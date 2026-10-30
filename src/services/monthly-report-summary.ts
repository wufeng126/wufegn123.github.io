/**
 * 月度经营报告 - 汇总计算服务
 *
 * 从 /api/reports/monthly/summary/route.ts 抽取的纯计算函数（无 I/O、无副作用），
 * 供路由层调用，降低路由文件体积并便于单元测试。
 */

export interface ProjectData {
  id: number;
  name: string;
  status: string;
  contractAmount: number;
  totalIncome: number;
  monthIncome: number;
  totalReceived: number;
  monthReceived: number;
  unreceived: number;
  overReceived: number;
  paymentRate: number;
  supplierCost: number;
  salaryCost: number;
  salaryPaid: number;
  unpaidSalary: number;
  expenseCost: number;
  materialCost: number;
  taxCost: number;
  totalCost: number;
  monthSalaryCost: number;
  monthSalaryPaid: number;
  monthLaborSalaryCost: number;
  monthTeamSettlementCost: number;
  monthSupplierSettlement: number;
  monthExpenseCost: number;
  monthMaterialCost: number;
  monthTaxCost: number;
  monthCost: number;
  monthSupplierPayments: number;
  cumulativeSupplierSettlement: number;
  cumulativeSupplierPayment: number;
  supplierPaymentRate: number;
  profit: number;
  profitRate: number;
  cumulativeIncome: number;
  cumulativeCost: number;
  cumulativeProfit: number;
  cumulativeProfitRate: number;
  // 经营利润与现金净流
  monthConfirmedOutput: number;      // 本月确认产值（已审批报量）
  monthApprovedVisa: number;         // 本月已完成签证金额
  monthConfirmedCost: number;        // 本月确认成本（结算+工资+费用+材料+税金）
  operatingProfit: number;           // 经营利润 = 本月确认产值 + 本月已完成签证 - 本月确认成本
  operatingProfitRate: number;       // 经营利润率
  monthActualPayment: number;        // 本月实际支付（工资发放+供应商付款）
  cashNetFlow: number;               // 现金净流 = 本月实际回款 - 本月实际支付
  cashNetFlowRate: number;           // 现金净流占产值比
  totalVisa: number;                 // 累计签证金额
  monthVisa: number;                 // 本月签证金额
  cumulativeVisa: number;            // 累计签证金额(用于回款滞后)
  inServiceCount: number;
  visaCount: number;
  pendingVisaCount: number;
  // New fields for payable module
  supplierPayable: number;
  supplierPaid: number;
  supplierUnpaid: number;
  salaryPayable: number;
  salaryUnpaid: number;
  unpaidSalaryWorkers: number;
  earliestUnpaidMonth: string | null;
}

export function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

export function safeSum(nums: number[]): number {
  return nums.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0);
}

export function formatWan(amount: number): string {
  if (Math.abs(amount) >= 100000000) return `${(amount / 100000000).toFixed(2)}亿元`;
  if (Math.abs(amount) >= 10000) return `${(amount / 10000).toFixed(2)}万元`;
  return `${amount.toFixed(2)}元`;
}

export function calculateAging(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    return `${diffDays}天`;
  } catch {
    return '-';
  }
}

export function getNextMonthEnd(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return next.toISOString().split('T')[0];
}

export function generateConclusion(
  ov: ReturnType<typeof getEmptyOverview> & Record<string, number>,
  pp: ReturnType<typeof getEmptyPayablePlan>,
  projects: ProjectData[],
): string {
  const operatingProfit = Number(ov.operatingProfit || 0);
  const profitRate = Number(ov.operatingProfitRate || 0);
  const judgement = operatingProfit <= 0
    ? '本月经营亏损'
    : profitRate >= 10
      ? '本月经营状况良好'
      : '本月经营平稳';
  const lines: string[] = [];

  // 第一行：一句话总评（老板先看这个）
  lines.push(`本月经营利润 ${formatWan(operatingProfit)}，利润率 ${profitRate.toFixed(1)}%，判断：${judgement}。`);

  // 经营情况（中性数字）
  lines.push(`确认产值 ${formatWan(ov.monthIncome)}，确认成本 ${formatWan(ov.monthCost)}。`);

  // 现金情况
  lines.push(`实际回款 ${formatWan(ov.monthReceived)}，实际支付 ${formatWan(ov.monthActualPayment)}，现金净流 ${formatWan(ov.cashNetFlow)}。`);

  // 回款进度
  if (ov.totalIncome > 0) {
    lines.push(`累计回款率 ${ov.paymentRate.toFixed(1)}%，未回款 ${formatWan(ov.unreceived)}。`);
  }

  // 应付情况
  if (pp.totalPayable > 0) {
    lines.push(`本月应付合计 ${formatWan(pp.totalPayable)}（人工未付 ${formatWan(pp.laborUnpaid)}、供应商未付 ${formatWan(pp.supplierUnpaid)}）。`);
  }

  // 亏损项目（事实陈述）
  const monthLossProjects = projects.filter((p) => p.operatingProfit < 0);
  if (monthLossProjects.length > 0) {
    lines.push(`本月亏损项目：${monthLossProjects.map((p) => p.name).join('、')}。`);
  }

  return lines.join('\n');
}

export function getEmptyOverview() {
  return {
    projectCount: 0, totalIncome: 0, monthIncome: 0, totalReceived: 0, monthReceived: 0,
    totalCost: 0, monthCost: 0,
    totalSalary: 0, monthSalaryCost: 0,
    totalSupplierCost: 0, monthSupplierSettlement: 0,
    totalExpense: 0, monthExpenseCost: 0,
    totalMaterialCost: 0, monthMaterialCost: 0,
    totalTaxCost: 0, monthTaxCost: 0,
    profit: 0, profitRate: 0,
    cumulativeIncome: 0, cumulativeCost: 0, cumulativeProfit: 0, cumulativeProfitRate: 0,
    unreceived: 0, overReceived: 0, paymentRate: 0,
    inServiceCount: 0, totalSalaryPaid: 0, totalUnpaidSalary: 0,
    totalSupplierPayable: 0, totalSupplierPaid: 0, totalSupplierUnpaid: 0,
    monthSupplierPayments: 0, cumulativeSupplierSettlement: 0, cumulativeSupplierPayment: 0,
    supplierPaymentRate: 0,
    operatingProfit: 0, operatingProfitRate: 0,
    cashNetFlow: 0, monthActualPayment: 0,
    totalVisa: 0, monthVisa: 0, cumulativeVisa: 0,
  };
}

export function getEmptyPayablePlan() {
  return {
    totalPayable: 0, laborPayable: 0, laborPaid: 0, laborUnpaid: 0,
    supplierPayable: 0, supplierPaid: 0, supplierUnpaid: 0,
    fundGap: 0, monthAvailable: 0,
  };
}

export function getEmptyRisks() {
  return {
    lossProjects: [], costOverIncomeProjects: [], lowPaymentRateProjects: [],
    highLaborProjects: [], unpaidSalaryProjects: [], pendingVisaProjects: [],
    overdueSupplierPayments: 0, expiringCertificates: 0,
  };
}
