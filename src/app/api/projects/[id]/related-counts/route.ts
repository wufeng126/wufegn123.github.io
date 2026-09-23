import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { assertProjectAccess } from '@/lib/api-project-scope';

type CountResult = { count: number | null; error: { message?: string } | null };

async function resolveCount(result: PromiseLike<CountResult>, label: string) {
  const { count, error } = await result;
  if (error) throw new Error(`${label}统计失败: ${error.message || 'unknown error'}`);
  return count || 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: '项目ID无效' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const access = await assertProjectAccess(client, auth.user, projectId);
    if (!access.ok) return access.response;

    // Count related data from all relevant tables
    const displayCounts: Record<string, number> = {};

    // Workers
    const workerCount = await resolveCount(client
      .from('workers')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '工人');
    displayCounts['工人'] = workerCount;

    // Worker salaries
    const salaryCount = await resolveCount(client
      .from('worker_salaries')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '工资记录');
    displayCounts['工资记录'] = salaryCount;

    // Worker payments（发放记录表实际名为 salary_payments，worker_payments 不存在）
    const workerPaymentCount = await resolveCount(client
      .from('salary_payments')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '工资发放');
    displayCounts['工资发放'] = workerPaymentCount;

    // Work item subitems (budget)
    const subitemCount = await resolveCount(client
      .from('work_item_subitems')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '工程量预算');
    displayCounts['工程量预算'] = subitemCount;

    // Client reports (报量)
    const reportCount = await resolveCount(client
      .from('client_reports')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '甲方报量');
    displayCounts['甲方报量'] = reportCount;

    // Client payments
    const paymentCount = await resolveCount(client
      .from('client_payments')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '甲方付款');
    displayCounts['甲方付款'] = paymentCount;

    // Subitem monthly reports
    const monthlyReportCount = await resolveCount(client
      .from('subitem_monthly_reports')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '月度报量');
    displayCounts['月度报量'] = monthlyReportCount;

    // Subitem monthly progress (settlements)
    const progressCount = await resolveCount(client
      .from('subitem_monthly_progress')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '月度结算');
    displayCounts['月度结算'] = progressCount;

    // Supplier settlements/payments are project-owned through supplier_contracts.
    const { data: supplierContracts, error: contractError } = await client
      .from('supplier_contracts')
      .select('id')
      .eq('project_id', projectId);
    if (contractError) throw new Error(`供应商合同统计失败: ${contractError.message}`);
    const supplierContractIds = (supplierContracts || [])
      .map((row: { id?: unknown }) => Number(row.id))
      .filter((contractId) => Number.isInteger(contractId) && contractId > 0);

    let settlementCount = 0;
    const supplierPaymentIds = new Set<number>();
    const { data: directSupplierPayments, error: directSupplierPaymentError } = await client
      .from('supplier_payments')
      .select('id')
      .eq('project_id', projectId);
    if (directSupplierPaymentError) throw new Error(`供应商付款统计失败: ${directSupplierPaymentError.message}`);
    (directSupplierPayments || []).forEach((row: { id?: unknown }) => {
      const paymentId = Number(row.id);
      if (Number.isInteger(paymentId) && paymentId > 0) supplierPaymentIds.add(paymentId);
    });

    if (supplierContractIds.length > 0) {
      settlementCount = await resolveCount(client
        .from('supplier_settlements')
        .select('*', { count: 'exact', head: true })
        .in('contract_id', supplierContractIds), '供应商结算');

      const { data: contractSupplierPayments, error: contractSupplierPaymentError } = await client
        .from('supplier_payments')
        .select('id')
        .in('contract_id', supplierContractIds);
      if (contractSupplierPaymentError) throw new Error(`供应商付款统计失败: ${contractSupplierPaymentError.message}`);
      (contractSupplierPayments || []).forEach((row: { id?: unknown }) => {
        const paymentId = Number(row.id);
        if (Number.isInteger(paymentId) && paymentId > 0) supplierPaymentIds.add(paymentId);
      });
    }
    const supplierPaymentCount = supplierPaymentIds.size;
    displayCounts['供应商合同'] = supplierContractIds.length;
    displayCounts['供应商结算'] = settlementCount;
    displayCounts['供应商付款'] = supplierPaymentCount;

    // Comprehensive expenses
    const expenseCount = await resolveCount(client
      .from('comprehensive_expenses')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '综合费用');
    displayCounts['综合费用'] = expenseCount;

    // Miscellaneous materials
    const materialCount = await resolveCount(client
      .from('miscellaneous_materials')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '零星材料');
    displayCounts['零星材料'] = materialCount;

    // Visas
    const visaCount = await resolveCount(client
      .from('visas')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '签证');
    displayCounts['签证'] = visaCount;

    // Limit prices
    const limitPriceCount = await resolveCount(client
      .from('limit_prices')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId), '限价');
    displayCounts['限价'] = limitPriceCount;

    const counts = {
      workers: workerCount,
      salaries: salaryCount + workerPaymentCount,
      subitems: subitemCount + monthlyReportCount + progressCount,
      clientReports: reportCount,
      clientPayments: paymentCount,
      settlements: settlementCount,
      supplierContracts: supplierContractIds.length,
      supplierPayments: supplierPaymentCount,
      expenses: expenseCount + materialCount,
      visas: visaCount,
      limitPrices: limitPriceCount,
    };
    const totalCount = Object.values(counts).reduce((sum, c) => sum + c, 0);

    // Filter out zero counts for cleaner display
    const relatedData = Object.entries(displayCounts)
      .filter(([_, count]) => count > 0)
      .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      projectId,
      counts: { ...counts, totalCount },
      relatedData,
      totalCount,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询关联数据失败' },
      { status: 500 }
    );
  }
}
