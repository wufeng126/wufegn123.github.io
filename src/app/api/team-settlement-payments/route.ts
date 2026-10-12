import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix, auditLog } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

async function assertProjectAccess(supabase: ReturnType<typeof getSupabaseClient>, user: Parameters<typeof getAccessibleProjectIds>[1], projectId: number) {
  const accessibleProjectIds = await getAccessibleProjectIds(supabase, user);
  if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(projectId)) {
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const settlementId = parseId(searchParams.get('settlementId'));

    const supabase = getSupabaseClient();
    if (!settlementId) return apiBadRequest('缺少结算单标识');

    const { data: settlement, error: settlementError } = await supabase
      .from('team_settlements')
      .select('*')
      .eq('id', settlementId)
      .maybeSingle();
    if (settlementError) throw new Error(settlementError.message);
    if (!settlement) return apiBadRequest('结算单不存在');

    const hasAccess = await assertProjectAccess(supabase, auth.user, Number(settlement.project_id));
    if (!hasAccess) return apiForbidden('无权查看该项目的班组付款');

    const { data: payments, error } = await supabase
      .from('team_settlement_payments')
      .select('*')
      .eq('settlement_id', settlementId)
      .order('payment_date', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw new Error(error.message);

    const { data: items } = await supabase
      .from('team_settlement_items')
      .select('amount')
      .eq('settlement_id', settlementId);
    const quantityAmount = round2((items || []).reduce((sum, item) => sum + toNumber(item.amount), 0));
    const deductionTotal = round2(
      toNumber(settlement.advance_deduct) +
        toNumber(settlement.labor_insurance_deduct) +
        toNumber(settlement.helper_deduct) +
        toNumber(settlement.safety_fund_deduct),
    );
    const payableAmount = round2(Math.max(0, quantityAmount - deductionTotal));
    const paidTotal = round2((payments || []).reduce((sum, payment) => sum + toNumber(payment.payment_amount), 0));
    const unpaidTotal = round2(Math.max(0, payableAmount - paidTotal));

    return apiSuccess({
      payments: payments || [],
      settlement: {
        id: Number(settlement.id),
        settlement_no: settlement.settlement_no || '',
        project_id: Number(settlement.project_id),
        team_id: Number(settlement.team_id),
        payable_amount: payableAmount,
        paid_amount: paidTotal,
        unpaid_amount: unpaidTotal,
      },
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组付款加载失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const settlementId = parseId(body?.settlement_id);
    const amount = round2(toNumber(body?.payment_amount));
    if (!settlementId) return apiBadRequest('缺少结算单标识');
    if (amount <= 0) return apiBadRequest('付款金额应大于 0');

    const supabase = getSupabaseClient();
    const { data: settlement, error: settlementError } = await supabase
      .from('team_settlements')
      .select('*')
      .eq('id', settlementId)
      .maybeSingle();
    if (settlementError) throw new Error(settlementError.message);
    if (!settlement) return apiBadRequest('结算单不存在');

    const projectId = Number(settlement.project_id);
    const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
    if (!hasAccess) return apiForbidden('无权维护该项目班组付款');

    const paymentDate = body?.payment_date ? new Date(body.payment_date).toISOString() : new Date().toISOString();

    const { data: paymentRows, error: insertError } = await insertWithSequenceFix('team_settlement_payments', {
      settlement_id: settlementId,
      project_id: projectId,
      team_id: settlement.team_id ? Number(settlement.team_id) : null,
      payment_amount: amount,
      method: body?.method || 'bank',
      method_desc: body?.method_desc || null,
      payment_date: paymentDate,
      remark: body?.remark || null,
      created_by: auth.user.id,
      created_by_name: auth.user.name || auth.user.username,
    }, supabase);
    if (insertError) throw new Error(insertError.message);

    const payment = Array.isArray(paymentRows) ? paymentRows[0] : paymentRows;
    await auditLog({
      operationType: 'create',
      resourceType: 'team_settlement_payment',
      resourceId: Number(payment?.id),
      details: {
        settlement_id: settlementId,
        project_id: projectId,
        payment_amount: amount,
        method: body?.method || 'bank',
      },
      request,
    });

    return apiSuccess({ payment });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组付款保存失败'));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const paymentId = parseId(searchParams.get('id'));
    if (!paymentId) return apiBadRequest('缺少付款记录标识');

    const supabase = getSupabaseClient();
    const { data: payment, error: findError } = await supabase
      .from('team_settlement_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!payment) return apiBadRequest('付款记录不存在');

    const projectId = Number(payment.project_id);
    const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
    if (!hasAccess) return apiForbidden('无权维护该项目班组付款');

    const { error: deleteError } = await supabase.from('team_settlement_payments').delete().eq('id', paymentId);
    if (deleteError) throw new Error(deleteError.message);

    await auditLog({
      operationType: 'delete',
      resourceType: 'team_settlement_payment',
      resourceId: paymentId,
      details: {
        settlement_id: Number(payment.settlement_id),
        project_id: projectId,
        payment_amount: toNumber(payment.payment_amount),
      },
      request,
    });

    return apiSuccess({ ok: true });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组付款删除失败'));
  }
}