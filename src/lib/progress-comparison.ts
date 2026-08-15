/**
 * P0-4 进度计划三态对比（纯聚合，无 DB/框架依赖，可单测）
 *
 * 三态口径：
 * - 计划进度：按时间线性推算——(今天 − 计划开始) ÷ (计划区间) × 100；未开始 0，已过计划结束 100
 * - 实际进度：取「已提交」施工日志中 log_date 最新一条的 actual_progress（同日志多人提交按 log_id 取最新），
 *   无日志时回退任务字段 actual_progress
 * - 完成量：计划量 = Σ task_quantities.matched_quantity；完成量 = Σ entries.completed_quantity（已提交日志）
 *
 * 滞后判定：actual + 10 < plan → 滞后（阈值 10 个百分点，与进度管理页 getTaskState 一致）；
 * 逾期：今天 > 计划结束且实际 < 100。
 */

/** 滞后阈值（百分点）：实际进度落后计划进度超过该值判定为滞后 */
export const PROGRESS_LAG_THRESHOLD_POINTS = 10;

export interface ProgressTaskInput {
  id: number;
  project_id: number;
  wbs?: string | null;
  phase?: string | null;
  area?: string | null;
  floor?: string | null;
  process?: string | null;
  plan_start_date?: string | null; // YYYY-MM-DD
  plan_end_date?: string | null;
  /** 任务字段实际进度（服务端已按最新已提交日志同步） */
  actual_progress?: string | number | null;
}

export interface ProgressQuantityInput {
  task_id: number;
  matched_quantity?: string | number | null;
  unit?: string | null;
  quantity_item?: string | null;
}

export interface ProgressEntryInput {
  progress_task_id: number;
  actual_progress?: string | number | null;
  completed_quantity?: string | number | null;
  /** 关联施工日志：日志日期（YYYY-MM-DD） */
  log_date?: string | null;
  /** 关联施工日志：状态 submitted/draft */
  log_status?: string | null;
  log_id?: number | null;
}

export type ProgressTaskStatus = 'completed' | 'overdue' | 'lagging' | 'on_track' | 'not_started';

export interface ProgressComparisonRow {
  task_id: number;
  wbs: string;
  /** 任务展示名：工序（楼层/区域/阶段 组合） */
  label: string;
  plan_start_date: string | null;
  plan_end_date: string | null;
  /** 计划进度（%，时间推算 0-100） */
  plan_percent: number;
  /** 实际进度（%，最新已提交日志） */
  actual_percent: number;
  /** 滞后点数 = 实际 − 计划 */
  lag_points: number;
  /** 计划工程量（Σ matched_quantity） */
  planned_qty: number;
  /** 已完成量（Σ 已提交日志 completed_quantity） */
  actual_qty: number;
  unit: string | null;
  status: ProgressTaskStatus;
  lagging: boolean;
  overdue: boolean;
}

export interface ProgressComparisonSummary {
  task_count: number;
  lagging_count: number;
  overdue_count: number;
  completed_count: number;
  avg_plan_percent: number;
  avg_actual_percent: number;
  total_planned_qty: number;
  total_actual_qty: number;
}

function toNum(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** 'YYYY-MM-DD' → 毫秒；非法返回 null */
function dateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** 时间推算计划进度：今天在计划区间内线性插值 */
export function calcPlannedPercent(
  today: string,
  planStart: string | null | undefined,
  planEnd: string | null | undefined,
): number {
  const todayMs = dateMs(today);
  const startMs = dateMs(planStart);
  const endMs = dateMs(planEnd);
  if (todayMs === null || startMs === null || endMs === null || endMs <= startMs) {
    return 0;
  }
  if (todayMs <= startMs) return 0;
  if (todayMs >= endMs) return 100;
  return round1(((todayMs - startMs) / (endMs - startMs)) * 100);
}

/** 任务展示名 */
export function buildTaskLabel(task: ProgressTaskInput): string {
  const parts = [task.process, task.floor, task.area, task.phase].filter(Boolean);
  return parts.join(' · ') || `任务#${task.id}`;
}

/**
 * 取「已提交」日志中最新一条 actual_progress：
 * log_date 降序，同日期按 log_id 降序（与 recalculateTaskActualProgress 一致）
 */
export function pickLatestActualProgress(entries: ProgressEntryInput[]): number | null {
  const submitted = entries
    .filter((entry) => entry.log_status === 'submitted' && entry.log_date)
    .sort((a, b) => {
      const dateCompare = String(b.log_date || '').localeCompare(String(a.log_date || ''));
      if (dateCompare !== 0) return dateCompare;
      return Number(b.log_id || 0) - Number(a.log_id || 0);
    });
  if (submitted.length === 0) return null;
  return clampPercent(toNum(submitted[0].actual_progress));
}

export function buildProgressComparison(params: {
  tasks: ProgressTaskInput[];
  quantities: ProgressQuantityInput[];
  entries: ProgressEntryInput[];
  today: string; // YYYY-MM-DD
}): { rows: ProgressComparisonRow[]; summary: ProgressComparisonSummary } {
  const { tasks, quantities, entries, today } = params;

  const plannedQtyByTask = new Map<number, number>();
  quantities.forEach((quantity) => {
    plannedQtyByTask.set(
      quantity.task_id,
      (plannedQtyByTask.get(quantity.task_id) || 0) + toNum(quantity.matched_quantity),
    );
  });

  const entriesByTask = new Map<number, ProgressEntryInput[]>();
  entries.forEach((entry) => {
    const list = entriesByTask.get(entry.progress_task_id) || [];
    list.push(entry);
    entriesByTask.set(entry.progress_task_id, list);
  });

  const rows: ProgressComparisonRow[] = tasks.map((task) => {
    const taskEntries = entriesByTask.get(task.id) || [];
    const submittedEntries = taskEntries.filter((entry) => entry.log_status === 'submitted');

    const planPercent = calcPlannedPercent(today, task.plan_start_date, task.plan_end_date);
    const latestActual = pickLatestActualProgress(taskEntries);
    const actualPercent = clampPercent(latestActual !== null ? latestActual : toNum(task.actual_progress));

    const actualQty = round1(
      submittedEntries.reduce((sum, entry) => sum + Math.max(0, toNum(entry.completed_quantity)), 0)
    );
    const plannedQty = round1(plannedQtyByTask.get(task.id) || 0);

    const lagPoints = round1(actualPercent - planPercent);
    const overdue = (dateMs(today) ?? 0) > (dateMs(task.plan_end_date) ?? Infinity) && actualPercent < 100;
    const lagging = actualPercent + PROGRESS_LAG_THRESHOLD_POINTS < planPercent;

    let status: ProgressTaskStatus;
    if (actualPercent >= 100) {
      status = 'completed';
    } else if (overdue) {
      status = 'overdue';
    } else if (lagging) {
      status = 'lagging';
    } else if (actualPercent > 0) {
      status = 'on_track';
    } else {
      status = 'not_started';
    }

    return {
      task_id: task.id,
      wbs: task.wbs || '',
      label: buildTaskLabel(task),
      plan_start_date: task.plan_start_date || null,
      plan_end_date: task.plan_end_date || null,
      plan_percent: planPercent,
      actual_percent: actualPercent,
      lag_points: lagPoints,
      planned_qty: plannedQty,
      actual_qty: actualQty,
      unit: quantities.find((q) => q.task_id === task.id)?.unit || null,
      status,
      lagging,
      overdue,
    };
  });

  const avg = (values: number[]) =>
    values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

  const summary: ProgressComparisonSummary = {
    task_count: rows.length,
    lagging_count: rows.filter((row) => row.lagging).length,
    overdue_count: rows.filter((row) => row.overdue).length,
    completed_count: rows.filter((row) => row.status === 'completed').length,
    avg_plan_percent: avg(rows.map((row) => row.plan_percent)),
    avg_actual_percent: avg(rows.map((row) => row.actual_percent)),
    total_planned_qty: round1(rows.reduce((sum, row) => sum + row.planned_qty, 0)),
    total_actual_qty: round1(rows.reduce((sum, row) => sum + row.actual_qty, 0)),
  };

  return { rows, summary };
}
