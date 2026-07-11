/**
 * 钉钉免登 API
 *
 * POST /api/auth/dingtalk
 * 前端从钉钉 JSAPI 获取 authCode 后发送到本接口，
 * 后端通过钉钉开放平台换取用户信息，匹配系统用户后签发 JWT。
 */

import { NextResponse } from 'next/server';
import { isDingTalkConfigured, getDingTalkConfig } from '@/lib/dingtalk-config';
import { callDingTalkApi } from '@/lib/dingtalk-service';
import { generateToken, UserPayload, UserRole } from '@/lib/auth';
import { setAuthCookie } from '@/lib/auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { apiError } from '@/lib/api-utils';
import { createClient } from '@supabase/supabase-js';

/**
 * 通过 authCode 获取钉钉用户信息
 * 钉钉免登流程：authCode → userid → 用户详情
 */
async function getDingTalkUserInfo(authCode: string) {
  if (!isDingTalkConfigured()) {
    throw new Error('钉钉企业内部应用未配置');
  }

  const config = getDingTalkConfig()!;

  // Step 1: 用 authCode 换取 userid
  // 钉钉新版本使用 /topapi/v2/user/getuserinfo 接口
  // callDingTalkApi 返回的 data 是完整钉钉 API 响应，业务数据在 data.result 中
  const userRaw = await callDingTalkApi<{ errcode: number; errmsg: string; result?: { userid: string; sys: boolean; name?: string } }>('/topapi/v2/user/getuserinfo', {
    method: 'POST',
    body: { code: authCode },
  });

  if (!userRaw.success) {
    throw new Error(`获取钉钉用户ID失败: ${userRaw.errmsg || 'API调用失败'}`);
  }

  const userResult = userRaw.data?.result;
  if (!userResult?.userid) {
    throw new Error(`获取钉钉用户ID失败: ${userRaw.data?.errmsg || '返回数据中无userid'}`);
  }

  const userId = userResult.userid;

  // Step 2: 用 userid 获取用户详情
  const detailRaw = await callDingTalkApi<{
    errcode: number; errmsg: string; result?: {
      userid: string;
      name: string;
      mobile: string;
      title?: string;
      dept_id_list?: number[];
    }
  }>('/topapi/v2/user/get', {
    method: 'POST',
    body: { userid: userId },
  });

  if (!detailRaw.success) {
    throw new Error(`获取钉钉用户详情失败: ${detailRaw.errmsg || 'API调用失败'}`);
  }

  const detailResult = detailRaw.data?.result;
  if (!detailResult) {
    throw new Error(`获取钉钉用户详情失败: ${detailRaw.data?.errmsg || '返回数据为空'}`);
  }

  return {
    userId,
    name: detailResult.name,
    mobile: detailResult.mobile,
    title: detailResult.title,
    deptIdList: detailResult.dept_id_list,
  };
}

/**
 * 根据钉钉用户信息匹配系统用户
 * 匹配规则：优先按 dingtalk_user_id 匹配，其次按手机号匹配
 * 匹配成功后同步更新钉钉绑定字段
 */
async function findSystemUser(dingtalkUserId: string, dingtalkName: string, mobile: string, deptIdList?: number[]): Promise<UserPayload | null> {
  const client = getSupabaseClient();

  // 钉钉绑定更新数据
  const dingtalkUpdateData = {
    dingtalk_user_id: dingtalkUserId,
    dingtalk_name: dingtalkName,
    dingtalk_mobile: mobile || null,
    dingtalk_dept_id: deptIdList?.join(',') || null,
    dingtalk_active: true,
    last_dingtalk_sync_at: new Date().toISOString(),
  };

  // 优先按 dingtalk_user_id 匹配
  const { data: byDingTalkId } = await client
    .from('users')
    .select('*')
    .eq('dingtalk_user_id', dingtalkUserId)
    .single();

  if (byDingTalkId) {
    // 同步更新钉钉信息
    await client
      .from('users')
      .update(dingtalkUpdateData)
      .eq('id', byDingTalkId.id);

    return {
      id: byDingTalkId.id,
      username: byDingTalkId.username,
      name: byDingTalkId.name || byDingTalkId.username,
      role: (byDingTalkId.role && ['super_admin', 'admin'].includes(byDingTalkId.role))
        ? byDingTalkId.role as UserRole
        : 'admin',
      role_id: byDingTalkId.role_id,
    };
  }

  // 其次按手机号匹配（通过 auth.users.phone 匹配，public.users 无 phone 列）
  if (mobile) {
    let matchedUserId: string | null = null;
    try {
      const supabaseAdmin = createClient(
        process.env.COZE_SUPABASE_URL!,
        process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = authUsers?.users?.find((u: any) => u.phone === mobile);
      if (authUser) {
        matchedUserId = authUser.id;
      }
    } catch (e) {
      console.warn('[DingTalk Auth] Auth Admin API 查询手机号失败:', e);
    }

    // 兜底：尝试 dingtalk_mobile 字段
    if (!matchedUserId) {
      const { data: byMobile } = await client
        .from('users')
        .select('*')
        .eq('dingtalk_mobile', mobile)
        .single();
      if (byMobile) {
        matchedUserId = byMobile.id;
      }
    }

    if (matchedUserId) {
      const { data: byMobile } = await client
        .from('users')
        .select('*')
        .eq('id', matchedUserId)
        .single();

      if (byMobile) {
        // 绑定钉钉信息到用户记录，下次直接匹配
        await client
          .from('users')
          .update(dingtalkUpdateData)
          .eq('id', byMobile.id);

        return {
          id: byMobile.id,
          username: byMobile.username,
          name: byMobile.name || byMobile.username,
          role: (byMobile.role && ['super_admin', 'admin'].includes(byMobile.role))
            ? byMobile.role as UserRole
            : 'admin',
          role_id: byMobile.role_id,
        };
      }
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    // 检查钉钉配置
    if (!isDingTalkConfigured()) {
      return apiError('钉钉企业内部应用未配置，无法免登', 400, 'DINGTALK_NOT_CONFIGURED');
    }

    const body = await request.json();
    const { authCode } = body;

    if (!authCode || typeof authCode !== 'string') {
      return apiError('缺少 authCode 参数', 400, 'MISSING_AUTH_CODE');
    }

    console.log('[DingTalk Auth] 开始免登流程, authCode:', authCode.substring(0, 8) + '...');

    // 1. 通过 authCode 获取钉钉用户信息
    const dingtalkUser = await getDingTalkUserInfo(authCode);
    console.log('[DingTalk Auth] 钉钉用户信息:', dingtalkUser.name, dingtalkUser.userId);

    // 2. 匹配系统用户
    const systemUser = await findSystemUser(dingtalkUser.userId, dingtalkUser.name, dingtalkUser.mobile, dingtalkUser.deptIdList);

    if (!systemUser) {
      return NextResponse.json({
        success: false,
        data: {
          dingtalkUser: {
            name: dingtalkUser.name,
            mobile: dingtalkUser.mobile,
          },
        },
        error: `未找到与钉钉用户"${dingtalkUser.name}"关联的系统账号，请联系管理员绑定`,
        code: 'USER_NOT_FOUND',
      }, { status: 403 });
    }

    // 3. 签发 JWT
    const token = await generateToken(systemUser);

    // 4. 构建响应并设置认证 Cookie
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: systemUser.id,
          username: systemUser.username,
          name: systemUser.name,
          role: systemUser.role,
          role_id: systemUser.role_id,
        },
      },
      error: null,
      code: 'OK',
    });
    // 设置认证 Cookie（SameSite=lax 兼容钉钉 webview）
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    // 5. 更新最后登录时间
    const client = getSupabaseClient();
    await client
      .from('users')
      .update({
        last_login: new Date().toISOString(),
      })
      .eq('id', systemUser.id);

    console.log('[DingTalk Auth] 免登成功:', systemUser.username);

    return response;
  } catch (error: any) {
    console.error('[DingTalk Auth] 免登失败:', error.message);
    return apiError(
      error.message || '钉钉免登失败',
      500,
      'DINGTALK_AUTH_ERROR'
    );
  }
}
