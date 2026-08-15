import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getRequestAuthUser } from '@/lib/auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';

type FoundationCategory =
  | 'area'
  | 'floor'
  | 'phase'
  | 'process'
  | 'dependency'
  | 'responsibility';

type ProgressTaskPayload = {
  id?: number;
  year_month?: string;
  wbs?: string;
  phase?: string;
  area?: string;
  floor?: string;
  process?: string;
  owner_role?: string;
  dependency?: string;
  logic?: string;
  plan_start_date?: string;
  plan_end_date?: string;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  actual_progress?: number;
  issue?: string | null;
  next_action?: string | null;
  is_key?: boolean;
  subitem_id?: number | null;
  quantity_item?: string | null;
  matched_quantity?: number | string | null;
  unit?: string | null;
};

type ProjectProgressFoundationRow = {
  category: string | null;
  name: string | null;
};

type ProjectProgressTaskRow = {
  id: number;
  project_id: number;
  year_month: string;
  wbs: string | null;
  phase: string | null;
  area: string | null;
  floor: string | null;
  process: string | null;
  owner_role: string | null;
  dependency: string | null;
  logic: string | null;
  plan_start_date: string;
  plan_end_date: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
  actual_progress: number | string | null;
  issue: string | null;
  next_action: string | null;
  is_key: boolean | null;
};

type ProjectProgressTaskQuantityRow = {
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

type SavedProgressTaskRow = {
  id: number;
};

const FOUNDATION_CATEGORIES: FoundationCategory[] = [
  'area',
  'floor',
  'phase',
  'process',
  'dependency',
  'responsibility',
];


function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableText(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeDate(value: unknown) {
  const text = nullableText(value);
  return text ? text.slice(0, 10) : null;
}

function normalizeYearMonth(task: ProgressTaskPayload) {
  if (task.year_month) return String(task.year_month).slice(0, 7);
  const startDate = normalizeDate(task.plan_start_date);
  if (startDate) return startDate.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

async function getAllowedProjectIds(client: ReturnType<typeof getSupabaseClient>, request: NextRequest) {
  const user = await getRequestAuthUser(request);
  if (!user) return { user: null, ids: null as number[] | null };

  const ids = await getAccessibleProjectIds(client, user);
  return { user, ids };
}

async function assertProjectAccess(
  client: ReturnType<typeof getSupabaseClient>,
  request: NextRequest,
  projectId: number,
) {
  const { user, ids } = await getAllowedProjectIds(client, request);
  if (ids && !ids.includes(projectId)) {
    return { ok: false, user, error: '无权访问该项目进度计划' };
  }
  return { ok: true, user, error: '' };
}

function groupFoundations(rows: ProjectProgressFoundationRow[]) {
  const grouped = FOUNDATION_CATEGORIES.reduce((acc, category) => {
    acc[category] = [];
    return acc;
  }, {} as Record<FoundationCategory, string[]>);

  for (const row of rows || []) {
    const category = row.category as FoundationCategory;
    if (FOUNDATION_CATEGORIES.includes(category) && row.name) {
      grouped[category].push(row.name);
    }
  }

  return grouped;
}

function mapTask(row: ProjectProgressTaskRow, quantitiesByTaskId: Map<number, ProjectProgressTaskQuantityRow>) {
  const quantity = quantitiesByTaskId.get(row.id);
  const subitem = quantity?.work_item_subitems;

  return {
    id: row.id,
    project_id: row.project_id,
    year_month: row.year_month,
    wbs: row.wbs || '',
    phase: row.phase || '',
    area: row.area || '',
    floor: row.floor || '',
    process: row.process || '',
    owner_role: row.owner_role || '',
    dependency: row.dependency || '',
    logic: row.logic || 'FS',
    plan_start_date: row.plan_start_date,
    plan_end_date: row.plan_end_date,
    actual_start_date: row.actual_start_date,
    actual_end_date: row.actual_end_date,
    actual_progress: toNumber(row.actual_progress),
    issue: row.issue || '',
    next_action: row.next_action || '',
    is_key: Boolean(row.is_key),
    subitem_id: quantity?.subitem_id || null,
    quantity_item: quantity?.quantity_item || subitem?.subitem_name || '',
    matched_quantity: toNumber(quantity?.matched_quantity),
    unit: quantity?.unit || subitem?.unit || '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const requestedProjectId = Number(searchParams.get('project_id') || 0);
    const { ids: accessibleProjectIds } = await getAllowedProjectIds(client, request);

    let projectQuery = client
      .from('projects')
      .select('id, name, status, created_at')
      .neq('name', '公司公共项目/非项目日志')
      .order('created_at', { ascending: false });

    if (accessibleProjectIds) {
      if (accessibleProjectIds.length === 0) {
        return NextResponse.json({
          projects: [],
          selectedProjectId: null,
          foundations: groupFoundations([]),
          tasks: [],
          subitems: [],
        });
      }
      projectQuery = projectQuery.in('id', accessibleProjectIds);
    }

    const { data: projects, error: projectsError } = await projectQuery;
    if (projectsError) {
      throw new Error(`查询项目失败: ${projectsError.message}`);
    }

    const projectList = projects || [];
    const selectedProject =
      projectList.find((project) => project.id === requestedProjectId) ||
      projectList[0] ||
      null;

    if (!selectedProject) {
      return NextResponse.json({
        projects: [],
        selectedProjectId: null,
        foundations: groupFoundations([]),
        tasks: [],
        subitems: [],
      });
    }

    const projectId = selectedProject.id;

    const { data: foundationRows, error: foundationError } = await client
      .from('project_progress_foundations')
      .select('id, category, name, sort_order')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (foundationError) {
      throw new Error(`查询进度基础信息失败: ${foundationError.message}`);
    }

    const { data: taskRows, error: tasksError } = await client
      .from('project_progress_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('plan_start_date', { ascending: true })
      .order('id', { ascending: true });

    if (tasksError) {
      throw new Error(`查询进度计划失败: ${tasksError.message}`);
    }

    const taskIds = (taskRows || []).map((task) => task.id);
    let quantityRows: ProjectProgressTaskQuantityRow[] = [];
    if (taskIds.length > 0) {
      const { data, error } = await client
        .from('project_progress_task_quantities')
        .select(`
          id,
          task_id,
          subitem_id,
          quantity_item,
          matched_quantity,
          unit,
          work_item_subitems (
            id,
            subitem_name,
            unit,
            budget_quantity,
            project_id
          )
        `)
        .in('task_id', taskIds);

      if (error) {
        throw new Error(`查询进度工程量匹配失败: ${error.message}`);
      }
      quantityRows = (data || []) as ProjectProgressTaskQuantityRow[];
    }

    const quantitiesByTaskId = new Map<number, ProjectProgressTaskQuantityRow>();
    for (const quantity of quantityRows) {
      if (!quantitiesByTaskId.has(quantity.task_id)) {
        quantitiesByTaskId.set(quantity.task_id, quantity);
      }
    }

    const { data: subitems, error: subitemsError } = await client
      .from('work_item_subitems')
      .select('id, subitem_name, unit, budget_quantity, project_id')
      .eq('project_id', projectId)
      .order('subitem_name', { ascending: true });

    if (subitemsError) {
      throw new Error(`查询项目工程量清单失败: ${subitemsError.message}`);
    }

    return NextResponse.json({
      projects: projectList.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status || '在建',
      })),
      selectedProjectId: projectId,
      foundations: groupFoundations((foundationRows || []) as ProjectProgressFoundationRow[]),
      tasks: ((taskRows || []) as ProjectProgressTaskRow[]).map((task) => mapTask(task, quantitiesByTaskId)),
      subitems: subitems || [],
    });
  } catch (error: unknown) {
    console.error('Progress Management API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '查询失败') },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = Number(body.project_id);
    const foundations = body.foundations || {};
    const tasks = Array.isArray(body.tasks) ? body.tasks as ProgressTaskPayload[] : [];

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: '请选择项目' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const access = await assertProjectAccess(client, request, projectId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    for (const category of FOUNDATION_CATEGORIES) {
      const values = Array.isArray(foundations[category]) ? foundations[category] : [];
      const names = Array.from(new Set(
        values.map((item: unknown) => String(item || '').trim()).filter(Boolean),
      ));

      await client
        .from('project_progress_foundations')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('project_id', projectId)
        .eq('category', category);

      if (names.length > 0) {
        const rows = names.map((name, index) => ({
          project_id: projectId,
          category,
          name,
          sort_order: index + 1,
          is_active: true,
          updated_at: new Date().toISOString(),
        }));

        const { error } = await client
          .from('project_progress_foundations')
          .upsert(rows, { onConflict: 'project_id,category,name' });

        if (error) {
          throw new Error(`保存进度基础信息失败: ${error.message}`);
        }
      }
    }

    const savedTasks: SavedProgressTaskRow[] = [];
    for (const task of tasks) {
      const planStartDate = normalizeDate(task.plan_start_date);
      const planEndDate = normalizeDate(task.plan_end_date);
      if (!planStartDate || !planEndDate) continue;

      const taskData = {
        project_id: projectId,
        year_month: normalizeYearMonth(task),
        wbs: nullableText(task.wbs) || '',
        phase: nullableText(task.phase) || '',
        area: nullableText(task.area) || '',
        floor: nullableText(task.floor) || '',
        process: nullableText(task.process) || '',
        owner_role: nullableText(task.owner_role) || '',
        dependency: nullableText(task.dependency) || '',
        logic: ['FS', 'SS', 'FF'].includes(String(task.logic)) ? String(task.logic) : 'FS',
        plan_start_date: planStartDate,
        plan_end_date: planEndDate,
        actual_start_date: normalizeDate(task.actual_start_date),
        actual_end_date: normalizeDate(task.actual_end_date),
        actual_progress: toNumber(task.actual_progress),
        issue: nullableText(task.issue),
        next_action: nullableText(task.next_action),
        is_key: Boolean(task.is_key),
        updated_at: new Date().toISOString(),
      };

      let savedTask: SavedProgressTaskRow | null = null;
      if (task.id && task.id > 0) {
        const { data, error } = await client
          .from('project_progress_tasks')
          .update(taskData)
          .eq('id', task.id)
          .eq('project_id', projectId)
          .select()
          .single();

        if (error) {
          throw new Error(`更新进度计划失败: ${error.message}`);
        }
        savedTask = data as SavedProgressTaskRow;
      } else {
        const { data, error } = await insertWithSequenceFix('project_progress_tasks', taskData, client);
        if (error) {
          throw new Error(`新增进度计划失败: ${error.message}`);
        }
        savedTask = (Array.isArray(data) ? data[0] : data) as SavedProgressTaskRow;
      }

      if (!savedTask?.id) continue;
      savedTasks.push(savedTask);

      await client
        .from('project_progress_task_quantities')
        .delete()
        .eq('task_id', savedTask.id);

      const quantityItem = nullableText(task.quantity_item);
      const matchedQuantity = toNumber(task.matched_quantity);
      const subitemId = task.subitem_id ? Number(task.subitem_id) : null;
      if (subitemId || quantityItem || matchedQuantity > 0) {
        const { error } = await insertWithSequenceFix(
          'project_progress_task_quantities',
          {
            task_id: savedTask.id,
            subitem_id: subitemId,
            quantity_item: quantityItem,
            matched_quantity: matchedQuantity.toString(),
            unit: nullableText(task.unit),
          },
          client,
        );

        if (error) {
          throw new Error(`保存进度工程量匹配失败: ${error.message}`);
        }
      }
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'project_progress',
      resourceId: projectId,
      details: { taskCount: savedTasks.length },
      request,
    });

    return NextResponse.json({ success: true, savedCount: savedTasks.length });
  } catch (error: unknown) {
    console.error('Progress Management API Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, '保存失败') },
      { status: 500 },
    );
  }
}
