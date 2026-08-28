import { NextResponse } from 'next/server';
import { login } from '@/lib/auth-db';
import { logSecurityEvent, getClientIP, getUserAgent } from '@/lib/security-log';
import { getLoginLockSeconds, recordLoginFailure, clearLoginFailures } from '@/lib/login-rate-limit';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * POST /api/auth/login - 用户登录
 */
export async function POST(request: Request) {
  const ip = getClientIP(request);
  const userAgent = getUserAgent(request);

  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, data: null, error: '用户名和密码不能为空', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // 登录限流：检查是否被锁定（单账号/IP 连续失败触发）
    const lockSeconds = getLoginLockSeconds(ip, String(username).trim().toLowerCase());
    if (lockSeconds > 0) {
      await logSecurityEvent({
        event_type: 'login_failed',
        username: username?.trim(),
        ip_address: ip,
        user_agent: userAgent,
        result: 'blocked',
        error_message: `登录过于频繁，锁定 ${lockSeconds} 秒`,
      });
      return NextResponse.json(
        { success: false, data: null, error: `尝试次数过多，请 ${Math.ceil(lockSeconds / 60)} 分钟后再试`, code: 'RATE_LIMITED' },
        { status: 429 }
      );
    }

    // 设置超时保护：5秒内必须完成
    const loginPromise = login(username, password);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), 5000)
    );

    let result;
    try {
      result = await Promise.race([loginPromise, timeoutPromise]);
    } catch (err: any) {
      if (err.message === 'LOGIN_TIMEOUT') {
        console.error('[Auth Login] 登录超时，可能是数据库连接问题');
        return NextResponse.json(
          { success: false, data: null, error: '登录验证超时，请稍后重试', code: 'TIMEOUT' },
          { status: 504 }
        );
      }
      throw err;
    }

    // 数据库查询本身失败（schema cache/连接等），明确返回服务不可用，而非"账号或密码错误"
    if (result && 'dbError' in result && result.dbError) {
      await logSecurityEvent({
        event_type: 'login_failed',
        username: username?.trim(),
        ip_address: ip,
        user_agent: userAgent,
        result: 'failed',
        error_message: '登录时查询用户信息失败（数据库异常）',
      });
      return NextResponse.json(
        { success: false, data: null, error: '登录服务暂不可用，数据库连接异常，请稍后重试', code: 'DB_UNAVAILABLE' },
        { status: 503 }
      );
    }

    // 账号不存在或密码错误
    if (!result || 'invalid' in result) {
      // 记录登录失败日志 + 限流计数（管理员账号不受账号维度锁定，防恶意锁死管理员）
      let isAdminTarget = false;
      try {
        const { data: userRow } = await getSupabaseClient()
          .from('users')
          .select('role')
          .ilike('username', String(username).trim().toLowerCase())
          .maybeSingle();
        isAdminTarget = ['super_admin', 'admin'].includes(String(userRow?.role || ''));
      } catch {
        // 查询失败不影响主流程
      }
      const locked = recordLoginFailure(ip, String(username).trim().toLowerCase(), isAdminTarget);
      await logSecurityEvent({
        event_type: 'login_failed',
        username: username?.trim(),
        ip_address: ip,
        user_agent: userAgent,
        result: 'failed',
        error_message: locked ? '连续失败次数过多，账号已临时锁定' : '账号或密码错误',
      });

      const status = locked ? 429 : 401;
      const error = locked ? '尝试次数过多，请 15 分钟后再试' : '账号或密码错误';
      const code = locked ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS';
      return NextResponse.json(
        { success: false, data: null, error, code },
        { status }
      );
    }

    // 账号存在但被禁用/待分配：返回明确原因（不再伪装成"账号或密码错误"）
    if ('blocked' in result) {
      await logSecurityEvent({
        event_type: 'login_failed',
        username: username?.trim(),
        ip_address: ip,
        user_agent: userAgent,
        result: 'blocked',
        error_message: result.blocked === 'disabled' ? '账号已被禁用' : '账号待分配权限',
      });
      const error = result.blocked === 'disabled'
        ? '该账号已被禁用，请联系管理员恢复'
        : '该账号待分配权限，请联系管理员启用（系统管理 → 权限管理 → 用户分配台账）';
      return NextResponse.json(
        { success: false, data: null, error, code: result.blocked === 'disabled' ? 'ACCOUNT_DISABLED' : 'ACCOUNT_PENDING' },
        { status: 403 }
      );
    }

    // 到这里只可能是登录成功分支
    if (!result || !('user' in result) || !('token' in result)) {
      return NextResponse.json(
        { success: false, data: null, error: '登录失败，请稍后重试', code: 'LOGIN_FAILED' },
        { status: 500 }
      );
    }
    const { user, token } = result;

    // 登录成功：清除限流计数
    clearLoginFailures(ip, String(username).trim().toLowerCase());

    // 记录登录成功日志
    await logSecurityEvent({
      event_type: 'login_success',
      user_id: user.id,
      username: user.username,
      ip_address: ip,
      user_agent: userAgent,
      result: 'success',
    });

    // 构建响应
    const response = NextResponse.json({
      success: true,
      data: {
        token,
        user,
      },
      error: null,
      code: 'SUCCESS',
    });

    // 设置认证 Cookie（SameSite=lax 兼容钉钉 webview）
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7天
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('[Auth Login] 登录异常:', error);
    return NextResponse.json(
      { success: false, data: null, error: '登录失败', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
