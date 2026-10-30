import { NextRequest, NextResponse } from 'next/server';
import { OSSStorage } from '@/lib/oss-storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';

const storage = new OSSStorage();

// 删除证件附件（加固：目录前缀 → 证件附件列表校验 → 先改库后删文件）
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { certificateId, attachmentKey } = body;

    if (!certificateId || !attachmentKey) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const certificateIdNum = parseInt(String(certificateId), 10);
    if (!Number.isInteger(certificateIdNum) || certificateIdNum <= 0) {
      return NextResponse.json({ error: '证件ID不合法' }, { status: 400 });
    }

    // 1. 附件必须位于 certificates/ 目录，禁止跨模块删除任意对象存储文件
    if (!String(attachmentKey).startsWith('certificates/')) {
      return NextResponse.json({ error: '附件标识不合法' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: cert, error: fetchError } = await client
      .from('certificates')
      .select('attachments')
      .eq('id', certificateIdNum)
      .single();

    if (fetchError || !cert) {
      return NextResponse.json({ error: '证件不存在' }, { status: 404 });
    }

    // 2. 附件 key 必须真实存在于该证件的附件列表，防止伪造 key 删除他人文件
    const existingAttachments: any[] = Array.isArray(cert.attachments) ? cert.attachments : [];
    const target = existingAttachments.find((a: any) => a?.key === attachmentKey);
    if (!target) {
      return NextResponse.json({ error: '附件不存在或已被删除' }, { status: 404 });
    }

    // 3. 先更新数据库（移除附件引用），成功后再删对象存储，避免「文件已删、库未改」的静默损坏
    const updatedAttachments = existingAttachments.filter((a: any) => a?.key !== attachmentKey);
    const { error: updateError } = await client
      .from('certificates')
      .update({ attachments: updatedAttachments })
      .eq('id', certificateIdNum);

    if (updateError) {
      throw new Error(`更新附件列表失败: ${updateError.message}`);
    }

    // 4. 删除对象存储文件；失败仅记录日志（库已移除引用，残留文件不影响业务）
    try {
      await storage.deleteFile({ fileKey: attachmentKey });
    } catch (storageError) {
      console.error('[Certificate Attachment Delete] 对象存储删除失败（文件残留待清理）:', storageError, { attachmentKey });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Certificate Attachment Delete] Error:', error);
    return NextResponse.json(
      { error: error.message || '删除附件失败' },
      { status: 500 }
    );
  }
}
