export type SupplierPaymentAllocationSettlement = {
  id?: number | string | null;
  settlement_no?: string | null;
  settlement_type?: string | null;
  payable_amount?: number | string | null;
  paid_amount?: number | string | null;
};

export type SupplierPaymentAllocation = {
  settlement_id: number;
  settlement_no: string | null;
  settlement_type: string | null;
  payment_amount: number;
  unpaid_balance: number;
};

export type SupplierPaymentAllocationResult = {
  allocations: SupplierPaymentAllocation[];
  total_selected_unpaid: number;
  unallocated_amount: number;
};

function parseMoney(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return Number(value) || 0;
  return 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function allocateSupplierPaymentAcrossSettlements(
  settlements: SupplierPaymentAllocationSettlement[],
  paymentAmount: number | string
): SupplierPaymentAllocationResult {
  let remaining = Math.max(0, roundMoney(parseMoney(paymentAmount)));
  let totalSelectedUnpaid = 0;
  const allocations: SupplierPaymentAllocation[] = [];

  for (const settlement of settlements) {
    const settlementId = Number(settlement.id || 0);
    if (!Number.isInteger(settlementId) || settlementId <= 0) continue;

    const payableAmount = parseMoney(settlement.payable_amount);
    const paidAmount = parseMoney(settlement.paid_amount);
    const unpaidBalance = Math.max(0, roundMoney(payableAmount - paidAmount));
    if (unpaidBalance <= 0) continue;

    totalSelectedUnpaid = roundMoney(totalSelectedUnpaid + unpaidBalance);
    if (remaining <= 0) continue;

    const paymentSlice = Math.min(remaining, unpaidBalance);
    allocations.push({
      settlement_id: settlementId,
      settlement_no: settlement.settlement_no || null,
      settlement_type: settlement.settlement_type || null,
      payment_amount: roundMoney(paymentSlice),
      unpaid_balance: unpaidBalance,
    });
    remaining = roundMoney(remaining - paymentSlice);
  }

  return {
    allocations,
    total_selected_unpaid: totalSelectedUnpaid,
    unallocated_amount: remaining,
  };
}
