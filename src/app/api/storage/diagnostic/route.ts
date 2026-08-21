import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

// 检查 OSS 环境变量配置 + 实际连接测试
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const config = {
      OSS_ENDPOINT: process.env.OSS_ENDPOINT
        ? process.env.OSS_ENDPOINT.replace(/\/+$/, '')
        : null,
      OSS_ACCESS_KEY_ID: process.env.OSS_ACCESS_KEY_ID
        ? `${process.env.OSS_ACCESS_KEY_ID.slice(0, 4)}****`
        : null,
      OSS_ACCESS_KEY_SECRET: process.env.OSS_ACCESS_KEY_SECRET ? '******' : null,
      OSS_BUCKET_NAME: process.env.OSS_BUCKET_NAME || null,
      OSS_REGION: process.env.OSS_REGION || 'cn-beijing',
    };

    const allConfigured =
      !!process.env.OSS_ENDPOINT &&
      !!process.env.OSS_ACCESS_KEY_ID &&
      !!process.env.OSS_ACCESS_KEY_SECRET &&
      !!process.env.OSS_BUCKET_NAME;

    // 实际连接测试
    let connectionTest: { ok: boolean; message: string; fileCount?: number } = {
      ok: false,
      message: '环境变量未配齐，跳过连接测试',
    };

    if (allConfigured) {
      try {
        const { OSSStorage } = await import('@/lib/oss-storage');
        const storage = new OSSStorage();
        const result = await storage.listFiles({ maxKeys: 5 });
        connectionTest = {
          ok: true,
          message: `连接成功，当前 Bucket 中有 ${result.keys.length} 个文件（最多检查5个）`,
          fileCount: result.keys.length,
        };
      } catch (err: unknown) {
        connectionTest = {
          ok: false,
          message: `连接失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    return NextResponse.json({
      success: true,
      configured: allConfigured,
      config,
      connectionTest,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '诊断失败' },
      { status: 500 }
    );
  }
}

// POST 方法：执行一次测试上传
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const { OSSStorage } = await import('@/lib/oss-storage');
    const storage = new OSSStorage();

    const testContent = Buffer.from(`OSS connection test - ${new Date().toISOString()}`);
    const key = await storage.uploadFile({
      fileContent: testContent,
      fileName: '_diagnostic-test/test.txt',
      contentType: 'text/plain',
    });

    // 上传成功后尝试读取签名 URL
    const presignedUrl = await storage.generatePresignedUrl({ key, expireTime: 300 });

    // 清理测试文件
    await storage.deleteFile({ fileKey: key });

    return NextResponse.json({
      success: true,
      message: '上传、签名URL、删除均成功',
      testKey: key,
      presignedUrl: presignedUrl ? '已生成' : '生成失败',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '测试上传失败',
        hint: '请检查 OSS_ENDPOINT 格式（应为 https://oss-cn-xxx.aliyuncs.com）和 AccessKey 权限',
      },
      { status: 500 }
    );
  }
}
