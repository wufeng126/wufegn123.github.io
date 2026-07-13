import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isEffectiveClientPaymentStatus } from '@/lib/business-logic';
import { getGlobalSummary, getProjectFinancialSummary } from '@/lib/data-aggregation';

// 获取当前月份
function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// 获取上个月份
function getLastYearMonth() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
}

// 获取最近N个月的年月列表
function getRecentMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export async function GET(request: Request) {
  try {
    // 解析查询参数
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const timeRange = searchParams.get('time_range') || 'month'; // month | quarter | year
    const selectedProjectId = projectId ? parseInt(projectId, 10) : undefined;
    
    const client = getSupabaseClient();
    const currentMonth = getCurrentYearMonth();
    
    // 根据时间范围计算日期筛选
    const now = new Date();
    let rangeStartDate: string; // YYYY-MM-DD format
    let trendMonthCount: number;
    
    if (timeRange === 'month') {
      // 本月：当月1号到月底
      rangeStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      trendMonthCount = 6;
    } else if (timeRange === 'quarter') {
      // 本季：季度首月1号到季度末
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      rangeStartDate = `${now.getFullYear()}-${String(quarterStartMonth + 1).padStart(2, '0')}-01`;
      trendMonthCount = 6;
    } else {
      // 本年：1月1号到12月31号
      rangeStartDate = `${now.getFullYear()}-01-01`;
      trendMonthCount = 12;
    }
    const rangeEndDate = now.toISOString().slice(0, 10);
    const dashboardDateRange = { start: rangeStartDate, end: rangeEndDate };
    
    // ========== 基础统计数据 ==========
    
    // 获取所有项目
    const { data: allProjects, error: projectError } = await client
      .from('projects')
      .select('id, name, status, address, partner, contract_amount, year, expected_completion_date, created_at')
      .order('created_at', { ascending: false });

    if (projectError) {
      throw new Error(`查询项目失败: ${projectError.message}`);
    }

    const projectCount = allProjects?.length || 0;
    const activeProjects = allProjects?.filter(p => p.status === '进行中') || [];

    // 获取工人数量（区分在场/退场）- 支持项目筛选
    let workersQuery = client
      .from('workers')
      .select('id, status, project_id');
    
    if (projectId) {
      workersQuery = workersQuery.eq('project_id', parseInt(projectId));
    }
    
    const { data: workersData, error: workerError } = await workersQuery;

    if (workerError) {
      throw new Error(`查询工人数量失败: ${workerError.message}`);
    }

    const workerCount = workersData?.length || 0;
    const inServiceCount = workersData?.filter(w => w.status !== 'left').length || 0;
    const leftCount = workersData?.filter(w => w.status === 'left').length || 0;

    // ========== 工程量统计数据 ==========
    
    // 获取所有分项工程（用于计算预算量和完成量）- 支持项目筛选
    let subitemsQuery = client
      .from('work_item_subitems')
      .select('id, project_id, subitem_name, unit, budget_quantity, completed_quantity, settlement_quantity, contract_price');
    
    if (projectId) {
      subitemsQuery = subitemsQuery.eq('project_id', parseInt(projectId));
    }
    
    const { data: subitemsData, error: subitemsError } = await subitemsQuery;

    if (subitemsError) {
      throw new Error(`查询分项工程失败: ${subitemsError.message}`);
    }

    // 计算各项目的预算量、对上报量、对下结算量
    const projectStats: Record<number, {
      budgetQuantity: number;
      budgetAmount: number;
      reportedQuantity: number;
      reportedAmount: number;
      settledQuantity: number;
      settledAmount: number;
    }> = {};

    subitemsData?.forEach(item => {
      const projectId = item.project_id;
      if (!projectId) return;

      if (!projectStats[projectId]) {
        projectStats[projectId] = {
          budgetQuantity: 0,
          budgetAmount: 0,
          reportedQuantity: 0,
          reportedAmount: 0,
          settledQuantity: 0,
          settledAmount: 0,
        };
      }

      const budgetQty = parseFloat(item.budget_quantity || '0') || 0;
      const reportedQty = parseFloat(item.completed_quantity || '0') || 0;
      const settledQty = parseFloat(item.settlement_quantity || '0') || 0;
      const price = parseFloat(item.contract_price || '0') || 0;

      projectStats[projectId].budgetQuantity += budgetQty;
      projectStats[projectId].budgetAmount += budgetQty * price;
      projectStats[projectId].reportedQuantity += reportedQty;
      projectStats[projectId].reportedAmount += reportedQty * price;
      projectStats[projectId].settledQuantity += settledQty;
      projectStats[projectId].settledAmount += settledQty * price;
    });

    // ========== 本月报量/结算数据 ==========
    
    // 本月对上报量
    const { data: monthlyReports } = await client
      .from('subitem_monthly_reports')
      .select('subitem_id, report_quantity, work_item_subitems(project_id, contract_price)')
      .eq('year_month', currentMonth);

    const currentMonthReport: Record<number, { quantity: number; amount: number }> = {};
    monthlyReports?.forEach(r => {
      const subitem = r.work_item_subitems as any;
      if (!subitem?.project_id) return;
      const projectId = subitem.project_id;
      const qty = parseFloat(r.report_quantity || '0') || 0;
      const price = parseFloat(subitem.contract_price || '0') || 0;
      
      if (!currentMonthReport[projectId]) {
        currentMonthReport[projectId] = { quantity: 0, amount: 0 };
      }
      currentMonthReport[projectId].quantity += qty;
      currentMonthReport[projectId].amount += qty * price;
    });

    // 本月对下结算量
    const { data: monthlySettlements } = await client
      .from('subitem_monthly_progress')
      .select('subitem_id, completed_quantity, work_item_subitems(project_id, contract_price)')
      .eq('year_month', currentMonth);

    const currentMonthSettlement: Record<number, { quantity: number; amount: number }> = {};
    monthlySettlements?.forEach(r => {
      const subitem = r.work_item_subitems as any;
      if (!subitem?.project_id) return;
      const projectId = subitem.project_id;
      const qty = parseFloat(r.completed_quantity || '0') || 0;
      const price = parseFloat(subitem.contract_price || '0') || 0;
      
      if (!currentMonthSettlement[projectId]) {
        currentMonthSettlement[projectId] = { quantity: 0, amount: 0 };
      }
      currentMonthSettlement[projectId].quantity += qty;
      currentMonthSettlement[projectId].amount += qty * price;
    });

    // ========== 甲方报量和付款数据 ==========

    // === 累计全量数据（不受时间范围影响，用于待回款计算）===

    // 全量甲方报量 - 排除已作废
    let allReportsQuery = client
      .from('client_reports')
      .select('settlement_amount, report_amount, status');
    if (projectId) allReportsQuery = allReportsQuery.eq('project_id', parseInt(projectId, 10));
    const { data: allReports } = await allReportsQuery;

    const totalMeasurementAmount = allReports?.filter(r => r.status !== 'voided').reduce((sum, r) => {
      return sum + parseFloat(r.settlement_amount || r.report_amount || '0');
    }, 0) || 0;

    // 全量甲方付款 - 只统计已完成的
    let allPaymentsQuery = client
      .from('client_payments')
      .select('payment_amount, status, payment_date');
    if (projectId) allPaymentsQuery = allPaymentsQuery.eq('project_id', parseInt(projectId, 10));
    const { data: allPayments } = await allPaymentsQuery;
    const totalPaid = allPayments?.filter(r => isEffectiveClientPaymentStatus(r.status)).reduce((sum, r) => {
      return sum + parseFloat(r.payment_amount || '0');
    }, 0) || 0;

    const unifiedSummary = selectedProjectId
      ? await getProjectFinancialSummary(selectedProjectId, dashboardDateRange)
      : await getGlobalSummary(dashboardDateRange);
    const financialMetrics = selectedProjectId ? {
      taxableIncome: (unifiedSummary as any)?.taxableIncome || 0,
      clientPaidAmount: (unifiedSummary as any)?.clientPaidAmount || 0,
      receivableAmount: (unifiedSummary as any)?.receivableAmount || 0,
      supplierPayableAmount: (unifiedSummary as any)?.supplierPayableAmount || 0,
      workerPayableAmount: (unifiedSummary as any)?.workerPayableAmount || 0,
      totalPayableAmount: (unifiedSummary as any)?.totalPayableAmount || 0,
      supplierPaidAmount: (unifiedSummary as any)?.supplierPaidAmount || 0,
      workerPaidAmount: (unifiedSummary as any)?.workerPaidAmount || 0,
      cashOutAmount: (unifiedSummary as any)?.cashOutAmount || 0,
      netCashFlow: (unifiedSummary as any)?.netCashFlow || 0,
      fundingGapAmount: (unifiedSummary as any)?.fundingGapAmount || 0,
      paymentRate: (unifiedSummary as any)?.paymentRate || 0,
      payablePaymentRate: (unifiedSummary as any)?.payablePaymentRate || 0,
      costIncomeRate: (unifiedSummary as any)?.costIncomeRate || 0,
      totalCost: (unifiedSummary as any)?.totalCost || 0,
      totalProfit: (unifiedSummary as any)?.profit || 0,
      profitRate: (unifiedSummary as any)?.profitRate || 0,
      supplierCost: (unifiedSummary as any)?.settlementAmount || 0,
      salaryCost: (unifiedSummary as any)?.salaryAmount || 0,
      expenseCost: (unifiedSummary as any)?.expenseAmount || 0,
      taxCost: (unifiedSummary as any)?.taxAmount || 0,
      miscMaterialCost: (unifiedSummary as any)?.miscMaterialAmount || 0,
    } : {
      taxableIncome: (unifiedSummary as any).totalTaxableIncome || 0,
      clientPaidAmount: (unifiedSummary as any).totalClientPaid || 0,
      receivableAmount: (unifiedSummary as any).totalReceivable || 0,
      supplierPayableAmount: (unifiedSummary as any).totalSupplierPayable || 0,
      workerPayableAmount: (unifiedSummary as any).totalWorkerPayable || 0,
      totalPayableAmount: (unifiedSummary as any).totalPayable || 0,
      supplierPaidAmount: (unifiedSummary as any).totalSupplierPaid || 0,
      workerPaidAmount: (unifiedSummary as any).totalWorkerPaid || 0,
      cashOutAmount: ((unifiedSummary as any).totalSupplierPaid || 0) + ((unifiedSummary as any).totalWorkerPaid || 0),
      netCashFlow: (unifiedSummary as any).netCashFlow || 0,
      fundingGapAmount: (unifiedSummary as any).fundingGapAmount || 0,
      paymentRate: (unifiedSummary as any).overallPaymentRate || 0,
      payablePaymentRate: (unifiedSummary as any).payablePaymentRate || 0,
      costIncomeRate: (unifiedSummary as any).costIncomeRate || 0,
      totalCost: (unifiedSummary as any).totalCost || 0,
      totalProfit: (unifiedSummary as any).totalProfit || 0,
      profitRate: (unifiedSummary as any).profitRate || 0,
      supplierCost: (unifiedSummary as any).totalSettlement || 0,
      salaryCost: (unifiedSummary as any).totalSalary || 0,
      expenseCost: (unifiedSummary as any).totalExpense || 0,
      taxCost: (unifiedSummary as any).totalTax || 0,
      miscMaterialCost: (unifiedSummary as any).totalMiscMaterial || 0,
    };

    // === 按时间范围筛选（用于当月/当月产值等指标）===

    let clientReportsQuery = client
      .from('client_reports')
      .select('report_amount, settlement_amount, invoice_amount, project_id, projects(name), report_date, status');
    if (projectId) clientReportsQuery = clientReportsQuery.eq('project_id', parseInt(projectId));
    if (timeRange !== 'year') clientReportsQuery = clientReportsQuery.gte('report_date', rangeStartDate);
    const { data: clientReports } = await clientReportsQuery;

    // 本月甲方报量
    const currentMonthClientReports = clientReports?.filter(r => {
      if (!r.report_date) return false;
      const reportDate = new Date(r.report_date);
      const yearMonth = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}`;
      return yearMonth === currentMonth;
    }) || [];
    const currentMonthClientReportAmount = currentMonthClientReports.filter(r => r.status !== 'voided').reduce((sum, r) => {
      return sum + parseFloat(r.settlement_amount || r.report_amount || '0');
    }, 0);

    // 甲方付款（按时间范围）
    let clientPaymentsQuery = client
      .from('client_payments')
      .select('payment_amount, project_id, projects(name), status, payment_date');
    if (projectId) clientPaymentsQuery = clientPaymentsQuery.eq('project_id', parseInt(projectId));
    if (timeRange !== 'year') clientPaymentsQuery = clientPaymentsQuery.gte('payment_date', rangeStartDate);
    const { data: clientPayments } = await clientPaymentsQuery;

    // ========== 预警计算 ==========
    
    let quantityWarnings = 0;  // 超预算预警
    let progressWarnings = 0;  // 进度预警（>80%）

    subitemsData?.forEach(item => {
      const budgetQty = parseFloat(item.budget_quantity || '0') || 0;
      const reportedQty = parseFloat(item.completed_quantity || '0') || 0;
      const settledQty = parseFloat(item.settlement_quantity || '0') || 0;
      
      // 对上报量超预算预警
      if (budgetQty > 0 && reportedQty > budgetQty) {
        quantityWarnings++;
      }
      
      // 进度超过80%预警
      if (budgetQty > 0 && (reportedQty / budgetQty) > 0.8) {
        progressWarnings++;
      }
    });

    // ========== 签证统计数据 ==========
    
    const { data: visasData } = await client
      .from('visas')
      .select('id, visa_amount, status, project_id');

    const totalVisaCount = visasData?.length || 0;
    const completedVisaCount = visasData?.filter(v => v.status === '已完结').length || 0;
    const pendingVisaCount = visasData?.filter(v => v.status === '待办理').length || 0;
    const totalVisaAmount = visasData?.reduce((sum, v) => {
      return sum + (parseFloat(v.visa_amount) || 0);
    }, 0) || 0;

    // 各项目签证金额
    const projectVisaAmounts: Record<number, number> = {};
    visasData?.forEach(v => {
      const projectId = v.project_id;
      const amount = parseFloat(v.visa_amount) || 0;
      if (!projectVisaAmounts[projectId]) {
        projectVisaAmounts[projectId] = 0;
      }
      projectVisaAmounts[projectId] += amount;
    });

    // ========== 证件统计数据 ==========
    
    // 获取证件状态
    function getCertificateStatus(expiryDate: string): 'normal' | 'expiring' | 'expired' {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiry = new Date(expiryDate);
      expiry.setHours(0, 0, 0, 0);
      const diffTime = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) return 'expired';
      if (diffDays <= 150) return 'expiring'; // 5个月约150天
      return 'normal';
    }
    
    const { data: certificatesData } = await client
      .from('certificates')
      .select('id, expiry_date');
    
    let certificateTotal = 0;
    let certificateExpiring = 0;
    let certificateExpired = 0;
    
    certificatesData?.forEach(cert => {
      certificateTotal++;
      const status = getCertificateStatus(cert.expiry_date);
      if (status === 'expired') certificateExpired++;
      else if (status === 'expiring') certificateExpiring++;
    });

    // ========== 汇总计算 ==========
    
    // 总预算量
    const totalBudgetAmount = subitemsData?.reduce((sum, item) => {
      const qty = parseFloat(item.budget_quantity || '0') || 0;
      const price = parseFloat(item.contract_price || '0') || 0;
      return sum + qty * price;
    }, 0) || 0;

    // 总对上报量
    const totalReportedAmount = subitemsData?.reduce((sum, item) => {
      const qty = parseFloat(item.completed_quantity || '0') || 0;
      const price = parseFloat(item.contract_price || '0') || 0;
      return sum + qty * price;
    }, 0) || 0;

    // 总对下结算量
    const totalSettledAmount = subitemsData?.reduce((sum, item) => {
      const qty = parseFloat(item.settlement_quantity || '0') || 0;
      const price = parseFloat(item.contract_price || '0') || 0;
      return sum + qty * price;
    }, 0) || 0;

    // 本月对上报量总额
    const currentMonthReportAmount = Object.values(currentMonthReport).reduce((sum: number, r: any) => {
      return sum + r.amount;
    }, 0);

    // 本月对下结算量总额
    const currentMonthSettlementAmount = Object.values(currentMonthSettlement).reduce((sum: number, r: any) => {
      return sum + r.amount;
    }, 0);

    // 对上对下差额
    const differenceAmount = totalReportedAmount - totalSettledAmount;

    // 完成百分比
    const reportPercent = totalBudgetAmount > 0 ? (totalReportedAmount / totalBudgetAmount * 100) : 0;
    const settlementPercent = totalBudgetAmount > 0 ? (totalSettledAmount / totalBudgetAmount * 100) : 0;

    // ========== 构建项目详情列表 ==========
    
    const projectDetails = allProjects?.map(project => {
      const stats = projectStats[project.id] || {
        budgetQuantity: 0,
        budgetAmount: 0,
        reportedQuantity: 0,
        reportedAmount: 0,
        settledQuantity: 0,
        settledAmount: 0,
      };
      
      const monthReport = currentMonthReport[project.id] || { quantity: 0, amount: 0 };
      const monthSettlement = currentMonthSettlement[project.id] || { quantity: 0, amount: 0 };
      
      const remainingReport = stats.budgetAmount - stats.reportedAmount;
      const remainingSettlement = stats.budgetAmount - stats.settledAmount;
      
      const reportPct = stats.budgetAmount > 0 ? (stats.reportedAmount / stats.budgetAmount * 100) : 0;
      const settlementPct = stats.budgetAmount > 0 ? (stats.settledAmount / stats.budgetAmount * 100) : 0;

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        year: project.year,
        address: project.address,
        partner: project.partner,
        contractAmount: parseFloat(project.contract_amount || '0') || 0,
        budgetAmount: stats.budgetAmount,
        reportedAmount: stats.reportedAmount,
        settledAmount: stats.settledAmount,
        currentMonthReport: monthReport.amount,
        currentMonthSettlement: monthSettlement.amount,
        remainingReport,
        remainingSettlement,
        reportPercent: reportPct,
        settlementPercent: settlementPct,
        isOverBudget: stats.reportedAmount > stats.budgetAmount && stats.budgetAmount > 0,
        visaAmount: projectVisaAmounts[project.id] || 0,
      };
    }) || [];

    // ========== 待收款金额 ==========
    const pendingPayment = financialMetrics.receivableAmount;

    // ========== 成本数据 ==========
    
    // 供应商结算金额（材料机械成本）- 支持项目筛选
    let settlementsQuery = client
      .from('settlements')
      .select('settlement_amount, settlement_date');
    
    if (projectId) {
      settlementsQuery = settlementsQuery.eq('project_id', parseInt(projectId));
    }
    if (timeRange !== 'year') {
      settlementsQuery = settlementsQuery.gte('settlement_date', rangeStartDate);
    }
    
    const { data: settlements } = await settlementsQuery;
    
    const totalSupplierCost = settlements?.reduce((sum, s) => {
      return sum + (parseFloat(s.settlement_amount || '0') || 0);
    }, 0) || 0;
    
    // 工人工资（使用 gross_pay 应发工资）- 支持项目筛选和时间范围筛选
    let workerSalariesQuery = client
      .from('worker_salaries')
      .select('gross_pay, year_month');
    
    if (projectId) {
      workerSalariesQuery = workerSalariesQuery.eq('project_id', parseInt(projectId));
    }
    if (timeRange !== 'year') {
      // year_month format is YYYY-MM, compare as string
      const rangeStartMonth = rangeStartDate.substring(0, 7); // YYYY-MM
      workerSalariesQuery = workerSalariesQuery.gte('year_month', rangeStartMonth);
    }
    
    const { data: workerSalaries } = await workerSalariesQuery;
    
    const totalSalaryCost = workerSalaries?.reduce((sum, s) => {
      return sum + (parseFloat(s.gross_pay || '0') || 0);
    }, 0) || 0;
    
    // 综合费用 - 支持项目筛选和时间范围筛选
    let expensesQuery = client
      .from('comprehensive_expenses')
      .select('amount, expense_date');
    
    if (projectId) {
      expensesQuery = expensesQuery.eq('project_id', parseInt(projectId));
    }
    if (timeRange !== 'year') {
      expensesQuery = expensesQuery.gte('expense_date', rangeStartDate);
    }
    
    const { data: expenses } = await expensesQuery;
    
    const totalExpenseCost = expenses?.reduce((sum, e) => {
      return sum + (parseFloat(e.amount || '0') || 0);
    }, 0) || 0;
    
    // 零星材料 - 支持项目筛选和时间范围筛选
    let miscMaterialsQuery = client
      .from('miscellaneous_materials')
      .select('amount, purchase_date');
    
    if (projectId) {
      miscMaterialsQuery = miscMaterialsQuery.eq('project_id', parseInt(projectId));
    }
    if (timeRange !== 'year') {
      miscMaterialsQuery = miscMaterialsQuery.gte('purchase_date', rangeStartDate);
    }
    
    const { data: miscMaterials } = await miscMaterialsQuery;
    
    const totalMiscMaterialCost = miscMaterials?.reduce((sum, m) => {
      return sum + (parseFloat(m.amount || '0') || 0);
    }, 0) || 0;
    
    // 税费计算：从 client_reports 的 invoice_amount 和 tax_rate 计算
    // 不含税收入 = 开票金额 / (1 + 税率 / 100)
    // 税费 = 开票金额 − 不含税收入
    let clientReportsForTaxQuery = client
      .from('client_reports')
      .select('invoice_amount, tax_rate, report_date');
    
    if (projectId) {
      clientReportsForTaxQuery = clientReportsForTaxQuery.eq('project_id', parseInt(projectId));
    }
    if (timeRange !== 'year') {
      clientReportsForTaxQuery = clientReportsForTaxQuery.gte('report_date', rangeStartDate);
    }
    
    const { data: clientReportsForTax } = await clientReportsForTaxQuery;
    
    const totalTaxCost = clientReportsForTax?.reduce((sum, r) => {
      const invoiceAmount = parseFloat(r.invoice_amount || '0') || 0;
      const taxRate = parseFloat(r.tax_rate || '9') || 9;
      if (invoiceAmount > 0 && taxRate >= 0) {
        const untaxedIncome = invoiceAmount / (1 + taxRate / 100);
        const taxAmount = invoiceAmount - untaxedIncome;
        return sum + taxAmount;
      }
      return sum;
    }, 0) || 0;
    
    // 获取已签回的签证金额
    let visasQuery = client
      .from('visas')
      .select('visa_amount, created_at')
      .eq('status', '已签回');
    
    if (projectId) {
      visasQuery = visasQuery.eq('project_id', parseInt(projectId));
    }
    if (timeRange !== 'year') {
      visasQuery = visasQuery.gte('created_at', rangeStartDate);
    }
    const { data: visasForIncome } = await visasQuery;
    
    const totalSignedVisaAmount = visasForIncome?.reduce((sum, v) => {
      return sum + (parseFloat(v.visa_amount || '0') || 0);
    }, 0) || 0;
    
    // 计算开票金额总额（含税收入）
    const totalInvoiceAmount = clientReportsForTax?.reduce((sum, r) => {
      return sum + (parseFloat(r.invoice_amount || '0') || 0);
    }, 0) || 0;
    
    // 含税收入 = 开票金额 + 签证
    const totalTaxableIncome = totalInvoiceAmount + totalSignedVisaAmount;
    
    // 总成本 = 供应商结算 + 工人工资 + 综合费用 + 税费 + 零星材料
    const totalCost = totalSupplierCost + totalSalaryCost + totalExpenseCost + totalTaxCost + totalMiscMaterialCost;
    
    // 总利润 = 含税收入 - 总成本
    const totalProfit = totalTaxableIncome - totalCost;
    const profitRate = totalTaxableIncome > 0 ? (totalProfit / totalTaxableIncome * 100) : 0;
    
    // ========== 月度趋势数据 ==========
    const recentMonths = getRecentMonths(trendMonthCount);
    
    // 按月统计产值 - 支持项目筛选，排除已作废
    let monthlyClientReportsQuery = client
      .from('client_reports')
      .select('report_amount, settlement_amount, report_date, status');
    
    if (projectId) {
      monthlyClientReportsQuery = monthlyClientReportsQuery.eq('project_id', parseInt(projectId));
    }
    
    const { data: monthlyClientReports } = await monthlyClientReportsQuery;
    
    const monthlyOutput: Record<string, number> = {};
    recentMonths.forEach(m => monthlyOutput[m] = 0);
    
    monthlyClientReports?.filter(r => r.status !== 'voided').forEach(r => {
      if (!r.report_date) return;
      const date = new Date(r.report_date);
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyOutput[yearMonth] !== undefined) {
        monthlyOutput[yearMonth] += parseFloat(r.settlement_amount || r.report_amount || '0') || 0;
      }
    });
    
    // 按月统计回款 - 支持项目筛选
    let monthlyPaymentsQuery = client
      .from('client_payments')
      .select('payment_amount, payment_date, status');
    
    if (projectId) {
      monthlyPaymentsQuery = monthlyPaymentsQuery.eq('project_id', parseInt(projectId));
    }
    
    const { data: monthlyPayments } = await monthlyPaymentsQuery;
    
    const monthlyPayment: Record<string, number> = {};
    recentMonths.forEach(m => monthlyPayment[m] = 0);
    
    monthlyPayments?.filter(p => isEffectiveClientPaymentStatus(p.status)).forEach(p => {
      if (!p.payment_date) return;
      const date = new Date(p.payment_date);
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyPayment[yearMonth] !== undefined) {
        monthlyPayment[yearMonth] += parseFloat(p.payment_amount || '0') || 0;
      }
    });
    
    // 构建趋势数据
    const trendData = recentMonths.map(month => ({
      month,
      output: monthlyOutput[month] || 0,
      payment: monthlyPayment[month] || 0,
    }));
    
    // ========== 成本构成数据 ==========
    const costComposition = [
      { name: '材料机械', value: totalSupplierCost, color: '#165DFF' },
      { name: '人工费', value: totalSalaryCost, color: '#00B42A' },
      { name: '综合费用', value: totalExpenseCost, color: '#FF7D00' },
      { name: '税费', value: totalTaxCost, color: '#F53F3F' },
      { name: '零星材料', value: totalMiscMaterialCost, color: '#722ED1' },
    ].filter(c => c.value > 0);

    // ========== 各项目收入/成本对比数据 ==========
    const projectCostData = await Promise.all(
      allProjects?.map(async (project) => {
        const projectFinancialSummary = await getProjectFinancialSummary(project.id, dashboardDateRange);
        if (projectFinancialSummary) {
          return {
            id: project.id,
            name: project.name,
            income: projectFinancialSummary.taxableIncome,
            cost: projectFinancialSummary.totalCost,
            profit: projectFinancialSummary.profit,
            profitRate: projectFinancialSummary.profitRate,
            receivableAmount: projectFinancialSummary.receivableAmount,
            totalPayableAmount: projectFinancialSummary.totalPayableAmount,
            cashOutAmount: projectFinancialSummary.cashOutAmount,
            netCashFlow: projectFinancialSummary.netCashFlow,
            fundingGapAmount: projectFinancialSummary.fundingGapAmount,
            paymentRate: projectFinancialSummary.paymentRate,
            payablePaymentRate: projectFinancialSummary.payablePaymentRate,
            costIncomeRate: projectFinancialSummary.costIncomeRate,
          };
        }

        let projReportsQuery = client
          .from('client_reports')
          .select('report_amount, settlement_amount, invoice_amount, report_date, status')
          .eq('project_id', project.id);
        if (timeRange !== 'year') {
          projReportsQuery = projReportsQuery.gte('report_date', rangeStartDate);
        }
        const { data: projReports } = await projReportsQuery;
        const projIncome = projReports?.filter((r: any) => r.status !== 'voided').reduce((sum: number, r: any) => sum + (parseFloat(r.settlement_amount || r.report_amount || '0') || 0), 0) || 0;

        let projSettlementsQuery = client
          .from('settlements')
          .select('settlement_amount, settlement_date')
          .eq('project_id', project.id);
        if (timeRange !== 'year') {
          projSettlementsQuery = projSettlementsQuery.gte('settlement_date', rangeStartDate);
        }
        const { data: projSettlements } = await projSettlementsQuery;
        const projSupplierCost = projSettlements?.reduce((sum: number, s: any) => sum + (parseFloat(s.settlement_amount || '0') || 0), 0) || 0;

        let projSalariesQuery = client
          .from('worker_salaries')
          .select('gross_pay, year_month')
          .eq('project_id', project.id);
        if (timeRange !== 'year') {
          const rangeStartMonth = rangeStartDate.substring(0, 7);
          projSalariesQuery = projSalariesQuery.gte('year_month', rangeStartMonth);
        }
        const { data: projSalaries } = await projSalariesQuery;
        const projSalaryCost = projSalaries?.reduce((sum: number, s: any) => sum + (parseFloat(s.gross_pay || '0') || 0), 0) || 0;

        let projExpensesQuery = client
          .from('comprehensive_expenses')
          .select('amount, expense_date')
          .eq('project_id', project.id);
        if (timeRange !== 'year') {
          projExpensesQuery = projExpensesQuery.gte('expense_date', rangeStartDate);
        }
        const { data: projExpenses } = await projExpensesQuery;
        const projExpenseCost = projExpenses?.reduce((sum: number, e: any) => sum + (parseFloat(e.amount || '0') || 0), 0) || 0;

        const projCost = projSupplierCost + projSalaryCost + projExpenseCost;
        const projProfit = projIncome - projCost;
        const projProfitRate = projIncome > 0 ? (projProfit / projIncome * 100) : 0;

        return { id: project.id, name: project.name, income: projIncome, cost: projCost, profit: projProfit, profitRate: projProfitRate };
      }) || []
    );

    // ========== 月度趋势数据（12个月） ==========
    const trendMonths = getRecentMonths(trendMonthCount);
    const { data: allClientReportsForTrend } = await client
      .from('client_reports')
      .select('report_amount, settlement_amount, report_date, project_id, status');

    const monthlyIncomeMap: Record<string, number> = {};
    trendMonths.forEach(m => monthlyIncomeMap[m] = 0);
    (allClientReportsForTrend || []).filter(r => r.status !== 'voided').forEach(r => {
      if (!r.report_date) return;
      if (projectId && r.project_id !== parseInt(projectId)) return;
      const date = new Date(r.report_date);
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyIncomeMap[yearMonth] !== undefined) {
        monthlyIncomeMap[yearMonth] += parseFloat(r.settlement_amount || r.report_amount || '0') || 0;
      }
    });

    const monthlyCostMap: Record<string, number> = {};
    trendMonths.forEach(m => monthlyCostMap[m] = 0);

    const { data: allMonthlySettlements } = await client
      .from('subitem_monthly_progress')
      .select('completed_quantity, year_month, work_item_subitems(project_id, contract_price)');
    (allMonthlySettlements || []).forEach(r => {
      if (!r.year_month) return;
      const subitem = r.work_item_subitems as any;
      if (projectId && subitem?.project_id !== parseInt(projectId)) return;
      const qty = parseFloat(r.completed_quantity || '0') || 0;
      const price = parseFloat(subitem?.contract_price || '0') || 0;
      if (monthlyCostMap[r.year_month] !== undefined) {
        monthlyCostMap[r.year_month] += qty * price;
      }
    });

    const { data: allSalaries } = await client
      .from('worker_salaries')
      .select('gross_pay, year_month, project_id');
    (allSalaries || []).forEach(r => {
      if (!r.year_month) return;
      if (projectId && r.project_id !== parseInt(projectId)) return;
      const gross = parseFloat(r.gross_pay || '0') || 0;
      if (monthlyCostMap[r.year_month] !== undefined) {
        monthlyCostMap[r.year_month] += gross;
      }
    });

    const monthlyTrend = trendMonths.map(month => ({
      month,
      income: monthlyIncomeMap[month] || 0,
      cost: monthlyCostMap[month] || 0,
      output: monthlyOutput[month] || 0,
      payment: monthlyPayment[month] || 0,
    }));

    // ========== 上月对比 ==========
    const lastMonth = getLastYearMonth();
    const lastMonthClientReports = (allClientReportsForTrend || []).filter(r => {
      if (!r.report_date) return false;
      if (r.status === 'voided') return false;
      const date = new Date(r.report_date);
      const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return ym === lastMonth && (!projectId || r.project_id === parseInt(projectId));
    });
    const lastMonthIncome = lastMonthClientReports.reduce((sum: number, r: any) => sum + (parseFloat(r.settlement_amount || r.report_amount || '0') || 0), 0);
    const curMonthIncome = monthlyIncomeMap[currentMonth] || 0;
    const incomeChange = lastMonthIncome > 0 ? ((curMonthIncome - lastMonthIncome) / lastMonthIncome * 100) : 0;
    const lastMonthCost = monthlyCostMap[lastMonth] || 0;
    const curMonthCost = monthlyCostMap[currentMonth] || 0;
    const costChange = lastMonthCost > 0 ? ((curMonthCost - lastMonthCost) / lastMonthCost * 100) : 0;
    const lastMonthProfit = lastMonthIncome - lastMonthCost;
    const curMonthProfit = curMonthIncome - curMonthCost;
    const profitChange = lastMonthProfit !== 0 ? ((curMonthProfit - lastMonthProfit) / Math.abs(lastMonthProfit) * 100) : 0;

    // ========== 预警计算 ==========
    // 1. 剩余工程量预警（<20%）
    const remainingPercent = totalBudgetAmount > 0 ? ((totalBudgetAmount - totalReportedAmount) / totalBudgetAmount * 100) : 100;
    const remainingWarning = remainingPercent < 20;

    // 2. 成本超支预警（对下结算量 > 对上报量）
    const costOverrun = totalSettledAmount > totalReportedAmount;
    const costOverrunAmount = totalSettledAmount - totalReportedAmount;

    // 3. 待收款过高预警（待收款 > 总产值的50%）
    const paymentWarningBase = financialMetrics.taxableIncome > 0 ? financialMetrics.taxableIncome : totalMeasurementAmount;
    const pendingPaymentHigh = paymentWarningBase > 0 && (pendingPayment / paymentWarningBase) > 0.5;
    const fundingGapWarning = financialMetrics.fundingGapAmount > 0;

    return NextResponse.json({
      // 时间范围标识
      timeRange,
      rangeStartDate,
      // 基础统计
      projectCount,
      activeProjectCount: activeProjects.length,
      workerCount: workerCount || 0,
      inServiceCount,
      leftCount,
      
      // 工程量统计
      totalBudgetAmount: totalBudgetAmount.toFixed(2),
      totalReportedAmount: totalReportedAmount.toFixed(2),
      totalSettledAmount: totalSettledAmount.toFixed(2),
      
      // 本月数据
      currentMonth,
      currentMonthReportAmount: currentMonthReportAmount.toFixed(2),
      currentMonthSettlementAmount: currentMonthSettlementAmount.toFixed(2),
      currentMonthClientReportAmount: currentMonthClientReportAmount.toFixed(2),
      
      // 差额和百分比
      differenceAmount: differenceAmount.toFixed(2),
      reportPercent: reportPercent.toFixed(1),
      settlementPercent: settlementPercent.toFixed(1),
      
      // 预警数量
      quantityWarnings,
      progressWarnings,
      totalWarnings: quantityWarnings + progressWarnings,
      
      // 甲方数据
      totalMeasurementAmount: financialMetrics.taxableIncome.toFixed(2),
      totalPaid: financialMetrics.clientPaidAmount.toFixed(2),
      receivableAmount: financialMetrics.receivableAmount.toFixed(2),
      supplierPayableAmount: financialMetrics.supplierPayableAmount.toFixed(2),
      workerPayableAmount: financialMetrics.workerPayableAmount.toFixed(2),
      totalPayableAmount: financialMetrics.totalPayableAmount.toFixed(2),
      supplierPaidAmount: financialMetrics.supplierPaidAmount.toFixed(2),
      workerPaidAmount: financialMetrics.workerPaidAmount.toFixed(2),
      cashOutAmount: financialMetrics.cashOutAmount.toFixed(2),
      netCashFlow: financialMetrics.netCashFlow.toFixed(2),
      fundingGapAmount: financialMetrics.fundingGapAmount.toFixed(2),
      paymentRate: financialMetrics.paymentRate.toFixed(2),
      payablePaymentRate: financialMetrics.payablePaymentRate.toFixed(2),
      costIncomeRate: financialMetrics.costIncomeRate.toFixed(2),
      pendingPayment: pendingPayment.toFixed(2), // 待收款金额
      
      // 签证统计
      totalVisaCount,
      completedVisaCount,
      pendingVisaCount,
      totalVisaAmount: totalVisaAmount.toFixed(2),
      
      // 证件统计
      certificateTotal,
      certificateExpiring,
      certificateExpired,
      
      // 项目详情
      projectDetails,
      activeProjects: activeProjects.slice(0, 3), // 只返回前3个活跃项目用于展示

      // 即将到期的项目（预计完工日期在30天内）
      expiringProjects: activeProjects
        .filter(p => {
          if (!p.expected_completion_date) return false;
          const endDate = new Date(p.expected_completion_date);
          const now = new Date();
          const diff = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return diff <= 30 && diff >= 0;
        })
        .map(p => ({ id: p.id, name: p.name, expected_completion_date: p.expected_completion_date }))
        .slice(0, 5),

      // 未发放工资统计
      unpaidSalaryStats: await (async () => {
        try {
          const { data: unpaidData } = await client
            .from('worker_salaries')
            .select('net_pay')
            .eq('payment_status', 'unpaid');
          const totalUnpaid = (unpaidData || []).reduce((sum: number, s: any) => sum + (parseFloat(s.net_pay) || 0), 0);
          const unpaidCount = unpaidData?.length || 0;
          return { count: unpaidCount, amount: totalUnpaid.toFixed(2) };
        } catch { return { count: 0, amount: '0' }; }
      })(),
      
      // 新增预警状态
      warnings: {
        remainingQuantity: {
          isWarning: remainingWarning,
          percent: remainingPercent.toFixed(1),
          message: remainingWarning ? `剩余工程量仅剩 ${remainingPercent.toFixed(1)}%，请注意补充` : null,
        },
        costOverrun: {
          isWarning: costOverrun,
          amount: costOverrunAmount.toFixed(2),
          message: costOverrun ? `成本超支 ¥${costOverrunAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}，对下结算超过对上报量` : null,
        },
        pendingPayment: {
          isWarning: pendingPaymentHigh,
          amount: pendingPayment.toFixed(2),
          percent: paymentWarningBase > 0 ? (pendingPayment / paymentWarningBase * 100).toFixed(1) : '0',
          message: pendingPaymentHigh ? `待收款占比 ${(pendingPayment / paymentWarningBase * 100).toFixed(1)}%，建议跟进回款` : null,
        },
        fundingGap: {
          isWarning: fundingGapWarning,
          amount: financialMetrics.fundingGapAmount.toFixed(2),
          message: fundingGapWarning ? `资金缺口 ¥${financialMetrics.fundingGapAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}，建议优先跟进回款并安排付款计划` : null,
        },
      },
      
      // 成本数据
      costData: {
        totalCost: financialMetrics.totalCost.toFixed(2),
        totalProfit: financialMetrics.totalProfit.toFixed(2),
        profitRate: financialMetrics.profitRate.toFixed(1),
        supplierCost: financialMetrics.supplierCost.toFixed(2),
        salaryCost: financialMetrics.salaryCost.toFixed(2),
        expenseCost: financialMetrics.expenseCost.toFixed(2),
        taxCost: financialMetrics.taxCost.toFixed(2),
        miscMaterialCost: financialMetrics.miscMaterialCost.toFixed(2),
      },
      
      // 月度趋势数据
      trendData: monthlyTrend,
      
      // 成本构成数据
      costComposition,
      
      // 各项目收入/成本对比
      projectCostData,
      
      // 环比变化
      kpiChanges: {
        incomeChange: incomeChange.toFixed(1),
        costChange: costChange.toFixed(1),
        profitChange: profitChange.toFixed(1),
        projectChange: 0,
      },
      
      // 更新时间
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}
