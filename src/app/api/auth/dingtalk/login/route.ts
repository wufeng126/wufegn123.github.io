/**
 * 钉钉免登登录 API
 *
 * POST /api/auth/dingtalk/login
 * 前端从钉钉 JSAPI 获取 authCode 后发送到本接口，
 * 后端通过钉钉开放平台换取用户信息，匹配系统用户后签发 JWT。
 *
 * 匹配规则：
 * 1. 优先按 dingtalk_user_id 精确匹配系统用户
 * 2. 其次按手机号匹配系统用户，匹配成功后自动绑定 dingtalk_user_id
 * 3. 无法匹配时自动创建待分配账号，返回 403 提示管理员分配权限
 *
 * 安全规则：
 * - 钉钉只作为身份认证来源，系统角色和权限仍以本系统配置为准
 * - 钉钉用户离职/停用时自动禁用系统登录
 * - 被禁用的系统用户不允许登录
 * - 所有登录尝试写入安全日志
 */

import { NextResponse } from 'next/server';
import { isDingTalkSsoConfigured } from '@/lib/dingtalk-config';
import { callDingTalkApi } from '@/lib/dingtalk-service';
import { generateToken, UserPayload, UserRole } from '@/lib/auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { apiError } from '@/lib/api-utils';
import { logDingTalkSecurityEvent } from '@/lib/dingtalk-security-log';
import { fetchUserPermissions, hashPassword } from '@/lib/auth-db';

type DingTalkUserInfoResult = {
  userid?: string;
  sys?: boolean;
  name?: string;
};

type DingTalkUserInfoResponse = DingTalkUserInfoResult & {
  errmsg?: string;
  result?: DingTalkUserInfoResult;
};

type DingTalkUserDetailResult = {
  userid?: string;
  name?: string;
  mobile?: string;
  unionid?: string;
  title?: string;
  dept_id_list?: number[];
  avatar?: string;
  active?: boolean;
};

type DingTalkUserDetailResponse = DingTalkUserDetailResult & {
  errmsg?: string;
  result?: DingTalkUserDetailResult;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 从请求中提取客户端IP */
function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }
  return 'unknown';
}

/** 从请求中提取 User-Agent */
function getUserAgent(request: Request): string {
  return request.headers.get('user-agent') || 'unknown';
}

/**
 * 通过 authCode 获取钉钉用户信息
 * 钉钉免登流程：authCode → userid → 用户详情
 */
async function getDingTalkUserInfo(authCode: string) {
  if (!isDingTalkSsoConfigured()) {
    throw new Error('钉钉企业内部应用未配置');
  }

  // Step 1: 用 authCode 换取 userid
  const userResult = await callDingTalkApi<{
    userid: string;
    sys: boolean;
    name?: string;
  }>('/topapi/v2/user/getuserinfo', {
    method: 'POST',
    body: { code: authCode },
  });

  // callDingTalkApi 返回 { success, data } 其中 data 是完整钉钉 API 响应
  // 业务数据在 data.result 中
  const rawData = userResult.data as DingTalkUserInfoResponse | null;
  const bizResult = rawData?.result || rawData;

  if (!userResult.success || !bizResult?.userid) {
    throw new Error(`获取钉钉用户ID失败: ${userResult.errmsg || rawData?.errmsg || '未知错误'}`);
  }

  const userId = bizResult.userid;

  // Step 2: 用 userid 获取用户详情
  const detailResponse = await callDingTalkApi<{
    userid: string;
    name: string;
    mobile: string;
    unionid?: string;
    title?: string;
    dept_id_list?: number[];
    avatar?: string;
    active?: boolean;
  }>('/topapi/v2/user/get', {
    method: 'POST',
    body: { userid: userId },
  });
  const detailRawData = detailResponse.data as DingTalkUserDetailResponse | null;
  const detailBizResult = detailRawData?.result || detailRawData;

  if (!detailResponse.success || !detailBizResult) {
    throw new Error(`获取钉钉用户详情失败: ${detailResponse.errmsg || detailRawData?.errmsg || '未知错误'}`);
  }

  return {
    userId,
    name: detailBizResult.name || '',
    mobile: detailBizResult.mobile || '',
    unionId: detailBizResult.unionid || '',
    title: detailBizResult.title,
    deptIdList: detailBizResult.dept_id_list,
    avatar: detailBizResult.avatar || '',
    active: detailBizResult.active !== false,
  };
}

/**
 * 根据钉钉用户信息匹配系统用户
 * 匹配规则：优先按 dingtalk_user_id 匹配，其次按手机号匹配
 * 匹配成功后同步更新钉钉绑定字段
 * 
 * 返回：匹配到的用户 + 是否因钉钉离职需要禁用
 */
async function findAndBindSystemUser(
  dingtalk_user_id: string,
  dingtalk_name: string,
  mobile: string,
  unionId?: string,
  deptIdList?: number[],
  avatar?: string,
  active?: boolean
): Promise<{ user: UserPayload; isDisabled: boolean; isPending: boolean } | null> {
  const client = getSupabaseClient();

  // 钉钉绑定更新数据
  const dingtalkUpdateData: Record<string, unknown> = {
    dingtalk_user_id: dingtalk_user_id,
    dingtalk_name: dingtalk_name,
    dingtalk_mobile: mobile || null,
    dingtalk_dept_id: deptIdList?.join(',') || null,
    dingtalk_avatar: avatar || null,
    dingtalk_active: active !== false,
    last_dingtalk_sync_at: new Date().toISOString(),
  };

  if (unionId) {
    dingtalkUpdateData.dingtalk_union_id = unionId;
  }

  // 如果钉钉用户离职/停用，标记需要禁用系统登录
  const isDingTalkInactive = active === false;

  // 1. 优先按 dingtalk_user_id 匹配
  const { data: byDingTalkId } = await client
    .from('users')
    .select('*')
    .eq('dingtalk_user_id', dingtalk_user_id)
    .single();

  let matchedUser = byDingTalkId;

  // 2. 其次按手机号匹配（public.users 无 phone 列，使用 dingtalk_mobile）
  if (!matchedUser && mobile) {
    const { data: byMobile } = await client
      .from('users')
      .select('*')
      .eq('dingtalk_mobile', mobile)
      .single();
    matchedUser = byMobile;
  }

  // 3. 兜底：通过 Supabase Auth Admin API 按 auth.users.phone 匹配
  if (!matchedUser && mobile) {
    try {
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.COZE_SUPABASE_URL || '';
      const serviceRoleKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
      if (supabaseUrl && serviceRoleKey) {
        const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: authUsers } = await adminClient.auth.admin.listUsers();
        const matchedAuthUser = authUsers?.users?.find(
          (u) => u.phone === mobile || u.user_metadata?.phone === mobile
        );
        if (matchedAuthUser) {
          const { data: byAuthId } = await client
            .from('users')
            .select('*')
            .eq('id', matchedAuthUser.id)
            .single();
          matchedUser = byAuthId;
        }
      }
    } catch (e) {
      console.warn('[DingTalk Login] Auth Admin API 手机号匹配失败:', getErrorMessage(e));
    }
  }

  if (!matchedUser) {
    return null;
  }

  // 同步更新钉钉信息
  // 如果钉钉用户已离职/停用，自动禁用系统登录
  if (isDingTalkInactive) {
    dingtalkUpdateData.is_disabled = true;
  }

  await client
    .from('users')
    .update(dingtalkUpdateData)
    .eq('id', matchedUser.id);

  const userRole = (matchedUser.role && ['super_admin', 'admin', 'pending'].includes(matchedUser.role))
    ? matchedUser.role as UserRole
    : 'admin';

  return {
    user: {
      id: matchedUser.id,
      username: matchedUser.username,
      name: matchedUser.name || matchedUser.username,
      role: userRole,
      role_id: matchedUser.role_id,
    },
    isDisabled: matchedUser.is_disabled || isDingTalkInactive,
    isPending: matchedUser.role === 'pending',
  };
}

export async function POST(request: Request) {
  const ip = getClientIP(request);
  const user_agent = getUserAgent(request);

  try {
    // 检查钉钉配置
    if (!isDingTalkSsoConfigured()) {
      return apiError('钉钉企业内部应用未配置完整，无法免登，请检查 AppKey、AppSecret 和 CorpId', 400, 'DINGTALK_NOT_CONFIGURED');
    }

    const body = await request.json();
    const { authCode } = body;

    if (!authCode || typeof authCode !== 'string') {
      return apiError('缺少 authCode 参数', 400, 'MISSING_AUTH_CODE');
    }

    console.log('[DingTalk Login] 开始免登流程, authCode:', authCode.substring(0, 8) + '...');

    // 1. 通过 authCode 获取钉钉用户信息
    const dingtalkUser = await getDingTalkUserInfo(authCode);
    console.log('[DingTalk Login] 钉钉用户信息:', dingtalkUser.name, dingtalkUser.userId, 'active:', dingtalkUser.active);

    // 检查钉钉用户是否已离职/停用
    if (!dingtalkUser.active) {
      await logDingTalkSecurityEvent({
        event_type: 'dingtalk_login_failed',
        dingtalk_user_id: dingtalkUser.userId,
        dingtalk_name: dingtalkUser.name,
        ip_address: ip,
        user_agent,
        result: 'failed',
        error_message: '钉钉用户已离职或停用，无法登录',
        metadata: { mobile: dingtalkUser.mobile },
      });

      return NextResponse.json({
        success: false,
        data: {
          dingtalkUser: {
            userId: dingtalkUser.userId,
            name: dingtalkUser.name,
          },
        },
        error: `钉钉用户"${dingtalkUser.name}"已离职或停用，无法登录系统`,
        code: 'USER_INACTIVE',
      }, { status: 403 });
    }

    // 2. 匹配系统用户
    const matchResult = await findAndBindSystemUser(
      dingtalkUser.userId,
      dingtalkUser.name,
      dingtalkUser.mobile,
      dingtalkUser.unionId,
      dingtalkUser.deptIdList,
      dingtalkUser.avatar,
      dingtalkUser.active
    );

    if (!matchResult) {
      // 未匹配到系统用户 → 自动创建待分配账号，但不允许直接登录
      try {
        const client = getSupabaseClient();
        const rawUsername = (dingtalkUser.name || `dt_${dingtalkUser.userId}`)
          .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
          .toLowerCase()
          .slice(0, 40);
        const baseUsername = rawUsername.replace(/^_+|_+$/g, '') || `dt_${dingtalkUser.userId}`;
        let username = baseUsername;
        let suffix = 1;
        while (true) {
          const { data: existing } = await client.from('users').select('id').eq('username', username).maybeSingle();
          if (!existing) break;
          username = `${baseUsername}_${suffix}`;
          suffix++;
        }
        const randomPwd = `dt_${Math.random().toString(36).slice(2, 10)}`;
        const pwdHash = hashPassword(randomPwd);
        const { data: newUser, error: createError } = await client.from('users').insert({
          username,
          name: dingtalkUser.name || username,
          password_hash: pwdHash,
          role: 'pending',
          is_disabled: true,
          dingtalk_user_id: dingtalkUser.userId,
          dingtalk_union_id: dingtalkUser.unionId || null,
          dingtalk_name: dingtalkUser.name,
          dingtalk_mobile: dingtalkUser.mobile || null,
          dingtalk_dept_id: dingtalkUser.deptIdList?.join(',') || null,
          dingtalk_avatar: dingtalkUser.avatar || null,
          dingtalk_active: true,
          last_dingtalk_sync_at: new Date().toISOString(),
        }).select().single();

        if (createError || !newUser) {
          console.error('[DingTalk AutoCreate] 创建用户失败:', createError?.message);
          return NextResponse.json({ success: false, error: `自动创建账号失败: ${createError?.message || '未知错误'}` }, { status: 500 });
        }

        await logDingTalkSecurityEvent({
          event_type: 'dingtalk_login_failed',
          dingtalk_user_id: dingtalkUser.userId,
          dingtalk_name: dingtalkUser.name,
          system_user_id: newUser.id,
          system_username: newUser.username,
          ip_address: ip,
          user_agent,
          result: 'failed',
          error_message: '已自动创建待分配账号，等待管理员分配权限',
          metadata: { mobile: dingtalkUser.mobile, autoCreated: true, pending: true },
        });

        console.log(`[DingTalk SSO] 自动创建待分配用户: ${username} (钉钉: ${dingtalkUser.name})`);
        return NextResponse.json({
          success: false,
          data: {
            dingtalkUser: {
              userId: dingtalkUser.userId,
              name: dingtalkUser.name,
            },
            systemUser: {
              id: newUser.id,
              username: newUser.username,
              name: newUser.name || newUser.username,
            },
          },
          error: `已为钉钉用户"${dingtalkUser.name}"创建系统账号，请联系管理员分配权限后再登录`,
          code: 'ACCOUNT_PENDING',
        }, { status: 403 });
      } catch (autoErr: unknown) {
        console.error('[DingTalk AutoCreate] 异常:', autoErr instanceof Error ? autoErr.message : autoErr);
        return NextResponse.json({ success: false, error: `账号创建失败: ${autoErr instanceof Error ? autoErr.message : '未知错误'}` }, { status: 500 });
      }
    }

    const { user: systemUser, isDisabled, isPending } = matchResult;

    // 检查系统用户是否被禁用
    if (isDisabled || isPending) {
      await logDingTalkSecurityEvent({
        event_type: 'dingtalk_login_failed',
        dingtalk_user_id: dingtalkUser.userId,
        dingtalk_name: dingtalkUser.name,
        system_user_id: systemUser.id,
        system_username: systemUser.username,
        ip_address: ip,
        user_agent,
        result: 'failed',
        error_message: isPending ? '系统账号待分配权限，无法登录' : '系统用户已被禁用，无法登录',
        metadata: { isDisabled, isPending },
      });

      return NextResponse.json({
        success: false,
        data: {
          dingtalkUser: {
            userId: dingtalkUser.userId,
            name: dingtalkUser.name,
          },
          systemUser: {
            id: systemUser.id,
            username: systemUser.username,
            name: systemUser.name,
          },
        },
        error: isPending
          ? `系统账号"${systemUser.name}"正在等待管理员分配权限，请稍后再登录`
          : `系统用户"${systemUser.name}"已被禁用，请联系管理员启用`,
        code: isPending ? 'ACCOUNT_PENDING' : 'USER_DISABLED',
      }, { status: 403 });
    }

    // 3. 签发 JWT
    const permissions = await fetchUserPermissions(systemUser.id, systemUser.role);
    const token = await generateToken({ ...systemUser, permissions });
    console.log(`[DingTalkLogin] 免登成功: user=${systemUser.username}, token长度=${token.length}`);

    // 4. 构建响应并设置认证 Cookie
    const response = NextResponse.json({
      success: true,
      data: {
        token,
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

    // 设置认证 Cookie（SameSite=lax 兼容钉钉 webview，不强制 Secure 以兼容 HTTP 代理场景）
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

    // 6. 记录安全日志
    await logDingTalkSecurityEvent({
      event_type: 'dingtalk_login_success',
      dingtalk_user_id: dingtalkUser.userId,
      dingtalk_name: dingtalkUser.name,
      system_user_id: systemUser.id,
      system_username: systemUser.username,
      ip_address: ip,
      user_agent,
      result: 'success',
      metadata: {
        mobile: dingtalkUser.mobile,
        deptIdList: dingtalkUser.deptIdList,
        role: systemUser.role,
      },
    });

    console.log('[DingTalk Login] 免登成功:', systemUser.username);

    return response;
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('[DingTalk Login] 免登失败:', errorMessage);

    await logDingTalkSecurityEvent({
      event_type: 'dingtalk_login_failed',
      ip_address: ip,
      user_agent,
      result: 'failed',
      error_message: errorMessage,
    });

    return apiError(
      errorMessage || '钉钉免登失败',
      500,
      'DINGTALK_AUTH_ERROR'
    );
  }
}
