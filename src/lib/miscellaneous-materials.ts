import { parseNumeric } from '@/lib/format';

/**
 * 零星材料录入要求：数量、单价必须是有限且大于 0 的数字。
 * 使用 Number 而不是 parseFloat，避免把 "12abc" 静默识别成 12。
 */
export function parsePositiveMiscellaneousMaterialNumber(value: unknown): number | null {
  let parsed: number;

  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return null;
    parsed = Number(normalized);
  } else {
    parsed = parseNumeric(value);
  }

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * 零星材料统一金额口径：金额始终由数量 × 单价计算，保留两位小数。
 * 历史脏数据不参与统计，避免负数或 0 值污染成本口径。
 */
export function calculateMiscellaneousMaterialAmount(
  quantity: unknown,
  unitPrice: unknown,
): number {
  const parsedQuantity = parseNumeric(quantity);
  const parsedUnitPrice = parseNumeric(unitPrice);

  if (
    !Number.isFinite(parsedQuantity) ||
    !Number.isFinite(parsedUnitPrice) ||
    parsedQuantity <= 0 ||
    parsedUnitPrice <= 0
  ) {
    return 0;
  }

  return Math.round((parsedQuantity * parsedUnitPrice + Number.EPSILON) * 100) / 100;
}
