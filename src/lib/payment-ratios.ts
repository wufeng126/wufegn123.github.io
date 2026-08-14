/**
 * 合同付款比例默认值（L6 修复：前后端/数据库唯一真源，纯常量模块，可被 client 组件安全导入）
 *
 * 使用方：
 * - 前端供应商合同表单/列表（src/app/supplier-contracts/page.tsx）
 * - 后端 API 默认值（src/app/api/supplier-contracts/route.ts）
 * - 数据库 schema default（src/storage/database/shared/schema.ts，人工对齐）
 * - 应付计算兜底（src/lib/business-logic.ts，从本模块 re-export）
 *
 * 决算付款比例默认 100：与 schema default('100') 及 calculatePayableAmount 的 `?? 100`
 * 兜底一致；此前表单/API 默认 0 会导致决算结算应付为 0 的潜在业务错误。
 */
export const DEFAULT_PAYMENT_RATIOS = {
  active: 80,   // 履约/进度付款比例 %
  complete: 95, // 完工结算付款比例 %
  final: 100,   // 决算付款比例 %
} as const;

export type PaymentRatioKey = keyof typeof DEFAULT_PAYMENT_RATIOS;
