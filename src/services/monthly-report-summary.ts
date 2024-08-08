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
  const lines: string[] = [];

  // 1. 经营利润（产值口径）
  if (ov.operatingProfit > 0) {
    lines.push(`本月经营利润为正，确认产值${formatWan(ov.monthIncome)}减确认成本${formatWan(ov.monthCost)}，经营利润${formatWan(ov.operatingProfit)}，经营利润率${ov.operatingProfitRate.toFixed(1)}%。`);
  } else if (ov.operatingProfit < 0) {
    lines.push(`本月经营利润为负，确认产值${formatWan(ov.monthIncome)}减确认成本${formatWan(ov.monthCost)}，经营亏损${formatWan(Math.abs(ov.operatingProfit))}，经营利润率${ov.operatingProfitRate.toFixed(1)}%，需重点关注成本控制。`);
  } else {
    lines.push('本月经营利润为零，需确认数据是否完整录入。');
  }

  // 2. 现金净流（资金口径）
  if (ov.cashNetFlow > 0) {
    lines.push(`本月现金净流为正，实际回款${formatWan(ov.monthReceived)}减实际支付${formatWan(ov.monthActualPayment)}，净流入${formatWan(ov.cashNetFlow)}，资金面宽裕。`);
  } else if (ov.cashNetFlow < 0) {
    lines.push(`本月现金净流为负，实际回款${formatWan(ov.monthReceived)}减实际支付${formatWan(ov.monthActualPayment)}，净流出${formatWan(Math.abs(ov.cashNetFlow))}，资金承压。`);
  } else {
    lines.push('本月现金净流为零，回款与支出持平。');
  }

  // 3. 经营利润 vs 现金净流 差异分析
  if (ov.operatingProfit > 0 && ov.cashNetFlow < 0) {
    lines.push(`本月经营利润为正但现金净流为负，主要由于回款滞后和人工/供应商付款集中，需重点跟进回款。`);
    const lowPaymentProjects = projects.filter(p => p.paymentRate < 50 && p.totalIncome > 0);
    if (lowPaymentProjects.length > 0) {
      lines.push(`重点催收项目：${lowPaymentProjects.map(p => `${p.name}(回款率${p.paymentRate.toFixed(0)}%)`).join('、')}。`);
    }
  } else if (ov.operatingProfit < 0 && ov.cashNetFlow > 0) {
    lines.push(`本月经营亏损但现金净流为正，说明回款较好但成本超支，需分析成本结构。`);
  }

  // 4. Payment collection
  if (ov.totalIncome > 0) {
    if (ov.paymentRate >= 80) {
      lines.push(`回款情况良好，累计回款率${ov.paymentRate.toFixed(1)}%，已回款${formatWan(ov.totalReceived)}。`);
    } else if (ov.paymentRate >= 50) {
      lines.push(`回款率${ov.paymentRate.toFixed(1)}%，未回款${formatWan(ov.unreceived)}，需加强催收。`);
    } else {
      lines.push(`回款率仅${ov.paymentRate.toFixed(1)}%，未回款${formatWan(ov.unreceived)}，回款风险较高，建议重点催收。`);
    }
  } else {
    lines.push('本月暂无产值数据，请确认报量是否已录入。');
  }

  // 5. Cost
  if (ov.cumulativeCost > ov.cumulativeIncome && ov.cumulativeIncome > 0) {
    lines.push(`累计成本${formatWan(ov.cumulativeCost)}已超过累计收入${formatWan(ov.cumulativeIncome)}，项目整体处于亏损状态。`);
  }

  // 4. Payable pressure
  if (pp.totalPayable > 0) {
    lines.push(`本月应付合计${formatWan(pp.totalPayable)}，其中人工未付${formatWan(pp.laborUnpaid)}，供应商未付${formatWan(pp.supplierUnpaid)}。`);
    if (pp.fundGap > 0) {
      lines.push(`预计资金缺口${formatWan(pp.fundGap)}，需优先安排资金。`);
    }
  }

  // 5. Salary risk
  if (pp.laborUnpaid > 0) {
    lines.push(`存在工资支付风险，未付人工工资${formatWan(pp.laborUnpaid)}，建议优先保障人工工资。`);
  }

  // 6. Supplier pressure
  if (pp.supplierUnpaid > 0) {
    lines.push(`存在供应商付款压力，未付供应商款${formatWan(pp.supplierUnpaid)}。`);
  }

  // 7. Dragging projects
  const monthLossProjects = projects.filter(p => p.operatingProfit < 0);
  const cumulLossProjects = projects.filter(p => p.cumulativeProfit < 0);
  const lowPaymentProjects = projects.filter(p => p.paymentRate < 50 && p.totalIncome > 0);
  if (monthLossProjects.length > 0) {
    lines.push(`本月亏损项目：${monthLossProjects.map(p => p.name).join('、')}，建议重点分析。`);
  }
  if (cumulLossProjects.length > 0) {
    lines.push(`累计亏损项目：${cumulLossProjects.map(p => p.name).join('、')}，需制定扭亏计划。`);
  }
  if (lowPaymentProjects.length > 0) {
    lines.push(`回款率低项目：${lowPaymentProjects.map(p => `${p.name}(${p.paymentRate.toFixed(0)}%)`).join('、')}，建议重点催收。`);
  }

  // 8. Next month focus
  const focusActions: string[] = [];
  if (pp.laborUnpaid > 0) focusActions.push('优先保障人工工资发放');
  if (pp.supplierUnpaid > 0) focusActions.push('处理逾期供应商款');
  if (lowPaymentProjects.length > 0) focusActions.push(`重点催收${lowPaymentProjects[0].name}回款`);
  if (cumulLossProjects.length > 0) focusActions.push('制定亏损项目扭亏计划');
  else if (monthLossProjects.length > 0) focusActions.push('分析本月亏损项目成本结构');
  if (focusActions.length > 0) {
    lines.push(`下月重点：${focusActions.join('；')}。`);
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
