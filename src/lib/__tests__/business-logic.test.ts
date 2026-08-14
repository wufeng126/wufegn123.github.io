import { describe, it, expect } from 'vitest';
import {
  parseNumeric,
  calculateTaxInfo,
  calculateSalary,
  SALARY_PAYMENT_TOLERANCE,
  calculateSalaryPaymentStatus,
  calculateSalaryUnpaidAmount,
  isSalaryPaymentLocked,
  calculatePayableAmount,
  isFinalSettlementType,
  summarizeSupplierSettlementRows,
  resolveReportedIncome,
  validateSettlementLimitPrice,
  normalizeReviewStatus,
  isReviewedStatus,
  isVoidedStatus,
  isEffectiveSupplierPaymentStatus,
  isEffectiveClientPaymentStatus,
  validateStatusTransition,
  REVIEW_STATUS,
} from '@/lib/business-logic';

describe('parseNumeric', () => {
  it('处理 null / undefined / 空字符串', () => {
    expect(parseNumeric(null)).toBe(0);
    expect(parseNumeric(undefined)).toBe(0);
    expect(parseNumeric('')).toBe(0);
  });

  it('处理数字与数字字符串', () => {
    expect(parseNumeric(123.45)).toBe(123.45);
    expect(parseNumeric('123.45')).toBe(123.45);
    expect(parseNumeric('  456 ')).toBe(456); // 空白容忍
  });

  it('处理 $numberDecimal 对象（drizzle numeric 返回形态）', () => {
    expect(parseNumeric({ $numberDecimal: '999.99' })).toBe(999.99);
  });

  it('无法解析时返回 0', () => {
    expect(parseNumeric('abc')).toBe(0);
  });
});

describe('calculateSalary（工资自动计算）', () => {
  it('应发 = 工时×工价 + 包活工资；实发 = 应发 - 个税 - 借支 - 劳保 - 罚款', () => {
    const result = calculateSalary({
      work_hours: 200,
      hourly_rate: 30,
      contract_work_pay: 500,
      income_tax: 120.5,
      advance_pay: 1000,
      labor_insurance: 50,
      fine: 20,
    });
    expect(result.grossPay).toBe(6500); // 200×30 + 500
    expect(result.netPay).toBe(5309.5); // 6500 - 120.5 - 1000 - 50 - 20
  });

  it('金额四舍五入到分', () => {
    const result = calculateSalary({
      work_hours: 3,
      hourly_rate: 33.333,
      contract_work_pay: 0,
      income_tax: 0,
      advance_pay: 0,
      labor_insurance: 0,
      fine: 0,
    });
    expect(result.grossPay).toBe(100.0); // 99.999 → 100
  });

  it('显式传入 gross_pay / net_pay 时不再计算', () => {
    const result = calculateSalary({
      work_hours: 200,
      hourly_rate: 30,
      contract_work_pay: 500,
      income_tax: 0,
      advance_pay: 0,
      labor_insurance: 0,
      fine: 0,
      gross_pay: 8000,
      net_pay: 7000,
    });
    expect(result.grossPay).toBe(8000);
    expect(result.netPay).toBe(7000);
  });

  it('零工时场景', () => {
    const result = calculateSalary({
      work_hours: 0,
      hourly_rate: 30,
      contract_work_pay: 0,
      income_tax: 0,
      advance_pay: 0,
      labor_insurance: 0,
      fine: 0,
    });
    expect(result.grossPay).toBe(0);
    expect(result.netPay).toBe(0);
  });
});

describe('calculateSalaryPaymentStatus（发放状态）', () => {
  it('未发放 unpaid', () => {
    expect(calculateSalaryPaymentStatus(5000, 0)).toBe('unpaid');
    expect(calculateSalaryPaymentStatus(5000, -1)).toBe('unpaid');
  });

  it('足额发放 paid（容差内）', () => {
    expect(calculateSalaryPaymentStatus(5000, 5000)).toBe('paid');
    expect(calculateSalaryPaymentStatus(5000, 5000 - SALARY_PAYMENT_TOLERANCE)).toBe('paid');
    expect(calculateSalaryPaymentStatus(5000, 5000 + SALARY_PAYMENT_TOLERANCE)).toBe('paid');
  });

  it('部分发放 partial', () => {
    expect(calculateSalaryPaymentStatus(5000, 3000)).toBe('partial');
  });

  it('超发 overpaid', () => {
    expect(calculateSalaryPaymentStatus(5000, 6000)).toBe('overpaid');
  });

  it('金额四舍五入后判定（避免浮点误差误判）', () => {
    expect(calculateSalaryPaymentStatus(5000, 4999.999)).toBe('paid');
  });
});

describe('calculateSalaryUnpaidAmount（未发余额）', () => {
  it('容差内视为结清', () => {
    expect(calculateSalaryUnpaidAmount(5000, 5000)).toBe(0);
    expect(calculateSalaryUnpaidAmount(5000, 4999.5)).toBe(0);
  });

  it('未发余额 = 应发 - 已发（不为负）', () => {
    expect(calculateSalaryUnpaidAmount(5000, 3000)).toBe(2000);
    expect(calculateSalaryUnpaidAmount(5000, 6000)).toBe(0);
  });
});

describe('isSalaryPaymentLocked', () => {
  it('partial/paid/overpaid 锁定，unpaid/空 不锁定', () => {
    expect(isSalaryPaymentLocked('partial')).toBe(true);
    expect(isSalaryPaymentLocked('paid')).toBe(true);
    expect(isSalaryPaymentLocked('overpaid')).toBe(true);
    expect(isSalaryPaymentLocked('unpaid')).toBe(false);
    expect(isSalaryPaymentLocked(null)).toBe(false);
    expect(isSalaryPaymentLocked(undefined)).toBe(false);
  });
});

describe('calculateTaxInfo（税务计算）', () => {
  it('9% 税率：不含税 = 含税/(1+9%)，税额 = 含税 - 不含税', () => {
    const result = calculateTaxInfo(10900, 9);
    expect(result.untaxedIncome).toBe(10000);
    expect(result.taxAmount).toBe(900);
  });

  it('非法输入返回 0', () => {
    expect(calculateTaxInfo(0, 9)).toEqual({ untaxedIncome: 0, taxAmount: 0 });
    expect(calculateTaxInfo(-100, 9)).toEqual({ untaxedIncome: 0, taxAmount: 0 });
    expect(calculateTaxInfo(100, -1)).toEqual({ untaxedIncome: 0, taxAmount: 0 });
  });

  it('保留两位小数', () => {
    const result = calculateTaxInfo(10000, 9);
    expect(result.untaxedIncome).toBe(9174.31);
    expect(result.taxAmount).toBe(825.69);
  });
});

describe('calculatePayableAmount（应付金额 = 结算金额×付款比例）', () => {
  const contract = {
    payment_ratio_active: 80,
    payment_ratio_complete: 95,
    payment_ratio_final: 100,
  };

  it('进度结算按 active 比例', () => {
    expect(calculatePayableAmount(10000, 'progress', contract)).toBe(8000);
  });

  it('里程碑结算按 complete 比例', () => {
    expect(calculatePayableAmount(10000, 'milestone', contract)).toBe(9500);
  });

  it('决算结算按 final 比例', () => {
    expect(calculatePayableAmount(10000, 'final', contract)).toBe(10000);
  });

  it('未知类型回退 active 比例', () => {
    expect(calculatePayableAmount(10000, 'other', contract)).toBe(8000);
  });

  it('比例缺失时使用默认值 80/95/100', () => {
    expect(calculatePayableAmount(10000, 'progress', {})).toBe(8000);
    expect(calculatePayableAmount(10000, 'milestone', {})).toBe(9500);
    expect(calculatePayableAmount(10000, 'final', {})).toBe(10000);
  });

  it('四舍五入到分', () => {
    expect(calculatePayableAmount(3333.33, 'progress', contract)).toBe(2666.66);
  });
});

describe('isFinalSettlementType（决算类型判定）', () => {
  it('识别 final/决算/总结算', () => {
    expect(isFinalSettlementType('final')).toBe(true);
    expect(isFinalSettlementType('complete')).toBe(true);
    expect(isFinalSettlementType('决算结算')).toBe(true);
    expect(isFinalSettlementType('总结算')).toBe(true);
  });

  it('非决算类型返回 false', () => {
    expect(isFinalSettlementType('progress')).toBe(false);
    expect(isFinalSettlementType('milestone')).toBe(false);
    expect(isFinalSettlementType(null)).toBe(false);
    expect(isFinalSettlementType('')).toBe(false);
  });
});

describe('summarizeSupplierSettlementRows（结算汇总）', () => {
  it('汇总金额并排除作废结算与无效付款', () => {
    const summary = summarizeSupplierSettlementRows(
      [
        { id: 1, contract_id: 1, settlement_amount: '10000', payable_amount: '8000', status: 'reviewed' },
        { id: 2, contract_id: 1, settlement_amount: '5000', payable_amount: '5000', status: 'voided' }, // 排除
        { id: 3, contract_id: 1, settlement_amount: '2000', payable_amount: '1500', status: 'draft' },
      ],
      [
        { id: 1, contract_id: 1, payment_amount: '6000', status: 'completed' },
        { id: 2, contract_id: 1, payment_amount: '3000', status: 'cancelled' }, // 排除
      ]
    );
    expect(summary.totalSettlements).toBe(2);
    expect(summary.totalAmount).toBe(12000); // 10000 + 2000
    expect(summary.totalPayable).toBe(9500); // 8000 + 1500
    expect(summary.totalPaid).toBe(6000);
  });

  it('空输入', () => {
    const summary = summarizeSupplierSettlementRows([], []);
    expect(summary.totalSettlements).toBe(0);
    expect(summary.totalAmount).toBe(0);
    expect(summary.totalPayable).toBe(0);
    expect(summary.totalPaid).toBe(0);
  });
});

describe('resolveReportedIncome（甲方收入口径 D3）', () => {
  it('invoice → settlement → report 兜底顺序', () => {
    expect(resolveReportedIncome(100, 90, 80)).toBe(100);
    expect(resolveReportedIncome(null, 90, 80)).toBe(90);
    expect(resolveReportedIncome(undefined, null, 80)).toBe(80);
    expect(resolveReportedIncome(null, null, null)).toBe(0);
    expect(resolveReportedIncome('0', '0', '50')).toBe(50); // invoice 为 0 时跳过
  });
});

describe('validateSettlementLimitPrice（P0-2 限价超限校验）', () => {
  it('结算单价超过限价 → overLimit + 超限比例', () => {
    expect(validateSettlementLimitPrice({ unitPrice: 1086, limitPrice: 980 })).toEqual({ overLimit: true, overRatio: 10.8 });
    expect(validateSettlementLimitPrice({ unitPrice: 56.5, limitPrice: 52 })).toEqual({ overLimit: true, overRatio: 8.7 });
  });

  it('结算单价等于或低于限价 → 不超限', () => {
    expect(validateSettlementLimitPrice({ unitPrice: 980, limitPrice: 980 }).overLimit).toBe(false);
    expect(validateSettlementLimitPrice({ unitPrice: 168, limitPrice: 175 }).overLimit).toBe(false);
    expect(validateSettlementLimitPrice({ unitPrice: 1000, limitPrice: 980 }).overRatio).toBeGreaterThan(0);
  });

  it('无限价（空/0/字符串）→ 不拦截（兼容历史分项）', () => {
    expect(validateSettlementLimitPrice({ unitPrice: 1000, limitPrice: null })).toEqual({ overLimit: false, overRatio: 0 });
    expect(validateSettlementLimitPrice({ unitPrice: 1000, limitPrice: undefined }).overLimit).toBe(false);
    expect(validateSettlementLimitPrice({ unitPrice: 1000, limitPrice: 0 }).overLimit).toBe(false);
    expect(validateSettlementLimitPrice({ unitPrice: 1000, limitPrice: '' }).overLimit).toBe(false);
  });

  it('超限比例保留 1 位小数', () => {
    expect(validateSettlementLimitPrice({ unitPrice: 100.01, limitPrice: 90 }).overRatio).toBe(11.1);
  });
});

describe('状态判定与流转', () => {
  it('normalizeReviewStatus 归一化', () => {
    expect(normalizeReviewStatus('reviewed')).toBe(REVIEW_STATUS.REVIEWED);
    expect(normalizeReviewStatus('voided')).toBe(REVIEW_STATUS.VOIDED);
    expect(normalizeReviewStatus('draft')).toBe(REVIEW_STATUS.DRAFT);
    expect(normalizeReviewStatus(null)).toBe(REVIEW_STATUS.DRAFT);
    expect(normalizeReviewStatus('任意值')).toBe(REVIEW_STATUS.DRAFT);
  });

  it('isReviewedStatus / isVoidedStatus', () => {
    expect(isReviewedStatus('reviewed')).toBe(true);
    expect(isReviewedStatus('voided')).toBe(false);
    expect(isVoidedStatus('voided')).toBe(true);
    expect(isVoidedStatus('reviewed')).toBe(false);
  });

  it('isEffectiveSupplierPaymentStatus：空/completed/reviewed 有效，voided/cancelled 无效', () => {
    expect(isEffectiveSupplierPaymentStatus(null)).toBe(true);
    expect(isEffectiveSupplierPaymentStatus(undefined)).toBe(true);
    expect(isEffectiveSupplierPaymentStatus('completed')).toBe(true);
    expect(isEffectiveSupplierPaymentStatus('reviewed')).toBe(true);
    expect(isEffectiveSupplierPaymentStatus('voided')).toBe(false);
    expect(isEffectiveSupplierPaymentStatus('cancelled')).toBe(false);
  });

  it('isEffectiveClientPaymentStatus：completed/reviewed 有效', () => {
    expect(isEffectiveClientPaymentStatus('completed')).toBe(true);
    expect(isEffectiveClientPaymentStatus('reviewed')).toBe(true);
    expect(isEffectiveClientPaymentStatus('pending')).toBe(false);
    expect(isEffectiveClientPaymentStatus('voided')).toBe(false);
  });

  it('合法流转：draft→reviewed、reviewed→draft、draft→voided、reviewed→voided', () => {
    expect(validateStatusTransition('draft', 'reviewed').valid).toBe(true);
    expect(validateStatusTransition('reviewed', 'draft').valid).toBe(true);
    expect(validateStatusTransition('draft', 'voided').valid).toBe(true);
    expect(validateStatusTransition('reviewed', 'voided').valid).toBe(true);
  });

  it('非法流转：voided 不可变更、状态未变更、目标不合法', () => {
    expect(validateStatusTransition('voided', 'reviewed').valid).toBe(false);
    expect(validateStatusTransition('voided', 'draft').valid).toBe(false);
    expect(validateStatusTransition('draft', 'draft').valid).toBe(false);
    expect(validateStatusTransition('draft', 'invalid_target').valid).toBe(false);
  });
});
