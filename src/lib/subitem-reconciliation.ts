/**
 * P0-1 报量-结算-回款月度勾稽（纯聚合，无 DB/框架依赖，可单测）
 *
 * 口径说明（与现有构架一致）：
 * - 对上报量：subitem_monthly_reports（数量 × 合同单价 contract_price = 甲方收入口径）
 * - 对下结算：subitem_monthly_progress（数量 × 实际结算单价 unit_price；
 *   记录未填单价时退回分项限价 limit_price → 合同价 contract_price）
 * - 甲方回款：client_payments 为项目级（无法到分项），只进项目汇总列
 * - 差异 = 报量金额 − 结算金额；差异率 = |差异| ÷ 本月报量金额（报量为 0 时为 null）
 */

/** 差异率预警阈值（%）：本月报量 vs 本月结算差异超过该值提示"可能少结/多报" */
export const RECONCILIATION_RATIO_WARNING_THRESHOLD = 30;

export interface ReconciliationSubitemInput {
  id: number;
  subitem_name: string;
  unit?: string | null;
  budget_quantity?: string | number | null;
  contract_price?: string | number | null;
  limit_price?: string | number | null;
}

export interface ReconciliationReportInput {
  subitem_id: number;
  year_month: string;
  report_quantity?: string | number | null;
}

export interface ReconciliationSettlementInput {
  subitem_id: number;
  year_month: string;
  completed_quantity?: string | number | null;
  unit_price?: string | number | null;
}

export interface ReconciliationPaymentInput {
  payment_amount?: string | number | null;
  payment_date?: string | null;
  /** 是否计入有效回款（调用方按状态判定：completed / reviewed） */
  effective?: boolean;
}

export interface ReconciliationSubitemRow {
  subitem_id: number;
  subitem_name: string;
  unit: string | null;
  budget_quantity: number;
  contract_price: number;
  limit_price: number | null;
  /** 本月对上报量 */
  month_report_quantity: number;
  /** 本月报量金额（× 合同单价） */
  month_report_amount: number;
  /** 累计对上报量（含本月） */
  cumulative_report_quantity: number;
  /** 累计报量金额 */
  cumulative_report_amount: number;
  /** 本月对下结算量 */
  month_settlement_quantity: number;
  /** 本月结算金额（× 实际结算单价） */
  month_settlement_amount: number;
  /** 累计对下结算量（含本月） */
  cumulative_settlement_quantity: number;
  /** 累计结算金额 */
  cumulative_settlement_amount: number;
  /** 本月差异 = 本月报量金额 − 本月结算金额 */
  month_difference: number;
  /** 累计差异 = 累计报量金额 − 累计结算金额 */
  cumulative_difference: number;
  /** 差异率（%）：|本月差异| ÷ 本月报量金额；报量为 0 时为 null */
  difference_ratio: number | null;
  /** 累计报量超出预算量（预算量 > 0 时判定） */
  over_budget: boolean;
  /** 本月结算量 > 本月报量（少报多结风险） */
  settlement_over_report: boolean;
  /** 差异率超过阈值（可能少结/多报） */
  ratio_warning: boolean;
}

export interface ReconciliationSummary {
  /** 本月报量金额合计 */
  month_report_amount: number;
  /** 本月结算金额合计（含内部附加清单口径由前端另行展示，此处为分项结算合计） */
  month_settlement_amount: number;
  /** 本月差异 = 本月报量 − 本月结算 */
  month_difference: number;
  /** 累计报量金额合计 */
  cumulative_report_amount: number;
  /** 累计结算金额合计 */
  cumulative_settlement_amount: number;
  /** 累计差异 */
  cumulative_difference: number;
  /** 本月回款（已生效 client_payments，payment_date 属于目标月） */
  month_payment_amount: number;
  /** 截止目标月累计回款 */
  cumulative_payment_amount: number;
  /** 应收余额 = 累计报量 − 累计回款（负值 = 超收/预收） */
  receivable_amount: number;
  /** 超预算分项数 */
  over_budget_count: number;
  /** 差异率超阈值分项数 */
  ratio_warning_count: number;
  /** 少报多结分项数 */
  settlement_over_report_count: number;
}

function toNum(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 实际结算单价：记录单价 → 分项限价 → 分项合同价（与 P0-2 语义一致） */
function effectiveUnitPrice(subitem: ReconciliationSubitemInput, recordUnitPrice?: string | number | null): number {
  const recordPrice = toNum(recordUnitPrice);
  if (recordPrice > 0) return recordPrice;
  const limitPrice = toNum(subitem.limit_price);
  if (limitPrice > 0) return limitPrice;
  return toNum(subitem.contract_price);
}

/** 月标识比较（YYYY-MM 字符串可直接比较） */
function monthLE(a: string, b: string): boolean {
  return a <= b;
}

export function buildSubitemMonthlyReconciliation(params: {
  subitems: ReconciliationSubitemInput[];
  reports: ReconciliationReportInput[];
  settlements: ReconciliationSettlementInput[];
  payments: ReconciliationPaymentInput[];
  yearMonth: string;
}): { rows: ReconciliationSubitemRow[]; summary: ReconciliationSummary } {
  const { subitems, reports, settlements, payments, yearMonth } = params;

  const rows: ReconciliationSubitemRow[] = subitems.map((subitem) => {
    const budgetQty = toNum(subitem.budget_quantity);
    const contractPrice = toNum(subitem.contract_price);
    const limitPrice = toNum(subitem.limit_price) > 0 ? toNum(subitem.limit_price) : null;

    const subReports = reports.filter((r) => r.subitem_id === subitem.id);
    const subSettlements = settlements.filter((s) => s.subitem_id === subitem.id);

    const monthReportQty = round2(
      subReports.filter((r) => r.year_month === yearMonth).reduce((sum, r) => sum + toNum(r.report_quantity), 0)
    );
    const cumulativeReportQty = round2(
      subReports.filter((r) => monthLE(r.year_month, yearMonth)).reduce((sum, r) => sum + toNum(r.report_quantity), 0)
    );

    const monthSettlementQty = round2(
      subSettlements.filter((s) => s.year_month === yearMonth).reduce((sum, s) => sum + toNum(s.completed_quantity), 0)
    );
    const cumulativeSettlementQty = round2(
      subSettlements.filter((s) => monthLE(s.year_month, yearMonth)).reduce((sum, s) => sum + toNum(s.completed_quantity), 0)
    );

    const monthReportAmount = round2(monthReportQty * contractPrice);
    const cumulativeReportAmount = round2(cumulativeReportQty * contractPrice);

    const monthSettlementAmount = round2(
      subSettlements
        .filter((s) => s.year_month === yearMonth)
        .reduce((sum, s) => sum + toNum(s.completed_quantity) * effectiveUnitPrice(subitem, s.unit_price), 0)
    );
    const cumulativeSettlementAmount = round2(
      subSettlements
        .filter((s) => monthLE(s.year_month, yearMonth))
        .reduce((sum, s) => sum + toNum(s.completed_quantity) * effectiveUnitPrice(subitem, s.unit_price), 0)
    );

    const monthDifference = round2(monthReportAmount - monthSettlementAmount);
    const cumulativeDifference = round2(cumulativeReportAmount - cumulativeSettlementAmount);

    const differenceRatio =
      monthReportAmount > 0 ? Math.abs((monthDifference / monthReportAmount) * 100) : null;

    return {
      subitem_id: subitem.id,
      subitem_name: subitem.subitem_name,
      unit: subitem.unit ?? null,
      budget_quantity: budgetQty,
      contract_price: contractPrice,
      limit_price: limitPrice,
      month_report_quantity: monthReportQty,
      month_report_amount: monthReportAmount,
      cumulative_report_quantity: cumulativeReportQty,
      cumulative_report_amount: cumulativeReportAmount,
      month_settlement_quantity: monthSettlementQty,
      month_settlement_amount: monthSettlementAmount,
      cumulative_settlement_quantity: cumulativeSettlementQty,
      cumulative_settlement_amount: cumulativeSettlementAmount,
      month_difference: monthDifference,
      cumulative_difference: cumulativeDifference,
      difference_ratio: differenceRatio === null ? null : round2(differenceRatio),
      over_budget: budgetQty > 0 && cumulativeReportQty > budgetQty,
      settlement_over_report: monthSettlementQty > monthReportQty,
      ratio_warning: differenceRatio !== null && differenceRatio > RECONCILIATION_RATIO_WARNING_THRESHOLD,
    };
  });

  const monthReportAmount = round2(rows.reduce((sum, r) => sum + r.month_report_amount, 0));
  const monthSettlementAmount = round2(rows.reduce((sum, r) => sum + r.month_settlement_amount, 0));
  const cumulativeReportAmount = round2(rows.reduce((sum, r) => sum + r.cumulative_report_amount, 0));
  const cumulativeSettlementAmount = round2(rows.reduce((sum, r) => sum + r.cumulative_settlement_amount, 0));

  const effectivePayments = payments.filter((p) => p.effective);
  const monthPaymentAmount = round2(
    effectivePayments
      .filter((p) => (p.payment_date || '').slice(0, 7) === yearMonth)
      .reduce((sum, p) => sum + toNum(p.payment_amount), 0)
  );
  const cumulativePaymentAmount = round2(
    effectivePayments
      .filter((p) => monthLE((p.payment_date || '').slice(0, 7), yearMonth))
      .reduce((sum, p) => sum + toNum(p.payment_amount), 0)
  );

  const summary: ReconciliationSummary = {
    month_report_amount: monthReportAmount,
    month_settlement_amount: monthSettlementAmount,
    month_difference: round2(monthReportAmount - monthSettlementAmount),
    cumulative_report_amount: cumulativeReportAmount,
    cumulative_settlement_amount: cumulativeSettlementAmount,
    cumulative_difference: round2(cumulativeReportAmount - cumulativeSettlementAmount),
    month_payment_amount: monthPaymentAmount,
    cumulative_payment_amount: cumulativePaymentAmount,
    receivable_amount: round2(cumulativeReportAmount - cumulativePaymentAmount),
    over_budget_count: rows.filter((r) => r.over_budget).length,
    ratio_warning_count: rows.filter((r) => r.ratio_warning).length,
    settlement_over_report_count: rows.filter((r) => r.settlement_over_report).length,
  };

  return { rows, summary };
}
