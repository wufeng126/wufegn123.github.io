import { NextRequest, NextResponse } from 'next/server';
import { OSSStorage } from '@/lib/oss-storage';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, getErrorMessage } from '@/lib/api-utils';

const storage = new OSSStorage();

// 获取班组结算附件签名URL
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { key, expireTime } = body;

    if (!key) {
      return apiBadRequest('缺少文件key');
    }

    const normalizedKey = String(key).trim();
    if (!normalizedKey.startsWith('team-settlements/')) {
      return NextResponse.json({ error: '无权访问该附件' }, { status: 403 });
    }

    const url = await storage.generatePresignedUrl({
      key: normalizedKey,
      expireTime: expireTime || 3600, // 默认1小时
    });

    return NextResponse.json({ success: true, url });
  } catch (error: unknown) {
    console.error('[TeamSettlement Attachment URL] Error:', error);
    return apiServerError(getErrorMessage(error, '获取文件链接失败'));
  }
}