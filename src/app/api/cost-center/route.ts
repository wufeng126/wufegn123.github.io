import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getProjectFinancialSummary } from '@/lib/data-aggregation';
import { formatAmountSmart, formatPercent, toWanYuan } from '@/lib/format';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    
    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    
    // ========== 1. 获取所有项目 ==========
    let projectsQuery = client
      .from('projects')
      .select('id, name, status, contract_amount')
      .order('created_at', { ascending: false });
    
    if (accessibleProjects !== null) {
      projectsQuery = projectsQuery.in('id', accessibleProjects);
    }
    
    const { data: projects, error: projectError } = await projectsQuery;
    if (projectError) {
      throw new Error(`查询项目失败: ${projectError.message}`);
    }

    // ========== 2. 使用统一中间层获取各项目财务汇总 ==========
    const summaries = await Promise.all(
      (projects || []).map((p: any) => getProjectFinancialSummary(p.id))
    );

    // 构建项目成本数据列表（保持前端接口兼容）
    const projectCostList = (projects || []).map((project: any, idx: number) => {
      const s = summaries[idx];
      if (!s) return null;
      return {
        id: project.id,
        name: project.name,
        status: project.status || '未知',
        contractAmount: parseFloat(project.contract_amount || '0') || 0,
        totalIncome: s.taxableIncome,
        invoiceAmount: s.invoiceAmount,
        untaxedIncome: s.untaxedIncome,
        visaAmount: s.visaAmount,
        totalCost: s.totalCost,
        settlementAmount: s.settlementAmount,
        salaryAmount: s.salaryAmount,
        expenseAmount: s.expenseAmount,
        taxAmount: s.taxAmount,
        miscMaterialAmount: s.miscMaterialAmount,
        profit: s.profit,
        profitRate: s.profitRate,
        laborCostRate: s.laborCostRate,
        expenseRate: s.expenseRate,
        taxRate: s.taxRate,
        miscMaterialRate: s.miscMaterialRate,
      };
    }).filter(Boolean);

    // ========== 3. 汇总计算（从统一中间层数据聚合） ==========
    const totals = projectCostList.reduce((acc: any, p: any) => {
      acc.totalIncome += p.totalIncome;
      acc.totalInvoiceAmount += p.invoiceAmount;
      acc.totalUntaxedIncome += p.untaxedIncome;
      acc.totalVisaAmount += p.visaAmount;
      acc.totalCost += p.totalCost;
      acc.totalSalary += p.salaryAmount;
      acc.totalSettlement += p.settlementAmount;
      acc.totalExpense += p.expenseAmount;
      acc.totalTaxAmount += p.taxAmount;
      acc.totalMiscMaterial += p.miscMaterialAmount;
      acc.totalProfit += p.profit;
      return acc;
    }, {
      totalIncome: 0, totalInvoiceAmount: 0, totalUntaxedIncome: 0, totalVisaAmount: 0,
      totalCost: 0, totalSalary: 0, totalSettlement: 0, totalExpense: 0,
      totalTaxAmount: 0, totalMiscMaterial: 0, totalProfit: 0,
    });

    // ========== 4. 成本异常预警 ==========
    interface Warning {
      projectId: number;
      projectName: string;
      type: string;
      message: string;
      value: number;
      severity: 'high' | 'medium' | 'low';
    }

    const warnings: Warning[] = [];

    projectCostList.forEach((project: any) => {
      if (project.profit < 0) {
        warnings.push({
          projectId: project.id,
          projectName: project.name,
          type: 'loss',
          message: `项目亏损 ${formatAmountSmart(Math.abs(toWanYuan(project.profit)))}`,
          value: project.profit,
          severity: 'high',
        });
      }

      if (project.totalCost > project.totalIncome && project.totalIncome > 0) {
        warnings.push({
          projectId: project.id,
          projectName: project.name,
          type: 'cost_overrun',
          message: `成本超收入 ${formatAmountSmart(toWanYuan(project.totalCost - project.totalIncome))}万`,
          value: project.totalCost - project.totalIncome,
          severity: 'high',
        });
      }

      if (project.laborCostRate > 60) {
        warnings.push({
          projectId: project.id,
          projectName: project.name,
          type: 'high_labor_cost',
          message: `人工费占比过高 ${formatPercent(project.laborCostRate)}`,
          value: project.laborCostRate,
          severity: 'medium',
        });
      }

      if (project.profitRate < 10 && project.profitRate >= 0 && project.totalIncome > 0) {
        warnings.push({
          projectId: project.id,
          projectName: project.name,
          type: 'low_profit_rate',
          message: `利润率过低 ${formatPercent(project.profitRate)}`,
          value: project.profitRate,
          severity: 'low',
        });
      }

      if (project.expenseRate > 20) {
        warnings.push({
          projectId: project.id,
          projectName: project.name,
          type: 'high_expense_rate',
          message: `综合费用占比过高 ${formatPercent(project.expenseRate)}`,
          value: project.expenseRate,
          severity: 'medium',
        });
      }
    });

    const severityOrder = { high: 0, medium: 1, low: 2 };
    warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // ========== 5. 返回数据 ==========
    const result = {
      summary: {
        totalIncome: totals.totalIncome,
        invoiceAmount: totals.totalInvoiceAmount,
        untaxedIncome: totals.totalUntaxedIncome,
        visaAmount: totals.totalVisaAmount,
        totalCost: totals.totalCost,
        totalSalary: totals.totalSalary,
        totalSettlement: totals.totalSettlement,
        totalExpense: totals.totalExpense,
        totalTax: totals.totalTaxAmount,
        totalMiscMaterial: totals.totalMiscMaterial,
        totalProfit: totals.totalProfit,
        avgProfitRate: totals.totalIncome > 0 ? (totals.totalProfit / totals.totalIncome) * 100 : 0,
        avgLaborCostRate: totals.totalCost > 0 ? (totals.totalSalary / totals.totalCost) * 100 : 0,
        avgExpenseRate: totals.totalCost > 0 ? (totals.totalExpense / totals.totalCost) * 100 : 0,
        avgTaxRate: totals.totalCost > 0 ? (totals.totalTaxAmount / totals.totalCost) * 100 : 0,
        avgMiscMaterialRate: totals.totalCost > 0 ? (totals.totalMiscMaterial / totals.totalCost) * 100 : 0,
      },
      projects: projectCostList,
      warnings,
    };

    if (projectId) {
      const projectData = projectCostList.find(p => p && p.id === parseInt(projectId as string));
      if (!projectData) {
        return NextResponse.json({ error: '项目不存在' }, { status: 404 });
      }
      return NextResponse.json({ 
        project: projectData,
        warnings: warnings.filter(w => w.projectId === parseInt(projectId)),
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('成本利润中心API错误:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}
