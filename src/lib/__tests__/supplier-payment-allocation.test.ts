import { describe, expect, it } from 'vitest';
import { allocateSupplierPaymentAcrossSettlements } from '@/lib/supplier-payment-allocation';

describe('allocateSupplierPaymentAcrossSettlements', () => {
  it('按所选结算单剩余未付金额顺序分摊一笔付款', () => {
    const result = allocateSupplierPaymentAcrossSettlements([
      { id: 1, settlement_no: 'JS001', payable_amount: 1000, paid_amount: 400 },
      { id: 2, settlement_no: 'JS002', payable_amount: 2000, paid_amount: 500 },
    ], 1300);

    expect(result.allocations).toEqual([
      { settlement_id: 1, settlement_no: 'JS001', settlement_type: null, payment_amount: 600, unpaid_balance: 600 },
      { settlement_id: 2, settlement_no: 'JS002', settlement_type: null, payment_amount: 700, unpaid_balance: 1500 },
    ]);
    expect(result.total_selected_unpaid).toBe(2100);
    expect(result.unallocated_amount).toBe(0);
  });

  it('付款金额超过所选结算单未付时保留未分摊金额作为合同级付款', () => {
    const result = allocateSupplierPaymentAcrossSettlements([
      { id: 1, settlement_no: 'JS001', payable_amount: 1000, paid_amount: 400 },
    ], 1000);

    expect(result.allocations).toEqual([
      { settlement_id: 1, settlement_no: 'JS001', settlement_type: null, payment_amount: 600, unpaid_balance: 600 },
    ]);
    expect(result.total_selected_unpaid).toBe(600);
    expect(result.unallocated_amount).toBe(400);
  });

  it('跳过已付清或无效的结算单', () => {
    const result = allocateSupplierPaymentAcrossSettlements([
      { id: 1, settlement_no: 'JS001', payable_amount: 500, paid_amount: 500 },
      { id: 2, settlement_no: 'JS002', payable_amount: 300, paid_amount: 0 },
      { id: 0, settlement_no: 'bad', payable_amount: 1000, paid_amount: 0 },
    ], 200);

    expect(result.allocations).toEqual([
      { settlement_id: 2, settlement_no: 'JS002', settlement_type: null, payment_amount: 200, unpaid_balance: 300 },
    ]);
    expect(result.total_selected_unpaid).toBe(300);
    expect(result.unallocated_amount).toBe(0);
  });
});
