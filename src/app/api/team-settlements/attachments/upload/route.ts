import { NextRequest, NextResponse } from 'next/server';
import { OSSStorage } from '@/lib/oss-storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, getErrorMessage } from '@/lib/api-utils';

const storage = new OSSStorage();

const MAX_SIZE = 20 * 1024 * 1024;

// 班组结算附件：允许图片 + PDF + Office 文档 + 文本（与结算单/证据链附件保持一致）
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
  const nameOk = ALLOWED_EXT.test(file.name || '');
  const typeOk = !file.type || ALLOWED_MIME.has(file.type);
  if (!nameOk && !typeOk) {
    return '仅支持图片、PDF、Word、Excel、PPT、TXT 格式';
  }
  return null;
}

// 上传班组结算附件
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const settlementId = formData.get('settlementId') as string | null;

    if (!file) return apiBadRequest('请选择要上传的文件');

    const invalid = validateFile(file);
    if (invalid) return apiBadRequest(invalid);

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = sanitizeFileName(file.name);
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: `team-settlements/${settlementId || 'new'}/${Date.now()}-${safeName}`,
      contentType: file.type || 'application/octet-stream',
    });

    const attachment = {
      key: fileKey,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
    };

    // 如果有关联的结算单ID，更新其 attachments 字段
    if (settlementId) {
      const client = getSupabaseClient();
      const { data: settlement, error: fetchError } = await client
        .from('team_settlements')
        .select('attachments')
        .eq('id', parseInt(settlementId))
        .single();

      if (fetchError) {
        return apiServerError(getErrorMessage(fetchError, '查询班组结算单失败'));
      }

      const existingAttachments: unknown[] = Array.isArray(settlement?.attachments) ? settlement.attachments : [];
      const updatedAttachments = [...existingAttachments, attachment];

      const { error: updateError } = await client
        .from('team_settlements')
        .update({ attachments: updatedAttachments })
        .eq('id', parseInt(settlementId));

      if (updateError) {
        return apiServerError(getErrorMessage(updateError, '更新附件失败'));
      }
    }

    return NextResponse.json({ success: true, attachment });
  } catch (error: unknown) {
    console.error('[TeamSettlement Upload] Error:', error);
    return apiServerError(getErrorMessage(error, '上传失败'));
  }
}