/**
 * 结算生效单价（纯函数，前后端共用，client 安全）
 *
 * 口径（与 api/subitem-reconciliation 的 effectiveUnitPrice 一致）：
 * 1. 结算记录录入的实际单价（> 0）
 * 2. 退回分项限价（> 0）
 * 3. 退回分项合同价
 *
 * 用于统一「对下结算金额」的统计口径：此前前端多处直接用 `limit_price || contract_price`
 * 计算，完全忽略了结算记录里的实际单价（P0-2 支持超限录入后），导致录入 55 元、统计按
 * 限价 48 元算，成本被系统性少算。
 */

export interface EffectiveSettlementPriceParams {
  /** 结算记录中的实际单价（subitem_monthly_progress.unit_price） */
  recordUnitPrice?: number | string | null;
  /** 分项限价（work_item_subitems.limit_price） */
  limitPrice?: number | string | null;
  /** 分项合同价（work_item_subitems.contract_price） */
  contractPrice?: number | string | null;
}

export function effectiveSettlementPrice(params: EffectiveSettlementPriceParams): number {
  const record = Number(params.recordUnitPrice);
  if (Number.isFinite(record) && record > 0) return record;

  const limit = Number(params.limitPrice);
  if (Number.isFinite(limit) && limit > 0) return limit;

  const contract = Number(params.contractPrice);
  return Number.isFinite(contract) && contract > 0 ? contract : 0;
}
