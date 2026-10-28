import { NextRequest, NextResponse } from 'next/server';
import { OSSStorage } from '@/lib/oss-storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, getErrorMessage } from '@/lib/api-utils';

const storage = new OSSStorage();

// 删除班组结算附件
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { settlementId, attachmentKey } = body;

    if (!settlementId || !attachmentKey) {
      return apiBadRequest('缺少必要参数');
    }

    // 从对象存储删除文件
    await storage.deleteFile({ fileKey: attachmentKey });

    // 从结算单记录中移除附件
    const client = getSupabaseClient();
    const { data: settlement, error: fetchError } = await client
      .from('team_settlements')
      .select('attachments')
      .eq('id', parseInt(settlementId))
      .single();

    if (fetchError) {
      throw new Error(`查询班组结算单失败: ${fetchError.message}`);
    }

    const existingAttachments = Array.isArray(settlement.attachments) ? settlement.attachments : [];
    const updatedAttachments = existingAttachments.filter((a: { key?: unknown }) => a?.key !== attachmentKey);

    const { error: updateError } = await client
      .from('team_settlements')
      .update({ attachments: updatedAttachments, updated_at: new Date().toISOString() })
      .eq('id', parseInt(settlementId));

    if (updateError) {
      throw new Error(`更新附件列表失败: ${updateError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[TeamSettlement Attachment Delete] Error:', error);
    return apiServerError(getErrorMessage(error, '删除附件失败'));
  }
}