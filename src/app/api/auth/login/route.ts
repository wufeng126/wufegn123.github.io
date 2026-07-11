import { NextResponse } from 'next/server';
import { login } from '@/lib/auth-db';
import { logSecurityEvent, getClientIP, getUserAgent } from '@/lib/security-log';

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
      // 记录登录失败日志
      await logSecurityEvent({
        event_type: 'login_failed',
        username: username?.trim(),
        ip_address: ip,
        user_agent: userAgent,
        result: 'failed',
        error_message: '账号或密码错误',
      });

      return NextResponse.json(
        { success: false, data: null, error: '账号或密码错误', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

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
