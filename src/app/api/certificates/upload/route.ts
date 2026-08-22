import { NextRequest, NextResponse } from 'next/server';
import { OSSStorage } from '@/lib/oss-storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, getErrorMessage } from '@/lib/api-utils';

const storage = new OSSStorage();

const MAX_SIZE = 20 * 1024 * 1024;

// 证件附件：允许图片 + PDF + Office 文档（与签证附件 / 证据链附件保持一致）
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

const ALLOWED_EXT = /\.(jpe?g|png|gif|webp|bmp|pdf|docx?|xlsx?|pptx?|txt)$/i;

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').replace(/_+/g, '_');
  return cleaned || 'attachment';
}

function validateFile(file: File): string | null {
  if (file.size > MAX_SIZE) return '文件大小不能超过20MB';
  // 优先校验扩展名（部分浏览器/客户端可能把 octet-stream 作为 MIME）
  const nameOk = ALLOWED_EXT.test(file.name || '');
  const typeOk = !file.type || ALLOWED_MIME.has(file.type);
  if (!nameOk && !typeOk) {
    return '仅支持图片、PDF、Word、Excel、PPT、TXT 格式';
  }
  return null;
}

// 上传证件附件
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const certificateId = formData.get('certificateId') as string | null;

    if (!file) return apiBadRequest('请选择要上传的文件');

    const invalid = validateFile(file);
    if (invalid) return apiBadRequest(invalid);

    // 上传到对象存储
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = sanitizeFileName(file.name);
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: `certificates/${certificateId || 'new'}/${Date.now()}-${safeName}`,
      contentType: file.type || 'application/octet-stream',
    });

    // 构建附件记录
    const attachment = {
      key: fileKey,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
    };

    // 如果有关联的证件ID，更新证件的 attachments 字段
    if (certificateId) {
      const client = getSupabaseClient();
      const { data: cert, error: fetchError } = await client
        .from('certificates')
        .select('attachments')
        .eq('id', parseInt(certificateId))
        .single();

      if (fetchError) {
        return apiServerError(getErrorMessage(fetchError, '查询证件失败'));
      }

      const existingAttachments: unknown[] = Array.isArray(cert?.attachments) ? cert.attachments : [];
      const updatedAttachments = [...existingAttachments, attachment];

      const { error: updateError } = await client
        .from('certificates')
        .update({ attachments: updatedAttachments })
        .eq('id', parseInt(certificateId));

      if (updateError) {
        return apiServerError(getErrorMessage(updateError, '更新附件失败'));
      }
    }

    return NextResponse.json({
      success: true,
      attachment,
    });
  } catch (error: unknown) {
    console.error('[Certificate Upload] Error:', error);
    return apiServerError(getErrorMessage(error, '上传失败'));
  }
}
