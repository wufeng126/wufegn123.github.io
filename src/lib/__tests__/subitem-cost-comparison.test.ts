import { describe, it, expect } from 'vitest';
import { buildSubitemCostComparison } from '@/lib/subitem-cost-comparison';

const baseSubitems = [
  {
    id: 1,
    project_id: 10,
    project_name: '项目A',
    subitem_name: '模板工程',
    unit: 'm2',
    budget_quantity: '1000',
    completed_quantity: '600',
    settlement_quantity: '560',
    contract_price: '50',
    limit_price: '45',
  },
  {
    id: 2,
    project_id: 10,
    project_name: '项目A',
    subitem_name: '钢筋工程',
    unit: 't',
    budget_quantity: '500',
    completed_quantity: '300',
    settlement_quantity: '320',
    contract_price: '4000',
    limit_price: '3800',
  },
];

describe('buildSubitemCostComparison', () => {
  it('基础三层对比：合同收入/限价成本/实际成本 + 毛利', () => {
    const { rows, summary } = buildSubitemCostComparison({
      subitems: [baseSubitems[0]],
      settlements: [
        { subitem_id: 1, completed_quantity: '560', unit_price: '48' },
      ],
    });

    const row = rows[0];
    expect(row.contract_revenue).toBe(30000); // 600 × 50
    expect(row.limit_cost).toBe(27000); // 600 × 45
    expect(row.actual_cost).toBe(26880); // 560 × 48
    expect(row.actual_gross_profit).toBe(3120); // 30000 − 26880
    expect(row.expected_gross_profit).toBe(3000); // 30000 − 27000
    expect(row.actual_gross_profit_rate).toBe(10.4); // 3120/30000
    expect(row.actual_unit_price).toBe(48);
    expect(row.completion_rate).toBe(60); // 600/1000
    expect(row.over_limit).toBe(true); // 48 > 45
    expect(row.negative_profit).toBe(false);

    expect(summary.contract_revenue).toBe(30000);
    expect(summary.actual_cost).toBe(26880);
    expect(summary.actual_gross_profit).toBe(3120);
    expect(summary.over_limit_count).toBe(1);
    expect(summary.negative_profit_count).toBe(0);
  });

  it('结算单价退回链：记录单价 → 分项限价 → 合同价', () => {
    // 无记录单价 → 用限价 45
    const rowWithLimit = buildSubitemCostComparison({
      subitems: [{ ...baseSubitems[0], settlement_quantity: '100' }],
      settlements: [{ subitem_id: 1, completed_quantity: '100', unit_price: null }],
    }).rows[0];
    expect(rowWithLimit.actual_cost).toBe(4500);
    expect(rowWithLimit.actual_unit_price).toBe(45);
    expect(rowWithLimit.over_limit).toBe(false); // 45 = 限价，不超

    // 无限价 → 退回合同价 50
    const rowWithContract = buildSubitemCostComparison({
      subitems: [{ ...baseSubitems[0], limit_price: null, settlement_quantity: '100' }],
      settlements: [{ subitem_id: 1, completed_quantity: '100', unit_price: null }],
    }).rows[0];
    expect(rowWithContract.actual_cost).toBe(5000);
    expect(rowWithContract.over_limit).toBe(false); // 限价为 null 不判超限
  });

  it('负毛利标记：实际成本 > 合同收入', () => {
    const { rows, summary } = buildSubitemCostComparison({
      subitems: [baseSubitems[1]],
      settlements: [
        { subitem_id: 2, completed_quantity: '320', unit_price: '3900' }, // 320×3900=1248000 > 300×4000=1200000
      ],
    });

    const row = rows[0];
    expect(row.contract_revenue).toBe(1200000);
    expect(row.actual_cost).toBe(1248000);
    expect(row.actual_gross_profit).toBe(-48000);
    expect(row.negative_profit).toBe(true);
    expect(row.over_limit).toBe(true); // 3900 > 3800
    expect(summary.negative_profit_count).toBe(1);
  });

  it('无结算量：实际成本 0，不判超限价', () => {
    const { rows } = buildSubitemCostComparison({
      subitems: [{ ...baseSubitems[0], settlement_quantity: '0' }],
      settlements: [],
    });

    const row = rows[0];
    expect(row.actual_cost).toBe(0);
    expect(row.actual_unit_price).toBeNull();
    expect(row.over_limit).toBe(false);
    expect(row.actual_gross_profit).toBe(30000);
  });

  it('多分项汇总：合计与风险计数', () => {
    const { rows, summary } = buildSubitemCostComparison({
      subitems: baseSubitems,
      settlements: [
        { subitem_id: 1, completed_quantity: '560', unit_price: '48' },  // 超限价
        { subitem_id: 2, completed_quantity: '320', unit_price: '3900' }, // 超限价 + 负毛利
      ],
    });

    expect(rows).toHaveLength(2);
    expect(summary.contract_revenue).toBe(1200000 + 30000); // 1230000
    expect(summary.actual_cost).toBe(26880 + 1248000); // 1274880
    expect(summary.actual_gross_profit).toBe(1230000 - 1274880); // -44880
    expect(summary.over_limit_count).toBe(2);
    expect(summary.negative_profit_count).toBe(1);
  });

  it('预算量为 0：完成率为 null，不报错', () => {
    const { rows } = buildSubitemCostComparison({
      subitems: [{ ...baseSubitems[0], budget_quantity: '0' }],
      settlements: [],
    });

    expect(rows[0].completion_rate).toBeNull();
    expect(rows[0].contract_revenue).toBe(30000);
  });

  it('无分项时返回空', () => {
    const { rows, summary } = buildSubitemCostComparison({ subitems: [], settlements: [] });
    expect(rows).toHaveLength(0);
    expect(summary.actual_gross_profit).toBe(0);
    expect(summary.over_limit_count).toBe(0);
  });
});
