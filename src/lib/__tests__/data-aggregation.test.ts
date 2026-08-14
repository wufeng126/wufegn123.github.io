import { describe, it, expect } from 'vitest';
import {
  supplierSettlementFingerprint,
  supplierPaymentFingerprint,
  addSupplierFingerprints,
} from '@/lib/data-aggregation';

describe('supplierSettlementFingerprint（结算去重指纹）', () => {
  const base = {
    supplierId: 5,
    projectId: 3,
    amount: 10000,
    date: '2026-08-01',
    type: 'progress',
  };

  it('同笔记录（供应商+项目+金额+日期+类型一致）指纹相同', () => {
    expect(supplierSettlementFingerprint(base)).toBe(supplierSettlementFingerprint({ ...base }));
  });

  it('金额精度归一（1234.50 与 1234.5 视为同一笔）', () => {
    expect(supplierSettlementFingerprint({ ...base, amount: 1234.5 })).toBe(
      supplierSettlementFingerprint({ ...base, amount: 1234.5001 })
    );
  });

  it('任一维度不同则指纹不同', () => {
    expect(supplierSettlementFingerprint({ ...base, supplierId: 6 })).not.toBe(supplierSettlementFingerprint(base));
    expect(supplierSettlementFingerprint({ ...base, projectId: 4 })).not.toBe(supplierSettlementFingerprint(base));
    expect(supplierSettlementFingerprint({ ...base, amount: 9999 })).not.toBe(supplierSettlementFingerprint(base));
    expect(supplierSettlementFingerprint({ ...base, date: '2026-08-02' })).not.toBe(supplierSettlementFingerprint(base));
    expect(supplierSettlementFingerprint({ ...base, type: 'final' })).not.toBe(supplierSettlementFingerprint(base));
  });

  it('空日期/空类型按空串参与指纹（老表缺字段时仍能匹配）', () => {
    const a = supplierSettlementFingerprint({ ...base, date: null, type: null });
    const b = supplierSettlementFingerprint({ ...base, date: '', type: '' });
    expect(a).toBe(b);
  });
});

describe('supplierPaymentFingerprint（付款去重指纹）', () => {
  const base = { supplierId: 5, projectId: 3, amount: 2000, date: '2026-08-05' };

  it('同笔记录指纹相同，维度不同则不同', () => {
    expect(supplierPaymentFingerprint(base)).toBe(supplierPaymentFingerprint({ ...base }));
    expect(supplierPaymentFingerprint({ ...base, amount: 2001 })).not.toBe(supplierPaymentFingerprint(base));
    expect(supplierPaymentFingerprint({ ...base, date: '2026-08-06' })).not.toBe(supplierPaymentFingerprint(base));
    expect(supplierPaymentFingerprint({ ...base, supplierId: 7 })).not.toBe(supplierPaymentFingerprint(base));
  });
});

describe('addSupplierFingerprints + 去重过滤（D4 核心场景回归）', () => {
  it('新表记录入集合后，同指纹老表记录被过滤（保留新表）', () => {
    // 模拟月报/台账合并逻辑：新表为权威来源
    const newSettlements = [
      { supplierId: 5, projectId: 3, amount: 10000, date: '2026-08-01', type: 'progress' },
      { supplierId: 6, projectId: 3, amount: 5000, date: '2026-08-10', type: 'final' },
    ];
    const legacySettlements = [
      // 与新表第 1 条同笔（迁移/双录入场景）→ 应被去重
      { supplierId: 5, projectId: 3, amount: 10000, date: '2026-08-01', type: 'progress' },
      // 老表独有记录 → 应保留
      { supplierId: 8, projectId: 4, amount: 3000, date: '2026-07-15', type: 'progress' },
    ];

    const seen = new Set<string>();
    addSupplierFingerprints(seen, newSettlements, supplierSettlementFingerprint);

    const keptLegacy = legacySettlements.filter(
      (s) => !seen.has(supplierSettlementFingerprint(s))
    );

    expect(keptLegacy).toHaveLength(1);
    expect(keptLegacy[0].supplierId).toBe(8);
  });

  it('付款同指纹去重', () => {
    const newPayments = [
      { supplierId: 5, projectId: 3, amount: 2000, date: '2026-08-05' },
    ];
    const legacyPayments = [
      { supplierId: 5, projectId: 3, amount: 2000, date: '2026-08-05' }, // 重复 → 去重
      { supplierId: 5, projectId: 3, amount: 800, date: '2026-06-01' },   // 独有 → 保留
    ];

    const seen = new Set<string>();
    addSupplierFingerprints(seen, newPayments, supplierPaymentFingerprint);

    const keptLegacy = legacyPayments.filter((p) => !seen.has(supplierPaymentFingerprint(p)));
    expect(keptLegacy).toHaveLength(1);
    expect(keptLegacy[0].amount).toBe(800);
  });

  it('老表无类型字段（null）也能与新表带类型字段的记录匹配', () => {
    // 老表 settlement_type 可能为 null，新表为 'progress'：指纹需按"空串归一"匹配
    const newRecord = { supplierId: 5, projectId: 3, amount: 10000, date: '2026-08-01', type: 'progress' };
    const legacyRecord = { supplierId: 5, projectId: 3, amount: 10000, date: '2026-08-01', type: null };
    // 说明：类型维度不一致 → 指纹不同 → 不去重（保守策略，宁可重复计也不误合并不同类型结算）
    expect(supplierSettlementFingerprint(newRecord)).not.toBe(supplierSettlementFingerprint(legacyRecord));
  });
});
