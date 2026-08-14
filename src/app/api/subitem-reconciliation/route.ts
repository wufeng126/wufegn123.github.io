import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import {
  isEffectiveClientPaymentStatus,
  isInactiveClientPaymentStatus,
} from '@/lib/business-logic';
import { buildSubitemMonthlyReconciliation } from '@/lib/subitem-reconciliation';

/**
 * P0-1 报量-结算-回款月度勾稽聚合 API（GET）
 * 参数：project_id（必填）、year_month（YYYY-MM，缺省为当前月）
 * 返回：分项级"报量 vs 结算"两栏（回款为项目级，只进汇总）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const yearMonth = searchParams.get('year_month');

    if (!projectId) {
      return NextResponse.json({ error: '缺少 project_id 参数' }, { status: 400 });
    }

    const pid = parseInt(projectId);
    if (!Number.isFinite(pid)) {
      return NextResponse.json({ error: 'project_id 参数无效' }, { status: 400 });
    }

    const now = new Date();
    const targetMonth = yearMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      return NextResponse.json({ error: 'year_month 格式应为 YYYY-MM' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 项目数据权限校验（与 client-payments GET 一致）
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjects && !accessibleProjects.includes(pid)) {
      return NextResponse.json({ rows: [], summary: null, year_month: targetMonth });
    }

    // 1. 分项清单（三层价格 + 预算量）
    const { data: subitems, error: subitemsError } = await client
      .from('work_item_subitems')
      .select('id, subitem_name, unit, budget_quantity, contract_price, limit_price')
      .eq('project_id', pid)
      .order('id', { ascending: true });

    if (subitemsError) {
      throw new Error(`查询分项失败: ${subitemsError.message}`);
    }

    const subitemIds = (subitems || []).map((s: any) => s.id);

    // 2. 月度对上报量（全量，前端只需目标月及之前）
    const { data: reports, error: reportsError } = subitemIds.length > 0
      ? await client
          .from('subitem_monthly_reports')
          .select('subitem_id, year_month, report_quantity')
          .in('subitem_id', subitemIds)
      : { data: [], error: null };

    if (reportsError) {
      throw new Error(`查询月度对上报量失败: ${reportsError.message}`);
    }

    // 3. 月度对下结算（含实际结算单价）
    const { data: settlements, error: settlementsError } = subitemIds.length > 0
      ? await client
          .from('subitem_monthly_progress')
          .select('subitem_id, year_month, completed_quantity, unit_price')
          .in('subitem_id', subitemIds)
      : { data: [], error: null };

    if (settlementsError) {
      throw new Error(`查询月度对下结算失败: ${settlementsError.message}`);
    }

    // 4. 甲方回款（项目级，排除已作废/取消；有效状态计入回款）
    const { data: payments, error: paymentsError } = await client
      .from('client_payments')
      .select('payment_amount, payment_date, status')
      .eq('project_id', pid);

    if (paymentsError) {
      throw new Error(`查询甲方回款失败: ${paymentsError.message}`);
    }

    const activePayments = (payments || []).filter(
      (p: any) => !isInactiveClientPaymentStatus(p.status)
    );

    const { rows, summary } = buildSubitemMonthlyReconciliation({
      subitems: (subitems || []).map((s: any) => ({
        id: s.id,
        subitem_name: s.subitem_name,
        unit: s.unit,
        budget_quantity: s.budget_quantity,
        contract_price: s.contract_price,
        limit_price: s.limit_price,
      })),
      reports: (reports || []).map((r: any) => ({
        subitem_id: r.subitem_id,
        year_month: r.year_month,
        report_quantity: r.report_quantity,
      })),
      settlements: (settlements || []).map((s: any) => ({
        subitem_id: s.subitem_id,
        year_month: s.year_month,
        completed_quantity: s.completed_quantity,
        unit_price: s.unit_price,
      })),
      payments: activePayments.map((p: any) => ({
        payment_amount: p.payment_amount,
        payment_date: p.payment_date,
        effective: isEffectiveClientPaymentStatus(p.status),
      })),
      yearMonth: targetMonth,
    });

    return NextResponse.json({ rows, summary, year_month: targetMonth });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}
