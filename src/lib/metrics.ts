/**
 * 全站口径字典（唯一事实来源）
 *
 * 目的：同一个业务概念只允许一种判定，避免各页面自己写 SQL / 自己 if 判断导致口径分叉。
 * 使用规则：
 * - 统计"算不算"：用 isRevenueIncluded / isReviewedStatus / isEffective*，不要自己写 status 比较
 * - SQL 过滤"已审核且要容忍 NULL"：用 REVIEWED_STATUS_OR_NULL
 * - 工人"在场"：用 isActiveWorkerStatus
 * - 项目"在建"：用 isActiveProjectStatus
 */
import { isReviewedStatus, isVoidedStatus } from '@/lib/review-status';

/** PostgREST 过滤串：status 为 reviewed 或为空（历史数据兼容）。用于 .or(...) */
export const REVIEWED_STATUS_OR_NULL = 'status.is.null,status.eq.reviewed';

/** 参与统计（不算作废、不算草稿）：status 为空按历史有效数据处理 */
export function isIncludedInStats(status?: string | null): boolean {
  if (!status) return true;
  if (isVoidedStatus(status)) return false;
  return isReviewedStatus(status);
}

/** 工人是否"在场/在职"：空状态按在职兼容（历史数据） */
export function isActiveWorkerStatus(status?: string | null): boolean {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return true;
  return ['in_service', 'active', '在场', '在岗', '正常'].includes(normalized);
}

/** 工人是否已退场 */
export function isLeftWorkerStatus(status?: string | null): boolean {
  const normalized = String(status || '').trim().toLowerCase();
  return ['left', 'resigned', '退场', '离职'].includes(normalized);
}

/** 项目状态归一：返回 "在建" | "竣工结算" | "暂停" | 原始值 */
export function normalizeProjectStatus(status?: string | null): string {
  const raw = String(status || '').trim();
  switch (raw) {
    case '进行中':
    case '在建':
    case 'active':
      return '在建';
    case '已完成':
    case '已完工':
    case '竣工结算':
    case 'completed':
      return '竣工结算';
    case '暂停':
    case '暂停中':
    case 'paused':
      return '暂停';
    default:
      return raw;
  }
}

/** 项目是否算"在建"（用于统计在建项目数/单选下拉） */
export function isActiveProjectStatus(status?: string | null): boolean {
  return normalizeProjectStatus(status) === '在建';
}

/** 累计产值：统一复用 lib/revenue 的 getReportRevenue（按开票额），禁止各页面另写一套 */
export { getReportRevenue as getInvoiceRevenue } from '@/lib/revenue';

/** 工资"应发"合计 */
export function sumSalaryGross(rows: Array<{ gross_pay?: unknown }>): number {
  return rows.reduce((sum, row) => sum + (Number(row.gross_pay) || 0), 0);
}

/** 工资"实发"合计 */
export function sumSalaryNet(rows: Array<{ net_pay?: unknown }>): number {
  return rows.reduce((sum, row) => sum + (Number(row.net_pay) || 0), 0);
}
