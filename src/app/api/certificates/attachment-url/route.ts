import { NextRequest, NextResponse } from 'next/server';
import { OSSStorage } from '@/lib/oss-storage';
import { requireAuth } from '@/lib/api-auth';

const storage = new OSSStorage();

// 获取附件签名URL
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { key, expireTime } = body;

    if (!key) {
      return NextResponse.json({ error: '缺少文件key' }, { status: 400 });
    }

    const url = await storage.generatePresignedUrl({
      key,
      expireTime: expireTime || 3600, // 默认1小时
    });

    return NextResponse.json({ success: true, url });
  } catch (error: any) {
    console.error('[Certificate Attachment URL] Error:', error);
    return NextResponse.json(
      { error: error.message || '获取文件链接失败' },
      { status: 500 }
    );
  }
}
