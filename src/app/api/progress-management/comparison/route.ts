import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { buildProgressComparison } from '@/lib/progress-comparison';

/** 上海时区当天日期（YYYY-MM-DD） */
function getShanghaiToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * P0-4 进度计划三态对比 API（GET）
 * 参数：project_id（必填）
 * 返回：分任务「计划% vs 实际% vs 完成量」对比 + 汇总（滞后/逾期任务数）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const projectIdParam = searchParams.get('project_id') || searchParams.get('projectId');
    const projectId = Number(projectIdParam || 0);

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: '请选择项目' }, { status: 400 });
    }

    const client = getSupabaseClient();

    const accessibleProjects = await getAccessibleProjectIds(client, auth.user);
    if (accessibleProjects && !accessibleProjects.includes(projectId)) {
      return NextResponse.json({ error: '无权访问该项目' }, { status: 403 });
    }

    const { data: projectRows } = await client
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .single();
    const projectName = (projectRows as any)?.name || '';

    // 1. 计划任务
    const { data: tasks, error: tasksError } = await client
      .from('project_progress_tasks')
      .select('id,project_id,wbs,phase,area,floor,process,plan_start_date,plan_end_date,actual_progress')
      .eq('project_id', projectId)
      .order('plan_start_date', { ascending: true })
      .order('id', { ascending: true });

    if (tasksError) {
      throw new Error(`查询进度计划失败: ${tasksError.message}`);
    }

    const taskIds = (tasks || []).map((task: any) => task.id);

    // 2. 任务工程量（计划量）
    const { data: quantities, error: quantitiesError } = taskIds.length > 0
      ? await client
          .from('project_progress_task_quantities')
          .select('task_id,matched_quantity,unit,quantity_item')
          .in('task_id', taskIds)
      : { data: [], error: null };

    if (quantitiesError) {
      throw new Error(`查询任务工程量失败: ${quantitiesError.message}`);
    }

    // 3. 日志进度条目（实际进度 + 完成量，关联日志日期/状态）
    const { data: entries, error: entriesError } = taskIds.length > 0
      ? await client
          .from('construction_log_progress_entries')
          .select(`
            progress_task_id,
            actual_progress,
            completed_quantity,
            log_id,
            construction_logs ( log_date, status )
          `)
          .eq('project_id', projectId)
          .in('progress_task_id', taskIds)
      : { data: [], error: null };

    if (entriesError) {
      throw new Error(`查询日志进度条目失败: ${entriesError.message}`);
    }

    const { rows, summary } = buildProgressComparison({
      tasks: (tasks || []).map((task: any) => ({
        id: task.id,
        project_id: task.project_id,
        wbs: task.wbs,
        phase: task.phase,
        area: task.area,
        floor: task.floor,
        process: task.process,
        plan_start_date: task.plan_start_date,
        plan_end_date: task.plan_end_date,
        actual_progress: task.actual_progress,
      })),
      quantities: (quantities || []).map((quantity: any) => ({
        task_id: quantity.task_id,
        matched_quantity: quantity.matched_quantity,
        unit: quantity.unit,
        quantity_item: quantity.quantity_item,
      })),
      entries: (entries || []).map((entry: any) => ({
        progress_task_id: entry.progress_task_id,
        actual_progress: entry.actual_progress,
        completed_quantity: entry.completed_quantity,
        log_date: (entry.construction_logs as any)?.log_date || null,
        log_status: (entry.construction_logs as any)?.status || null,
        log_id: entry.log_id,
      })),
      today: getShanghaiToday(),
    });

    return NextResponse.json({ project_id: projectId, project_name: projectName, rows, summary });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}
