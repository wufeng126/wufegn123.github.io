import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  isFinalSettlementType,
  isVoidedStatus,
  REVIEW_STATUS,
  summarizeSupplierSettlementRows,
} from '@/lib/business-logic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const contractId = searchParams.get('contract_id');
  const supabase = getSupabaseClient();

  if (!contractId) {
    const { data: settlements, error: settlementsError } = await supabase
      .from('supplier_settlements')
      .select('*');

    if (settlementsError) {
      return Response.json({ error: settlementsError.message }, { status: 500 });
    }

    const activeSettlements = (settlements || []).filter((settlement: any) => !isVoidedStatus(settlement.status));

    const { data: payments, error: paymentsError } = await supabase
      .from('supplier_payments')
      .select('*');

    if (paymentsError) {
      return Response.json({ error: paymentsError.message }, { status: 500 });
    }

    const totals = summarizeSupplierSettlementRows(activeSettlements, payments || []);

    return Response.json({
      supplierCost: totals.totalAmount,
      supplierPaid: totals.totalPaid,
      supplierPending: totals.totalProgressPending,
    });
  }

  const { data: settlements, error: settlementsError } = await supabase
    .from('supplier_settlements')
    .select('*')
    .eq('contract_id', contractId)
    .order('settlement_date', { ascending: true });

  if (settlementsError) {
    return Response.json({ error: settlementsError.message }, { status: 500 });
  }

  const activeSettlements = (settlements || []).filter((settlement: any) => !isVoidedStatus(settlement.status));

  const { data: payments, error: paymentsError } = await supabase
    .from('supplier_payments')
    .select('payment_amount, status')
    .eq('contract_id', contractId);

  if (paymentsError) {
    return Response.json({ error: paymentsError.message }, { status: 500 });
  }

  const totals = summarizeSupplierSettlementRows(activeSettlements, payments || []);
  const hasFinalSettlement = activeSettlements.some((settlement: any) =>
    isFinalSettlementType(settlement.settlement_type)
  );

  const summary = {
    contractId: Number(contractId),
    totalSettlements: totals.totalSettlements,
    totalAmount: totals.totalAmount,
    totalPayable: totals.totalPayable,
    totalFinalPayable: totals.totalFinalPayable,
    totalPaid: totals.totalPaid,
    totalProgressPending: totals.totalProgressPending,
    totalFinalPending: totals.totalFinalPending,
    hasFinalSettlement,
    settlements: activeSettlements.map((settlement: any) => ({
      id: settlement.id,
      type: settlement.settlement_type,
      amount: settlement.settlement_amount,
      payable: settlement.payable_amount,
      date: settlement.settlement_date,
      status: settlement.status || REVIEW_STATUS.DRAFT,
    })),
  };

  return Response.json({ summary });
}
