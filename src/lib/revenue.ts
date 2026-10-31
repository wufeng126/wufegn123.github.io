/**
 * 产值口径（全站统一）
 *
 * 业务决定：**产值 = 开票额（invoice_amount）**。
 * 报量额（report_amount）与结算额（settlement_amount）作为明细展示，不参与产值/收入汇总。
 * 未开票额 = 结算额 - 开票额（用于提示"已结算但未开票"的金额）。
 */

export function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

type RevenueRow = {
  invoice_amount?: unknown;
  settlement_amount?: unknown;
  report_amount?: unknown;
};

/** 产值（收入）：统一取开票额 */
export function getReportRevenue(row: RevenueRow | Record<string, unknown> | null | undefined): number {
  if (!row) return 0;
  return toNumber((row as RevenueRow).invoice_amount);
}

/** 结算额（无结算时回退报量额），仅用于"未开票额"等辅助口径 */
export function getReportSettlement(row: RevenueRow | Record<string, unknown> | null | undefined): number {
  if (!row) return 0;
  const settlement = toNumber((row as RevenueRow).settlement_amount);
  return settlement > 0 ? settlement : toNumber((row as RevenueRow).report_amount);
}

/** 未开票额 = 结算额 - 开票额（不小于 0） */
export function getReportUninvoiced(row: RevenueRow | Record<string, unknown> | null | undefined): number {
  return Math.max(getReportSettlement(row) - getReportRevenue(row), 0);
}
