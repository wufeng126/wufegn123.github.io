/**
 * P0-6 成本三层对比（纯聚合，无 DB/框架依赖，可单测）
 *
 * 口径说明（与 P0-2 限价语义一致）：
 * - 合同收入（甲方收入） = 累计对上报量 completed_quantity × 合同单价 contract_price
 * - 限价成本（内部成本线）= 累计对上报量 × 限价 limit_price（未填限价退回合同价）
 * - 实际成本（已发生）    = 累计对下结算金额（subitem_monthly_progress 汇总，
 *   每笔按实际结算单价 unit_price，未填退回限价 → 合同价）
 * - 实际毛利 = 合同收入 − 实际成本；超限价 = 加权实际单价 > 限价；负毛利 = 实际毛利 < 0
 */

export interface CostSubitemInput {
  id: number;
  project_id: number;
  project_name?: string | null;
  subitem_name: string;
  unit?: string | null;
  budget_quantity?: string | number | null;
  completed_quantity?: string | number | null;
  settlement_quantity?: string | number | null;
  contract_price?: string | number | null;
  limit_price?: string | number | null;
}

export interface CostSettlementInput {
  subitem_id: number;
  completed_quantity?: string | number | null;
  unit_price?: string | number | null;
}

export interface CostComparisonRow {
  subitem_id: number;
  project_id: number;
  project_name: string;
  subitem_name: string;
  unit: string | null;
  budget_quantity: number;
  completed_quantity: number;
  settlement_quantity: number;
  /** 完成率（%）：完成量 ÷ 预算量，预算量为 0 时为 null */
  completion_rate: number | null;
  contract_price: number;
  limit_price: number | null;
  /** 加权实际结算单价（实际成本 ÷ 结算量），无结算时为 null */
  actual_unit_price: number | null;
  /** 合同收入 = 完成量 × 合同单价 */
  contract_revenue: number;
  /** 限价成本 = 完成量 × 限价（退回合同价） */
  limit_cost: number;
  /** 实际成本 = 累计对下结算金额 */
  actual_cost: number;
  /** 预算毛利空间 = 合同收入 − 限价成本 */
  expected_gross_profit: number;
  /** 实际毛利 = 合同收入 − 实际成本 */
  actual_gross_profit: number;
  /** 实际毛利率（%），合同收入为 0 时为 null */
  actual_gross_profit_rate: number | null;
  /** 加权实际单价超限价（有结算且限价>0 时判定） */
  over_limit: boolean;
  /** 实际毛利为负（成本超收入） */
  negative_profit: boolean;
}

export interface CostComparisonSummary {
  contract_revenue: number;
  limit_cost: number;
  actual_cost: number;
  expected_gross_profit: number;
  actual_gross_profit: number;
  actual_gross_profit_rate: number | null;
  over_limit_count: number;
  negative_profit_count: number;
}

function toNum(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 单笔结算的生效单价：记录单价 → 分项限价 → 分项合同价 */
function effectiveUnitPrice(subitem: CostSubitemInput, recordUnitPrice?: string | number | null): number {
  const recordPrice = toNum(recordUnitPrice);
  if (recordPrice > 0) return recordPrice;
  const limitPrice = toNum(subitem.limit_price);
  if (limitPrice > 0) return limitPrice;
  return toNum(subitem.contract_price);
}

export function buildSubitemCostComparison(params: {
  subitems: CostSubitemInput[];
  settlements: CostSettlementInput[];
}): { rows: CostComparisonRow[]; summary: CostComparisonSummary } {
  const { subitems, settlements } = params;

  const rows: CostComparisonRow[] = subitems.map((subitem) => {
    const budgetQty = toNum(subitem.budget_quantity);
    const completedQty = toNum(subitem.completed_quantity);
    const settlementQty = toNum(subitem.settlement_quantity);
    const contractPrice = toNum(subitem.contract_price);
    const limitPrice = toNum(subitem.limit_price);
    const limitPriceOrContract = limitPrice > 0 ? limitPrice : contractPrice;

    const subSettlements = settlements.filter((s) => s.subitem_id === subitem.id);
    const actualCost = round2(
      subSettlements.reduce((sum, s) => sum + toNum(s.completed_quantity) * effectiveUnitPrice(subitem, s.unit_price), 0)
    );

    const contractRevenue = round2(completedQty * contractPrice);
    const limitCost = round2(completedQty * limitPriceOrContract);
    const actualGrossProfit = round2(contractRevenue - actualCost);
    const actualGrossProfitRate = contractRevenue > 0 ? (actualGrossProfit / contractRevenue) * 100 : null;

    const actualUnitPrice = settlementQty > 0 ? round2(actualCost / settlementQty) : null;

    return {
      subitem_id: subitem.id,
      project_id: subitem.project_id,
      project_name: subitem.project_name || '',
      subitem_name: subitem.subitem_name,
      unit: subitem.unit ?? null,
      budget_quantity: budgetQty,
      completed_quantity: completedQty,
      settlement_quantity: settlementQty,
      completion_rate: budgetQty > 0 ? round2((completedQty / budgetQty) * 100) : null,
      contract_price: contractPrice,
      limit_price: limitPrice > 0 ? limitPrice : null,
      actual_unit_price: actualUnitPrice,
      contract_revenue: contractRevenue,
      limit_cost: limitCost,
      actual_cost: actualCost,
      expected_gross_profit: round2(contractRevenue - limitCost),
      actual_gross_profit: actualGrossProfit,
      actual_gross_profit_rate: actualGrossProfitRate === null ? null : round2(actualGrossProfitRate),
      over_limit: settlementQty > 0 && limitPrice > 0 && (actualUnitPrice ?? 0) > limitPrice,
      negative_profit: actualGrossProfit < 0,
    };
  });

  const contractRevenue = round2(rows.reduce((sum, r) => sum + r.contract_revenue, 0));
  const limitCost = round2(rows.reduce((sum, r) => sum + r.limit_cost, 0));
  const actualCost = round2(rows.reduce((sum, r) => sum + r.actual_cost, 0));
  const actualGrossProfit = round2(contractRevenue - actualCost);

  const summary: CostComparisonSummary = {
    contract_revenue: contractRevenue,
    limit_cost: limitCost,
    actual_cost: actualCost,
    expected_gross_profit: round2(contractRevenue - limitCost),
    actual_gross_profit: actualGrossProfit,
    actual_gross_profit_rate: contractRevenue > 0 ? round2((actualGrossProfit / contractRevenue) * 100) : null,
    over_limit_count: rows.filter((r) => r.over_limit).length,
    negative_profit_count: rows.filter((r) => r.negative_profit).length,
  };

  return { rows, summary };
}
