import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  isFinalSettlementType,
  isReviewedStatus,
  REVIEW_STATUS,
  summarizeSupplierSettlementRows,
} from '@/lib/business-logic';
import { assertProjectAccess, emptyProjectScopeResponse, getProjectAccessScope } from '@/lib/api-project-scope';

const emptyTotals = {
  supplierCost: 0,
  supplierPaid: 0,
  supplierPending: 0,
};

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const contractId = searchParams.get('contract_id');
  const supabase = getSupabaseClient();

  if (!contractId) {
    const projectScope = await getProjectAccessScope(supabase, auth.user);
    if (projectScope !== null && projectScope.length === 0) {
      return emptyProjectScopeResponse(emptyTotals);
    }

    let contractQuery = supabase
      .from('supplier_contracts')
      .select('id, project_id');
    if (projectScope !== null) {
      contractQuery = contractQuery.in('project_id', projectScope);
    }

    const { data: contracts, error: contractError } = await contractQuery;
    if (contractError) {
      return Response.json({ error: contractError.message }, { status: 500 });
    }

    const contractIds = (contracts || []).map((contract: any) => Number(contract.id)).filter(Boolean);
    let settlements: any[] = [];
    if (contractIds.length > 0) {
      const { data, error: settlementsError } = await supabase
        .from('supplier_settlements')
        .select('*')
        .in('contract_id', contractIds);

      if (settlementsError) {
        return Response.json({ error: settlementsError.message }, { status: 500 });
      }
      settlements = data || [];
    }

    const reviewedSettlements = (settlements || []).filter((settlement: any) => isReviewedStatus(settlement.status));

    const paymentMapById = new Map<number, any>();
    const addPaymentRows = (rows?: any[] | null) => {
      (rows || []).forEach((payment) => {
        const id = Number(payment.id);
        if (Number.isFinite(id) && id > 0) {
          paymentMapById.set(id, payment);
        }
      });
    };

    if (contractIds.length > 0) {
      const { data: contractPayments, error: paymentsError } = await supabase
        .from('supplier_payments')
        .select('*')
        .in('contract_id', contractIds);

      if (paymentsError) {
        return Response.json({ error: paymentsError.message }, { status: 500 });
      }
      addPaymentRows(contractPayments);
    }

    let projectPaymentQuery = supabase
      .from('supplier_payments')
      .select('*');
    if (projectScope !== null) {
      projectPaymentQuery = projectPaymentQuery.in('project_id', projectScope);
    }

    const { data: projectPayments, error: projectPaymentsError } = await projectPaymentQuery;
    if (projectPaymentsError) {
      return Response.json({ error: projectPaymentsError.message }, { status: 500 });
    }
    addPaymentRows(projectPayments);

    const totals = summarizeSupplierSettlementRows(reviewedSettlements, Array.from(paymentMapById.values()));

    return Response.json({
      supplierCost: totals.totalAmount,
      supplierPaid: totals.totalPaid,
      supplierPending: totals.totalProgressPending,
    });
  }

  const { data: contract, error: contractError } = await supabase
    .from('supplier_contracts')
    .select('id, project_id')
    .eq('id', contractId)
    .single();
  if (contractError || !contract) {
    return Response.json({ error: '合同不存在' }, { status: 404 });
  }
  const access = await assertProjectAccess(supabase, auth.user, contract.project_id);
  if (!access.ok) return access.response;

  const { data: settlements, error: settlementsError } = await supabase
    .from('supplier_settlements')
    .select('*')
    .eq('contract_id', contractId)
    .order('settlement_date', { ascending: true });

  if (settlementsError) {
    return Response.json({ error: settlementsError.message }, { status: 500 });
  }

  const reviewedSettlements = (settlements || []).filter((settlement: any) => isReviewedStatus(settlement.status));

  const { data: payments, error: paymentsError } = await supabase
    .from('supplier_payments')
    .select('payment_amount, status')
    .eq('contract_id', contractId);

  if (paymentsError) {
    return Response.json({ error: paymentsError.message }, { status: 500 });
  }

  const totals = summarizeSupplierSettlementRows(reviewedSettlements, payments || []);
  const hasFinalSettlement = reviewedSettlements.some((settlement: any) =>
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
    settlements: reviewedSettlements.map((settlement: any) => ({
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
