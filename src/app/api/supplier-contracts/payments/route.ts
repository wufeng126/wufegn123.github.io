import { NextRequest, NextResponse } from 'next/server';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { logSecurityEvent } from '@/lib/security-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import {
  isEffectiveSupplierPaymentStatus,
  isReviewedStatus,
  isVoidedStatus,
  validateSupplierPayment,
} from '@/lib/business-logic';
import { invalidateAggregationCache } from '@/lib/data-aggregation';
import { normalizeSupplierPaymentType } from '@/lib/supplier-payment-types';
import { allocateSupplierPaymentAcrossSettlements } from '@/lib/supplier-payment-allocation';
import {
  assertProjectAccess,
  badProjectIdResponse,
  emptyProjectScopeResponse,
  getProjectAccessScope,
  parseOptionalProjectId,
} from '@/lib/api-project-scope';

type SupplierSettlementPaymentTarget = {
  id: number;
  contract_id: number | string | null;
  settlement_no?: string | null;
  settlement_type?: string | null;
  settlement_amount?: number | string | null;
  payable_amount?: number | string | null;
  status?: string | null;
};

type SupplierPaymentAmountRow = {
  settlement_id?: number | string | null;
  payment_amount?: number | string | null;
  status?: string | null;
};

function normalizePaymentDate(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.replace(/\//g, '-').slice(0, 10);
}

function normalizeSettlementIds(value: unknown, fallback: unknown): number[] {
  const rawValues = Array.isArray(value) ? value : (fallback ? [fallback] : []);
  const ids = rawValues
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
  return [...new Set(ids)];
}

// GET /api/supplier-contracts/payments - 获取付款记录列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contract_id');
    const settlementId = searchParams.get('settlement_id');
    const supplierId = searchParams.get('supplier_id');
    const projectId = searchParams.get('project_id');
    const requestedProjectId = parseOptionalProjectId(projectId);
    if (Number.isNaN(requestedProjectId)) return badProjectIdResponse();
    const projectScope = await getProjectAccessScope(supabase, auth.user);
    if (requestedProjectId && projectScope !== null && !projectScope.includes(requestedProjectId)) {
      return NextResponse.json({ error: '当前账号无权访问该项目' }, { status: 403 });
    }

    let scopedContractIds: number[] | null = null;
    if (contractId && contractId !== 'all') {
      const { data: contract, error: contractError } = await supabase
        .from('supplier_contracts')
        .select('id, project_id')
        .eq('id', parseInt(contractId))
        .single();
      if (contractError || !contract) {
        return NextResponse.json({ error: '合同不存在' }, { status: 404 });
      }
      const access = await assertProjectAccess(supabase, auth.user, contract.project_id);
      if (!access.ok) return access.response;
    } else if ((supplierId && supplierId !== 'all') || requestedProjectId || projectScope !== null) {
      if (projectScope !== null && projectScope.length === 0) {
        return emptyProjectScopeResponse({
          payments: [],
          summary: { totalPayments: 0, totalAmount: 0 },
        });
      }
      let contractScopeQuery = supabase
        .from('supplier_contracts')
        .select('id');

      if (supplierId && supplierId !== 'all') {
        contractScopeQuery = contractScopeQuery.eq('supplier_id', parseInt(supplierId));
      }
      if (requestedProjectId) {
        contractScopeQuery = contractScopeQuery.eq('project_id', requestedProjectId);
      } else if (projectScope !== null) {
        contractScopeQuery = contractScopeQuery.in('project_id', projectScope);
      }

      const { data: scopedContracts, error: scopeError } = await contractScopeQuery;
      if (scopeError) throw scopeError;
      scopedContractIds = (scopedContracts || []).map((contract: any) => Number(contract.id)).filter(Boolean);

    }

    let query = supabase
      .from('supplier_payments')
      .select(`
        *,
        contract:contract_id(id, contract_name, contract_no, supplier_id, project_id),
        settlement:settlement_id(id, settlement_no, settlement_type, payable_amount)
      `)
      .order('payment_date', { ascending: false });

    if (contractId && contractId !== 'all') {
      query = query.eq('contract_id', parseInt(contractId));
    } else if (scopedContractIds) {
      const paymentScope: string[] = [];
      if (scopedContractIds.length > 0) {
        paymentScope.push(`contract_id.in.(${scopedContractIds.join(',')})`);
      }
      if (requestedProjectId) {
        paymentScope.push(`project_id.eq.${requestedProjectId}`);
      } else if (projectScope !== null && projectScope.length > 0) {
        paymentScope.push(`project_id.in.(${projectScope.join(',')})`);
      }
      if (supplierId && supplierId !== 'all') {
        paymentScope.push(`supplier_id.eq.${parseInt(supplierId)}`);
      }
      if (paymentScope.length === 0) {
        return NextResponse.json({
          payments: [],
          summary: { totalPayments: 0, totalAmount: 0 },
        });
      }
      query = query.or(paymentScope.join(','));
    }
    if (settlementId && settlementId !== 'all') {
      query = query.eq('settlement_id', parseInt(settlementId));
    }

    const { data, error } = await query;
    if (error) throw error;

    const scopedPayments = (data || []).filter((payment: any) => {
      const paymentProjectId = Number(payment.project_id || payment.contract?.project_id || 0);
      const paymentSupplierId = Number(payment.supplier_id || payment.contract?.supplier_id || 0);
      if (requestedProjectId && paymentProjectId !== requestedProjectId) return false;
      if (!requestedProjectId && projectScope !== null && !projectScope.includes(paymentProjectId)) return false;
      if (supplierId && supplierId !== 'all' && paymentSupplierId !== parseInt(supplierId)) return false;
      return true;
    });

    const supplierIds = [...new Set(scopedPayments.map((p: any) => p.supplier_id || p.contract?.supplier_id).filter(Boolean))];
    const projectIds = [...new Set(scopedPayments.map((p: any) => p.project_id || p.contract?.project_id).filter(Boolean))];
    const suppliersMap: Record<number, any> = {};
    const projectsMap: Record<number, any> = {};

    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, name')
        .in('id', supplierIds);

      (suppliers || []).forEach((s: any) => {
        suppliersMap[s.id] = s;
      });
    }

    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds);

      (projects || []).forEach((project: any) => {
        projectsMap[project.id] = project;
      });
    }

    const paymentsWithDetails = scopedPayments.map((payment: any) => ({
      ...payment,
      supplier_id: payment.supplier_id || payment.contract?.supplier_id || null,
      supplier_name: suppliersMap[payment.supplier_id || payment.contract?.supplier_id]?.name || '',
      project_id: payment.project_id || payment.contract?.project_id || null,
      project_name: projectsMap[payment.project_id || payment.contract?.project_id]?.name || '',
    }));

    const summary = {
      totalPayments: paymentsWithDetails.length,
      totalAmount: paymentsWithDetails
        .filter((p: any) => isEffectiveSupplierPaymentStatus(p.status))
        .reduce((sum: number, p: any) => sum + Number(p.payment_amount || 0), 0),
    };

    return NextResponse.json({
      payments: paymentsWithDetails,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/supplier-contracts/payments - 新增付款记录
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const body = await request.json();
    const { contract_id, payment_amount, payment_date, payment_method, remark, payment_type } = body;

    if (!contract_id) {
      return NextResponse.json({ error: '请选择合同' }, { status: 400 });
    }
    if (!payment_amount || Number(payment_amount) <= 0 || !Number.isFinite(Number(payment_amount))) {
      return NextResponse.json({ error: '请输入有效的付款金额' }, { status: 400 });
    }

    const contractId = Number(contract_id);
    const paymentAmount = Number(payment_amount);
    const settlementIds = normalizeSettlementIds(body.settlement_ids, body.settlement_id);

    const { data: contract, error: contractError } = await supabase
      .from('supplier_contracts')
      .select('supplier_id, project_id')
      .eq('id', contractId)
      .single();
    if (contractError || !contract) {
      return NextResponse.json({ error: '合同不存在' }, { status: 400 });
    }
    const access = await assertProjectAccess(supabase, auth.user, contract.project_id);
    if (!access.ok) return access.response;

    const contractValidation = await validateSupplierPayment({
      contract_id: contractId,
      payment_amount: paymentAmount,
    });
    if (!contractValidation.valid) {
      return NextResponse.json({ error: contractValidation.message }, { status: 400 });
    }

    // 收集软警告（超额付款等），随成功响应返回，由前端提示但不阻断保存
    const warnings: string[] = [];
    if (contractValidation.warning) warnings.push(contractValidation.warning);

    let selectedSettlements: SupplierSettlementPaymentTarget[] = [];
    let allocationResult: ReturnType<typeof allocateSupplierPaymentAcrossSettlements> | null = null;

    if (settlementIds.length > 0) {
      const { data: settlementRows, error: settlementError } = await supabase
        .from('supplier_settlements')
        .select('id, contract_id, settlement_no, settlement_type, settlement_amount, payable_amount, status')
        .in('id', settlementIds);
      if (settlementError) throw settlementError;

      const settlementMap = new Map<number, SupplierSettlementPaymentTarget>(
        ((settlementRows || []) as SupplierSettlementPaymentTarget[]).map((settlement) => [Number(settlement.id), settlement])
      );
      const missingSettlementIds = settlementIds.filter((id) => !settlementMap.has(id));
      if (missingSettlementIds.length > 0) {
        return NextResponse.json({ error: '结算单不存在' }, { status: 400 });
      }
      selectedSettlements = settlementIds.map((id) => settlementMap.get(id)).filter(Boolean) as SupplierSettlementPaymentTarget[];

      const wrongContractSettlement = selectedSettlements.find((settlement) => Number(settlement.contract_id) !== contractId);
      if (wrongContractSettlement) {
        return NextResponse.json({ error: '结算单不属于当前合同' }, { status: 400 });
      }

      const voidedSettlement = selectedSettlements.find((settlement) => isVoidedStatus(settlement.status));
      if (voidedSettlement) {
        return NextResponse.json({
          error: `结算单 ${voidedSettlement.settlement_no || `#${voidedSettlement.id}`} 已作废，不能关联付款`,
        }, { status: 400 });
      }

      const unreviewedSettlements = selectedSettlements.filter((settlement) => !isReviewedStatus(settlement.status));
      if (unreviewedSettlements.length > 0) {
        const labels = unreviewedSettlements
          .map((settlement) => settlement.settlement_no || `#${settlement.id}`)
          .join('、');
        return NextResponse.json({
          error: `结算单 ${labels} 尚未审核通过，不能直接关联付款。可先审核结算单，或取消勾选后作为合同级预付款保存。`,
        }, { status: 400 });
      }

      const { data: existingPayments, error: paymentsError } = await supabase
        .from('supplier_payments')
        .select('settlement_id, payment_amount, status')
        .in('settlement_id', settlementIds);
      if (paymentsError) throw paymentsError;

      const paidBySettlementId = new Map<number, number>();
      ((existingPayments || []) as SupplierPaymentAmountRow[])
        .filter((payment) => isEffectiveSupplierPaymentStatus(payment.status))
        .forEach((payment) => {
          const settlementId = Number(payment.settlement_id || 0);
          if (!settlementId) return;
          paidBySettlementId.set(
            settlementId,
            (paidBySettlementId.get(settlementId) || 0) + Number(payment.payment_amount || 0)
          );
        });

      allocationResult = allocateSupplierPaymentAcrossSettlements(
        selectedSettlements.map((settlement) => ({
          ...settlement,
          paid_amount: paidBySettlementId.get(Number(settlement.id)) || 0,
        })),
        paymentAmount
      );

      if (allocationResult.total_selected_unpaid <= 0) {
        warnings.push('所选结算单已无剩余未付金额，本次付款将按合同级付款保存。');
      } else if (allocationResult.unallocated_amount > 0) {
        warnings.push(`付款金额超过所选结算单剩余未付，超出部分 ${allocationResult.unallocated_amount.toLocaleString()} 元已按合同级付款保存。`);
      }
    }

    const now = new Date();
    const paymentNo = `FK${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getTime()).slice(-6)}`;

    let finalPaymentType = normalizeSupplierPaymentType(payment_type);
    if (!payment_type && selectedSettlements.length > 0) {
      const settlementTypes = [...new Set(selectedSettlements.map((settlement) => settlement.settlement_type).filter(Boolean))];
      if (settlementTypes.length === 1) {
        finalPaymentType = normalizeSupplierPaymentType(settlementTypes[0]);
      }
    }

    const finalPaymentDate = normalizePaymentDate(payment_date, now.toISOString().slice(0, 10));
    const basePayment = {
      supplier_id: contract.supplier_id,
      project_id: contract.project_id || null,
      contract_id: contractId,
      payment_no: paymentNo,
      payment_date: finalPaymentDate,
      payment_method: payment_method || '银行转账',
      remark: remark || null,
      status: 'completed',
    };

    const paymentRowsToInsert: Record<string, unknown>[] = [];
    if (allocationResult) {
      allocationResult.allocations.forEach((allocation) => {
        paymentRowsToInsert.push({
          ...basePayment,
          settlement_id: allocation.settlement_id,
          payment_amount: allocation.payment_amount,
          payment_type: payment_type ? finalPaymentType : normalizeSupplierPaymentType(allocation.settlement_type),
        });
      });

      if (allocationResult.unallocated_amount > 0 || paymentRowsToInsert.length === 0) {
        paymentRowsToInsert.push({
          ...basePayment,
          settlement_id: null,
          payment_amount: allocationResult.unallocated_amount > 0 ? allocationResult.unallocated_amount : paymentAmount,
          payment_type: finalPaymentType,
        });
      }
    } else {
      paymentRowsToInsert.push({
        ...basePayment,
        settlement_id: null,
        payment_amount: paymentAmount,
        payment_type: finalPaymentType,
      });
    }

    const { data: paymentArr, error } = await insertWithSequenceFix(
      'supplier_payments',
      paymentRowsToInsert,
      supabase
    );

    const paymentData = Array.isArray(paymentArr) ? paymentArr[0] : paymentArr;
    const paymentsData = Array.isArray(paymentArr) ? paymentArr : (paymentArr ? [paymentArr] : []);

    if (error) throw error;

    invalidateAggregationCache();

    await auditLog({
      operationType: 'create',
      resourceType: 'supplier_payment',
      resourceId: paymentData?.id,
      details: {
        contract_id: contractId,
        settlement_ids: settlementIds,
        payment_ids: paymentsData.map((payment) => payment.id),
        payment_amount: paymentAmount,
        record_count: paymentsData.length,
      },
      request,
    });

    await logSecurityEvent({
      event_type: 'supplier_payment_create',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: {
        payment_id: paymentData?.id,
        payment_ids: paymentsData.map((payment) => payment.id),
        contract_id: contractId,
        settlement_ids: settlementIds,
        payment_amount: paymentAmount,
        payment_type: finalPaymentType,
      },
    });

    return NextResponse.json({
      payment: paymentData,
      payments: paymentsData,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
