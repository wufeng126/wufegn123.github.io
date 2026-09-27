import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isEffectiveSupplierPaymentStatus, isReviewedStatus } from '@/lib/business-logic';
import { requireAuth } from '@/lib/api-auth';
import {
  badProjectIdResponse,
  canAccessProject,
  emptyProjectScopeResponse,
  getProjectAccessScope,
  parseOptionalProjectId,
} from '@/lib/api-project-scope';

const emptySummary = {
  totalContracts: 0,
  totalAmount: 0,
  totalSettlement: 0,
  totalPayable: 0,
  totalPaid: 0,
  totalPending: 0,
  totalWarranty: 0,
  totalFinalPayment: 0,
};

function collectPaymentById(target: Map<number, any>, rows?: any[] | null) {
  (rows || []).forEach((payment) => {
    const id = Number(payment.id);
    if (Number.isFinite(id) && id > 0) {
      target.set(id, payment);
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');
    const projectId = searchParams.get('project_id');
    const requestedProjectId = parseOptionalProjectId(projectId);
    if (Number.isNaN(requestedProjectId)) return badProjectIdResponse();

    const projectScope = await getProjectAccessScope(supabase, auth.user);
    if (requestedProjectId && !canAccessProject(projectScope, requestedProjectId)) {
      return NextResponse.json({ error: '当前账号无权访问该项目' }, { status: 403 });
    }
    if (!requestedProjectId && projectScope !== null && projectScope.length === 0) {
      return emptyProjectScopeResponse({ items: [], summary: emptySummary });
    }

    // 获取所有合同及汇总数据
    let query = supabase
      .from('supplier_contracts')
      .select(`
        id, contract_name, contract_no, total_amount, contract_status, locked,
        supplier:supplier_id(id, name, type),
        project:project_id(id, name)
      `);

    if (supplierId) query = query.eq('supplier_id', supplierId);
    if (requestedProjectId) {
      query = query.eq('project_id', requestedProjectId);
    } else if (projectScope !== null) {
      query = query.in('project_id', projectScope);
    }

    const { data: contracts, error: contractError } = await query;
    if (contractError) throw contractError;

    const contractIds = (contracts || []).map((c: any) => Number(c.id)).filter(Boolean);
    const contractIdSet = new Set(contractIds);

    let settlements: any[] = [];
    if (contractIds.length > 0) {
      const { data, error: settlementError } = await supabase
        .from('supplier_settlements')
        .select('*')
        .in('contract_id', contractIds);
      if (settlementError) throw settlementError;
      settlements = data || [];
    }

    const paymentMapById = new Map<number, any>();
    if (contractIds.length > 0) {
      const { data: contractPayments, error: paymentError } = await supabase
        .from('supplier_payments')
        .select('*')
        .in('contract_id', contractIds);
      if (paymentError) throw paymentError;
      collectPaymentById(paymentMapById, contractPayments);
    }

    let directPaymentQuery = supabase
      .from('supplier_payments')
      .select('*');
    if (supplierId) directPaymentQuery = directPaymentQuery.eq('supplier_id', supplierId);
    if (requestedProjectId) {
      directPaymentQuery = directPaymentQuery.eq('project_id', requestedProjectId);
    } else if (projectScope !== null) {
      directPaymentQuery = directPaymentQuery.in('project_id', projectScope);
    }
    const { data: directPayments, error: directPaymentError } = await directPaymentQuery;
    if (directPaymentError) throw directPaymentError;
    collectPaymentById(paymentMapById, directPayments);
    const payments = Array.from(paymentMapById.values());

    const directUnlinkedPayments = payments.filter((payment: any) => {
      if (!isEffectiveSupplierPaymentStatus(payment.status)) return false;
      const contractId = Number(payment.contract_id);
      return !Number.isFinite(contractId) || contractId <= 0 || !contractIdSet.has(contractId);
    });

    const supplierIds = Array.from(new Set(
      directUnlinkedPayments.map((payment: any) => Number(payment.supplier_id)).filter(Boolean)
    ));
    const projectIds = Array.from(new Set(
      directUnlinkedPayments.map((payment: any) => Number(payment.project_id)).filter(Boolean)
    ));
    const supplierMap = new Map<number, any>();
    const projectMap = new Map<number, any>();
    if (supplierIds.length > 0) {
      const { data: directSuppliers, error: supplierError } = await supabase
        .from('suppliers')
        .select('id,name,type')
        .in('id', supplierIds);
      if (supplierError) throw supplierError;
      (directSuppliers || []).forEach((supplier: any) => supplierMap.set(Number(supplier.id), supplier));
    }
    if (projectIds.length > 0) {
      const { data: directProjects, error: projectError } = await supabase
        .from('projects')
        .select('id,name')
        .in('id', projectIds);
      if (projectError) throw projectError;
      (directProjects || []).forEach((project: any) => projectMap.set(Number(project.id), project));
    }

    // 计算汇总数据
    const items = (contracts || []).map((contract: any) => {
      const contractSettlements = (settlements || []).filter((s: any) => (
        s.contract_id === contract.id && isReviewedStatus(s.status)
      ));
      const contractPayments = (payments || []).filter((p: any) => (
        p.contract_id === contract.id && isEffectiveSupplierPaymentStatus(p.status)
      ));

      // 统计结算
      const totalSettlement = contractSettlements.reduce((sum: number, s: any) => sum + Number(s.settlement_amount || 0), 0);
      const totalPayable = contractSettlements.reduce((sum: number, s: any) => sum + Number(s.payable_amount || 0), 0);
      const totalWarranty = contractSettlements.reduce((sum: number, s: any) => sum + Number(s.warranty_amount || 0), 0);

      // 统计付款
      const totalPaid = contractPayments.reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0);

      // 计算未付
      const pendingAmount = totalPayable - totalPaid;

      // 尾款 = 质保金返还
      const finalPayment = contractPayments
        .filter((p: any) => p.payment_type === 'warranty')
        .reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0);

      return {
        supplier_id: contract.supplier?.id,
        supplier_name: contract.supplier?.name,
        supplier_type: contract.supplier?.type,
        project_id: contract.project?.id,
        project_name: contract.project?.name,
        contract_id: contract.id,
        contract_name: contract.contract_name,
        contract_no: contract.contract_no,
        total_amount: Number(contract.total_amount || 0),
        total_settlement: totalSettlement,
        payable_amount: totalPayable,
        paid_amount: totalPaid,
        pending_amount: pendingAmount,
        warranty_amount: totalWarranty,
        final_payment: finalPayment,
        contract_status: contract.locked ? '已完结' : (contract.contract_status || '履约中'),
      };
    });

    const directItems = directUnlinkedPayments.map((payment: any) => {
      const supplier = supplierMap.get(Number(payment.supplier_id));
      const project = projectMap.get(Number(payment.project_id));
      const paymentAmount = Number(payment.payment_amount || 0);
      return {
        supplier_id: Number(payment.supplier_id) || 0,
        supplier_name: supplier?.name || '未知供应商',
        supplier_type: supplier?.type,
        project_id: Number(payment.project_id) || undefined,
        project_name: project?.name || '未关联项目',
        contract_id: -Number(payment.id),
        contract_name: '未关联合同付款',
        contract_no: payment.payment_no || '-',
        total_amount: 0,
        total_settlement: 0,
        payable_amount: 0,
        paid_amount: paymentAmount,
        pending_amount: 0,
        warranty_amount: payment.payment_type === 'warranty' ? paymentAmount : 0,
        final_payment: payment.payment_type === 'warranty' ? paymentAmount : 0,
        contract_status: '未关联合同',
      };
    });

    const allItems = [...items, ...directItems];

    // 全局汇总
    const summary = {
      totalContracts: items.length,
      totalAmount: allItems.reduce((sum: number, i: any) => sum + i.total_amount, 0),
      totalSettlement: allItems.reduce((sum: number, i: any) => sum + i.total_settlement, 0),
      totalPayable: allItems.reduce((sum: number, i: any) => sum + i.payable_amount, 0),
      totalPaid: allItems.reduce((sum: number, i: any) => sum + i.paid_amount, 0),
      totalPending: allItems.reduce((sum: number, i: any) => sum + i.pending_amount, 0),
      totalWarranty: allItems.reduce((sum: number, i: any) => sum + i.warranty_amount, 0),
      totalFinalPayment: allItems.reduce((sum: number, i: any) => sum + i.final_payment, 0),
    };

    return NextResponse.json({ items: allItems, summary });
  } catch (error: any) {
    console.error('Account dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
