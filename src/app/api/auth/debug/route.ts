import { NextResponse } from 'next/server';

/**
 * /api/auth/debug - 调试接口
 * 生产环境完全禁用，开发环境需要登录
 */
export async function GET() {
  // 生产环境完全禁用
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: '此接口在生产环境不可用', code: 'DISABLED' },
      { status: 403 }
    );
  }

  // 开发环境也禁用（安全风险：泄露密码哈希）
  return NextResponse.json(
    { success: false, error: '此接口已禁用，请使用数据库管理工具查看用户信息', code: 'DISABLED' },
    { status: 403 }
  );
}
