export const SUPPLIER_PAYMENT_TYPES = [
  { value: 'progress', label: '进度付款' },
  { value: 'milestone', label: '节点付款' },
  { value: 'final', label: '决算付款' },
  { value: 'warranty', label: '质保金返还' },
] as const;

export type SupplierPaymentType = typeof SUPPLIER_PAYMENT_TYPES[number]['value'];

const SUPPLIER_PAYMENT_TYPE_VALUES = new Set<string>(
  SUPPLIER_PAYMENT_TYPES.map((item) => item.value)
);

export function normalizeSupplierPaymentType(value: unknown, fallback: SupplierPaymentType = 'progress'): SupplierPaymentType {
  const raw = String(value || '').trim();
  if (SUPPLIER_PAYMENT_TYPE_VALUES.has(raw)) {
    return raw as SupplierPaymentType;
  }

  if (/质保|warranty/i.test(raw)) return 'warranty';
  if (/决算|最终|final/i.test(raw)) return 'final';
  if (/节点|阶段|完工|milestone|complete/i.test(raw)) return 'milestone';
  if (/进度|月度|履约|active|progress/i.test(raw)) return 'progress';

  return fallback;
}

export function getSupplierPaymentTypeLabel(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const direct = SUPPLIER_PAYMENT_TYPES.find((item) => item.value === raw);
  if (direct) return direct.label;
  if (!/质保|warranty|决算|最终|final|节点|阶段|完工|milestone|complete|进度|月度|履约|active|progress/i.test(raw)) {
    return raw;
  }
  const normalized = normalizeSupplierPaymentType(raw);
  return SUPPLIER_PAYMENT_TYPES.find((item) => item.value === normalized)?.label || raw;
}
