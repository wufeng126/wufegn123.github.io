import { NextRequest, NextResponse } from 'next/server';
import { OSSStorage } from '@/lib/oss-storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { apiBadRequest, apiForbidden, apiNotFound, apiServerError, getErrorMessage } from '@/lib/api-utils';

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

    const settlementIdNum = parseInt(String(settlementId), 10);
    if (!Number.isInteger(settlementIdNum) || settlementIdNum <= 0) {
      return apiBadRequest('结算单ID不合法');
    }

    // 1. 校验附件 key 必须位于该结算单目录下，禁止跨模块/跨结算单删除任意对象存储文件
    if (!String(attachmentKey).startsWith(`team-settlements/${settlementIdNum}/`)) {
      return apiBadRequest('附件标识不合法');
    }

    const client = getSupabaseClient();
    const { data: settlement, error: fetchError } = await client
      .from('team_settlements')
      .select('attachments, project_id')
      .eq('id', settlementIdNum)
      .single();

    if (fetchError || !settlement) {
      return apiNotFound('班组结算单不存在');
    }

    // 2. 项目级数据权限：仅可操作自己可访问项目的结算单附件
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    const settlementProjectId = Number(settlement.project_id || 0);
    if (accessibleProjects && settlementProjectId && !accessibleProjects.includes(settlementProjectId)) {
      return apiForbidden('无权操作该项目结算单附件');
    }

    // 3. 附件 key 必须真实存在于该结算单附件列表，防止伪造 key 误删/越权删除
    const existingAttachments = Array.isArray(settlement.attachments) ? settlement.attachments : [];
    const target = existingAttachments.find((a: { key?: unknown }) => a?.key === attachmentKey);
    if (!target) {
      return apiNotFound('附件不存在或已被删除');
    }

    // 4. 先更新数据库（移除附件引用），成功后再删除对象存储文件，避免「文件已删、库未改」的静默数据损坏
    const updatedAttachments = existingAttachments.filter((a: { key?: unknown }) => a?.key !== attachmentKey);
    const { error: updateError } = await client
      .from('team_settlements')
      .update({ attachments: updatedAttachments, updated_at: new Date().toISOString() })
      .eq('id', settlementIdNum);

    if (updateError) {
      throw new Error(`更新附件列表失败: ${updateError.message}`);
    }

    // 5. 删除对象存储文件；失败仅记录日志（库已移除引用，残留文件不影响业务，可后续清理）
    try {
      await storage.deleteFile({ fileKey: attachmentKey });
    } catch (storageError) {
      console.error('[TeamSettlement Attachment Delete] 对象存储删除失败（文件残留待清理）:', storageError, { attachmentKey });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[TeamSettlement Attachment Delete] Error:', error);
    return apiServerError(getErrorMessage(error, '删除附件失败'));
  }
}