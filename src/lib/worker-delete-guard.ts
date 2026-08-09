/**
 * 工人删除守卫：删除花名册人员前，检查其在出勤、工资核算、工资发放、班组结算拆分中是否已有数据。
 * 有数据则阻止删除并提示，避免财务/考勤数据成为孤儿记录。
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const DATA_TABLE_DEFS = [
  { table: 'construction_log_attendance', label: '出勤' },
  { table: 'worker_salaries', label: '工资核算' },
  { table: 'salary_payments', label: '工资发放' },
  { table: 'team_settlement_splits', label: '班组结算拆分' },
] as const;

function isMissingTableError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  const message = String(err?.message || '').toLowerCase();
  return (
    err?.code === '42P01' ||
    err?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('schema cache') ||
    message.includes('relation') && message.includes('not exist')
  );
}

export type WorkerDeleteGuardResult = {
  hasData: boolean;
  /** 有数据的模块标签（按定义顺序去重，如 ['出勤','工资核算']） */
  blockedModules: string[];
  /** 每个工人命中的模块：workerId -> 模块标签数组 */
  byWorker: Map<number, string[]>;
};

/**
 * 检查工人是否在出勤/工资核算/工资发放中有数据。
 * 表不存在时静默跳过（向后兼容旧库）。
 */
export async function checkWorkerDeleteGuard(
  client: SupabaseClient,
  workerIds: number[],
): Promise<WorkerDeleteGuardResult> {
  const uniqueIds = Array.from(new Set(workerIds.map(Number).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { hasData: false, blockedModules: [], byWorker: new Map() };
  }

  const byWorker = new Map<number, string[]>();
  const blockedModules = new Set<string>();

  for (const def of DATA_TABLE_DEFS) {
    try {
      const { data, error } = await client
        .from(def.table)
        .select('worker_id')
        .in('worker_id', uniqueIds);
      if (error) {
        if (isMissingTableError(error)) continue; // 表不存在 → 跳过该模块
        console.warn(`[WorkerDeleteGuard] check ${def.table} failed:`, error.message);
        continue;
      }
      const hitIds = new Set(
        (data || [])
          .map((record: { worker_id?: number | string | null }) => Number(record.worker_id))
          .filter(Boolean)
      );
      hitIds.forEach((wid) => {
        const modules = byWorker.get(wid) || [];
        if (!modules.includes(def.label)) modules.push(def.label);
        byWorker.set(wid, modules);
      });
    } catch (err) {
      console.warn(`[WorkerDeleteGuard] check ${def.table} exception:`, err);
    }
  }

  byWorker.forEach((modules) => modules.forEach((label) => blockedModules.add(label)));

  return {
    hasData: byWorker.size > 0,
    blockedModules: Array.from(blockedModules),
    byWorker,
  };
}
