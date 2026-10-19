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

function calcPayable(quantityAmount: number, settlement: Record<string, unknown>) {
  const deductionTotal = round2(
    toNumber(settlement.advance_deduct) +
      toNumber(settlement.labor_insurance_deduct) +
      toNumber(settlement.helper_deduct) +
      toNumber(settlement.safety_fund_deduct),
  );
  return round2(Math.max(0, quantityAmount - deductionTotal));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const settlementId = parseId(searchParams.get('settlementId'));
    const teamId = parseId(searchParams.get('teamId'));
    const projectId = parseId(searchParams.get('projectId'));
    const mode = searchParams.get('mode');

    const supabase = getSupabaseClient();

    // 详情页：查某结算单关联的核销付款（含应付/已付核销/未付）
    if (settlementId) {
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
      const payableAmount = calcPayable(quantityAmount, settlement as Record<string, unknown>);
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
    }

    // 班组维度汇总：每班组 结算实付累计 / 付款累计 / 未付
    if (mode === 'team-summary') {
      if (projectId) {
        const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
        if (!hasAccess) return apiForbidden('无权查看该项目');
      }
      let settleQuery = supabase.from('team_settlements').select('id, project_id, team_id, advance_deduct, labor_insurance_deduct, helper_deduct, safety_fund_deduct');
      if (projectId) settleQuery = settleQuery.eq('project_id', projectId);
      if (teamId) settleQuery = settleQuery.eq('team_id', teamId);
      const { data: settlements, error: settleError } = await settleQuery;
      if (settleError) throw new Error(settleError.message);

      const settleIds = (settlements || []).map((s) => Number(s.id));
      let items: Array<{ settlement_id: number; amount: unknown }> = [];
      if (settleIds.length > 0) {
        const { data: itemRows, error: itemError } = await supabase
          .from('team_settlement_items')
          .select('settlement_id, amount')
          .in('settlement_id', settleIds);
        if (itemError) throw new Error(itemError.message);
        items = itemRows || [];
      }
      const itemAmountBySettlement = new Map<number, number>();
      for (const item of items) {
        const sid = Number(item.settlement_id);
        itemAmountBySettlement.set(sid, (itemAmountBySettlement.get(sid) || 0) + toNumber(item.amount));
      }

      const payableByTeam = new Map<number, number>();
      const projectByTeam = new Map<number, number>();
      for (const s of settlements || []) {
        const tid = Number(s.team_id);
        if (!tid) continue;
        projectByTeam.set(tid, Number(s.project_id));
        const payable = calcPayable(itemAmountBySettlement.get(Number(s.id)) || 0, s as unknown as Record<string, unknown>);
        payableByTeam.set(tid, (payableByTeam.get(tid) || 0) + payable);
      }

      let payQuery = supabase.from('team_settlement_payments').select('team_id, project_id, payment_amount');
      if (projectId) payQuery = payQuery.eq('project_id', projectId);
      if (teamId) payQuery = payQuery.eq('team_id', teamId);
      const { data: paymentRows, error: payError } = await payQuery;
      if (payError) throw new Error(payError.message);
      const paidByTeam = new Map<number, number>();
      for (const p of paymentRows || []) {
        const tid = Number(p.team_id);
        if (!tid) continue;
        projectByTeam.set(tid, Number(p.project_id));
        paidByTeam.set(tid, (paidByTeam.get(tid) || 0) + toNumber(p.payment_amount));
      }

      const allTeamIds = Array.from(new Set([...payableByTeam.keys(), ...paidByTeam.keys()]));
      let teamNameMap = new Map<number, string>();
      let teamWorkTypeMap = new Map<number, string>();
      if (allTeamIds.length > 0) {
        const { data: teams } = await supabase.from('team_groups').select('id, name, work_type').in('id', allTeamIds);
        teamNameMap = new Map((teams || []).map((t) => [Number(t.id), String(t.name || '')]));
        teamWorkTypeMap = new Map((teams || []).map((t) => [Number(t.id), String(t.work_type || '')]));
      }
      let projectNameMap = new Map<number, string>();
      const allProjectIds = Array.from(new Set(Array.from(projectByTeam.values()).filter(Boolean)));
      if (allProjectIds.length > 0) {
        const { data: projects } = await supabase.from('projects').select('id, name').in('id', allProjectIds);
        projectNameMap = new Map((projects || []).map((p) => [Number(p.id), String(p.name || '')]));
      }

      const rows = allTeamIds.map((tid) => {
        const payable = round2(payableByTeam.get(tid) || 0);
        const paid = round2(paidByTeam.get(tid) || 0);
        return {
          team_id: tid,
          team_name: teamNameMap.get(tid) || `班组#${tid}`,
          work_type: teamWorkTypeMap.get(tid) || '',
          project_id: projectByTeam.get(tid) || 0,
          project_name: projectNameMap.get(projectByTeam.get(tid) || 0) || '',
          payable_amount: payable,
          paid_amount: paid,
          unpaid_amount: round2(payable - paid),
        };
      }).sort((a, b) => b.unpaid_amount - a.unpaid_amount);

      return apiSuccess({ teams: rows });
    }

    // 通用付款列表：按 teamId / projectId 过滤
    if (projectId) {
      const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
      if (!hasAccess) return apiForbidden('无权查看该项目');
    }
    let query = supabase
      .from('team_settlement_payments')
      .select('*, team_groups(name, work_type), team_settlements(settlement_no, settlement_month), projects(name)')
      .order('payment_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);
    if (teamId) query = query.eq('team_id', teamId);
    if (projectId) query = query.eq('project_id', projectId);
    const { data: payments, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (payments || []).map((p) => {
      const team = (p as Record<string, unknown>).team_groups as { name?: string; work_type?: string } | null;
      const settle = (p as Record<string, unknown>).team_settlements as { settlement_no?: string; settlement_month?: string } | null;
      const proj = (p as Record<string, unknown>).projects as { name?: string } | null;
      return {
        id: Number(p.id),
        settlement_id: p.settlement_id ? Number(p.settlement_id) : null,
        settlement_no: settle?.settlement_no || '',
        settlement_month: settle?.settlement_month || '',
        project_id: Number(p.project_id),
        project_name: proj?.name || '',
        team_id: Number(p.team_id),
        team_name: team?.name || '',
        work_type: team?.work_type || '',
        payment_amount: toNumber(p.payment_amount),
        method: String(p.method || 'bank'),
        method_desc: p.method_desc || null,
        payment_date: p.payment_date,
        remark: p.remark || null,
        created_by_name: p.created_by_name || null,
        created_at: p.created_at,
      };
    });

    return apiSuccess({ payments: rows });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组付款加载失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const teamId = parseId(body?.team_id);
    const settlementId = parseId(body?.settlement_id);
    const amount = round2(toNumber(body?.payment_amount));
    if (!teamId) return apiBadRequest('缺少班组标识');
    if (amount <= 0) return apiBadRequest('付款金额应大于 0');

    const supabase = getSupabaseClient();

    const { data: team, error: teamError } = await supabase
      .from('team_groups')
      .select('id, project_id')
      .eq('id', teamId)
      .maybeSingle();
    if (teamError) throw new Error(teamError.message);
    if (!team) return apiBadRequest('班组不存在');
    const projectId = Number(team.project_id);

    // 可选核销的结算单：必须属于同一班组
    if (settlementId) {
      const { data: settlement, error: settlementError } = await supabase
        .from('team_settlements')
        .select('id, team_id')
        .eq('id', settlementId)
        .maybeSingle();
      if (settlementError) throw new Error(settlementError.message);
      if (!settlement) return apiBadRequest('结算单不存在');
      if (Number(settlement.team_id) !== teamId) return apiBadRequest('结算单与班组不匹配');
    }

    const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
    if (!hasAccess) return apiForbidden('无权维护该项目班组付款');

    const paymentDate = body?.payment_date ? new Date(body.payment_date).toISOString() : new Date().toISOString();

    const { data: paymentRows, error: insertError } = await insertWithSequenceFix('team_settlement_payments', {
      settlement_id: settlementId,
      project_id: projectId,
      team_id: teamId,
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
        team_id: teamId,
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