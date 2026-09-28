import {
  deriveLivingAllowanceReceiptMatchStatus,
  isMoneyWithinCentTolerance,
  isFinalLivingAllowanceMatchStatus,
  normalizeYearMonth,
  parseMoney,
  roundMoney,
  yearMonthFromDate,
} from '@/lib/living-allowance';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

type QueryResult<T> = {
  data: T[] | null;
  error: {
    code?: string;
    message?: string;
  } | null;
};

type SingleQueryResult<T> = {
  data: T | null;
  error: {
    code?: string;
    message?: string;
  } | null;
};

export type ReconciliationSalary = {
  id: number | string;
  worker_id: number | string | null;
  project_id: number | string | null;
  year_month: string | null;
  advance_pay?: unknown;
  net_pay?: unknown;
};

export type ReconciliationAllowanceRecord = {
  id: number | string;
  receipt_item_id?: number | string | null;
  worker_id: number | string | null;
  project_id: number | string | null;
  year_month: string | null;
  amount: unknown;
  status?: string | null;
  deducted_salary_id?: number | string | null;
};

export type LivingAllowanceReconciliationResult = {
  yearMonth: string;
  receiptAmount: number;
  salaryCandidates: ReconciliationSalary[];
  salary: ReconciliationSalary | null;
  salaryDuplicate: boolean;
  allowanceRecords: ReconciliationAllowanceRecord[];
  allowanceRecord: ReconciliationAllowanceRecord | null;
  allowanceRecordAmount: number | null;
  allowanceMonthTotal: number;
  salaryAdvancePay: number | null;
  allowanceDifference: number | null;
  allowanceMonthDifference: number;
  salaryDifference: number | null;
  salaryCoverageDifference: number | null;
  matchStatus: string;
};

function normalizeId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function hasPersistedLivingAllowanceMatch(params: {
  matchStatus?: unknown;
  matchedRecordId?: unknown;
  matchedSalaryId?: unknown;
}) {
  return isFinalLivingAllowanceMatchStatus(params.matchStatus)
    || normalizeId(params.matchedRecordId) !== null
    || normalizeId(params.matchedSalaryId) !== null;
}

export function matchesLivingAllowanceScope(
  record: { worker_id: unknown; project_id: unknown; year_month: unknown },
  workerId: number | null,
  projectId: number | null,
  yearMonth: string,
) {
  if (!workerId || normalizeId(record.worker_id) !== workerId) return false;
  if (normalizeYearMonth(String(record.year_month || '')) !== yearMonth) return false;

  const recordProjectId = normalizeId(record.project_id);
  return projectId === null ? recordProjectId === null : recordProjectId === projectId;
}

export function chooseLivingAllowanceRecord(params: {
  records: ReconciliationAllowanceRecord[];
  itemId: number;
  amount: number;
  existingRecordId: number | null;
  occupiedRecordIds: Set<number>;
}) {
  const { records, itemId, amount, existingRecordId, occupiedRecordIds } = params;
  const existingRecord = records.find(record => (
    normalizeId(record.id) === existingRecordId
    && !occupiedRecordIds.has(Number(record.id))
  ));
  if (existingRecord) return existingRecord;

  const legacyLinkedRecord = records.find(record => (
    normalizeId(record.receipt_item_id) === itemId
    && !occupiedRecordIds.has(Number(record.id))
  ));
  if (legacyLinkedRecord) return legacyLinkedRecord;

  const availableRecords = records.filter(record => !occupiedRecordIds.has(Number(record.id)));
  const amountMatches = availableRecords.filter(record => (
    isMoneyWithinCentTolerance(record.amount, amount)
  ));
  if (amountMatches.length === 1) return amountMatches[0];
  if (amountMatches.length === 0 && availableRecords.length === 1) return availableRecords[0];
  return null;
}

export function removeMatchedSalaryIdColumn(select: string) {
  return select
    .split(',')
    .filter((field) => field.trim() !== 'matched_salary_id')
    .join(',');
}

export async function queryReceiptItemsWithCompatibility<T extends Record<string, unknown>>(
  buildQuery: (select: string) => unknown,
  select: string,
) {
  const preferred = await buildQuery(select) as QueryResult<T>;
  if (!preferred.error || !isMissingMatchedSalaryIdError(preferred.error)) {
    return {
      ...preferred,
      data: preferred.data || [],
      supportsMatchedSalaryId: !preferred.error,
    };
  }

  const legacy = await buildQuery(removeMatchedSalaryIdColumn(select)) as QueryResult<T>;
  if (legacy.error) {
    return {
      ...legacy,
      data: legacy.data || [],
      supportsMatchedSalaryId: false,
    };
  }

  return {
    ...legacy,
    data: (legacy.data || []).map((row) => ({
      ...row,
      matched_salary_id: null,
    })),
    supportsMatchedSalaryId: false,
  };
}

export async function queryReceiptItemWithCompatibility<T extends Record<string, unknown>>(
  buildQuery: (select: string) => unknown,
  select: string,
) {
  const preferred = await buildQuery(select) as SingleQueryResult<T>;
  if (!preferred.error || !isMissingMatchedSalaryIdError(preferred.error)) {
    return {
      ...preferred,
      supportsMatchedSalaryId: !preferred.error,
    };
  }

  const legacy = await buildQuery(removeMatchedSalaryIdColumn(select)) as SingleQueryResult<T>;
  if (legacy.error || !legacy.data) {
    return {
      ...legacy,
      supportsMatchedSalaryId: false,
    };
  }

  return {
    ...legacy,
    data: {
      ...legacy.data,
      matched_salary_id: null,
    },
    supportsMatchedSalaryId: false,
  };
}

export async function updateReceiptItemWithCompatibility(
  client: SupabaseClient,
  itemId: number,
  payload: Record<string, unknown>,
) {
  const preferred = await client
    .from('living_allowance_receipt_items')
    .update(payload)
    .eq('id', itemId);

  if (!preferred.error || !isMissingMatchedSalaryIdError(preferred.error)) {
    return preferred;
  }

  const { matched_salary_id: _matchedSalaryId, ...legacyPayload } = payload;
  return client
    .from('living_allowance_receipt_items')
    .update(legacyPayload)
    .eq('id', itemId);
}

function signedDifference(left: number, right: number) {
  return roundMoney(left - right);
}

export function buildLivingAllowanceReconciliation(params: {
  workerId: number | null;
  projectId: number | null;
  itemId: number;
  itemAmount: unknown;
  paymentDate?: string | null;
  receiptDate?: string | null;
  existingRecordId: number | null;
  existingSalaryId: number | null;
  persistedMatchStatus?: string | null;
  salaryRecords: ReconciliationSalary[];
  allowanceRecords: ReconciliationAllowanceRecord[];
  occupiedRecordIds: Set<number>;
  yearMonth?: string | null;
}) {
  const yearMonth = normalizeYearMonth(params.yearMonth)
    || normalizeYearMonth(params.paymentDate)
    || yearMonthFromDate(params.receiptDate);
  const receiptAmount = parseMoney(params.itemAmount);
  const allowanceRecords = params.allowanceRecords.filter(record => (
    matchesLivingAllowanceScope(record, params.workerId, params.projectId, yearMonth)
  ));
  const salaryCandidates = params.salaryRecords.filter(record => (
    matchesLivingAllowanceScope(record, params.workerId, params.projectId, yearMonth)
  ));
  const allowanceRecord = chooseLivingAllowanceRecord({
    records: allowanceRecords,
    itemId: params.itemId,
    amount: receiptAmount,
    existingRecordId: params.existingRecordId,
    occupiedRecordIds: params.occupiedRecordIds,
  });
  const salaryDuplicate = salaryCandidates.length > 1;
  const matchedSalaryId = normalizeId(
    (params.salaryRecords.find(record => normalizeId(record.id) === params.existingSalaryId) || {}).id,
  );
  const salary = salaryDuplicate
    ? null
    : salaryCandidates.find(record => normalizeId(record.id) === matchedSalaryId)
      || salaryCandidates[0]
      || null;
  const allowanceRecordAmount = allowanceRecord ? parseMoney(allowanceRecord.amount) : null;
  const allowanceMonthTotal = roundMoney(
    allowanceRecords.reduce((sum, record) => sum + parseMoney(record.amount), 0),
  );
  const salaryAdvancePay = salary ? parseMoney(salary.advance_pay) : null;
  const derivedMatchStatus = params.workerId
    ? deriveLivingAllowanceReceiptMatchStatus({
      salaryCount: salaryCandidates.length,
      allowanceRecordCount: allowanceRecords.length,
      allowanceRecordId: allowanceRecord ? Number(allowanceRecord.id) : null,
      allowanceRecordAmount,
      receiptAmount,
      allowanceMonthTotal,
      salaryAdvancePay,
    })
    : String(params.persistedMatchStatus || 'unmatched') === 'unmatched'
      ? 'manual_required'
      : String(params.persistedMatchStatus || 'manual_required');

  return {
    yearMonth,
    receiptAmount,
    salaryCandidates,
    salary,
    salaryDuplicate,
    allowanceRecords,
    allowanceRecord,
    allowanceRecordAmount,
    allowanceMonthTotal,
    salaryAdvancePay,
    allowanceDifference: allowanceRecordAmount === null
      ? null
      : signedDifference(receiptAmount, allowanceRecordAmount),
    allowanceMonthDifference: signedDifference(receiptAmount, allowanceMonthTotal),
    salaryDifference: salaryAdvancePay === null
      ? null
      : signedDifference(receiptAmount, salaryAdvancePay),
    salaryCoverageDifference: salaryAdvancePay === null
      ? null
      : signedDifference(allowanceMonthTotal, salaryAdvancePay),
    matchStatus: derivedMatchStatus,
  } satisfies LivingAllowanceReconciliationResult;
}

export function isMissingMatchedSalaryIdError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || '');
  const message = String((error as { message?: unknown } | null)?.message || '');
  return code === '42703'
    || (/matched_salary_id/i.test(message)
      && /(column|schema cache|does not exist|could not find)/i.test(message));
}
