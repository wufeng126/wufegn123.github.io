import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, verifyToken, revokeToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // logout 时按 jti 注销 token，使已登出的 token 立即失效（DB 持久化，多实例同步）
    const token = request.cookies.get('auth_token')?.value || '';
    if (token) {
      const payload = await verifyToken(token);
      if (payload?.jti) {
        // 不 await verifyToken 的撤销副作用，直接用原始 payload 拿 exp / id
        const expMs = payload.exp ? payload.exp * 1000 : undefined;
        const userId = typeof payload.id === 'number' ? payload.id : undefined;
        await revokeToken(payload.jti, expMs, userId);
      }
    }
    await clearAuthCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { success: false, error: '退出登录失败' },
      { status: 500 }
    );
  }
}
