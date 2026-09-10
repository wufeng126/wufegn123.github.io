import { describe, expect, it } from 'vitest';
import { getSupplierPaymentTypeLabel, normalizeSupplierPaymentType } from '../supplier-payment-types';

describe('supplier payment type helpers', () => {
  it('keeps supported payment types explicit', () => {
    expect(normalizeSupplierPaymentType('progress')).toBe('progress');
    expect(normalizeSupplierPaymentType('milestone')).toBe('milestone');
    expect(normalizeSupplierPaymentType('final')).toBe('final');
    expect(normalizeSupplierPaymentType('warranty')).toBe('warranty');
  });

  it('normalizes settlement-derived and legacy names', () => {
    expect(normalizeSupplierPaymentType('阶段结算')).toBe('milestone');
    expect(normalizeSupplierPaymentType('决算付款')).toBe('final');
    expect(normalizeSupplierPaymentType('质保金返还')).toBe('warranty');
    expect(normalizeSupplierPaymentType('履约付款')).toBe('progress');
  });

  it('does not hide unknown historical values in labels', () => {
    expect(getSupplierPaymentTypeLabel('other')).toBe('other');
  });
});
