export type InsightLevel = 'good' | 'info' | 'warn' | 'danger';

export type MonthlyInsight = {
  level: InsightLevel;
  title: string;
  detail: string;
  action?: string;
};

type TrendRow = { month: string; income: number; received: number; cost: number; profit: number };

type ProjectLite = {
  name?: string | null;
  monthIncome?: number | null;
  monthIncomeExTax?: number | null;
  monthCost?: number | null;
  monthLaborSalaryCost?: number | null;
  monthMaterialCost?: number | null;
  monthSupplierSettlement?: number | null;
  monthExpenseCost?: number | null;
  monthTaxCost?: number | null;
  salaryUnpaid?: number | null;
  supplierUnpaid?: number | null;
  supplierPayable?: number | null;
  monthSalaryPaid?: number | null;
};

export type MonthlyInsightInput = {
  overview?: Record<string, unknown>;
  projects?: ProjectLite[];
  trends?: TrendRow[];
  materialTop?: { category: string; amount: number; count: number } | null;
  laborHours?: number;
  laborAmount?: number;
  /** 预算员填写的实际产值（剔除走账），填写后以它为准 */
  actualOutputOverride?: number;
};

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(value: number, base: number) {
  return base > 0 ? (value / base) * 100 : 0;
}

function fmtWan(value: number) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(2)} 万`;
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

/**
 * 月度经营自动分析：不做数据罗列，而是做对比、归因、数据质量校验，并给出具体动作。
 */
export function buildMonthlyInsights(input: MonthlyInsightInput): MonthlyInsight[] {
  const overview = input.overview || {};
  const projects = input.projects || [];
  const trends = (input.trends || []).slice().sort((a, b) => a.month.localeCompare(b.month));
  const insights: MonthlyInsight[] = [];

  const bookedExTax = num(overview.monthIncomeExTax);
  const override = num(input.actualOutputOverride);
  const exTax = override > 0 ? override : bookedExTax;
  const income = num(overview.monthIncome);
  const cost = num(overview.monthCost);
  const profit = exTax - cost;
  const costRate = pct(cost, exTax);
  const received = num(overview.monthReceived);
  const unreceived = num(overview.unreceived);

  const current = trends[trends.length - 1];
  const previous = trends.length >= 2 ? trends[trends.length - 2] : null;

  // 0) 开票额与实际产值差异（走账）
  if (override > 0 && bookedExTax > 0 && Math.abs(bookedExTax - override) >= 1) {
    const gap = bookedExTax - override;
    const gapRate = bookedExTax > 0 ? (gap / bookedExTax) * 100 : 0;
    insights.push({
      level: gapRate >= 30 ? 'warn' : 'info',
      title: `开票额与实际产值相差 ${fmtWan(gap)}（占开票 ${gapRate.toFixed(1)}%）`,
      detail: `开票额 ${fmtWan(bookedExTax)}，实际产值 ${fmtWan(override)}。差额部分多为止走账/代付，不计入真实经营成果，本页利润已按实际产值计算。`,
      action: gapRate >= 30 ? '走账比例较高，建议在预算员分析中说明原因与对应项目，避免被误读为真实产值。' : undefined,
    });
  }

  // 1) 成本率与历史对比（核心判断：成本是否异常）
  if (previous && exTax > 0) {
    const prevCostRate = pct(previous.cost, previous.income);
    const diff = costRate - prevCostRate;
    if (Math.abs(diff) >= 8) {
      insights.push({
        level: diff > 0 ? 'warn' : 'info',
        title: `成本率较上月${diff > 0 ? '上升' : '下降'} ${Math.abs(diff).toFixed(1)} 个百分点`,
        detail: `本月成本率 ${costRate.toFixed(1)}%，上月 ${prevCostRate.toFixed(1)}%。${diff > 0 ? '在产值未同步增长的情况下，成本上升会直接压缩利润。' : '成本控制改善，但需确认本月成本是否归集完整（是否有未结算/未录入）。'}`,
        action: diff > 0 ? '按成本构成逐项核对本月新增成本，重点看人工与供应商结算。' : '确认未结算成本是否已全部入账，避免利润虚高。',
      });
    } else {
      insights.push({
        level: 'info',
        title: `成本率基本稳定（${costRate.toFixed(1)}%，上月 ${prevCostRate.toFixed(1)}%）`,
        detail: '本月成本结构与上月接近，未出现明显异常波动。',
      });
    }
  }

  // 2) 利润变化归因（收入效应 vs 成本效应）
  if (previous && exTax > 0) {
    const prevProfit = num(previous.profit);
    const deltaProfit = profit - prevProfit;
    const deltaIncome = exTax - num(previous.income);
    const prevCostRate = pct(previous.cost, previous.income) / 100;
    const incomeEffect = deltaIncome * (1 - prevCostRate);
    const costEffect = -(cost - num(previous.cost));
    if (Math.abs(deltaProfit) > 0.01) {
      const driver = Math.abs(incomeEffect) >= Math.abs(costEffect) ? '产值' : '成本';
      insights.push({
        level: deltaProfit >= 0 ? 'good' : 'danger',
        title: `利润环比${deltaProfit >= 0 ? '增加' : '减少'} ${fmtWan(Math.abs(deltaProfit))}，主要来自${driver}变化`,
        detail: `产值变动影响 ${incomeEffect >= 0 ? '+' : ''}${fmtWan(incomeEffect)}，成本变动影响 ${costEffect >= 0 ? '+' : ''}${fmtWan(costEffect)}。${driver === '产值' ? '利润改善/恶化主要由产值驱动，成本端相对平稳。' : '利润变化主要由成本驱动，需定位是哪一类成本增加。'}`,
        action: driver === '产值' ? '核对本月产值确认依据（报量/结算单），确认是否含走账或跨月确认。' : '按人工/材料/供应商/其他逐项对比上月，找出增量来源。',
      });
    }
  }

  // 3) 数据质量：产值与成本是否匹配
  const zeroCostWithIncome = projects.filter((p) => num(p.monthIncome) > 0 && num(p.monthCost) <= 0);
  const zeroIncomeWithCost = projects.filter((p) => num(p.monthIncome) <= 0 && num(p.monthCost) > 0);
  if (zeroCostWithIncome.length > 0) {
    insights.push({
      level: 'danger',
      title: `有 ${zeroCostWithIncome.length} 个项目本月有产值但没有成本`,
      detail: `涉及：${zeroCostWithIncome.map((p) => p.name || '未命名').join('、')}。这类项目利润会被高估，通常是成本未录入或未结算。`,
      action: '核对这些项目是否漏录工资/结算/材料，或成本尚在审批中。',
    });
  }
  if (zeroIncomeWithCost.length > 0) {
    insights.push({
      level: 'warn',
      title: `有 ${zeroIncomeWithCost.length} 个项目本月有成本但没有产值`,
      detail: `涉及：${zeroIncomeWithCost.map((p) => p.name || '未命名').join('、')}。可能是本月未报量（产值确认滞后），会造成项目看起来亏损。`,
      action: '确认是否漏报产值，或项目处于停工/收尾阶段。',
    });
  }

  // 4) 人工效率：单位产值人工成本 + 工时产值
  const laborCost = projects.reduce((s, p) => s + num(p.monthLaborSalaryCost), 0);
  const laborRate = pct(laborCost, exTax);
  if (exTax > 0 && laborCost > 0) {
    const prevLaborRate = previous ? pct(laborCost, num(previous.income)) : 0;
    if (laborRate >= 45) {
      insights.push({
        level: 'warn',
        title: `人工成本占产值 ${laborRate.toFixed(1)}%，处于偏高水平`,
        detail: `本月人工 ${fmtWan(laborCost)}，产值 ${fmtWan(exTax)}。人工占比高会直接压低毛利，需判断是单价、工效还是窝工。`,
        action: '结合「月度用工分析」核对点工工时与分类，重点看非生产性用工（清理、倒运、返工）占比。',
      });
    }
    if (input.laborHours && input.laborHours > 0) {
      const outputPerHour = exTax / input.laborHours;
      insights.push({
        level: outputPerHour < 500 ? 'warn' : 'info',
        title: `每工时可支撑产值约 ${outputPerHour.toFixed(0)} 元`,
        detail: `点工 ${input.laborHours.toFixed(0)} 小时，产值 ${fmtWan(exTax)}。${outputPerHour < 500 ? '该效率偏低，可能存在窝工或工时虚报。' : '该效率处于正常区间。'}`,
        action: outputPerHour < 500 ? '抽查工时记录与施工日志，核对是否存在重复报工或停工待料。' : undefined,
      });
    }
    if (prevLaborRate > 0 && laborRate - prevLaborRate >= 8) {
      insights.push({
        level: 'warn',
        title: `人工占比环比上升 ${(laborRate - prevLaborRate).toFixed(1)} 个百分点`,
        detail: `上月约 ${prevLaborRate.toFixed(1)}%，本月 ${laborRate.toFixed(1)}%。若单价未变，说明工效下降或用工结构变化。`,
        action: '对比两月工种结构（木工/钢筋/普工），确认是否高单价工种占比上升。',
      });
    }
  }

  // 5) 材料：集中度与异常
  const materialCost = projects.reduce((s, p) => s + num(p.monthMaterialCost), 0);
  const materialRate = pct(materialCost, exTax);
  if (input.materialTop && materialCost > 0) {
    const topShare = pct(input.materialTop.amount, materialCost);
    if (topShare >= 40) {
      insights.push({
        level: 'warn',
        title: `材料集中在「${input.materialTop.category}」，占材料 ${topShare.toFixed(1)}%`,
        detail: `该分类本月 ${input.materialTop.count} 笔、${fmtWan(input.materialTop.amount)}。过度集中时单价或数量出错的影响会被放大。`,
        action: '抽查该分类 3-5 笔单价与采购单，核对是否与市场价/合同价一致。',
      });
    }
  }
  if (materialRate >= 25) {
    insights.push({
      level: 'warn',
      title: `材料成本占产值 ${materialRate.toFixed(1)}%，高于常规区间`,
      detail: `材料 ${fmtWan(materialCost)}。需区分是正常采购高峰还是超耗/浪费。`,
      action: '结合分项工程完成量核对材料理论用量，重点看周转材料是否重复采购。',
    });
  }

  // 6) 供应商与付款压力
  const supplierUnpaid = projects.reduce((s, p) => s + num(p.supplierUnpaid), 0);
  const supplierPayable = projects.reduce((s, p) => s + num(p.supplierPayable), 0);
  if (supplierPayable > 0) {
    const unpaidRate = pct(supplierUnpaid, supplierPayable);
    if (unpaidRate >= 50) {
      insights.push({
        level: 'danger',
        title: `供应商未付占应付 ${unpaidRate.toFixed(1)}%`,
        detail: `应付 ${fmtWan(supplierPayable)}，未付 ${fmtWan(supplierUnpaid)}。付款滞后可能影响材料供应与后续价格。`,
        action: '按供应商列出未付清单，优先处理影响供货的关键供应商。',
      });
    }
  }

  // 7) 工资发放风险
  const unpaidSalary = projects.reduce((s, p) => s + num(p.salaryUnpaid), 0);
  const paidSalary = projects.reduce((s, p) => s + num(p.monthSalaryPaid), 0);
  if (unpaidSalary > 0) {
    const ratio = pct(unpaidSalary, unpaidSalary + paidSalary);
    insights.push({
      level: ratio >= 30 ? 'danger' : 'warn',
      title: `工人未发工资 ${fmtWan(unpaidSalary)}（占应发 ${ratio.toFixed(1)}%）`,
      detail: ratio >= 30 ? '未发比例较高，存在欠薪与劳务纠纷风险。' : '存在一定未发金额，需按计划发放。',
      action: '核对未发月份，优先清理跨月拖欠（特别是已退场工人）。',
    });
  }

  // 8) 回款与应收
  if (exTax > 0) {
    const receiveRate = pct(received, income);
    if (receiveRate < 80) {
      insights.push({
        level: receiveRate < 60 ? 'danger' : 'warn',
        title: `本月回款率 ${receiveRate.toFixed(1)}%，低于 80%`,
        detail: `开票 ${fmtWan(income)}，回款 ${fmtWan(received)}。产值转化为现金的速度偏慢，会放大资金压力。`,
        action: '按项目列出应收未收台账，明确催收责任人与时间。',
      });
    }
    if (unreceived > 0) {
      insights.push({
        level: 'info',
        title: `累计应收未收 ${fmtWan(unreceived)}`,
        detail: '该金额会持续占用现金流，需与甲方对账确认无争议金额。',
        action: '优先处理超过 60 天未回的款项，必要时暂停新增产值。',
      });
    }
  }

  // 9) 亏损项目
  const lossProjects = projects
    .map((p) => ({ name: p.name || '未命名', profit: num(p.monthIncomeExTax) - num(p.monthCost) }))
    .filter((p) => p.profit < 0)
    .sort((a, b) => a.profit - b.profit);
  if (lossProjects.length > 0) {
    insights.push({
      level: 'danger',
      title: `${lossProjects.length} 个项目本月亏损`,
      detail: lossProjects.map((p) => `${p.name}（${fmtWan(p.profit)}）`).join('；'),
      action: '逐个项目核对产值确认是否滞后、成本是否包含上月未结部分。',
    });
  }

  if (insights.length === 0) {
    insights.push({
      level: 'good',
      title: '本月经营数据未见明显异常',
      detail: '成本率、人工占比、回款率均在常规区间，暂无需要特别关注的异常项。',
      action: '保持按月核对产值与成本归集，避免跨月累积。',
    });
  }

  return insights;
}
