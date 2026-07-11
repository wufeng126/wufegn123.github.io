import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

// 获取附件签名URL
export async function POST(request: NextRequest) {
  try {
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
