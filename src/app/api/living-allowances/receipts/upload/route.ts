import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { OSSStorage } from '@/lib/oss-storage';
import { normalizeYearMonth } from '@/lib/living-allowance';

const storage = new OSSStorage();
const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXT = /\.(jpe?g|png|gif|webp|bmp|pdf)$/i;

function sanitizeFileName(name: string): string {
  const cleaned = String(name || 'receipt')
    .replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'receipt';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = normalizeId(formData.get('project_id'));
    const receiptDate = String(formData.get('receipt_date') || '').trim();
    const payerAccount = String(formData.get('payer_account') || '').trim();
    const remark = String(formData.get('remark') || '').trim();

    if (!file) return NextResponse.json({ error: '请选择要上传的回单原图' }, { status: 400 });
    if (!receiptDate || !normalizeYearMonth(receiptDate)) {
      return NextResponse.json({ error: '请选择回单日期' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '回单文件不能超过20MB' }, { status: 400 });
    }
    if (!ALLOWED_EXT.test(file.name || '') && !String(file.type || '').startsWith('image/') && file.type !== 'application/pdf') {
      return NextResponse.json({ error: '仅支持图片或PDF回单' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjectIds !== null && projectId && !accessibleProjectIds.includes(projectId)) {
      return NextResponse.json({ error: '无权在该项目下上传生活费回单' }, { status: 403 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash('sha256').update(buffer).digest('hex');
    const safeName = sanitizeFileName(file.name);
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: `living-allowances/receipts/${receiptDate}/${Date.now()}-${safeName}`,
      contentType: file.type || 'application/octet-stream',
    });

    const result = await insertWithSequenceFix('living_allowance_receipts', {
      project_id: projectId,
      receipt_date: receiptDate,
      file_key: fileKey,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
      file_hash: fileHash,
      payer_account: payerAccount || null,
      split_status: 'pending',
      remark: remark || null,
      created_by: auth.user.id || null,
    }, client);

    if (result.error) {
      throw new Error(`保存回单记录失败: ${result.error.message}`);
    }

    const receipt = Array.isArray(result.data) ? result.data[0] : result.data;
    const url = await storage.generatePresignedUrl({ key: fileKey, expireTime: 3600 });

    await auditLog({
      operationType: 'create',
      resourceType: 'living_allowance_receipt',
      resourceId: receipt?.id,
      details: { project_id: projectId, receipt_date: receiptDate, file_name: file.name },
      request,
    });

    return NextResponse.json({ receipt, url });
  } catch (error: unknown) {
    console.error('[LivingAllowanceReceiptUpload] error:', error);
    return NextResponse.json({ error: getErrorMessage(error, '上传失败') }, { status: 500 });
  }
}
