import { getSupabaseClient } from '@/storage/database/supabase-client';

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

export type PendingLivingAllowanceRecord = {
  id: number;
  amount: unknown;
};

export type SalaryForAllowanceSync = {
  id: number;
  worker_id: number;
  project_id: number | null;
  year_month: string;
  gross_pay?: unknown;
  income_tax?: unknown;
  advance_pay?: unknown;
  labor_insurance?: unknown;
  fine?: unknown;
};

export function parseMoney(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeYearMonth(value?: string | null): string {
  const match = /^(\d{4})-(\d{1,2})/.exec(String(value || '').trim());
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}`;
}

export function yearMonthFromDate(value?: string | null): string {
  return normalizeYearMonth(value);
}

export async function getPendingLivingAllowanceRecords(
  client: SupabaseClient,
  params: { workerId: number; projectId?: number | null; yearMonth: string }
): Promise<PendingLivingAllowanceRecord[]> {
  let query = client
    .from('living_allowance_records')
    .select('id, amount')
    .eq('worker_id', params.workerId)
    .eq('year_month', params.yearMonth)
    .neq('status', 'deducted')
    .is('deducted_salary_id', null);

  if (params.projectId != null) {
    query = query.eq('project_id', params.projectId);
  }

  const { data, error } = await query;

  if (error) {
    // 老库未跑迁移时不阻断工资录入，避免影响当前正在使用的系统。
    if (error.code === '42P01' || /living_allowance_records/i.test(error.message || '')) {
      console.warn('[LivingAllowance] table not ready, skip auto deduction:', error.message);
      return [];
    }
    throw new Error(`查询生活费台账失败: ${error.message}`);
  }

  return (data || []) as PendingLivingAllowanceRecord[];
}

export async function getPendingLivingAllowanceTotal(
  client: SupabaseClient,
  params: { workerId: number; projectId?: number | null; yearMonth: string }
) {
  const records = await getPendingLivingAllowanceRecords(client, params);
  const total = records.reduce((sum, record) => sum + parseMoney(record.amount), 0);
  return {
    records,
    total: Math.round(total * 100) / 100,
  };
}

export async function markLivingAllowancesDeducted(
  client: SupabaseClient,
  params: { recordIds: number[]; salaryId: number }
) {
  if (params.recordIds.length === 0) return;

  const { data: records, error: fetchError } = await client
    .from('living_allowance_records')
    .select('id, amount')
    .in('id', params.recordIds);

  if (fetchError) {
    throw new Error(`查询待扣生活费失败: ${fetchError.message}`);
  }

  for (const record of records || []) {
    const { error } = await client
      .from('living_allowance_records')
      .update({
        status: 'deducted',
        deducted_salary_id: params.salaryId,
        deducted_amount: parseMoney((record as any).amount),
        updated_at: new Date().toISOString(),
      })
      .eq('id', (record as any).id);

    if (error) {
      throw new Error(`更新生活费扣减状态失败: ${error.message}`);
    }
  }
}

export function calculateNetPayWithAdvance(salary: SalaryForAllowanceSync, nextAdvancePay: number) {
  const grossPay = parseMoney(salary.gross_pay);
  const incomeTax = parseMoney(salary.income_tax);
  const laborInsurance = parseMoney(salary.labor_insurance);
  const fine = parseMoney(salary.fine);
  return Math.round((grossPay - incomeTax - nextAdvancePay - laborInsurance - fine) * 100) / 100;
}

export async function syncLivingAllowancesToSalary(
  client: SupabaseClient,
  salary: SalaryForAllowanceSync
) {
  const yearMonth = normalizeYearMonth(salary.year_month);
  if (!salary.worker_id || !yearMonth) {
    return { synced: false, amount: 0, linkedCount: 0, addedAdvancePay: 0 };
  }

  const pending = await getPendingLivingAllowanceTotal(client, {
    workerId: Number(salary.worker_id),
    projectId: salary.project_id == null ? null : Number(salary.project_id),
    yearMonth,
  });

  if (pending.total <= 0 || pending.records.length === 0) {
    return { synced: false, amount: 0, linkedCount: 0, addedAdvancePay: 0 };
  }

  const currentAdvancePay = parseMoney(salary.advance_pay);
  // 如果工资表借支已覆盖生活费金额，只建立追溯关系，避免重复扣。
  const addedAdvancePay = Math.max(pending.total - currentAdvancePay, 0);
  const nextAdvancePay = Math.round((currentAdvancePay + addedAdvancePay) * 100) / 100;

  if (addedAdvancePay > 0) {
    const nextNetPay = calculateNetPayWithAdvance(salary, nextAdvancePay);
    const { error: updateError } = await client
      .from('worker_salaries')
      .update({
        advance_pay: nextAdvancePay,
        net_pay: nextNetPay,
      })
      .eq('id', salary.id);

    if (updateError) {
      throw new Error(`同步生活费到工资借支失败: ${updateError.message}`);
    }
  }

  await markLivingAllowancesDeducted(client, {
    recordIds: pending.records.map(record => record.id),
    salaryId: salary.id,
  });

  return {
    synced: true,
    amount: pending.total,
    linkedCount: pending.records.length,
    addedAdvancePay,
  };
}
