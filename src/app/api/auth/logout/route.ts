import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, verifyToken, revokeToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // 修复（S4）：logout 时按 jti 注销 token，使已登出的 token 立即失效（不再仅清 cookie）
    const token = request.cookies.get('auth_token')?.value || '';
    if (token) {
      const payload = await verifyToken(token);
      if (payload?.jti) revokeToken(payload.jti);
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
