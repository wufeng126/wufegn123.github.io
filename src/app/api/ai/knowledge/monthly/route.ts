import { NextRequest, NextResponse } from 'next/server';
import { getProjectFinancialSummary } from '@/lib/data-aggregation';
import { yearMonthToRange } from '@/lib/format';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function round2(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectIdParam = searchParams.get('projectId');
    const yearMonth = searchParams.get('yearMonth');

    const projectId = Number(projectIdParam);

    if (!projectIdParam || !Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json(
        { success: false, error: '缺少有效的 projectId 参数' },
        { status: 400 },
      );
    }

    if (!yearMonth || !YEAR_MONTH_PATTERN.test(yearMonth)) {
      return NextResponse.json(
        { success: false, error: 'yearMonth 格式必须为 YYYY-MM，例如 2026-07' },
        { status: 400 },
      );
    }

    const dateRange = yearMonthToRange(yearMonth);
    const [monthlySummary, cumulativeSummary] = await Promise.all([
      getProjectFinancialSummary(projectId, dateRange),
      getProjectFinancialSummary(projectId),
    ]);

    // 查询当月各工种工资拆分
    const supabase = getSupabaseClient();
    // 先查所有工人ID
    const { data: allWorkers } = await supabase
      .from('workers')
      .select('id, work_type')
      .not('work_type', 'is', null);
    const workerMap = new Map((allWorkers || []).map((w: any) => [w.id, w.work_type]));
    // 查当月工资后按工种分组
    const { data: salaryRows } = await supabase
      .from('worker_salaries')
      .select('worker_id, gross_pay')
      .eq('project_id', projectId)
      .eq('year_month', yearMonth);
    const tradeWageMap: Record<string, number> = {};
    let totalTradeWage = 0;
    (salaryRows || []).forEach((r: any) => {
      const trade = workerMap.get(r.worker_id) || '未分类';
      const pay = parseFloat(r.gross_pay) || 0;
      tradeWageMap[trade] = (tradeWageMap[trade] || 0) + pay;
      totalTradeWage += pay;
    });

    // 查询当月对上报量
    const { data: subitems } = await supabase
      .from('work_item_subitems')
      .select('id, subitem_name, unit')
      .eq('project_id', projectId);
    const subitemMap = new Map((subitems || []).map((s: any) => [s.id, { name: s.subitem_name, unit: s.unit }]));
    const { data: reportRows } = await supabase
      .from('subitem_monthly_reports')
      .select('subitem_id, report_quantity')
      .eq('year_month', yearMonth);
    const subIds = (reportRows || []).map((r: any) => r.subitem_id);
    const filteredReports = (reportRows || []).filter((r: any) => subitemMap.has(r.subitem_id));
    const reportItems: { name: string; qty: number; unit: string }[] = [];
    filteredReports.forEach((r: any) => {
      const info = subitemMap.get(r.subitem_id) || { name: '未知', unit: '' };
      reportItems.push({
        name: info.name,
        qty: parseFloat(r.report_quantity) || 0,
        unit: info.unit,
      });
    });
    if (!monthlySummary || !cumulativeSummary) {
      return NextResponse.json(
        { success: false, error: '未找到项目财务数据' },
        { status: 404 },
      );
    }

    const data = {
      tradeWages: tradeWageMap,
      tradeWageTotal: totalTradeWage,
      reportItems,
      projectId,
      projectName: monthlySummary.projectName,
      yearMonth,
      dateRange,
      contractAmount: monthlySummary.contractAmount,
      monthly: {
        income: monthlySummary.taxableIncome,
        invoiceAmount: monthlySummary.invoiceAmount,
        clientReportAmount: monthlySummary.invoiceAmount,
        visaAmount: monthlySummary.visaAmount,
        cost: monthlySummary.totalCost,
        profit: monthlySummary.profit,
        profitRate: monthlySummary.profitRate,
        laborCost: monthlySummary.salaryAmount,
        workerSalary: monthlySummary.salaryAmount,
        managementFee: monthlySummary.expenseAmount,
        miscMaterialAmount: monthlySummary.miscMaterialAmount,
        taxAmount: monthlySummary.taxAmount,
        supplierSettlementAmount: monthlySummary.settlementAmount,
        clientPaidAmount: monthlySummary.clientPaidAmount,
        workerPaidAmount: monthlySummary.workerPaidAmount,
        supplierPaidAmount: monthlySummary.supplierPaidAmount,
        clientPaymentRate: monthlySummary.paymentRate,
      },
      cumulative: {
        income: cumulativeSummary.taxableIncome,
        invoiceAmount: cumulativeSummary.invoiceAmount,
        clientReportAmount: cumulativeSummary.invoiceAmount,
        cost: cumulativeSummary.totalCost,
        profit: cumulativeSummary.profit,
        profitRate: cumulativeSummary.profitRate,
        laborCost: cumulativeSummary.salaryAmount,
        workerSalary: cumulativeSummary.salaryAmount,
        managementFee: cumulativeSummary.expenseAmount,
        clientPaidAmount: cumulativeSummary.clientPaidAmount,
        workerPaidAmount: cumulativeSummary.workerPaidAmount,
        supplierPaidAmount: cumulativeSummary.supplierPaidAmount,
        clientPaymentRate: cumulativeSummary.paymentRate,
      },
      brief: {
        contractAmount: monthlySummary.contractAmount,
        monthlyReportAmount: monthlySummary.invoiceAmount,
        cumulativeReportAmount: cumulativeSummary.invoiceAmount,
        monthlySalary: monthlySummary.salaryAmount,
        cumulativeSalary: cumulativeSummary.salaryAmount,
        monthlyManagementFee: monthlySummary.expenseAmount,
        monthlyProfit: monthlySummary.profit,
        profitRate: monthlySummary.profitRate,
        clientPaymentRate: monthlySummary.paymentRate,
      },
      raw: {
        monthly: monthlySummary,
        cumulative: cumulativeSummary,
      },
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: JSON.parse(JSON.stringify(data, (_key, value) => (
        typeof value === 'number' ? round2(value) : value
      ))),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '月度分析数据加载失败' },
      { status: 500 },
    );
  }
}
