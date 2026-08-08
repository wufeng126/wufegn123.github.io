import { NextResponse } from 'next/server';
import { login } from '@/lib/auth-db';
import { logSecurityEvent, getClientIP, getUserAgent } from '@/lib/security-log';
import { getLoginLockSeconds, recordLoginFailure, clearLoginFailures } from '@/lib/login-rate-limit';

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

    if (!result) {
      // 记录登录失败日志 + 限流计数
      const locked = recordLoginFailure(ip, String(username).trim().toLowerCase());
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

    // 登录成功：清除限流计数
    clearLoginFailures(ip, String(username).trim().toLowerCase());

    // 记录登录成功日志
    await logSecurityEvent({
      event_type: 'login_success',
      user_id: result.user.id,
      username: result.user.username,
      ip_address: ip,
      user_agent: userAgent,
      result: 'success',
    });

    // 构建响应
    const response = NextResponse.json({
      success: true,
      data: {
        token: result.token,
        user: result.user,
      },
      error: null,
      code: 'SUCCESS',
    });

    // 设置认证 Cookie（SameSite=lax 兼容钉钉 webview）
    response.cookies.set('auth_token', result.token, {
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
