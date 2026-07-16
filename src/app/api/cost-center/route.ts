import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getProjectFinancialSummary } from '@/lib/data-aggregation';
import { formatAmountSmart, formatPercent, toWanYuan } from '@/lib/format';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

const DAY_MS = 24 * 60 * 60 * 1000;

type ReceivableRiskLevel = 'high' | 'medium' | 'attention' | 'config' | 'normal';

interface ProjectReceivableConfig {
  id: number;
  name: string;
  status: string | null;
  contract_amount: string | number | null;
  construction_payment_ratio: string | number | null;
  completion_settlement_payment_ratio: string | number | null;
  warranty_payment_ratio: string | number | null;
  warranty_expired_payment_ratio: string | number | null;
  completion_date: string | null;
  warranty_days: string | number | null;
}

interface ProjectCostRow {
  id: number;
  name: string;
  status: string;
  effectiveStatus: string;
  contractAmount: number;
  totalIncome: number;
  invoiceAmount: number;
  untaxedIncome: number;
  visaAmount: number;
  totalCost: number;
  settlementAmount: number;
  salaryAmount: number;
  expenseAmount: number;
  taxAmount: number;
  miscMaterialAmount: number;
  profit: number;
  profitRate: number;
  laborCostRate: number;
  expenseRate: number;
  taxRate: number;
  miscMaterialRate: number;
  clientPaidAmount: number;
  supplierPaidAmount: number;
  workerPaidAmount: number;
  receivableAmount: number;
  paymentRatio: number | null;
  ratioReceivableAmount: number | null;
  ratioUnreceivedAmount: number | null;
  fullUnreceivedAmount: number;
  completionDate: string | null;
  warrantyDays: string | number | null;
  warrantyExpiredDate: string | null;
  receivableAgingDays: number | null;
  receivableRiskLabel: string;
  receivableRiskLevel: ReceivableRiskLevel;
  supplierPayableBaseAmount: number;
  supplierPayableAmount: number;
  workerPayableAmount: number;
  totalPayableAmount: number;
  cashOutAmount: number;
  netCashFlow: number;
  fundingGapAmount: number;
  paymentRate: number;
  payablePaymentRate: number;
  costIncomeRate: number;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProjectStatus(status?: string | null) {
  if (status === '进行中') return '在建';
  if (status === '已完成') return '竣工结算';
  if (status === '暂停') return '在建';
  return status || '待完善';
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date;
}

function getWarrantyExpiredDate(project: ProjectReceivableConfig) {
  const days = toOptionalNumber(project.warranty_days);
  if (!project.completion_date || days === null || days <= 0) return null;
  return addDays(project.completion_date, days);
}

function getEffectiveStatus(project: ProjectReceivableConfig, today: Date) {
  const status = normalizeProjectStatus(project.status);
  const expiredDate = getWarrantyExpiredDate(project);
  if ((status === '质保期' || status === '竣工结算') && expiredDate && today.getTime() >= expiredDate.getTime()) {
    return '质保期满';
  }
  return status;
}

function getPaymentRatio(project: ProjectReceivableConfig, status: string) {
  if (status === '在建') return toOptionalNumber(project.construction_payment_ratio);
  if (status === '竣工结算') return toOptionalNumber(project.completion_settlement_payment_ratio);
  if (status === '质保期') return toOptionalNumber(project.warranty_payment_ratio);
  if (status === '质保期满') return toOptionalNumber(project.warranty_expired_payment_ratio);
  return null;
}

function getReceivableRisk(params: {
  paymentRatio: number | null;
  ratioUnreceivedAmount: number;
  fullUnreceivedAmount: number;
  agingDays: number | null;
}): { label: string; level: ReceivableRiskLevel } {
  if (params.paymentRatio === null) return { label: '待完善', level: 'config' };
  if ((params.agingDays || 0) >= 365 && params.fullUnreceivedAmount > 0) return { label: '高风险', level: 'high' };
  if ((params.agingDays || 0) >= 180 && params.fullUnreceivedAmount > 0) return { label: '重点跟进', level: 'medium' };
  if (params.ratioUnreceivedAmount > 0) return { label: '待收款', level: 'attention' };
  return { label: '正常', level: 'normal' };
}

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
      .select('id, name, status, contract_amount, construction_payment_ratio, completion_settlement_payment_ratio, warranty_payment_ratio, warranty_expired_payment_ratio, completion_date, warranty_days')
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
      ((projects || []) as ProjectReceivableConfig[]).map((p) => getProjectFinancialSummary(p.id))
    );

    // 构建项目成本数据列表（保持前端接口兼容）
    const today = new Date();
    const projectCostList: ProjectCostRow[] = ((projects || []) as ProjectReceivableConfig[]).map((project, idx) => {
      const s = summaries[idx];
      if (!s) return null;
      const effectiveStatus = getEffectiveStatus(project, today);
      const paymentRatio = getPaymentRatio(project, effectiveStatus);
      const invoiceAmount = toNumber(s.invoiceAmount);
      const clientPaidAmount = toNumber(s.clientPaidAmount);
      const ratioReceivableAmount = paymentRatio === null ? null : Math.max((invoiceAmount * paymentRatio) / 100, 0);
      const ratioUnreceivedAmount = ratioReceivableAmount === null ? null : Math.max(ratioReceivableAmount - clientPaidAmount, 0);
      const fullUnreceivedAmount = Math.max(invoiceAmount - clientPaidAmount, 0);
      const warrantyExpiredDate = getWarrantyExpiredDate(project);
      const receivableAgingDays =
        effectiveStatus === '质保期满' && warrantyExpiredDate
          ? Math.max(0, Math.floor((today.getTime() - warrantyExpiredDate.getTime()) / DAY_MS))
          : null;
      const risk = getReceivableRisk({
        paymentRatio,
        ratioUnreceivedAmount: ratioUnreceivedAmount || 0,
        fullUnreceivedAmount,
        agingDays: receivableAgingDays,
      });
      return {
        id: project.id,
        name: project.name,
        status: project.status || '未知',
        effectiveStatus,
        contractAmount: toNumber(project.contract_amount),
        totalIncome: s.taxableIncome,
        invoiceAmount,
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
        clientPaidAmount,
        supplierPaidAmount: s.supplierPaidAmount,
        workerPaidAmount: s.workerPaidAmount,
        receivableAmount: s.receivableAmount,
        paymentRatio,
        ratioReceivableAmount,
        ratioUnreceivedAmount,
        fullUnreceivedAmount,
        completionDate: project.completion_date || null,
        warrantyDays: project.warranty_days || null,
        warrantyExpiredDate: warrantyExpiredDate ? warrantyExpiredDate.toISOString().slice(0, 10) : null,
        receivableAgingDays,
        receivableRiskLabel: risk.label,
        receivableRiskLevel: risk.level,
        supplierPayableBaseAmount: s.supplierPayableBaseAmount,
        supplierPayableAmount: s.supplierPayableAmount,
        workerPayableAmount: s.workerPayableAmount,
        totalPayableAmount: s.totalPayableAmount,
        cashOutAmount: s.cashOutAmount,
        netCashFlow: s.netCashFlow,
        fundingGapAmount: s.fundingGapAmount,
        paymentRate: s.paymentRate,
        payablePaymentRate: s.payablePaymentRate,
        costIncomeRate: s.costIncomeRate,
      };
    }).filter((project): project is ProjectCostRow => Boolean(project));

    // ========== 3. 汇总计算（从统一中间层数据聚合） ==========
    const totals = projectCostList.reduce((acc, p) => {
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
      acc.totalClientPaid += p.clientPaidAmount;
      acc.totalSupplierPaid += p.supplierPaidAmount;
      acc.totalWorkerPaid += p.workerPaidAmount;
      acc.totalSupplierPayableBase += p.supplierPayableBaseAmount;
      acc.totalReceivable += p.receivableAmount;
      acc.totalSupplierPayable += p.supplierPayableAmount;
      acc.totalWorkerPayable += p.workerPayableAmount;
      acc.totalPayable += p.totalPayableAmount;
      acc.totalCashOut += p.cashOutAmount;
      acc.totalFundingGap += p.fundingGapAmount;
      acc.totalNetCashFlow += p.netCashFlow;
      acc.totalRatioReceivableAmount += p.ratioReceivableAmount || 0;
      acc.totalRatioUnreceivedAmount += p.ratioUnreceivedAmount || 0;
      acc.totalFullUnreceivedAmount += p.fullUnreceivedAmount || 0;
      return acc;
    }, {
      totalIncome: 0, totalInvoiceAmount: 0, totalUntaxedIncome: 0, totalVisaAmount: 0,
      totalCost: 0, totalSalary: 0, totalSettlement: 0, totalExpense: 0,
      totalTaxAmount: 0, totalMiscMaterial: 0, totalProfit: 0,
      totalClientPaid: 0, totalSupplierPaid: 0, totalWorkerPaid: 0,
      totalSupplierPayableBase: 0,
      totalReceivable: 0, totalSupplierPayable: 0, totalWorkerPayable: 0,
      totalPayable: 0, totalCashOut: 0, totalFundingGap: 0, totalNetCashFlow: 0,
      totalRatioReceivableAmount: 0, totalRatioUnreceivedAmount: 0, totalFullUnreceivedAmount: 0,
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

    projectCostList.forEach((project) => {
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

      if (project.fundingGapAmount > 0) {
        warnings.push({
          projectId: project.id,
          projectName: project.name,
          type: 'funding_gap',
          message: `璧勯噾缂哄彛 ${formatAmountSmart(toWanYuan(project.fundingGapAmount))}`,
          value: project.fundingGapAmount,
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
        totalClientPaid: totals.totalClientPaid,
        totalSupplierPaid: totals.totalSupplierPaid,
        totalWorkerPaid: totals.totalWorkerPaid,
        totalReceivable: totals.totalReceivable,
        totalSupplierPayable: totals.totalSupplierPayable,
        totalWorkerPayable: totals.totalWorkerPayable,
        totalPayable: totals.totalPayable,
        totalCashOut: totals.totalCashOut,
        totalNetCashFlow: totals.totalNetCashFlow,
        totalFundingGap: totals.totalFundingGap,
        totalRatioReceivableAmount: totals.totalRatioReceivableAmount,
        totalRatioUnreceivedAmount: totals.totalRatioUnreceivedAmount,
        totalFullUnreceivedAmount: totals.totalFullUnreceivedAmount,
        avgProfitRate: totals.totalIncome > 0 ? (totals.totalProfit / totals.totalIncome) * 100 : 0,
        avgLaborCostRate: totals.totalCost > 0 ? (totals.totalSalary / totals.totalCost) * 100 : 0,
        avgExpenseRate: totals.totalCost > 0 ? (totals.totalExpense / totals.totalCost) * 100 : 0,
        avgTaxRate: totals.totalCost > 0 ? (totals.totalTaxAmount / totals.totalCost) * 100 : 0,
        avgMiscMaterialRate: totals.totalCost > 0 ? (totals.totalMiscMaterial / totals.totalCost) * 100 : 0,
        avgPaymentRate: totals.totalIncome > 0 ? (totals.totalClientPaid / totals.totalIncome) * 100 : 0,
        avgPayablePaymentRate: (totals.totalSupplierPayableBase + totals.totalSalary) > 0
          ? ((totals.totalSupplierPaid + totals.totalWorkerPaid) / (totals.totalSupplierPayableBase + totals.totalSalary)) * 100
          : 0,
        avgCostIncomeRate: totals.totalIncome > 0 ? (totals.totalCost / totals.totalIncome) * 100 : 0,
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
  } catch (error: unknown) {
    console.error('成本利润中心API错误:', error);
    const message = error instanceof Error ? error.message : '查询失败';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
