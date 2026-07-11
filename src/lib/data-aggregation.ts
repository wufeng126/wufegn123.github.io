/**
 * 数据汇总中间层 — 全局唯一数据源
 *
 * 设计原则：
 * 1. 看板、月报、台账全部从此模块取数，禁止各自独立查询计算
 * 2. 所有金额使用 parseNumeric 处理，确保类型一致
 * 3. 日期统一使用 YYYY-MM-DD 完整日期，年月查询用 yearMonthToRange 转换
 * 4. 状态过滤统一：已作废记录排除（neq 'voided'），已签回签证才计入收入
 *
 * 使用方式：
 *   import { getProjectFinancialSummary, getGlobalSummary } from '@/lib/data-aggregation';
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { parseNumeric, round2, yearMonthToRange } from './format';

// ========== 类型定义 ==========

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

export interface ProjectFinancialSummary {
  projectId: number;
  projectName: string;
  contractAmount: number;
  // 收入
  invoiceAmount: number;      // 开票金额
  visaAmount: number;         // 签证金额
  taxableIncome: number;      // 含税收入 = 开票 + 签证
  untaxedIncome: number;     // 不含税收入
  taxAmount: number;          // 税费
  // 成本
  settlementAmount: number;   // 供应商结算（材料机械）
  salaryAmount: number;       // 工人工资（人工费）
  expenseAmount: number;      // 综合费用
  miscMaterialAmount: number; // 零星材料
  totalCost: number;          // 总成本
  // 利润
  profit: number;
  profitRate: number;
  // 占比
  laborCostRate: number;
  expenseRate: number;
  taxRate: number;
  miscMaterialRate: number;
  // 资金
  clientPaidAmount: number;   // 甲方已回款
  supplierPaidAmount: number; // 供应商已付款
  workerPaidAmount: number;   // 工人已发工资
  // 回款率
  paymentRate: number;
}

export interface GlobalSummary {
  // 项目
  totalProjects: number;
  activeProjects: number;
  // 工人
  totalWorkers: number;
  inServiceWorkers: number;
  leftWorkers: number;
  // 金额汇总
  totalInvoice: number;
  totalVisa: number;
  totalTaxableIncome: number;
  totalUntaxedIncome: number;
  totalTax: number;
  totalSettlement: number;
  totalSalary: number;
  totalExpense: number;
  totalMiscMaterial: number;
  totalCost: number;
  totalProfit: number;
  profitRate: number;
  // 资金
  totalClientPaid: number;
  totalSupplierPaid: number;
  totalWorkerPaid: number;
  // 待收/待付
  totalReceivable: number;   // 应收 = 含税收入 - 已回款
  totalSupplierPayable: number; // 供应商应付 = 结算 - 已付
  totalWorkerPayable: number;   // 工人应付 = 应发 - 已发
  // 回款率
  overallPaymentRate: number;
}

export interface ProjectListItem {
  id: number;
  name: string;
  year: number;
  status: string;
  address?: string;
  partner?: string;
  contract_amount?: number;
  expected_completion_date?: string;
  // 统计
  workerCount: number;
  inServiceCount: number;
  leftCount: number;
  totalInvoice: number;
  totalSettlement: number;
  totalSalary: number;
  totalProfit: number;
}

// ========== 内部工具 ==========

/** 构建日期过滤条件 */
function buildDateFilter(
  query: any,
  column: string,
  dateRange?: DateRange
): any {
  if (!dateRange) return query;
  if (dateRange.start) query = query.gte(column, dateRange.start);
  if (dateRange.end) query = query.lte(column, dateRange.end);
  return query;
}

/** 年月转日期范围（兼容 year_month 字段查询） */
function yearMonthFilter(yearMonth: string): { start: string; end: string } {
  return yearMonthToRange(yearMonth);
}

// ========== 单项目汇总 ==========

/**
 * 获取单个项目的财务汇总 — 全局唯一数据源
 * 所有看板/月报/台账的"项目金额"数据必须来自此函数
 *
 * @param projectId 项目ID
 * @param dateRange 可选日期范围（不传则查全部）
 */
export async function getProjectFinancialSummary(
  projectId: number,
  dateRange?: DateRange
): Promise<ProjectFinancialSummary | null> {
  const client = getSupabaseClient();

  // 获取项目基础信息
  const { data: project } = await client
    .from('projects')
    .select('id, name, contract_amount, tax_rate')
    .eq('id', projectId)
    .single();

  if (!project) return null;

  const projectTaxRate = parseNumeric(project.tax_rate || '9');

  // 1. 甲方报量 → 开票金额 & 税费（仅已审核，排除作废）
  let clientReportsQuery = client
    .from('client_reports')
    .select('invoice_amount, settlement_amount, report_amount, tax_rate, report_date')
    .eq('project_id', projectId)
    .neq('status', 'voided');

  if (dateRange) {
    clientReportsQuery = buildDateFilter(clientReportsQuery, 'report_date', dateRange);
  }

  const { data: clientReports } = await clientReportsQuery;

  let invoiceAmount = 0;
  let taxFromInvoice = 0;
  let untaxedIncome = 0;
  (clientReports || []).forEach((r: any) => {
    const inv = parseNumeric(r.invoice_amount) || parseNumeric(r.settlement_amount) || parseNumeric(r.report_amount);
    const tr = parseNumeric(r.tax_rate) || projectTaxRate;
    invoiceAmount += inv;
    const untaxed = inv / (1 + tr / 100);
    taxFromInvoice += inv - untaxed;
    untaxedIncome += untaxed;
  });

  // 2. 签证（仅已签回）
  let visasQuery = client
    .from('visas')
    .select('visa_amount, created_at')
    .eq('project_id', projectId)
    .eq('status', '已签回');

  if (dateRange) {
    visasQuery = buildDateFilter(visasQuery, 'created_at', dateRange);
  }

  const { data: visas } = await visasQuery;
  const visaAmount = (visas || []).reduce((sum: number, v: any) => sum + parseNumeric(v.visa_amount), 0);

  // 3. 供应商结算（仅已审核，排除作废）
  const { data: contracts } = await client
    .from('supplier_contracts')
    .select('id')
    .eq('project_id', projectId);

  const contractIds = (contracts || []).map((c: any) => c.id);

  let settlementAmount = 0;
  if (contractIds.length > 0) {
    const { data: settlements } = await client
      .from('supplier_settlements')
      .select('settlement_amount, settlement_date')
      .in('contract_id', contractIds)
      .neq('status', 'voided');

    settlementAmount = (settlements || []).reduce((sum: number, s: any) => sum + parseNumeric(s.settlement_amount), 0);
  }

  // 4. 工人工资（应发工资总额）
  let salariesQuery = client
    .from('worker_salaries')
    .select('gross_pay, year_month')
    .eq('project_id', projectId);

  if (dateRange) {
    // year_month 是 YYYY-MM 格式，转换为范围查询
    salariesQuery = salariesQuery
      .gte('year_month', dateRange.start.substring(0, 7))
      .lte('year_month', dateRange.end.substring(0, 7));
  }

  const { data: salaries } = await salariesQuery;
  const salaryAmount = (salaries || []).reduce((sum: number, s: any) => sum + parseNumeric(s.gross_pay), 0);

  // 5. 综合费用（仅已审核）
  let expensesQuery = client
    .from('comprehensive_expenses')
    .select('amount, occurrence_date')
    .eq('project_id', projectId)
    .neq('status', 'voided');

  if (dateRange) {
    expensesQuery = buildDateFilter(expensesQuery, 'occurrence_date', dateRange);
  }

  const { data: expenses } = await expensesQuery;
  const expenseAmount = (expenses || []).reduce((sum: number, e: any) => sum + parseNumeric(e.amount), 0);

  // 6. 零星材料（仅已审核）
  let miscMaterialsQuery = client
    .from('miscellaneous_materials')
    .select('amount, purchase_date')
    .eq('project_id', projectId)
    .neq('status', 'voided');

  if (dateRange) {
    miscMaterialsQuery = buildDateFilter(miscMaterialsQuery, 'purchase_date', dateRange);
  }

  const { data: miscMaterials } = await miscMaterialsQuery;
  const miscMaterialAmount = (miscMaterials || []).reduce((sum: number, m: any) => sum + parseNumeric(m.amount), 0);

  // 7. 甲方已回款
  let clientPaymentsQuery = client
    .from('client_payments')
    .select('payment_amount, payment_date')
    .eq('project_id', projectId);

  if (dateRange) {
    clientPaymentsQuery = buildDateFilter(clientPaymentsQuery, 'payment_date', dateRange);
  }

  const { data: clientPayments } = await clientPaymentsQuery;
  const clientPaidAmount = (clientPayments || []).reduce((sum: number, p: any) => sum + parseNumeric(p.payment_amount), 0);

  // 8. 供应商已付款
  let supplierPaidAmount = 0;
  if (contractIds.length > 0) {
    const { data: supplierPayments } = await client
      .from('supplier_payments')
      .select('payment_amount, payment_date')
      .in('contract_id', contractIds);

    supplierPaidAmount = (supplierPayments || []).reduce((sum: number, p: any) => sum + parseNumeric(p.payment_amount), 0);
  }

  // 9. 工人已发工资
  const { data: salaryPayments } = await client
    .from('salary_payments')
    .select('payment_amount')
    .eq('project_id', projectId);
  const workerPaidAmount = (salaryPayments || []).reduce((sum: number, p: any) => sum + parseNumeric(p.payment_amount), 0);

  // ========== 汇总计算 ==========
  const taxableIncome = invoiceAmount + visaAmount;
  const totalCost = settlementAmount + salaryAmount + expenseAmount + taxFromInvoice + miscMaterialAmount;
  const profit = taxableIncome - totalCost;
  const profitRate = taxableIncome > 0 ? (profit / taxableIncome) * 100 : 0;
  const paymentRate = taxableIncome > 0 ? (clientPaidAmount / taxableIncome) * 100 : 0;

  return {
    projectId,
    projectName: project.name,
    contractAmount: parseNumeric(project.contract_amount),
    invoiceAmount: round2(invoiceAmount),
    visaAmount: round2(visaAmount),
    taxableIncome: round2(taxableIncome),
    untaxedIncome: round2(untaxedIncome),
    taxAmount: round2(taxFromInvoice),
    settlementAmount: round2(settlementAmount),
    salaryAmount: round2(salaryAmount),
    expenseAmount: round2(expenseAmount),
    miscMaterialAmount: round2(miscMaterialAmount),
    totalCost: round2(totalCost),
    profit: round2(profit),
    profitRate: round2(profitRate),
    laborCostRate: totalCost > 0 ? round2((salaryAmount / totalCost) * 100) : 0,
    expenseRate: totalCost > 0 ? round2((expenseAmount / totalCost) * 100) : 0,
    taxRate: totalCost > 0 ? round2((taxFromInvoice / totalCost) * 100) : 0,
    miscMaterialRate: totalCost > 0 ? round2((miscMaterialAmount / totalCost) * 100) : 0,
    clientPaidAmount: round2(clientPaidAmount),
    supplierPaidAmount: round2(supplierPaidAmount),
    workerPaidAmount: round2(workerPaidAmount),
    paymentRate: round2(paymentRate),
  };
}

// ========== 全局汇总 ==========

/**
 * 获取全局财务汇总 — 看板首页、资金管理看板的数据源
 * @param dateRange 可选日期范围
 * @param projectIds 可选项目ID列表（权限过滤）
 */
export async function getGlobalSummary(
  dateRange?: DateRange,
  projectIds?: number[]
): Promise<GlobalSummary> {
  const client = getSupabaseClient();

  // 获取项目列表
  let projectsQuery = client.from('projects').select('id, name, status');
  if (projectIds && projectIds.length > 0) {
    projectsQuery = projectsQuery.in('id', projectIds);
  }
  const { data: projects } = await projectsQuery;

  const totalProjects = projects?.length || 0;
  const activeProjects = projects?.filter(p => p.status === '进行中').length || 0;
  const allProjectIds = (projects || []).map(p => p.id);

  // 工人统计
  let workersQuery = client.from('workers').select('id, status, project_id');
  if (projectIds && projectIds.length > 0) {
    workersQuery = workersQuery.in('project_id', projectIds);
  }
  const { data: workersData } = await workersQuery;

  const totalWorkers = workersData?.length || 0;
  const inServiceWorkers = workersData?.filter(w => w.status !== 'left').length || 0;
  const leftWorkers = workersData?.filter(w => w.status === 'left').length || 0;

  // 逐项目汇总（使用统一函数）
  let totals = {
    totalInvoice: 0, totalVisa: 0, totalTaxableIncome: 0, totalUntaxedIncome: 0,
    totalTax: 0, totalSettlement: 0, totalSalary: 0, totalExpense: 0,
    totalMiscMaterial: 0, totalCost: 0, totalProfit: 0,
    totalClientPaid: 0, totalSupplierPaid: 0, totalWorkerPaid: 0,
  };

  for (const pid of allProjectIds) {
    const summary = await getProjectFinancialSummary(pid, dateRange);
    if (!summary) continue;
    totals.totalInvoice += summary.invoiceAmount;
    totals.totalVisa += summary.visaAmount;
    totals.totalTaxableIncome += summary.taxableIncome;
    totals.totalUntaxedIncome += summary.untaxedIncome;
    totals.totalTax += summary.taxAmount;
    totals.totalSettlement += summary.settlementAmount;
    totals.totalSalary += summary.salaryAmount;
    totals.totalExpense += summary.expenseAmount;
    totals.totalMiscMaterial += summary.miscMaterialAmount;
    totals.totalCost += summary.totalCost;
    totals.totalProfit += summary.profit;
    totals.totalClientPaid += summary.clientPaidAmount;
    totals.totalSupplierPaid += summary.supplierPaidAmount;
    totals.totalWorkerPaid += summary.workerPaidAmount;
  }

  const profitRate = totals.totalTaxableIncome > 0
    ? (totals.totalProfit / totals.totalTaxableIncome) * 100
    : 0;
  const overallPaymentRate = totals.totalTaxableIncome > 0
    ? (totals.totalClientPaid / totals.totalTaxableIncome) * 100
    : 0;

  return {
    totalProjects,
    activeProjects,
    totalWorkers,
    inServiceWorkers,
    leftWorkers,
    ...Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, round2(v as number)])
    ),
    totalReceivable: round2(totals.totalTaxableIncome - totals.totalClientPaid),
    totalSupplierPayable: round2(totals.totalSettlement - totals.totalSupplierPaid),
    totalWorkerPayable: round2(totals.totalSalary - totals.totalWorkerPaid),
    profitRate: round2(profitRate),
    overallPaymentRate: round2(overallPaymentRate),
  } as GlobalSummary;
}

// ========== 项目列表汇总 ==========

/**
 * 获取项目列表（含轻量统计）— 项目管理页面的数据源
 * @param projectIds 可选项目ID过滤（权限）
 */
export async function getProjectListSummary(
  projectIds?: number[]
): Promise<ProjectListItem[]> {
  const client = getSupabaseClient();

  let projectsQuery = client
    .from('projects')
    .select('id, name, year, status, address, partner, contract_amount, expected_completion_date, created_at')
    .order('created_at', { ascending: false });

  if (projectIds && projectIds.length > 0) {
    projectsQuery = projectsQuery.in('id', projectIds);
  }

  const { data: projects } = await projectsQuery;
  if (!projects || projects.length === 0) return [];

  // 批量查询工人统计
  const { data: workers } = await client
    .from('workers')
    .select('id, status, project_id');

  const workerMap = new Map<number, { total: number; inService: number; left: number }>();
  (workers || []).forEach(w => {
    const pid = w.project_id;
    if (!pid) return;
    if (!workerMap.has(pid)) {
      workerMap.set(pid, { total: 0, inService: 0, left: 0 });
    }
    const entry = workerMap.get(pid)!;
    entry.total++;
    if (w.status === 'left') entry.left++;
    else entry.inService++;
  });

  // 逐项目获取财务汇总（无日期范围 = 全部）
  const results: ProjectListItem[] = [];
  for (const p of projects) {
    const summary = await getProjectFinancialSummary(p.id);
    results.push({
      id: p.id,
      name: p.name,
      year: p.year,
      status: p.status,
      address: p.address,
      partner: p.partner,
      contract_amount: parseNumeric(p.contract_amount),
      expected_completion_date: p.expected_completion_date,
      workerCount: workerMap.get(p.id)?.total || 0,
      inServiceCount: workerMap.get(p.id)?.inService || 0,
      leftCount: workerMap.get(p.id)?.left || 0,
      totalInvoice: summary?.invoiceAmount || 0,
      totalSettlement: summary?.settlementAmount || 0,
      totalSalary: summary?.salaryAmount || 0,
      totalProfit: summary?.profit || 0,
    });
  }

  return results;
}

// ========== 月度趋势 ==========

export interface MonthlyTrendItem {
  yearMonth: string;
  invoiceAmount: number;
  clientPaidAmount: number;
  settlementAmount: number;
  salaryAmount: number;
  profit: number;
}

/**
 * 获取月度趋势数据 — 看板首页折线图、月报趋势图的数据源
 * @param months 最近 N 个月（默认6）
 * @param projectId 可选项目过滤
 */
export async function getMonthlyTrend(
  months = 6,
  projectId?: number
): Promise<MonthlyTrendItem[]> {
  const client = getSupabaseClient();

  const now = new Date();
  const result: MonthlyTrendItem[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const { start, end } = yearMonthToRange(yearMonth);

    const dateRange: DateRange = { start, end };

    // 如果指定了项目，用单项目查询
    if (projectId) {
      const summary = await getProjectFinancialSummary(projectId, dateRange);
      result.push({
        yearMonth,
        invoiceAmount: summary?.invoiceAmount || 0,
        clientPaidAmount: summary?.clientPaidAmount || 0,
        settlementAmount: summary?.settlementAmount || 0,
        salaryAmount: summary?.salaryAmount || 0,
        profit: summary?.profit || 0,
      });
    } else {
      // 全局查询
      const summary = await getGlobalSummary(dateRange);
      result.push({
        yearMonth,
        invoiceAmount: summary.totalInvoice,
        clientPaidAmount: summary.totalClientPaid,
        settlementAmount: summary.totalSettlement,
        salaryAmount: summary.totalSalary,
        profit: summary.totalProfit,
      });
    }
  }

  return result;
}
