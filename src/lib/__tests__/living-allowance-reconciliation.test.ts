import { describe, expect, it } from 'vitest';
import {
  buildLivingAllowanceReconciliation,
  hasPersistedLivingAllowanceMatch,
} from '@/lib/living-allowance-reconciliation';

const salary = (advancePay = 300) => ({
  id: 101,
  worker_id: 1,
  project_id: 10,
  year_month: '2026-08',
  advance_pay: advancePay,
  net_pay: 1700,
});

const allowance = (amount = 300, id = 201) => ({
  id,
  receipt_item_id: null,
  worker_id: 1,
  project_id: 10,
  year_month: '2026-08',
  amount,
  status: 'deducted',
  deducted_salary_id: 101,
});

function reconcile(overrides: Partial<Parameters<typeof buildLivingAllowanceReconciliation>[0]> = {}) {
  return buildLivingAllowanceReconciliation({
    workerId: 1,
    projectId: 10,
    itemId: 501,
    itemAmount: 300,
    paymentDate: '2026-08-15',
    receiptDate: '2026-08-15',
    existingRecordId: null,
    existingSalaryId: null,
    persistedMatchStatus: 'unmatched',
    salaryRecords: [salary()],
    allowanceRecords: [allowance()],
    occupiedRecordIds: new Set<number>(),
    ...overrides,
  });
}

describe('生活费回单核对', () => {
  it('找不到对应工资时标记为 salary_not_found', () => {
    const result = reconcile({ salaryRecords: [] });

    expect(result.salary).toBeNull();
    expect(result.matchStatus).toBe('salary_not_found');
  });

  it('同一工人同月存在多条工资时标记为 salary_duplicate', () => {
    const result = reconcile({
      salaryRecords: [salary(300), { ...salary(300), id: 102 }],
    });

    expect(result.salaryDuplicate).toBe(true);
    expect(result.salary).toBeNull();
    expect(result.matchStatus).toBe('salary_duplicate');
  });

  it('回单金额和生活费台账、工资借支都一致时核对通过', () => {
    const result = reconcile();

    expect(result.allowanceRecord?.id).toBe(201);
    expect(result.salary?.id).toBe(101);
    expect(result.allowanceDifference).toBe(0);
    expect(result.salaryDifference).toBe(0);
    expect(result.matchStatus).toBe('amount_matched');
  });

  it('回单金额或月度生活费合计与工资借支不一致时标记为 amount_mismatch', () => {
    const result = reconcile({
      itemAmount: 280,
      allowanceRecords: [allowance(280)],
    });

    expect(result.allowanceDifference).toBe(0);
    expect(result.salaryCoverageDifference).toBe(-20);
    expect(result.matchStatus).toBe('amount_mismatch');
  });

  it('金额差异正好为 0.01 元时仍视为一致，超过 0.01 元才提示差异', () => {
    const boundaryResult = reconcile({
      itemAmount: 100,
      salaryRecords: [salary(100.01)],
      allowanceRecords: [allowance(100.01)],
    });
    const overBoundaryResult = reconcile({
      itemAmount: 100,
      salaryRecords: [salary(100.02)],
      allowanceRecords: [allowance(100.02)],
    });

    expect(boundaryResult.matchStatus).toBe('amount_matched');
    expect(overBoundaryResult.matchStatus).toBe('amount_mismatch');
  });

  it('没有生活费台账时标记为 record_not_found', () => {
    const result = reconcile({ allowanceRecords: [] });

    expect(result.allowanceRecord).toBeNull();
    expect(result.matchStatus).toBe('record_not_found');
  });

  it('生活费台账已被其他回单明细占用时不能重复匹配', () => {
    const result = reconcile({ occupiedRecordIds: new Set([201]) });

    expect(result.allowanceRecord).toBeNull();
    expect(result.matchStatus).toBe('allowance_record_not_found');
  });

  it('旧数据已有历史关联时，即使状态异常也视为已完成核对', () => {
    expect(hasPersistedLivingAllowanceMatch({
      matchStatus: 'salary_not_found',
      matchedRecordId: 201,
      matchedSalaryId: null,
    })).toBe(true);
    expect(hasPersistedLivingAllowanceMatch({
      matchStatus: 'unmatched',
      matchedRecordId: null,
      matchedSalaryId: 101,
    })).toBe(true);
    expect(hasPersistedLivingAllowanceMatch({
      matchStatus: 'salary_not_found',
      matchedRecordId: null,
      matchedSalaryId: null,
    })).toBe(false);
  });
});
