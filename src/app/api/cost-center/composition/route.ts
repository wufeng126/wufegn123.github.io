import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { VISA_DONE_STATUSES } from '@/lib/business-logic';
import { getTeamSettlementCostAmount } from '@/lib/data-aggregation';

// 获取年月的起止日期
function getMonthDateRange(year: number, month: number): { startDate: string; endDate: string } {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
  
  return { startDate, endDate };
}

// 获取年月范围
function getYearMonthRange(year: number, month: number): { startYearMonth: string; endYearMonth: string } {
  const startYearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const endYearMonth = `${year}-${String(month).padStart(2, '0')}`;
  
  return { startYearMonth, endYearMonth };
}

// 计算环比变化率
function calculateChangeRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// 计算税费（与主成本中心 API 保持一致）
function calculateTaxAmount(invoiceAmount: number, taxRate: number): number {
  if (!invoiceAmount || invoiceAmount <= 0 || !taxRate || taxRate <= 0) {
    return 0;
  }
  // 不含税收入 = 开票金额 / (1 + 税率 / 100)
  const untaxedIncome = invoiceAmount / (1 + taxRate / 100);
  // 税费 = 开票金额 − 不含税收入
  const taxAmount = invoiceAmount - untaxedIncome;
  return Math.round(taxAmount * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const viewType = searchParams.get('viewType') || 'monthly'; // monthly 或 cumulative
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString());

    const client = getSupabaseClient();

    // 计算当前月份和上一月份的时间范围
    const currentMonthRange = getMonthDateRange(year, month);
    const currentYearMonthRange = getYearMonthRange(year, month);
    
    // 计算上一月份的时间范围
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    const prevMonthRange = getMonthDateRange(prevYear, prevMonth);
    const prevYearMonthRange = getYearMonthRange(prevYear, prevMonth);

    // ========== 收入数据 ==========
    // 1. 开票金额数据（从 client_reports 表）
    let invoiceQuery = client
      .from('client_reports')
      .select('project_id, invoice_amount, report_date');
    
    let prevInvoiceQuery = client
      .from('client_reports')
      .select('project_id, invoice_amount, report_date');

    if (projectId) {
      invoiceQuery = invoiceQuery.eq('project_id', parseInt(projectId));
      prevInvoiceQuery = prevInvoiceQuery.eq('project_id', parseInt(projectId));
    }

    // 累计视图：获取所有数据；季度视图：按季度筛选
    if (viewType === 'monthly') {
      invoiceQuery = invoiceQuery
        .gte('report_date', currentMonthRange.startDate)
        .lte('report_date', currentMonthRange.endDate);
      prevInvoiceQuery = prevInvoiceQuery
        .gte('report_date', prevMonthRange.startDate)
        .lte('report_date', prevMonthRange.endDate);
    }

    const { data: currentInvoiceData } = await invoiceQuery;
    const { data: prevInvoiceData } = await prevInvoiceQuery;

    // 2. 签证数据（已完成的）
    let visaQuery = client
      .from('visas')
      .select('project_id, visa_amount, occurrence_date')
      .in('status', [...VISA_DONE_STATUSES]);
    
    let prevVisaQuery = client
      .from('visas')
      .select('project_id, visa_amount, occurrence_date')
      .in('status', [...VISA_DONE_STATUSES]);

    if (projectId) {
      visaQuery = visaQuery.eq('project_id', parseInt(projectId));
      prevVisaQuery = prevVisaQuery.eq('project_id', parseInt(projectId));
    }

    if (viewType === 'monthly') {
      visaQuery = visaQuery
        .gte('occurrence_date', currentMonthRange.startDate)
        .lte('occurrence_date', currentMonthRange.endDate);
      prevVisaQuery = prevVisaQuery
        .gte('occurrence_date', prevMonthRange.startDate)
        .lte('occurrence_date', prevMonthRange.endDate);
    }

    const { data: currentVisaData } = await visaQuery;
    const { data: prevVisaData } = await prevVisaQuery;

    // ========== 成本数据 ==========
    // 3. 供应商及班组结算数据
    let settlementQuery = client
      .from('settlements')
      .select('project_id, settlement_amount, settlement_date');
    
    let prevSettlementQuery = client
      .from('settlements')
      .select('project_id, settlement_amount, settlement_date');

    if (projectId) {
      settlementQuery = settlementQuery.eq('project_id', parseInt(projectId));
      prevSettlementQuery = prevSettlementQuery.eq('project_id', parseInt(projectId));
    }

    if (viewType === 'monthly') {
      settlementQuery = settlementQuery
        .gte('settlement_date', currentMonthRange.startDate)
        .lte('settlement_date', currentMonthRange.endDate);
      prevSettlementQuery = prevSettlementQuery
        .gte('settlement_date', prevMonthRange.startDate)
        .lte('settlement_date', prevMonthRange.endDate);
    }

    const { data: currentSettlementData } = await settlementQuery;
    const { data: prevSettlementData } = await prevSettlementQuery;

    // 4. 工人工资数据（使用 year_month 字段）
    let salaryQuery = client
      .from('worker_salaries')
      .select('project_id, gross_pay, year_month');
    
    let prevSalaryQuery = client
      .from('worker_salaries')
      .select('project_id, gross_pay, year_month');

    if (projectId) {
      salaryQuery = salaryQuery.eq('project_id', parseInt(projectId));
      prevSalaryQuery = prevSalaryQuery.eq('project_id', parseInt(projectId));
    }

    if (viewType === 'monthly') {
      salaryQuery = salaryQuery
        .gte('year_month', currentYearMonthRange.startYearMonth)
        .lte('year_month', currentYearMonthRange.endYearMonth);
      prevSalaryQuery = prevSalaryQuery
        .gte('year_month', prevYearMonthRange.startYearMonth)
        .lte('year_month', prevYearMonthRange.endYearMonth);
    }

    const { data: currentSalaryData } = await salaryQuery;
    const { data: prevSalaryData } = await prevSalaryQuery;

    // 5. 综合费用数据
    let expenseQuery = client
      .from('comprehensive_expenses')
      .select('project_id, amount, expense_date');
    
    let prevExpenseQuery = client
      .from('comprehensive_expenses')
      .select('project_id, amount, expense_date');

    if (projectId) {
      expenseQuery = expenseQuery.eq('project_id', parseInt(projectId));
      prevExpenseQuery = prevExpenseQuery.eq('project_id', parseInt(projectId));
    }

    if (viewType === 'monthly') {
      expenseQuery = expenseQuery
        .gte('expense_date', currentMonthRange.startDate)
        .lte('expense_date', currentMonthRange.endDate);
      prevExpenseQuery = prevExpenseQuery
        .gte('expense_date', prevMonthRange.startDate)
        .lte('expense_date', prevMonthRange.endDate);
    }

    const { data: currentExpenseData } = await expenseQuery;
    const { data: prevExpenseData } = await prevExpenseQuery;

    // 6. 零星材料数据
    let miscMaterialQuery = client
      .from('miscellaneous_materials')
      .select('project_id, amount, purchase_date');
    
    let prevMiscMaterialQuery = client
      .from('miscellaneous_materials')
      .select('project_id, amount, purchase_date');

    if (projectId) {
      miscMaterialQuery = miscMaterialQuery.eq('project_id', parseInt(projectId));
      prevMiscMaterialQuery = prevMiscMaterialQuery.eq('project_id', parseInt(projectId));
    }

    if (viewType === 'monthly') {
      miscMaterialQuery = miscMaterialQuery
        .gte('purchase_date', currentMonthRange.startDate)
        .lte('purchase_date', currentMonthRange.endDate);
      prevMiscMaterialQuery = prevMiscMaterialQuery
        .gte('purchase_date', prevMonthRange.startDate)
        .lte('purchase_date', prevMonthRange.endDate);
    }

    const { data: currentMiscMaterialData } = await miscMaterialQuery;
    const { data: prevMiscMaterialData } = await prevMiscMaterialQuery;

    // ========== 税费数据 ==========
    // 6. 税费数据（从产值结算表计算）
    let taxQuery = client
      .from('client_reports')
      .select('project_id, invoice_amount, report_date, tax_rate');
    
    let prevTaxQuery = client
      .from('client_reports')
      .select('project_id, invoice_amount, report_date, tax_rate');

    if (projectId) {
      taxQuery = taxQuery.eq('project_id', parseInt(projectId));
      prevTaxQuery = prevTaxQuery.eq('project_id', parseInt(projectId));
    }

    if (viewType === 'monthly') {
      taxQuery = taxQuery
        .gte('report_date', currentMonthRange.startDate)
        .lte('report_date', currentMonthRange.endDate);
      prevTaxQuery = prevTaxQuery
        .gte('report_date', prevMonthRange.startDate)
        .lte('report_date', prevMonthRange.endDate);
    }

    const { data: currentTaxData } = await taxQuery;
    const { data: prevTaxData } = await prevTaxQuery;

    // ========== 计算汇总数据 ==========
    // 当前周期数据
    const currentInvoiceAmount = currentInvoiceData?.reduce((sum, item) => 
      sum + (parseFloat(item.invoice_amount || '0') || 0), 0) || 0;
    const currentVisaAmount = currentVisaData?.reduce((sum, item) => 
      sum + (parseFloat(item.visa_amount || '0') || 0), 0) || 0;
    const currentSettlementAmount = currentSettlementData?.reduce((sum, item) => 
      sum + (parseFloat(item.settlement_amount || '0') || 0), 0) || 0;
    const currentWorkerSalaryAmount = currentSalaryData?.reduce((sum, item) => 
      sum + (parseFloat(item.gross_pay || '0') || 0), 0) || 0;
    const currentTeamSettlementAmount = await getTeamSettlementCostAmount(client, {
      projectId: projectId ? parseInt(projectId) : undefined,
      dateRange: viewType === 'monthly'
        ? { start: currentMonthRange.startDate, end: currentMonthRange.endDate }
        : undefined,
    });
    const currentSalaryAmount = currentWorkerSalaryAmount + currentTeamSettlementAmount;
    const currentExpenseAmount = currentExpenseData?.reduce((sum, item) => 
      sum + (parseFloat(item.amount || '0') || 0), 0) || 0;
    const currentMiscMaterialAmount = currentMiscMaterialData?.reduce((sum, item) => 
      sum + (parseFloat(item.amount || '0') || 0), 0) || 0;
    // 税费计算：使用默认税率 9%（如果数据库中没有 tax_rate 字段）
    const DEFAULT_TAX_RATE = 9;
    const currentTaxAmount = currentTaxData?.reduce((sum, item) => {
      const invoiceAmount = parseFloat(item.invoice_amount || '0') || 0;
      const taxRate = parseFloat(item.tax_rate || String(DEFAULT_TAX_RATE)) || DEFAULT_TAX_RATE;
      return sum + calculateTaxAmount(invoiceAmount, taxRate);
    }, 0) || 0;

    // 上一周期数据
    const prevInvoiceAmount = prevInvoiceData?.reduce((sum, item) => 
      sum + (parseFloat(item.invoice_amount || '0') || 0), 0) || 0;
    const prevVisaAmount = prevVisaData?.reduce((sum, item) => 
      sum + (parseFloat(item.visa_amount || '0') || 0), 0) || 0;
    const prevSettlementAmount = prevSettlementData?.reduce((sum, item) => 
      sum + (parseFloat(item.settlement_amount || '0') || 0), 0) || 0;
    const prevWorkerSalaryAmount = prevSalaryData?.reduce((sum, item) => 
      sum + (parseFloat(item.gross_pay || '0') || 0), 0) || 0;
    const prevTeamSettlementAmount = await getTeamSettlementCostAmount(client, {
      projectId: projectId ? parseInt(projectId) : undefined,
      dateRange: viewType === 'monthly'
        ? { start: prevMonthRange.startDate, end: prevMonthRange.endDate }
        : undefined,
    });
    const prevSalaryAmount = prevWorkerSalaryAmount + prevTeamSettlementAmount;
    const prevExpenseAmount = prevExpenseData?.reduce((sum, item) => 
      sum + (parseFloat(item.amount || '0') || 0), 0) || 0;
    const prevMiscMaterialAmount = prevMiscMaterialData?.reduce((sum, item) => 
      sum + (parseFloat(item.amount || '0') || 0), 0) || 0;
    const prevTaxAmount = prevTaxData?.reduce((sum, item) => {
      const invoiceAmount = parseFloat(item.invoice_amount || '0') || 0;
      const taxRate = parseFloat(item.tax_rate || String(DEFAULT_TAX_RATE)) || DEFAULT_TAX_RATE;
      return sum + calculateTaxAmount(invoiceAmount, taxRate);
    }, 0) || 0;

    // 汇总计算（总成本包含综合费用、税费和零星材料）
    const currentTotalIncome = currentInvoiceAmount + currentVisaAmount;
    const currentTotalCost = currentSettlementAmount + currentSalaryAmount + currentExpenseAmount + currentTaxAmount + currentMiscMaterialAmount;
    const prevTotalIncome = prevInvoiceAmount + prevVisaAmount;
    const prevTotalCost = prevSettlementAmount + prevSalaryAmount + prevExpenseAmount + prevTaxAmount + prevMiscMaterialAmount;

    // 计算环比变化率
    const invoiceChangeRate = calculateChangeRate(currentInvoiceAmount, prevInvoiceAmount);
    const visaChangeRate = calculateChangeRate(currentVisaAmount, prevVisaAmount);
    const settlementChangeRate = calculateChangeRate(currentSettlementAmount, prevSettlementAmount);
    const salaryChangeRate = calculateChangeRate(currentSalaryAmount, prevSalaryAmount);
    const expenseChangeRate = calculateChangeRate(currentExpenseAmount, prevExpenseAmount);
    const taxChangeRate = calculateChangeRate(currentTaxAmount, prevTaxAmount);
    const miscMaterialChangeRate = calculateChangeRate(currentMiscMaterialAmount, prevMiscMaterialAmount);
    const incomeChangeRate = calculateChangeRate(currentTotalIncome, prevTotalIncome);
    const costChangeRate = calculateChangeRate(currentTotalCost, prevTotalCost);

    // 预警判断
    const incomeWarning = viewType === 'monthly' && incomeChangeRate < -10;
    const costWarning = viewType === 'monthly' && costChangeRate > 10;

    // 返回结果
    const result = {
      viewType,
      year,
      month,
      periodLabel: viewType === 'monthly' 
        ? `${year}年${month}月` 
        : '累计',
      prevPeriodLabel: viewType === 'monthly' 
        ? `${prevYear}年${prevMonth}月` 
        : '-',
      income: {
        total: currentTotalIncome,
        invoice: {
          amount: currentInvoiceAmount,
          percentage: currentTotalIncome > 0 ? (currentInvoiceAmount / currentTotalIncome) * 100 : 0,
          changeRate: invoiceChangeRate,
          prevAmount: prevInvoiceAmount,
        },
        visa: {
          amount: currentVisaAmount,
          percentage: currentTotalIncome > 0 ? (currentVisaAmount / currentTotalIncome) * 100 : 0,
          changeRate: visaChangeRate,
          prevAmount: prevVisaAmount,
        },
        totalChangeRate: incomeChangeRate,
        warning: incomeWarning,
      },
      cost: {
        total: currentTotalCost,
        settlement: {
          amount: currentSettlementAmount,
          percentage: currentTotalCost > 0 ? (currentSettlementAmount / currentTotalCost) * 100 : 0,
          changeRate: settlementChangeRate,
          prevAmount: prevSettlementAmount,
        },
        salary: {
          amount: currentSalaryAmount,
          percentage: currentTotalCost > 0 ? (currentSalaryAmount / currentTotalCost) * 100 : 0,
          changeRate: salaryChangeRate,
          prevAmount: prevSalaryAmount,
        },
        expense: {
          amount: currentExpenseAmount,
          percentage: currentTotalCost > 0 ? (currentExpenseAmount / currentTotalCost) * 100 : 0,
          changeRate: expenseChangeRate,
          prevAmount: prevExpenseAmount,
        },
        tax: {
          amount: currentTaxAmount,
          percentage: currentTotalCost > 0 ? (currentTaxAmount / currentTotalCost) * 100 : 0,
          changeRate: taxChangeRate,
          prevAmount: prevTaxAmount,
        },
        miscMaterial: {
          amount: currentMiscMaterialAmount,
          percentage: currentTotalCost > 0 ? (currentMiscMaterialAmount / currentTotalCost) * 100 : 0,
          changeRate: miscMaterialChangeRate,
          prevAmount: prevMiscMaterialAmount,
        },
        totalChangeRate: costChangeRate,
        warning: costWarning,
      },
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}
