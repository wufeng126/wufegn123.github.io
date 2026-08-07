import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getRequestAuthUser } from '@/lib/auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

type ProgressTaskRow = {
  id: number;
  project_id: number;
  wbs: string | null;
  area: string | null;
  floor: string | null;
  process: string | null;
  plan_start_date: string;
  plan_end_date: string;
  actual_progress: number | string | null;
};

type ProgressQuantityRow = {
  task_id: number;
  subitem_id: number | null;
  quantity_item: string | null;
  matched_quantity: number | string | null;
  unit: string | null;
};

type ConstructionLogRow = {
  id: number;
};

type ProgressLogEntryRow = {
  progress_task_id: number;
  actual_progress: number | string | null;
  completed_quantity: number | string | null;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isMissingProgressEntriesTableError(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    message.includes('construction_log_progress_entries') ||
    message.includes('schema cache')
  );
}

function getMonthRange(yearMonth: string) {
  const [yearText, monthText] = yearMonth.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const start = `${yearText}-${monthText}-01`;
  const endDate = new Date(year, month, 0).getDate();
  const end = `${yearText}-${monthText}-${String(endDate).padStart(2, '0')}`;
  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const user = await getRequestAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, records: [], error: '未登录' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const projectId = Number(searchParams.get('project_id') || searchParams.get('projectId') || 0);
    const yearMonth = String(searchParams.get('year_month') || '').slice(0, 7);
    const monthRange = getMonthRange(yearMonth);

    if (!Number.isInteger(projectId) || projectId <= 0 || !monthRange) {
      return NextResponse.json({ success: false, records: [], error: '参数错误' }, { status: 400 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(supabase, user);
    if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(projectId)) {
      return NextResponse.json({ success: false, records: [], error: '无权访问该项目' }, { status: 403 });
    }

    const { data: logRows, error: logsError } = await supabase
      .from('construction_logs')
      .select('id')
      .eq('project_id', projectId)
      .gte('log_date', monthRange.start)
      .lte('log_date', monthRange.end);

    if (logsError) throw new Error(logsError.message);

    const logIds = ((logRows || []) as ConstructionLogRow[]).map((log) => log.id);
    let logProgressRows: ProgressLogEntryRow[] = [];

    if (logIds.length > 0) {
      const { data, error } = await supabase
        .from('construction_log_progress_entries')
        .select('progress_task_id,actual_progress,completed_quantity')
        .eq('project_id', projectId)
        .in('log_id', logIds);

      if (error && !isMissingProgressEntriesTableError(error)) throw new Error(error.message);
      if (!error) logProgressRows = (data || []) as ProgressLogEntryRow[];
    }

    const loggedTaskIds = Array.from(new Set(logProgressRows.map((entry) => entry.progress_task_id)));

    const { data: taskRows, error: tasksError } = await supabase
      .from('project_progress_tasks')
      .select('id,project_id,wbs,area,floor,process,plan_start_date,plan_end_date,actual_progress')
      .eq('project_id', projectId)
      .lte('plan_start_date', monthRange.end)
      .gte('plan_end_date', monthRange.start)
      .order('plan_start_date', { ascending: true })
      .order('id', { ascending: true });

    if (tasksError) throw new Error(tasksError.message);

    const tasksById = new Map<number, ProgressTaskRow>(
      ((taskRows || []) as ProgressTaskRow[]).map((task) => [task.id, task]),
    );
    const missingLoggedTaskIds = loggedTaskIds.filter((taskId) => !tasksById.has(taskId));

    if (missingLoggedTaskIds.length > 0) {
      const { data: loggedTaskRows, error: loggedTasksError } = await supabase
        .from('project_progress_tasks')
        .select('id,project_id,wbs,area,floor,process,plan_start_date,plan_end_date,actual_progress')
        .eq('project_id', projectId)
        .in('id', missingLoggedTaskIds);

      if (loggedTasksError) throw new Error(loggedTasksError.message);
      ((loggedTaskRows || []) as ProgressTaskRow[]).forEach((task) => tasksById.set(task.id, task));
    }

    const tasks = Array.from(tasksById.values());
    const taskIds = tasks.map((task) => task.id);
    if (taskIds.length === 0) {
      return NextResponse.json({ success: true, records: [] });
    }

    const { data: quantityRows, error: quantitiesError } = await supabase
      .from('project_progress_task_quantities')
      .select('task_id,subitem_id,quantity_item,matched_quantity,unit')
      .in('task_id', taskIds);

    if (quantitiesError) throw new Error(quantitiesError.message);

    const logProgressByTaskId = new Map<number, { completed_quantity: number; latest_progress: number }>();
    logProgressRows.forEach((entry) => {
      const current = logProgressByTaskId.get(entry.progress_task_id) || {
        completed_quantity: 0,
        latest_progress: 0,
      };
      current.completed_quantity += Math.max(0, toNumber(entry.completed_quantity));
      current.latest_progress = Math.max(current.latest_progress, Math.max(0, Math.min(100, toNumber(entry.actual_progress))));
      logProgressByTaskId.set(entry.progress_task_id, current);
    });

    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const grouped = new Map<number, {
      subitem_id: number;
      expected_quantity: number;
      matched_quantity: number;
      task_count: number;
      completed_task_count: number;
      latest_progress: number;
      task_labels: string[];
      unit: string;
    }>();

    for (const quantity of ((quantityRows || []) as ProgressQuantityRow[])) {
      if (!quantity.subitem_id) continue;
      const task = taskById.get(quantity.task_id);
      if (!task) continue;

      const matchedQuantity = toNumber(quantity.matched_quantity);
      const logProgress = logProgressByTaskId.get(quantity.task_id);
      const actualProgress = logProgress
        ? logProgress.latest_progress
        : Math.max(0, Math.min(100, toNumber(task.actual_progress)));
      const expectedQuantity = logProgress && logProgress.completed_quantity > 0
        ? logProgress.completed_quantity
        : matchedQuantity * (actualProgress / 100);
      const current = grouped.get(quantity.subitem_id) || {
        subitem_id: quantity.subitem_id,
        expected_quantity: 0,
        matched_quantity: 0,
        task_count: 0,
        completed_task_count: 0,
        latest_progress: 0,
        task_labels: [],
        unit: quantity.unit || '',
      };

      current.expected_quantity += expectedQuantity;
      current.matched_quantity += matchedQuantity;
      current.task_count += 1;
      current.completed_task_count += actualProgress >= 100 ? 1 : 0;
      current.latest_progress = Math.max(current.latest_progress, actualProgress);
      current.unit = current.unit || quantity.unit || '';
      current.task_labels.push(
        [task.area, task.floor, task.process].filter(Boolean).join(' ') || task.wbs || `任务${task.id}`,
      );
      grouped.set(quantity.subitem_id, current);
    }

    const records = Array.from(grouped.values()).map((record) => ({
      ...record,
      expected_quantity: Math.round(record.expected_quantity * 100) / 100,
      matched_quantity: Math.round(record.matched_quantity * 100) / 100,
      task_labels: record.task_labels.slice(0, 5),
    }));

    return NextResponse.json({ success: true, records });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '查询进度应报量失败';
    return NextResponse.json({ success: false, records: [], error: message }, { status: 500 });
  }
}
