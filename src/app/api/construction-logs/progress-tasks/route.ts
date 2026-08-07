import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getConstructionLogAccessibleProjectIds } from '@/lib/public-log-project';

type ProgressTaskRow = {
  id: number;
  project_id: number;
  year_month: string | null;
  wbs: string | null;
  phase: string | null;
  area: string | null;
  floor: string | null;
  process: string | null;
  plan_start_date: string;
  plan_end_date: string;
  actual_progress: number | string | null;
  issue: string | null;
  next_action: string | null;
};

type ProgressTaskQuantityRow = {
  task_id: number;
  subitem_id: number | null;
  quantity_item: string | null;
  matched_quantity: number | string | null;
  unit: string | null;
  work_item_subitems?: {
    subitem_name?: string | null;
    unit?: string | null;
  } | null;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLogDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = Number(searchParams.get('project_id') || searchParams.get('projectId') || 0);
    const logDate = normalizeLogDate(searchParams.get('date'));

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return apiBadRequest('请选择项目');
    }

    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);
    if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(projectId)) {
      return apiForbidden('无权读取该项目进度任务');
    }

    const { data: taskRows, error: tasksError } = await supabase
      .from('project_progress_tasks')
      .select('id,project_id,year_month,wbs,phase,area,floor,process,plan_start_date,plan_end_date,actual_progress,issue,next_action')
      .eq('project_id', projectId)
      .lte('plan_start_date', logDate)
      .gte('plan_end_date', logDate)
      .order('plan_start_date', { ascending: true })
      .order('id', { ascending: true });

    if (tasksError) throw new Error(tasksError.message);

    const taskIds = ((taskRows || []) as ProgressTaskRow[]).map((task) => task.id);
    let quantityRows: ProgressTaskQuantityRow[] = [];

    if (taskIds.length > 0) {
      const { data, error } = await supabase
        .from('project_progress_task_quantities')
        .select(`
          task_id,
          subitem_id,
          quantity_item,
          matched_quantity,
          unit,
          work_item_subitems (
            subitem_name,
            unit
          )
        `)
        .in('task_id', taskIds);

      if (error) throw new Error(error.message);
      quantityRows = (data || []) as ProgressTaskQuantityRow[];
    }

    const quantityByTaskId = new Map<number, ProgressTaskQuantityRow>();
    quantityRows.forEach((quantity) => {
      if (!quantityByTaskId.has(quantity.task_id)) quantityByTaskId.set(quantity.task_id, quantity);
    });

    const tasks = ((taskRows || []) as ProgressTaskRow[]).map((task) => {
      const quantity = quantityByTaskId.get(task.id);
      const subitem = quantity?.work_item_subitems;
      return {
        id: task.id,
        project_id: task.project_id,
        year_month: task.year_month || task.plan_start_date.slice(0, 7),
        wbs: task.wbs || '',
        phase: task.phase || '',
        area: task.area || '',
        floor: task.floor || '',
        process: task.process || '',
        plan_start_date: task.plan_start_date,
        plan_end_date: task.plan_end_date,
        actual_progress: toNumber(task.actual_progress),
        issue: task.issue || '',
        next_action: task.next_action || '',
        subitem_id: quantity?.subitem_id || null,
        quantity_item: quantity?.quantity_item || subitem?.subitem_name || '',
        matched_quantity: toNumber(quantity?.matched_quantity),
        unit: quantity?.unit || subitem?.unit || '',
      };
    });

    return apiSuccess({ tasks, project_id: projectId, date: logDate });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '查询施工日志进度任务失败'));
  }
}
