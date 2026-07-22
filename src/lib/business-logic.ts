/**
 * 业务逻辑工具库
 * 集中管理各业务链路的金额计算、状态流转和余额校验
 */
import { getSupabaseClient } from '@/storage/database/supabase-client';

// ========== 通用工具 ==========

export const VISA_DONE_STATUSES = ['已完成', '已结算', '已完结', '已签回', 'approved'] as const;
export const VISA_ACTIVE_STATUSES = ['已提交', '已签字', '待预算员确认', '待办理'] as const;

export function isVisaDoneStatus(status?: string | null) {
  return VISA_DONE_STATUSES.includes(status as (typeof VISA_DONE_STATUSES)[number]);
}

export function isVisaActiveStatus(status?: string | null) {
  return VISA_ACTIVE_STATUSES.includes(status as (typeof VISA_ACTIVE_STATUSES)[number]);
}

/** 安全解析 numeric 类型 */
export function parseNumeric(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && '$numberDecimal' in value) {
    return parseFloat(value.$numberDecimal) || 0;
  }
  if (typeof value === 'object') {
    try {
      const str = String(value);
      const num = parseFloat(str);
      if (!isNaN(num)) return num;
      const match = str.match(/-?\d+\.?\d*/);
      if (match) return parseFloat(match[0]) || 0;
    } catch (e) {}
  }
  return 0;
}

/** 计算税务信息（不含税收入 + 税额） */
export function calculateTaxInfo(invoiceAmount: number, taxRate: number) {
  if (!invoiceAmount || invoiceAmount <= 0 || !taxRate || taxRate < 0) {
    return { untaxedIncome: 0, taxAmount: 0 };
  }
  const untaxedIncome = invoiceAmount / (1 + taxRate / 100);
  const taxAmount = invoiceAmount - untaxedIncome;
  return {
    untaxedIncome: Math.round(untaxedIncome * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
  };
}

// ========== 人工成本链路 ==========

/**
 * 自动计算工资
 * 应发工资 = 工时 × 工价 + 包活工资
 * 实发工资 = 应发工资 - 个税 - 借支 - 劳保 - 罚款
 */
export function calculateSalary(params: {
  work_hours: number;
  hourly_rate: number;
  contract_work_pay: number;
  income_tax: number;
  advance_pay: number;
  labor_insurance: number;
  fine: number;
  gross_pay?: number;
  net_pay?: number;
}) {
  const grossPay = params.gross_pay != null
    ? params.gross_pay
    : params.work_hours * params.hourly_rate + params.contract_work_pay;
  const netPay = params.net_pay != null
    ? params.net_pay
    : grossPay - params.income_tax - params.advance_pay - params.labor_insurance - params.fine;
  return {
    grossPay: Math.round(grossPay * 100) / 100,
    netPay: Math.round(netPay * 100) / 100,
  };
}

/**
 * 同步工资发放状态
 * 根据 salary_payments 汇总已付金额，更新 worker_salaries.payment_status
 */
export type SalaryPaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid';
export const SALARY_PAYMENT_TOLERANCE = 1;

export function calculateSalaryPaymentStatus(netPay: number, paidAmount: number): SalaryPaymentStatus {
  if (paidAmount <= 0) return 'unpaid';
  const difference = Math.round((paidAmount - netPay) * 100) / 100;
  if (Math.abs(difference) <= SALARY_PAYMENT_TOLERANCE) return 'paid';
  if (difference > SALARY_PAYMENT_TOLERANCE) return 'overpaid';
  return 'partial';
}

export function calculateSalaryUnpaidAmount(netPay: number, paidAmount: number): number {
  const difference = Math.round((paidAmount - netPay) * 100) / 100;
  return Math.abs(difference) <= SALARY_PAYMENT_TOLERANCE
    ? 0
    : Math.max(0, netPay - paidAmount);
}

export async function syncSalaryPaymentStatus(salaryId: number): Promise<SalaryPaymentStatus> {
  const client = getSupabaseClient();

  // 获取工资记录
  const { data: salary } = await client
    .from('worker_salaries')
    .select('id, worker_id, project_id, year_month, net_pay')
    .eq('id', salaryId)
    .single();

  if (!salary) return 'unpaid';

  const netPay = parseNumeric(salary.net_pay);

  // 获取该工资的已付金额
  const { data: payments } = await client
    .from('salary_payments')
    .select('payment_amount')
    .eq('salary_id', salaryId);

  let totalPaid = (payments || []).reduce((sum: number, p: any) => sum + parseNumeric(p.payment_amount), 0);

  if (salary.worker_id && salary.project_id && salary.year_month) {
    const { data: unlinkedPayments } = await client
      .from('salary_payments')
      .select('payment_amount')
      .is('salary_id', null)
      .eq('worker_id', salary.worker_id)
      .eq('project_id', salary.project_id)
      .eq('year_month', salary.year_month);

    totalPaid += (unlinkedPayments || []).reduce(
      (sum: number, p: any) => sum + parseNumeric(p.payment_amount),
      0
    );
  }

  const newStatus = calculateSalaryPaymentStatus(netPay, totalPaid);

  // 更新状态
  await client
    .from('worker_salaries')
    .update({ payment_status: newStatus })
    .eq('id', salaryId);

  return newStatus;
}

/**
 * 批量同步工资发放状态
 */
export async function syncAllSalaryPaymentStatus(): Promise<void> {
  const client = getSupabaseClient();

  // 获取所有工资记录
  const { data: salaries } = await client
    .from('worker_salaries')
    .select('id, worker_id, project_id, year_month, net_pay');

  if (!salaries || salaries.length === 0) return;

  // 获取所有发放记录
  const { data: payments } = await client
    .from('salary_payments')
    .select('salary_id, worker_id, project_id, year_month, payment_amount');

  // 按 salary_id 汇总已付金额
  const paidMap = new Map<number, number>();
  const unlinkedPaidMap = new Map<string, number>();
  (payments || []).forEach((p: any) => {
    const amount = parseNumeric(p.payment_amount);
    if (p.salary_id) {
      const current = paidMap.get(p.salary_id) || 0;
      paidMap.set(p.salary_id, current + amount);
      return;
    }

    if (p.worker_id && p.project_id && p.year_month) {
      const key = salaryPaymentMatchKey(p);
      unlinkedPaidMap.set(key, (unlinkedPaidMap.get(key) || 0) + amount);
    }
  });

  // 逐条更新
  for (const salary of salaries) {
    const netPay = parseNumeric(salary.net_pay);
    const totalPaid = (paidMap.get(salary.id) || 0) + (unlinkedPaidMap.get(salaryPaymentMatchKey(salary)) || 0);

    const newStatus = calculateSalaryPaymentStatus(netPay, totalPaid);

    await client
      .from('worker_salaries')
      .update({ payment_status: newStatus })
      .eq('id', salary.id);
  }
}

// ========== 供应商成本链路 ==========

/**
 * 计算结算单应付金额
 * 应付金额 = 结算金额 × 合同付款比例（根据结算类型选择不同比例）
 */
export function calculatePayableAmount(
  settlementAmount: number,
  settlementType: string,
  contract: {
    payment_ratio_active?: number;
    payment_ratio_complete?: number;
    payment_ratio_final?: number;
  }
): number {
  let ratio: number;
  switch (settlementType) {
    case 'progress':
      ratio = contract.payment_ratio_active ?? 80;
      break;
    case 'milestone':
      ratio = contract.payment_ratio_complete ?? 95;
      break;
    case 'final':
      ratio = contract.payment_ratio_final ?? 100;
      break;
    default:
      ratio = contract.payment_ratio_active ?? 80;
  }
  return Math.round(settlementAmount * ratio / 100 * 100) / 100;
}

/**
 * 获取合同下的已付总额
 */
export async function getContractPaidAmount(contractId: number): Promise<number> {
  const client = getSupabaseClient();
  const { data: payments } = await client
    .from('supplier_payments')
    .select('payment_amount')
    .eq('contract_id', contractId);

  return (payments || []).reduce((sum: number, p: any) => sum + parseNumeric(p.payment_amount), 0);
}

/**
 * 获取合同下的结算总额（履约应付 + 决算应付）
 */
export async function getContractSettlementSummary(contractId: number) {
  const client = getSupabaseClient();

  const { data: settlements } = await client
    .from('supplier_settlements')
    .select('settlement_amount, payable_amount, status')
    .eq('contract_id', contractId);

  const activeSettlements = (settlements || []).filter((s: any) => !isVoidedStatus(s.status));
  const totalSettlement = activeSettlements.reduce((sum: number, s: any) => sum + parseNumeric(s.settlement_amount), 0);
  const totalPayable = activeSettlements.reduce((sum: number, s: any) => sum + parseNumeric(s.payable_amount), 0);

  return {
    totalSettlement,  // 决算应付 = 累计结算金额
    totalPayable,     // 履约应付 = 各期应付之和
  };
}

/**
 * 校验供应商付款是否超过未付余额
 * @returns { valid: boolean, unpaidBalance: number, message: string }
 */
export async function validateSupplierPayment(params: {
  contract_id: number;
  payment_amount: number;
  exclude_payment_id?: number; // 编辑场景排除自身
}): Promise<{ valid: boolean; unpaidBalance: number; message: string }> {
  const client = getSupabaseClient();

  // 获取合同
  const { data: contract } = await client
    .from('supplier_contracts')
    .select('id, contract_name, payment_ratio_active, payment_ratio_complete, payment_ratio_final')
    .eq('id', params.contract_id)
    .single();

  if (!contract) {
    return { valid: false, unpaidBalance: 0, message: '合同不存在' };
  }

  // 获取已付金额
  let paidQuery = client
    .from('supplier_payments')
    .select('id, payment_amount')
    .eq('contract_id', params.contract_id);

  const { data: existingPayments } = await paidQuery;

  let totalPaid = (existingPayments || []).reduce((sum: number, p: any) => {
    if (params.exclude_payment_id && p.id === params.exclude_payment_id) return sum;
    return sum + parseNumeric(p.payment_amount);
  }, 0);

  // 获取应付金额（履约应付 = 各期结算金额 × 付款比例之和）
  const { totalPayable } = await getContractSettlementSummary(params.contract_id);

  const unpaidBalance = totalPayable - totalPaid;

  if (params.payment_amount > unpaidBalance) {
    return {
      valid: false,
      unpaidBalance,
      message: `付款金额超过未付余额。履约应付: ¥${totalPayable.toLocaleString()}, 已付: ¥${totalPaid.toLocaleString()}, 未付: ¥${unpaidBalance.toLocaleString()}`,
    };
  }

  return { valid: true, unpaidBalance, message: '' };
}

// ========== 甲方资金链路 ==========

/**
 * 获取项目的报量总额（已审核）
 */
/**
 * 校验供应商付款是否超过单张结算单的应付余额
 */
export async function validateSupplierSettlementPayment(params: {
  settlement_id: number;
  payment_amount: number;
  exclude_payment_id?: number;
}): Promise<{ valid: boolean; unpaidBalance: number; message: string }> {
  const client = getSupabaseClient();

  const { data: settlement } = await client
    .from('supplier_settlements')
    .select('id, payable_amount, status')
    .eq('id', params.settlement_id)
    .single();

  if (!settlement) {
    return { valid: false, unpaidBalance: 0, message: '结算单不存在' };
  }

  if (isVoidedStatus(settlement.status)) {
    return { valid: false, unpaidBalance: 0, message: '结算单已作废，不能付款' };
  }

  let paymentQuery = client
    .from('supplier_payments')
    .select('id, payment_amount')
    .eq('settlement_id', params.settlement_id);

  if (params.exclude_payment_id) {
    paymentQuery = paymentQuery.neq('id', params.exclude_payment_id);
  }

  const { data: payments } = await paymentQuery;
  const totalPaid = (payments || []).reduce(
    (sum: number, p: any) => sum + parseNumeric(p.payment_amount),
    0
  );
  const payableAmount = parseNumeric(settlement.payable_amount);
  const unpaidBalance = payableAmount - totalPaid;

  if (params.payment_amount > unpaidBalance) {
    return {
      valid: false,
      unpaidBalance,
      message: `付款金额超过结算单未付余额。应付: ¥${payableAmount.toLocaleString()}, 已付: ¥${totalPaid.toLocaleString()}, 未付: ¥${unpaidBalance.toLocaleString()}`,
    };
  }

  return { valid: true, unpaidBalance, message: '' };
}

export async function getProjectReportedAmount(projectId: number): Promise<{
  totalSettlement: number;  // 结算金额
  totalInvoice: number;     // 开票金额
}> {
  const client = getSupabaseClient();
  const { data: reports } = await client
    .from('client_reports')
    .select('settlement_amount, invoice_amount, status')
    .eq('project_id', projectId);

  const activeReports = (reports || []).filter((r: any) => !isVoidedStatus(r.status));

  return {
    totalSettlement: activeReports.reduce((sum: number, r: any) => sum + parseNumeric(r.settlement_amount), 0),
    totalInvoice: activeReports.reduce((sum: number, r: any) => sum + parseNumeric(r.invoice_amount), 0),
  };
}

function salaryPaymentMatchKey(record: {
  worker_id?: number | null;
  project_id?: number | null;
  year_month?: string | null;
}) {
  return `${Number(record.worker_id || 0)}:${Number(record.project_id || 0)}:${record.year_month || ''}`;
}

/**
 * 获取项目的已回款总额
 */
export async function getProjectPaidAmount(
  projectId: number,
  excludePaymentId?: number
): Promise<number> {
  const client = getSupabaseClient();

  let query = client
    .from('client_payments')
    .select('id, payment_amount, status')
    .eq('project_id', projectId)
    .neq('status', 'voided');

  if (excludePaymentId) {
    query = query.neq('id', excludePaymentId);
  }

  const { data: payments } = await query;

  return (payments || [])
    .filter((p: any) => isEffectiveClientPaymentStatus(p.status))
    .reduce((sum: number, p: any) => sum + parseNumeric(p.payment_amount), 0);
}

/**
 * 校验甲方付款是否超过未回款余额
 * @returns { valid: boolean, unpaidBalance: number, message: string }
 */
export async function validateClientPayment(params: {
  project_id: number;
  payment_amount: number;
  exclude_payment_id?: number;
}): Promise<{ valid: boolean; unpaidBalance: number; message: string }> {
  const { totalSettlement } = await getProjectReportedAmount(params.project_id);
  const totalPaid = await getProjectPaidAmount(params.project_id, params.exclude_payment_id);
  const unpaidBalance = totalSettlement - totalPaid;

  if (params.payment_amount > unpaidBalance && totalSettlement > 0) {
    return {
      valid: false,
      unpaidBalance,
      message: `付款金额超过未回款余额。结算金额: ¥${totalSettlement.toLocaleString()}, 已回款: ¥${totalPaid.toLocaleString()}, 未回款: ¥${unpaidBalance.toLocaleString()}`,
    };
  }

  return { valid: true, unpaidBalance, message: '' };
}

// ========== 状态流转 ==========

export type ReviewStatus = 'draft' | 'reviewed' | 'voided';

export const REVIEW_STATUS = {
  DRAFT: 'draft',
  REVIEWED: 'reviewed',
  VOIDED: 'voided',
} as const;

export function normalizeReviewStatus(status?: string | null): ReviewStatus {
  if (status === REVIEW_STATUS.REVIEWED || status === REVIEW_STATUS.VOIDED) {
    return status;
  }
  return REVIEW_STATUS.DRAFT;
}

export function isAllowedReviewStatus(status?: string | null): status is ReviewStatus {
  return (
    status === REVIEW_STATUS.DRAFT ||
    status === REVIEW_STATUS.REVIEWED ||
    status === REVIEW_STATUS.VOIDED
  );
}

export function isReviewedStatus(status?: string | null): boolean {
  return normalizeReviewStatus(status) === REVIEW_STATUS.REVIEWED;
}

export function isVoidedStatus(status?: string | null): boolean {
  return normalizeReviewStatus(status) === REVIEW_STATUS.VOIDED;
}

export function isEffectiveClientPaymentStatus(status?: string | null): boolean {
  return status === 'completed' || isReviewedStatus(status);
}

export function isPendingClientPaymentStatus(status?: string | null): boolean {
  return status === 'pending' || status === REVIEW_STATUS.DRAFT;
}

export function isInactiveClientPaymentStatus(status?: string | null): boolean {
  return status === 'cancelled' || isVoidedStatus(status);
}

export function isEffectiveSupplierPaymentStatus(status?: string | null): boolean {
  return !status || status === 'completed' || isReviewedStatus(status);
}

export function isInactiveSupplierPaymentStatus(status?: string | null): boolean {
  return status === 'cancelled' || isVoidedStatus(status);
}

/**
 * 校验状态流转是否合法
 * draft → reviewed ✓（审核）
 * reviewed → draft ✓（反审核/撤销审核）
 * draft → voided ✓（作废）
 * reviewed → voided ✓（作废已审核记录）
 * voided → any ✗（已作废不可变更）
 */
export function validateStatusTransition(
  currentStatus: string,
  targetStatus: string
): { valid: boolean; message: string } {
  if (!isAllowedReviewStatus(targetStatus)) {
    return { valid: false, message: '目标状态不合法' };
  }

  const current = normalizeReviewStatus(currentStatus);
  const target = normalizeReviewStatus(targetStatus);

  if (current === REVIEW_STATUS.VOIDED) {
    return { valid: false, message: '已作废的记录不可变更' };
  }
  if (current === target) {
    return { valid: false, message: '状态未变更' };
  }
  return { valid: validTransitions(current, target), message: '' };
}

function validTransitions(from: string, to: string): boolean {
  const allowed: Record<string, string[]> = {
    draft: ['reviewed', 'voided'],
    reviewed: ['draft', 'voided'],
  };
  return (allowed[from] || []).includes(to);
}

// ========== 成本利润计算 ==========

export interface ProjectCostCalculation {
  projectId: number;
  projectName: string;
  contractAmount: number;
  // 收入
  invoiceAmount: number;       // 开票金额
  visaAmount: number;          // 签证金额
  taxableIncome: number;       // 含税收入 = 开票 + 签证
  untaxedIncome: number;       // 不含税收入
  taxAmount: number;           // 税费
  // 成本
  settlementAmount: number;    // 供应商结算（材料机械）
  salaryAmount: number;        // 工人工资（人工费）
  expenseAmount: number;       // 综合费用
  miscMaterialAmount: number;  // 零星材料
  totalCost: number;           // 总成本 = 材料机械 + 人工费 + 综合费用 + 税费 + 零星材料
  // 利润
  profit: number;
  profitRate: number;
  // 占比
  laborCostRate: number;
  expenseRate: number;
  taxRate: number;
  miscMaterialRate: number;
  // 资金
  clientPaidAmount: number;    // 甲方已回款
  supplierPaidAmount: number;  // 供应商已付款
  workerPaidAmount: number;    // 工人已发工资
}

/**
 * 计算单个项目的成本利润数据
 * 所有金额从源数据自动汇总，不手工录入核心金额
 */
export async function calculateProjectCost(projectId: number): Promise<ProjectCostCalculation | null> {
  const client = getSupabaseClient();

  // 获取项目
  const { data: project } = await client
    .from('projects')
    .select('id, name, contract_amount, tax_rate')
    .eq('id', projectId)
    .single();

  if (!project) return null;

  const projectTaxRate = parseNumeric(project.tax_rate || '9');

  // 1. 甲方报量 → 开票金额 & 税费（仅已审核）
  const { data: clientReports } = await client
    .from('client_reports')
    .select('invoice_amount, tax_rate')
    .eq('project_id', projectId)
    .neq('status', 'voided');

  let invoiceAmount = 0;
  let taxFromInvoice = 0;
  let untaxedIncome = 0;
  (clientReports || []).forEach((r: any) => {
    const inv = parseNumeric(r.invoice_amount);
    const tr = parseNumeric(r.tax_rate) || projectTaxRate;
    invoiceAmount += inv;
    const taxInfo = calculateTaxInfo(inv, tr);
    taxFromInvoice += taxInfo.taxAmount;
    untaxedIncome += taxInfo.untaxedIncome;
  });

  // 2. 签证（仅已完成的）
  const { data: visas } = await client
    .from('visas')
    .select('visa_amount')
    .eq('project_id', projectId)
    .in('status', [...VISA_DONE_STATUSES]);

  const visaAmount = (visas || []).reduce((sum: number, v: any) => sum + parseNumeric(v.visa_amount), 0);

  // 3. 供应商结算（仅已审核）
  const { data: contracts } = await client
    .from('supplier_contracts')
    .select('id')
    .eq('project_id', projectId);

  const contractIds = (contracts || []).map((c: any) => c.id);

  let settlementAmount = 0;
  if (contractIds.length > 0) {
    const { data: settlements } = await client
      .from('supplier_settlements')
      .select('settlement_amount, status')
      .in('contract_id', contractIds);

    settlementAmount = (settlements || [])
      .filter((s: any) => !isVoidedStatus(s.status))
      .reduce((sum: number, s: any) => sum + parseNumeric(s.settlement_amount), 0);
  }

  // 4. 工人工资（应发工资总额）
  const { data: salaries } = await client
    .from('worker_salaries')
    .select('gross_pay')
    .eq('project_id', projectId);

  const workerSalaryAmount = (salaries || []).reduce((sum: number, s: any) => sum + parseNumeric(s.gross_pay), 0);
  let teamSettlementAmount = 0;
  try {
    const { data: teamSettlements, error: teamSettlementError } = await client
      .from('team_settlements')
      .select('id,status')
      .eq('project_id', projectId);
    if (teamSettlementError) throw teamSettlementError;

    const settlementIds = (teamSettlements || [])
      .filter((settlement: any) => !isVoidedStatus(settlement.status))
      .map((settlement: any) => Number(settlement.id))
      .filter(Boolean);

    if (settlementIds.length > 0) {
      const { data: teamItems, error: teamItemsError } = await client
        .from('team_settlement_items')
        .select('amount')
        .in('settlement_id', settlementIds);
      if (teamItemsError) throw teamItemsError;
      teamSettlementAmount = (teamItems || []).reduce((sum: number, item: any) => sum + parseNumeric(item.amount), 0);
    }
  } catch (error: any) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('team_settlements') && !message.includes('team_settlement_items') && !message.includes('schema cache')) {
      throw error;
    }
  }
  const salaryAmount = workerSalaryAmount + teamSettlementAmount;

  // 5. 综合费用（仅已审核）
  const { data: expenses } = await client
    .from('comprehensive_expenses')
    .select('amount')
    .eq('project_id', projectId)
    .neq('status', 'voided');

  const expenseAmount = (expenses || []).reduce((sum: number, e: any) => sum + parseNumeric(e.amount), 0);

  // 6. 零星材料（仅已审核）
  const { data: miscMaterials } = await client
    .from('miscellaneous_materials')
    .select('amount')
    .eq('project_id', projectId)
    .neq('status', 'voided');

  const miscMaterialAmount = (miscMaterials || []).reduce((sum: number, m: any) => sum + parseNumeric(m.amount), 0);

  // 汇总计算
  const taxableIncome = invoiceAmount + visaAmount;
  const totalCost = settlementAmount + salaryAmount + expenseAmount + taxFromInvoice + miscMaterialAmount;
  const profit = taxableIncome - totalCost;
  const profitRate = taxableIncome > 0 ? (profit / taxableIncome) * 100 : 0;

  // 资金
  const clientPaidAmount = await getProjectPaidAmount(projectId);
  
  let supplierPaidAmount = 0;
  if (contractIds.length > 0) {
    const { data: supplierPayments } = await client
      .from('supplier_payments')
      .select('payment_amount')
      .in('contract_id', contractIds);
    supplierPaidAmount = (supplierPayments || []).reduce((sum: number, p: any) => sum + parseNumeric(p.payment_amount), 0);
  }

  const { data: salaryPayments } = await client
    .from('salary_payments')
    .select('payment_amount')
    .eq('project_id', projectId);
  const workerPaidAmount = (salaryPayments || []).reduce((sum: number, p: any) => sum + parseNumeric(p.payment_amount), 0);

  return {
    projectId,
    projectName: project.name,
    contractAmount: parseNumeric(project.contract_amount),
    invoiceAmount,
    visaAmount,
    taxableIncome,
    untaxedIncome,
    taxAmount: taxFromInvoice,
    settlementAmount,
    salaryAmount,
    expenseAmount,
    miscMaterialAmount,
    totalCost,
    profit,
    profitRate: Math.round(profitRate * 100) / 100,
    laborCostRate: totalCost > 0 ? Math.round((salaryAmount / totalCost) * 10000) / 100 : 0,
    expenseRate: totalCost > 0 ? Math.round((expenseAmount / totalCost) * 10000) / 100 : 0,
    taxRate: totalCost > 0 ? Math.round((taxFromInvoice / totalCost) * 10000) / 100 : 0,
    miscMaterialRate: totalCost > 0 ? Math.round((miscMaterialAmount / totalCost) * 10000) / 100 : 0,
    clientPaidAmount,
    supplierPaidAmount,
    workerPaidAmount,
  };
}
