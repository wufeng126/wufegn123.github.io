import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/auth-db';
import { logSecurityEvent } from '@/lib/security-log';

/**
 * 安全初始化接口
 *
 * 安全策略：
 * 1. 生产环境必须携带 x-init-secret header，值必须匹配 INIT_SECRET 环境变量
 * 2. 仅当数据库无任何用户时才允许初始化（首次部署）
 * 3. 初始化完成后永久禁用（已有用户则直接拒绝）
 * 4. 禁止同步/重置超级管理员密码
 * 5. 所有调用记录安全日志
 */

/** 检查数据库是否已有用户 */
async function hasExistingUsers(): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('users')
      .select('id')
      .limit(1);
    if (error) return true; // 查询出错时保守返回 true（拒绝初始化）
    return !!(data && data.length > 0);
  } catch {
    return true;
  }
}

/**
 * POST /api/auth/init - 初始化默认管理员
 * 仅在数据库无用户时可用，且必须携带 INIT_SECRET
 */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = request.headers.get('user-agent') || '';

  // 0. 生产环境完全禁用初始化接口
  if (process.env.COZE_PROJECT_ENV === 'PROD') {
    await logSecurityEvent({
      event_type: 'init_attempt',
      result: 'blocked',
      ip_address: ip,
      user_agent: userAgent,
      error_message: '生产环境禁用初始化接口',
    });
    return NextResponse.json(
      { success: false, data: null, error: '此接口在生产环境中已禁用', code: 'DISABLED' },
      { status: 403 }
    );
  }

  // 1. 校验 INIT_SECRET
  const initSecret = process.env.INIT_SECRET;
  if (!initSecret) {
    console.warn('[Auth Init] INIT_SECRET 环境变量未配置，初始化接口不可用');
    await logSecurityEvent({
      event_type: 'init_attempt',
      result: 'failed',
      ip_address: ip,
      user_agent: userAgent,
      error_message: 'INIT_SECRET 未配置',
    });
    return NextResponse.json(
      { success: false, data: null, error: '初始化接口未启用', code: 'INIT_DISABLED' },
      { status: 403 }
    );
  }

  const providedSecret = request.headers.get('x-init-secret');
  if (providedSecret !== initSecret) {
    console.warn('[Auth Init] INIT_SECRET 校验失败');
    await logSecurityEvent({
      event_type: 'init_attempt',
      result: 'failed',
      ip_address: ip,
      user_agent: userAgent,
      error_message: 'INIT_SECRET 校验失败',
    });
    return NextResponse.json(
      { success: false, data: null, error: '无权调用此接口', code: 'FORBIDDEN' },
      { status: 403 }
    );
  }

  // 2. 检查数据库是否已有用户（已有用户则永久禁用初始化）
  const hasUsers = await hasExistingUsers();
  if (hasUsers) {
    console.warn('[Auth Init] 数据库已有用户，初始化接口已永久禁用');
    await logSecurityEvent({
      event_type: 'init_attempt',
      result: 'failed',
      ip_address: ip,
      user_agent: userAgent,
      error_message: '数据库已有用户，初始化已永久禁用',
    });
    return NextResponse.json(
      { success: false, data: null, error: '系统已初始化，此接口已禁用', code: 'ALREADY_INITIALIZED' },
      { status: 403 }
    );
  }

  // 3. 首次部署：创建默认超级管理员（仅此一次）
  try {
    const client = getSupabaseClient();
    const defaultPassword = 'admin123';
    const defaultPasswordHash = hashPassword(defaultPassword);

    const { data: newAdmin, error: createError } = await client
      .from('users')
      .insert({
        username: 'admin',
        password_hash: defaultPasswordHash,
        role: 'super_admin',
      })
      .select()
      .single();

    if (createError || !newAdmin) {
      console.error('[Auth Init] 创建默认管理员失败:', createError?.message);
      await logSecurityEvent({
        event_type: 'init_attempt',
        result: 'failed',
        ip_address: ip,
        user_agent: userAgent,
        error_message: '创建默认管理员失败: ' + (createError?.message || '未知错误'),
      });
      return NextResponse.json(
        { success: false, data: null, error: '初始化失败', code: 'INIT_FAILED' },
        { status: 500 }
      );
    }

    await logSecurityEvent({
      event_type: 'init_success',
      result: 'success',
      ip_address: ip,
      user_agent: userAgent,
      metadata: { username: 'admin', role: 'super_admin' },
    });

    // 不返回密码信息
    return NextResponse.json({
      success: true,
      data: { initialized: true, message: '已创建默认超级管理员，请尽快修改默认密码' },
      error: null,
      code: 'OK',
    });
  } catch (error: any) {
    console.error('[Auth Init] 异常:', error.message);
    await logSecurityEvent({
      event_type: 'init_attempt',
      result: 'failed',
      ip_address: ip,
      user_agent: userAgent,
      error_message: error.message,
    });
    return NextResponse.json(
      { success: false, data: null, error: '初始化异常', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/init - 查询初始化状态
 * 生产环境下完全禁用此接口
 * 仅返回是否已初始化，不泄露任何用户信息或密码
 */
export async function GET() {
  // 生产环境禁用状态查询
  if (process.env.COZE_PROJECT_ENV === 'PROD') {
    return NextResponse.json(
      { success: false, data: null, error: '此接口在生产环境中已禁用', code: 'DISABLED' },
      { status: 403 }
    );
  }
  try {
    const hasUsers = await hasExistingUsers();
    return NextResponse.json({
      success: true,
      data: {
        initialized: hasUsers,
        message: hasUsers ? '系统已初始化' : '系统尚未初始化',
      },
      error: null,
      code: 'OK',
    });
  } catch {
    return NextResponse.json({
      success: true,
      data: { initialized: true, message: '查询失败' },
      error: null,
      code: 'OK',
    });
  }
}
