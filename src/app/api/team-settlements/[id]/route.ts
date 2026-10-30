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

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * 编辑班组结算单（仅草稿/已驳回）。
 * 支持更新：结算月份、备注、附件、四项扣款、付款比例、工程量明细（替换）、分账金额（按工人重算）。
 * 已提交待审批/已审批的结算单不可编辑（需先撤回或反审核）。
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePermission(request, 'team_settlements:edit');
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const settlementId = Number(id);
    if (!Number.isInteger(settlementId) || settlementId <= 0) {
      return apiBadRequest('结算单ID无效');
    }

    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseClient();

    const { data: settlement, error } = await supabase
      .from('team_settlements')
      .select('id, project_id, team_id, status, settlement_month')
      .eq('id', settlementId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!settlement) return apiNotFound('结算单不存在');

    const status = String(settlement.status || 'draft');
    if (!['draft', 'rejected'].includes(status)) {
      return apiBadRequest('只有草稿或已驳回的结算单可以编辑（待审批/已审批请先撤回或反审核）');
    }

    const access = await assertProjectAccess(supabase, auth.user, Number(settlement.project_id));
    if (!access.ok) return apiForbidden('无权编辑该项目班组结算');

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (body?.settlement_month !== undefined) {
      const month = String(body.settlement_month || '').trim();
      if (!/^\d{4}-\d{2}$/.test(month)) return apiBadRequest('结算月份格式应为 YYYY-MM');
      patch.settlement_month = month;
    }
    if (body?.remark !== undefined) patch.remark = body.remark ? String(body.remark) : null;
    if (Array.isArray(body?.attachments)) {
      patch.attachments = body.attachments.filter(
        (att: unknown) => att && typeof att === 'object' && typeof (att as { key?: unknown }).key === 'string',
      );
    }
    for (const field of ['advance_deduct', 'labor_insurance_deduct', 'helper_deduct', 'safety_fund_deduct'] as const) {
      if (body?.[field] !== undefined) patch[field] = round2(toNumber(body[field]));
    }
    if (body?.payment_ratio !== undefined) {
      patch.payment_ratio = Math.max(0, Math.min(100, round2(toNumber(body.payment_ratio))));
    }

    // 乐观锁：仅草稿/已驳回状态可更新，防止与提交审批并发时覆盖
    const { data: updatedRows, error: updateError } = await supabase
      .from('team_settlements')
      .update(patch)
      .eq('id', settlementId)
      .in('status', ['draft', 'rejected'])
      .select('id');
    if (updateError) throw new Error(updateError.message);
    if (!updatedRows || updatedRows.length === 0) {
      return apiBadRequest('结算单状态已变化（可能已被提交审批），请刷新后重试');
    }

    // 替换工程量明细
    if (Array.isArray(body?.items)) {
      const items = (body.items as Array<{ content?: unknown; unit?: unknown; quantity?: unknown; unit_price?: unknown }>)
        .map((item) => ({
          content: String(item.content || '').trim(),
          unit: item.unit ? String(item.unit) : null,
          quantity: round2(toNumber(item.quantity)),
          unit_price: round2(toNumber(item.unit_price)),
        }))
        .filter((item) => item.content && item.quantity > 0);
      if (items.length === 0) return apiBadRequest('请至少录入一条结算工程量');

      const { error: deleteItemError } = await supabase
        .from('team_settlement_items')
        .delete()
        .eq('settlement_id', settlementId);
      if (deleteItemError) throw new Error(deleteItemError.message);

      const { error: insertItemError } = await supabase.from('team_settlement_items').insert(
        items.map((item) => ({
          settlement_id: settlementId,
          project_id: Number(settlement.project_id),
          team_id: Number(settlement.team_id),
          content: item.content,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: round2(item.quantity * item.unit_price),
        })),
      );
      if (insertItemError) throw new Error(insertItemError.message);
    }

    // 更新分账金额（保留原工时，重算单价）
    if (Array.isArray(body?.splits)) {
      const { data: existingSplits } = await supabase
        .from('team_settlement_splits')
        .select('worker_id, work_hours')
        .eq('settlement_id', settlementId);
      const hoursMap = new Map(
        (existingSplits || []).map((split: { worker_id?: unknown; work_hours?: unknown }) => [
          Number(split.worker_id),
          Number(split.work_hours || 0),
        ]),
      );
      const nextSplits = (body.splits as Array<{ worker_id?: unknown; amount?: unknown }>)
        .map((split) => {
          const workerId = Number(split.worker_id);
          const amount = round2(toNumber(split.amount));
          if (!workerId || amount <= 0) return null;
          return { workerId, amount, workHours: round2(hoursMap.get(workerId) || 0) };
        })
        .filter((split): split is { workerId: number; amount: number; workHours: number } => split !== null);

      if (nextSplits.length > 0) {
        const { error: deleteSplitError } = await supabase
          .from('team_settlement_splits')
          .delete()
          .eq('settlement_id', settlementId);
        if (deleteSplitError) throw new Error(deleteSplitError.message);
        const { error: insertSplitError } = await supabase.from('team_settlement_splits').insert(
          nextSplits.map((split) => ({
            settlement_id: settlementId,
            project_id: Number(settlement.project_id),
            team_id: Number(settlement.team_id),
            worker_id: split.workerId,
            work_hours: split.workHours,
            unit_price: split.workHours > 0 ? round2(split.amount / split.workHours) : 0,
            amount: split.amount,
          })),
        );
        if (insertSplitError) throw new Error(insertSplitError.message);
      }
    }

    try {
      invalidateAggregationCache();
    } catch {
      // 缓存失效非致命
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'team_settlement',
      resourceId: settlementId,
      details: {
        action: 'edit',
        from_status: status,
        settlement_month: patch.settlement_month ?? settlement.settlement_month,
      },
      request,
    });

    return apiSuccess({ settlement_id: settlementId, updated: true });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组结算编辑失败'));
  }
}