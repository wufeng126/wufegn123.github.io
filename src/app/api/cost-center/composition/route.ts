import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import {
  getMultiProjectFinancialSummaries,
  type DateRange,
  type ProjectFinancialSummary,
} from '@/lib/data-aggregation';

interface CompositionTotals {
  invoiceAmount: number;
  visaAmount: number;
  totalIncome: number;
  settlementAmount: number;
  salaryAmount: number;
  expenseAmount: number;
  taxAmount: number;
  miscMaterialAmount: number;
  totalCost: number;
}

function getMonthDateRange(year: number, month: number): DateRange {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
  return { start, end };
}

function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month > 1) return { year, month: month - 1 };
  return { year: year - 1, month: 12 };
}

function getDateRangeForView(viewType: string, year: number, month: number): DateRange {
  const monthRange = getMonthDateRange(year, month);
  if (viewType === 'cumulative') {
    return { start: '1900-01-01', end: monthRange.end };
  }
  return monthRange;
}

function calculateChangeRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function zeroTotals(): CompositionTotals {
  return {
    invoiceAmount: 0,
    visaAmount: 0,
    totalIncome: 0,
    settlementAmount: 0,
    salaryAmount: 0,
    expenseAmount: 0,
    taxAmount: 0,
    miscMaterialAmount: 0,
    totalCost: 0,
  };
}

function addSummary(totals: CompositionTotals, summary: ProjectFinancialSummary): void {
  totals.invoiceAmount += summary.invoiceAmount;
  totals.visaAmount += summary.visaAmount;
  totals.totalIncome += summary.taxableIncome;
  totals.settlementAmount += summary.settlementAmount;
  totals.salaryAmount += summary.salaryAmount;
  totals.expenseAmount += summary.expenseAmount;
  totals.taxAmount += summary.taxAmount;
  totals.miscMaterialAmount += summary.miscMaterialAmount;
  totals.totalCost += summary.totalCost;
}

async function getCompositionTotals(projectIds: number[], dateRange: DateRange): Promise<CompositionTotals> {
  const totals = zeroTotals();
  const summaries = await getMultiProjectFinancialSummaries(projectIds, dateRange);

  summaries.forEach((summary) => {
    addSummary(totals, summary);
  });

  return {
    invoiceAmount: round2(totals.invoiceAmount),
    visaAmount: round2(totals.visaAmount),
    totalIncome: round2(totals.totalIncome),
    settlementAmount: round2(totals.settlementAmount),
    salaryAmount: round2(totals.salaryAmount),
    expenseAmount: round2(totals.expenseAmount),
    taxAmount: round2(totals.taxAmount),
    miscMaterialAmount: round2(totals.miscMaterialAmount),
    totalCost: round2(totals.totalCost),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectIdParam = searchParams.get('projectId');
    const viewType = searchParams.get('viewType') === 'cumulative' ? 'cumulative' : 'monthly';
    const now = new Date();
    const year = Number.parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
    const month = Number.parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: '年月参数不正确' }, { status: 400 });
    }

    const projectId = projectIdParam ? Number.parseInt(projectIdParam, 10) : null;
    if (projectIdParam && (!Number.isInteger(projectId) || !projectId)) {
      return NextResponse.json({ error: '项目参数不正确' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);

    if (projectId && accessibleProjectIds !== null && !accessibleProjectIds.includes(projectId)) {
      return NextResponse.json({ error: '当前账号无权查看该项目' }, { status: 403 });
    }

    let projectIds: number[] = [];
    if (projectId) {
      projectIds = [projectId];
    } else if (accessibleProjectIds !== null) {
      projectIds = accessibleProjectIds;
    } else {
      const { data: projects, error } = await client.from('projects').select('id');
      if (error) throw new Error(`查询项目失败: ${error.message}`);
      projectIds = (projects || [])
        .map((project) => Number(project.id))
        .filter((id) => Number.isInteger(id));
    }

    const currentRange = getDateRangeForView(viewType, year, month);
    const prevMonth = getPreviousMonth(year, month);
    const previousRange = getDateRangeForView(viewType, prevMonth.year, prevMonth.month);

    const [currentTotals, previousTotals] = await Promise.all([
      getCompositionTotals(projectIds, currentRange),
      getCompositionTotals(projectIds, previousRange),
    ]);

    const invoiceChangeRate = calculateChangeRate(currentTotals.invoiceAmount, previousTotals.invoiceAmount);
    const visaChangeRate = calculateChangeRate(currentTotals.visaAmount, previousTotals.visaAmount);
    const settlementChangeRate = calculateChangeRate(currentTotals.settlementAmount, previousTotals.settlementAmount);
    const salaryChangeRate = calculateChangeRate(currentTotals.salaryAmount, previousTotals.salaryAmount);
    const expenseChangeRate = calculateChangeRate(currentTotals.expenseAmount, previousTotals.expenseAmount);
    const taxChangeRate = calculateChangeRate(currentTotals.taxAmount, previousTotals.taxAmount);
    const miscMaterialChangeRate = calculateChangeRate(currentTotals.miscMaterialAmount, previousTotals.miscMaterialAmount);
    const incomeChangeRate = calculateChangeRate(currentTotals.totalIncome, previousTotals.totalIncome);
    const costChangeRate = calculateChangeRate(currentTotals.totalCost, previousTotals.totalCost);

    const incomeWarning = viewType === 'monthly' && incomeChangeRate < -10;
    const costWarning = viewType === 'monthly' && costChangeRate > 10;

    return NextResponse.json({
      viewType,
      year,
      month,
      periodLabel: viewType === 'monthly'
        ? `${year}年${month}月`
        : `截至${year}年${month}月`,
      prevPeriodLabel: viewType === 'monthly'
        ? `${prevMonth.year}年${prevMonth.month}月`
        : `截至${prevMonth.year}年${prevMonth.month}月`,
      income: {
        total: currentTotals.totalIncome,
        invoice: {
          amount: currentTotals.invoiceAmount,
          percentage: currentTotals.totalIncome > 0 ? (currentTotals.invoiceAmount / currentTotals.totalIncome) * 100 : 0,
          changeRate: invoiceChangeRate,
          prevAmount: previousTotals.invoiceAmount,
        },
        visa: {
          amount: currentTotals.visaAmount,
          percentage: currentTotals.totalIncome > 0 ? (currentTotals.visaAmount / currentTotals.totalIncome) * 100 : 0,
          changeRate: visaChangeRate,
          prevAmount: previousTotals.visaAmount,
        },
        totalChangeRate: incomeChangeRate,
        warning: incomeWarning,
      },
      cost: {
        total: currentTotals.totalCost,
        settlement: {
          amount: currentTotals.settlementAmount,
          percentage: currentTotals.totalCost > 0 ? (currentTotals.settlementAmount / currentTotals.totalCost) * 100 : 0,
          changeRate: settlementChangeRate,
          prevAmount: previousTotals.settlementAmount,
        },
        salary: {
          amount: currentTotals.salaryAmount,
          percentage: currentTotals.totalCost > 0 ? (currentTotals.salaryAmount / currentTotals.totalCost) * 100 : 0,
          changeRate: salaryChangeRate,
          prevAmount: previousTotals.salaryAmount,
        },
        expense: {
          amount: currentTotals.expenseAmount,
          percentage: currentTotals.totalCost > 0 ? (currentTotals.expenseAmount / currentTotals.totalCost) * 100 : 0,
          changeRate: expenseChangeRate,
          prevAmount: previousTotals.expenseAmount,
        },
        tax: {
          amount: currentTotals.taxAmount,
          percentage: currentTotals.totalCost > 0 ? (currentTotals.taxAmount / currentTotals.totalCost) * 100 : 0,
          changeRate: taxChangeRate,
          prevAmount: previousTotals.taxAmount,
        },
        miscMaterial: {
          amount: currentTotals.miscMaterialAmount,
          percentage: currentTotals.totalCost > 0 ? (currentTotals.miscMaterialAmount / currentTotals.totalCost) * 100 : 0,
          changeRate: miscMaterialChangeRate,
          prevAmount: previousTotals.miscMaterialAmount,
        },
        totalChangeRate: costChangeRate,
        warning: costWarning,
      },
    });
  } catch (error: unknown) {
    console.error('成本构成分析API错误:', error);
    const message = error instanceof Error ? error.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
