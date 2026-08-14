import { describe, it, expect } from 'vitest';
import { buildSubitemMonthlyReconciliation, RECONCILIATION_RATIO_WARNING_THRESHOLD } from '@/lib/subitem-reconciliation';

const baseSubitems = [
  { id: 1, subitem_name: '模板工程', unit: 'm2', budget_quantity: '1000', contract_price: '50', limit_price: '45' },
  { id: 2, subitem_name: '钢筋工程', unit: 't', budget_quantity: '500', contract_price: '4000', limit_price: '3800' },
  { id: 3, subitem_name: '无价格分项', unit: '项', budget_quantity: '10', contract_price: null, limit_price: null },
];

describe('buildSubitemMonthlyReconciliation', () => {
  it('基础勾稽：本月报量×合同价 vs 本月结算×实际单价，差异正确', () => {
    const { rows, summary } = buildSubitemMonthlyReconciliation({
      subitems: [baseSubitems[0]],
      reports: [{ subitem_id: 1, year_month: '2026-06', report_quantity: '100' }],
      settlements: [{ subitem_id: 1, year_month: '2026-06', completed_quantity: '80', unit_price: '45' }],
      payments: [],
      yearMonth: '2026-06',
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.month_report_quantity).toBe(100);
    expect(row.month_report_amount).toBe(5000); // 100 × 50
    expect(row.month_settlement_quantity).toBe(80);
    expect(row.month_settlement_amount).toBe(3600); // 80 × 45
    expect(row.month_difference).toBe(1400);
    expect(row.cumulative_difference).toBe(1400);
    expect(summary.month_report_amount).toBe(5000);
    expect(summary.month_settlement_amount).toBe(3600);
    expect(summary.month_difference).toBe(1400);
  });

  it('累计口径：只统计目标月及之前的记录', () => {
    const { rows, summary } = buildSubitemMonthlyReconciliation({
      subitems: [baseSubitems[0]],
      reports: [
        { subitem_id: 1, year_month: '2026-05', report_quantity: '300' },
        { subitem_id: 1, year_month: '2026-06', report_quantity: '100' },
        { subitem_id: 1, year_month: '2026-07', report_quantity: '200' }, // 未来月不应计入
      ],
      settlements: [
        { subitem_id: 1, year_month: '2026-04', completed_quantity: '200', unit_price: '45' },
        { subitem_id: 1, year_month: '2026-06', completed_quantity: '80', unit_price: '45' },
      ],
      payments: [],
      yearMonth: '2026-06',
    });

    const row = rows[0];
    expect(row.month_report_quantity).toBe(100);
    expect(row.cumulative_report_quantity).toBe(400); // 300 + 100
    expect(row.cumulative_report_amount).toBe(20000);
    expect(row.month_settlement_quantity).toBe(80);
    expect(row.cumulative_settlement_quantity).toBe(280); // 200 + 80
    expect(row.cumulative_settlement_amount).toBe(12600);
  });

  it('结算单价退回链：记录单价 → 分项限价 → 分项合同价', () => {
    // 无记录单价，用限价 45
    const rowWithLimit = buildSubitemMonthlyReconciliation({
      subitems: [baseSubitems[0]],
      reports: [],
      settlements: [{ subitem_id: 1, year_month: '2026-06', completed_quantity: '100', unit_price: null }],
      payments: [],
      yearMonth: '2026-06',
    }).rows[0];
    expect(rowWithLimit.month_settlement_amount).toBe(4500); // 100 × 45

    // 无限价，退回合同价 50
    const rowWithContract = buildSubitemMonthlyReconciliation({
      subitems: [{ ...baseSubitems[0], limit_price: null }],
      reports: [],
      settlements: [{ subitem_id: 1, year_month: '2026-06', completed_quantity: '100', unit_price: null }],
      payments: [],
      yearMonth: '2026-06',
    }).rows[0];
    expect(rowWithContract.month_settlement_amount).toBe(5000); // 100 × 50

    // 无任何价格，为 0
    const rowNoPrice = buildSubitemMonthlyReconciliation({
      subitems: [baseSubitems[2]],
      reports: [],
      settlements: [{ subitem_id: 3, year_month: '2026-06', completed_quantity: '100', unit_price: null }],
      payments: [],
      yearMonth: '2026-06',
    }).rows[0];
    expect(rowNoPrice.month_settlement_amount).toBe(0);
  });

  it('回款只进项目汇总：按月过滤 + 只计有效状态 + 应收余额', () => {
    const { summary } = buildSubitemMonthlyReconciliation({
      subitems: [baseSubitems[0]],
      reports: [
        { subitem_id: 1, year_month: '2026-05', report_quantity: '200' },
        { subitem_id: 1, year_month: '2026-06', report_quantity: '100' },
      ],
      settlements: [],
      payments: [
        { payment_amount: '3000', payment_date: '2026-05-10', effective: true },
        { payment_amount: '2000', payment_date: '2026-06-15', effective: true },
        { payment_amount: '9999', payment_date: '2026-06-20', effective: false }, // pending/未生效不计
        { payment_amount: '5000', payment_date: '2026-07-01', effective: true }, // 未来月不计
      ],
      yearMonth: '2026-06',
    });

    expect(summary.month_payment_amount).toBe(2000);
    expect(summary.cumulative_payment_amount).toBe(5000); // 3000 + 2000
    // 累计报量金额 = 300 × 50 = 15000
    expect(summary.cumulative_report_amount).toBe(15000);
    expect(summary.receivable_amount).toBe(10000); // 15000 − 5000
  });

  it('风险标记：超预算 / 少报多结 / 差异率超阈值', () => {
    const { rows, summary } = buildSubitemMonthlyReconciliation({
      subitems: [baseSubitems[0], baseSubitems[1]],
      reports: [
        { subitem_id: 1, year_month: '2026-05', report_quantity: '800' },
        { subitem_id: 1, year_month: '2026-06', report_quantity: '300' }, // 累计 1100 > 预算 1000
        { subitem_id: 2, year_month: '2026-06', report_quantity: '100' },
      ],
      settlements: [
        { subitem_id: 1, year_month: '2026-06', completed_quantity: '50', unit_price: '45' },
        // 分项2：本月结算 150 > 报量 100 → 少报多结
        { subitem_id: 2, year_month: '2026-06', completed_quantity: '150', unit_price: '3800' },
      ],
      payments: [],
      yearMonth: '2026-06',
    });

    const row1 = rows[0];
    expect(row1.over_budget).toBe(true); // 累计 1100 > 1000
    expect(row1.settlement_over_report).toBe(false); // 50 < 300
    // 差异率：|15000 − 2250| / 15000 = 85% > 30%
    expect(row1.difference_ratio).toBeGreaterThan(RECONCILIATION_RATIO_WARNING_THRESHOLD);
    expect(row1.ratio_warning).toBe(true);

    const row2 = rows[1];
    expect(row2.over_budget).toBe(false);
    expect(row2.settlement_over_report).toBe(true); // 150 > 100
    // 分项2 差异率 = |400000 − 570000| / 400000 = 42.5% > 30% → 应为 true
    expect(row2.difference_ratio).toBe(42.5);
    expect(row2.ratio_warning).toBe(true);

    expect(summary.over_budget_count).toBe(1);
    expect(summary.settlement_over_report_count).toBe(1);
    expect(summary.ratio_warning_count).toBe(2);
  });

  it('差异率为 null：本月报量金额为 0 时不判差异', () => {
    const { rows } = buildSubitemMonthlyReconciliation({
      subitems: [baseSubitems[0]],
      reports: [],
      settlements: [{ subitem_id: 1, year_month: '2026-06', completed_quantity: '10', unit_price: '45' }],
      payments: [],
      yearMonth: '2026-06',
    });

    expect(rows[0].month_report_amount).toBe(0);
    expect(rows[0].difference_ratio).toBeNull();
    expect(rows[0].ratio_warning).toBe(false);
  });

  it('无任何记录时输出零值行，不报错', () => {
    const { rows, summary } = buildSubitemMonthlyReconciliation({
      subitems: baseSubitems,
      reports: [],
      settlements: [],
      payments: [],
      yearMonth: '2026-06',
    });

    expect(rows).toHaveLength(3);
    rows.forEach((row) => {
      expect(row.month_report_quantity).toBe(0);
      expect(row.month_settlement_amount).toBe(0);
      expect(row.over_budget).toBe(false);
      expect(row.ratio_warning).toBe(false);
    });
    expect(summary.month_payment_amount).toBe(0);
    expect(summary.receivable_amount).toBe(0);
    expect(summary.over_budget_count).toBe(0);
  });
});
