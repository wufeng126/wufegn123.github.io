import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requirePermission } from '@/lib/api-auth';
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiSuccess,
  getErrorMessage,
} from '@/lib/api-utils';
import { assertProjectAccess } from '@/lib/api-project-scope';
import { invalidateAggregationCache } from '@/lib/data-aggregation';

/**
 * 删除班组结算单（草稿/已驳回/已提交待审批可删）。
 * 已提交待审批（pending）删除时尚未生成分账工资，安全；
 * 已审批（reviewed）已计入成本，不可直接删除——需先驳回或作废。
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePermission(request, 'team_settlements:delete');
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const settlementId = Number(id);
    if (!Number.isInteger(settlementId) || settlementId <= 0) {
      return apiBadRequest('结算单ID无效');
    }

    const supabase = getSupabaseClient();
    const { data: settlement, error } = await supabase
      .from('team_settlements')
      .select('id, project_id, status, settlement_no')
      .eq('id', settlementId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!settlement) return apiNotFound('结算单不存在');

    const status = String(settlement.status || 'draft');
    if (!['draft', 'rejected', 'pending'].includes(status)) {
      return apiBadRequest('只有草稿、已驳回或已提交待审批的结算单可以删除');
    }

    const access = await assertProjectAccess(supabase, auth.user, Number(settlement.project_id));
    if (!access.ok) return apiForbidden('无权删除该项目班组结算');

    // 乐观锁：仅当仍处于校验时的状态才删除，防止与审批并发时误删已生效结算
    const { data: deletedRows, error: deleteError } = await supabase
      .from('team_settlements')
      .delete()
      .eq('id', settlementId)
      .eq('status', status)
      .select('id');
    if (deleteError) throw new Error(deleteError.message);
    if (!deletedRows || deletedRows.length === 0) {
      return apiBadRequest('结算单状态已变化（可能已被他人审批），请刷新后重试');
    }

    try {
      invalidateAggregationCache();
    } catch {
      // 缓存失效非致命
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'team_settlement',
      resourceId: settlementId,
      details: { settlement_no: settlement.settlement_no, status },
      request,
    });

    return apiSuccess({ deleted: true });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组结算删除失败'));
  }
}
