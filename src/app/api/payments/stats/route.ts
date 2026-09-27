import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { isEffectiveSupplierPaymentStatus, isReviewedStatus } from '@/lib/business-logic';
import {
  badProjectIdResponse,
  canAccessProject,
  emptyProjectScopeResponse,
  getProjectAccessScope,
  parseOptionalProjectId,
} from '@/lib/api-project-scope';

// 格式化数字为千分位 + 两位小数
function formatCurrency(amount: number): string {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 获取供应商付款统计
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const requestedProjectId = parseOptionalProjectId(projectId);
    if (Number.isNaN(requestedProjectId)) return badProjectIdResponse();

    const client = getSupabaseClient();
    const projectScope = await getProjectAccessScope(client, auth.user);
    if (requestedProjectId && !canAccessProject(projectScope, requestedProjectId)) {
      return NextResponse.json({ error: '当前账号无权访问该项目' }, { status: 403 });
    }

    const emptyPayload = {
      stats: [],
      summary: {
        total_payable: 0,
        total_paid: 0,
        total_unpaid: 0,
        supplier_count: 0,
        settled_count: 0,
        unsettled_count: 0,
      },
    };
    if (!requestedProjectId && projectScope !== null && projectScope.length === 0) {
      return emptyProjectScopeResponse(emptyPayload);
    }

    // 1. 获取项目对应的合同数据
    // 注：supplier_contracts 表无 cumulative_amount/cumulative_paid 列（此前 select 报错），
    // 应付/已付分别由下方 supplier_settlements.payable_amount 与 supplier_payments.payment_amount 聚合
    let contractQuery = client
      .from('supplier_contracts')
      .select('id, supplier_id, project_id, contract_name, total_amount');

    if (requestedProjectId) {
      contractQuery = contractQuery.eq('project_id', requestedProjectId);
    } else if (projectScope !== null) {
      contractQuery = contractQuery.in('project_id', projectScope);
    }

    const { data: contracts, error: contractsError } = await contractQuery;

    if (contractsError) {
      throw new Error(`查询合同数据失败: ${contractsError.message}`);
    }

    const contractIds = contracts?.map(c => c.id).filter(Boolean) || [];

    // 2. 获取结算数据（从 supplier_settlements，只有挂合同的结算才形成应付）
    let settlements: any[] = [];
    if (contractIds.length > 0) {
      const { data: settlementRows, error: settlementsError } = await client
        .from('supplier_settlements')
        .select('contract_id, settlement_amount, payable_amount, status')
        .in('contract_id', contractIds);

      if (settlementsError) {
        throw new Error(`查询结算数据失败: ${settlementsError.message}`);
      }
      settlements = settlementRows || [];
    }

    // 3. 获取付款数据（兼容合同关联付款 + 项目直连付款，并按 id 去重）
    const paymentMapById = new Map<number, any>();
    const addPayments = (rows?: any[] | null) => {
      (rows || []).forEach((payment: any) => {
        const id = Number(payment.id);
        if (Number.isFinite(id)) paymentMapById.set(id, payment);
      });
    };

    if (contractIds.length > 0) {
      const { data: contractPayments, error: contractPaymentsError } = await client
        .from('supplier_payments')
        .select('id, supplier_id, project_id, contract_id, payment_amount, status')
        .in('contract_id', contractIds);

      if (contractPaymentsError) {
        throw new Error(`查询合同付款数据失败: ${contractPaymentsError.message}`);
      }
      addPayments(contractPayments);
    }

    let directPaymentQuery = client
      .from('supplier_payments')
      .select('id, supplier_id, project_id, contract_id, payment_amount, status');

    if (requestedProjectId) {
      directPaymentQuery = directPaymentQuery.eq('project_id', requestedProjectId);
    } else if (projectScope !== null) {
      directPaymentQuery = directPaymentQuery.in('project_id', projectScope);
    }

    const { data: directPayments, error: directPaymentsError } = await directPaymentQuery;

    if (directPaymentsError) {
      throw new Error(`查询项目付款数据失败: ${directPaymentsError.message}`);
    }
    addPayments(directPayments);
    const payments = Array.from(paymentMapById.values());

    // 4. 构建合同ID到合同信息的映射
    const contractMap: Record<number, any> = {};
    contracts?.forEach((c: any) => {
      contractMap[c.id] = c;
    });

    const supplierIds = [...new Set([
      ...(contracts || []).map((contract: any) => Number(contract.supplier_id)),
      ...payments.map((payment: any) => Number(payment.supplier_id || contractMap[payment.contract_id]?.supplier_id)),
    ].filter(Boolean))];
    if (supplierIds.length === 0) {
      return emptyProjectScopeResponse(emptyPayload);
    }

    // 5. 获取可见供应商
    const { data: suppliers, error: suppliersError } = await client
      .from('suppliers')
      .select('id, name, type')
      .in('id', supplierIds)
      .order('name');

    if (suppliersError) {
      throw new Error(`查询供应商失败: ${suppliersError.message}`);
    }

    // 6. 计算每个供应商的应付/已付/未付
    // 应付金额 = 结算单中的 payable_amount 总和
    const settlementMap: Record<number, number> = {};
    settlements?.forEach((s: any) => {
      if (!isReviewedStatus(s.status)) return;
      const contract = contractMap[s.contract_id];
      if (contract) {
        const sid = contract.supplier_id;
        const amount = parseFloat(s.payable_amount || '0') || 0;
        settlementMap[sid] = (settlementMap[sid] || 0) + amount;
      }
    });

    // 已付款金额 = 付款记录中的 payment_amount 总和
    const paymentMap: Record<number, number> = {};
    payments.forEach((p: any) => {
      if (!isEffectiveSupplierPaymentStatus(p.status)) return;
      const sid = Number(p.supplier_id || contractMap[p.contract_id]?.supplier_id || 0);
      if (sid) {
        const amount = parseFloat(p.payment_amount || '0') || 0;
        paymentMap[sid] = (paymentMap[sid] || 0) + amount;
      }
    });

    // 7. 按供应商聚合数据
    const supplierStats: Record<number, any> = {};
    suppliers?.forEach((supplier: any) => {
      supplierStats[supplier.id] = {
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_type: supplier.type,
        payable_amount: 0,
        paid_amount: 0,
        unpaid_amount: 0,
        payable_formatted: formatCurrency(0),
        paid_formatted: formatCurrency(0),
        unpaid_formatted: formatCurrency(0),
        is_settled: false,
        has_business: false,
      };
    });

    // 累加结算金额
    Object.entries(settlementMap).forEach(([sid, amount]) => {
      const supplierId = parseInt(sid);
      if (supplierStats[supplierId]) {
        supplierStats[supplierId].payable_amount += amount;
      }
    });

    // 累加付款金额
    Object.entries(paymentMap).forEach(([sid, amount]) => {
      const supplierId = parseInt(sid);
      if (supplierStats[supplierId]) {
        supplierStats[supplierId].paid_amount += amount;
      }
    });

    // 计算未付款并格式化
    const stats = Object.values(supplierStats).map((s: any) => {
      s.unpaid_amount = Math.max(0, s.payable_amount - s.paid_amount);
      s.payable_formatted = formatCurrency(s.payable_amount);
      s.paid_formatted = formatCurrency(s.paid_amount);
      s.unpaid_formatted = formatCurrency(s.unpaid_amount);
      s.is_settled = s.unpaid_amount === 0 && s.payable_amount > 0;
      s.has_business = s.payable_amount > 0 || s.paid_amount > 0;
      return s;
    });

    // 8. 计算汇总数据
    const summary = {
      total_payable: stats.reduce((sum: number, s: any) => sum + s.payable_amount, 0),
      total_paid: stats.reduce((sum: number, s: any) => sum + s.paid_amount, 0),
      total_unpaid: stats.reduce((sum: number, s: any) => sum + s.unpaid_amount, 0),
      supplier_count: stats.filter((s: any) => s.has_business).length,
      settled_count: stats.filter((s: any) => s.is_settled).length,
      unsettled_count: stats.filter((s: any) => s.unpaid_amount > 0).length,
    };

    return NextResponse.json({
      stats: stats.filter((s: any) => s.has_business),  // 只返回有业务往来的供应商
      summary,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}
