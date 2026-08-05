import { NextResponse } from 'next/server';
import { requireApiReadPermission } from '@/lib/api-auth';

// 检查 OSS 环境变量配置（仅返回配置状态，不返回敏感值）
export async function GET(request: Request) {
  try {
    const auth = await requireApiReadPermission(request);
    if (!auth.ok) return auth.response;

    const config = {
      OSS_ENDPOINT: process.env.OSS_ENDPOINT ? '已配置' : '未配置',
      OSS_ACCESS_KEY_ID: process.env.OSS_ACCESS_KEY_ID ? '已配置' : '未配置',
      OSS_ACCESS_KEY_SECRET: process.env.OSS_ACCESS_KEY_SECRET ? '已配置' : '未配置',
      OSS_BUCKET_NAME: process.env.OSS_BUCKET_NAME ? '已配置' : '未配置',
      OSS_REGION: process.env.OSS_REGION || 'cn-beijing (默认)',
    };

    // 检查是否有 COZE_BUCKET_* 变量（不应该再使用）
    const deprecatedConfig = {
      COZE_BUCKET_ENDPOINT_URL: process.env.COZE_BUCKET_ENDPOINT_URL ? '已配置 (已弃用)' : '未配置',
      COZE_BUCKET_NAME: process.env.COZE_BUCKET_NAME ? '已配置 (已弃用)' : '未配置',
    };

    const allConfigured = 
      process.env.OSS_ENDPOINT &&
      process.env.OSS_ACCESS_KEY_ID &&
      process.env.OSS_ACCESS_KEY_SECRET &&
      process.env.OSS_BUCKET_NAME;

    return NextResponse.json({
      success: true,
      configured: allConfigured,
      oss: config,
      deprecated: deprecatedConfig,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '诊断失败' },
      { status: 500 }
    );
  }
}
