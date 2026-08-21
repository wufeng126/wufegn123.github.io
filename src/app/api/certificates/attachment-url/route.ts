import { NextRequest, NextResponse } from 'next/server';
import { OSSStorage } from '@/lib/oss-storage';
import { requirePermission } from '@/lib/api-auth';

const storage = new OSSStorage();

// 获取附件签名URL
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'certificates:view');
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { key, expireTime } = body;

    if (!key) {
      return NextResponse.json({ error: '缺少文件key' }, { status: 400 });
    }

    const normalizedKey = String(key).trim();
    if (!normalizedKey.startsWith('certificates/')) {
      return NextResponse.json({ error: '无权访问该附件' }, { status: 403 });
    }

    const url = await storage.generatePresignedUrl({
      key: normalizedKey,
      expireTime: expireTime || 3600, // 默认1小时
    });

    return NextResponse.json({ success: true, url });
  } catch (error: unknown) {
    console.error('[Certificate Attachment URL] Error:', error);
    const message = error instanceof Error ? error.message : '获取文件链接失败';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
