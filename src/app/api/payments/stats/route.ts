import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 格式化数字为千分位 + 两位小数
function formatCurrency(amount: number): string {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 获取供应商付款统计
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    const client = getSupabaseClient();

    // 1. 获取所有供应商
    const { data: suppliers, error: suppliersError } = await client
      .from('suppliers')
      .select('id, name, type')
      .order('name');

    if (suppliersError) {
      throw new Error(`查询供应商失败: ${suppliersError.message}`);
    }

    // 2. 获取项目对应的合同数据
    let contractQuery = client
      .from('supplier_contracts')
      .select('id, supplier_id, project_id, contract_name, total_amount, cumulative_amount, cumulative_paid');

    if (projectId) {
      contractQuery = contractQuery.eq('project_id', parseInt(projectId));
    }

    const { data: contracts, error: contractsError } = await contractQuery;

    if (contractsError) {
      throw new Error(`查询合同数据失败: ${contractsError.message}`);
    }

    // 3. 获取结算数据（从 supplier_settlements）
    let settlementQuery = client
      .from('supplier_settlements')
      .select('contract_id, settlement_amount, payable_amount');

    if (projectId) {
      // 如果有项目ID，先获取该项目的合同ID列表
      const contractIds = contracts?.map(c => c.id) || [];
      if (contractIds.length > 0) {
        settlementQuery = settlementQuery.in('contract_id', contractIds);
      }
    }

    const { data: settlements, error: settlementsError } = await settlementQuery;

    if (settlementsError) {
      throw new Error(`查询结算数据失败: ${settlementsError.message}`);
    }

    // 4. 获取付款数据（从 supplier_payments）
    let paymentQuery = client
      .from('supplier_payments')
      .select('contract_id, payment_amount');

    if (projectId) {
      const contractIds = contracts?.map(c => c.id) || [];
      if (contractIds.length > 0) {
        paymentQuery = paymentQuery.in('contract_id', contractIds);
      }
    }

    const { data: payments, error: paymentsError } = await paymentQuery;

    if (paymentsError) {
      throw new Error(`查询付款数据失败: ${paymentsError.message}`);
    }

    // 5. 构建合同ID到合同信息的映射
    const contractMap: Record<number, any> = {};
    contracts?.forEach((c: any) => {
      contractMap[c.id] = c;
    });

    // 6. 计算每个供应商的应付/已付/未付
    // 应付金额 = 结算单中的 payable_amount 总和
    const settlementMap: Record<number, number> = {};
    settlements?.forEach((s: any) => {
      const contract = contractMap[s.contract_id];
      if (contract) {
        const sid = contract.supplier_id;
        const amount = parseFloat(s.payable_amount || '0') || 0;
        settlementMap[sid] = (settlementMap[sid] || 0) + amount;
      }
    });

    // 已付款金额 = 付款记录中的 payment_amount 总和
    const paymentMap: Record<number, number> = {};
    payments?.forEach((p: any) => {
      const contract = contractMap[p.contract_id];
      if (contract) {
        const sid = contract.supplier_id;
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
