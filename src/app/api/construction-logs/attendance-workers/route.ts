import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { getProjectActiveWorkers } from '@/lib/project-workers';

function parseProjectId(value: string | null) {
  const projectId = Number(value);
  return Number.isInteger(projectId) && projectId > 0 ? projectId : null;
}

function parseWorkerIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((workerId) => Number(workerId))
      .filter((workerId) => Number.isInteger(workerId) && workerId > 0),
  ));
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message || '';
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('relation');
}

async function assertProjectAccess(projectId: number, supabase: unknown, user: Parameters<typeof getAccessibleProjectIds>[1]) {
  const accessibleProjectIds = await getAccessibleProjectIds(supabase, user);
  if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(projectId)) {
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const projectId = parseProjectId(request.nextUrl.searchParams.get('projectId'));
    if (!projectId) return apiBadRequest('请选择项目');

    const supabase = getSupabaseClient();
    const hasAccess = await assertProjectAccess(projectId, supabase, auth.user);
    if (!hasAccess) return apiForbidden('无权查看该项目花名册');

    const workers = (await getProjectActiveWorkers(supabase, projectId))
      .map((worker) => ({
        id: worker.id,
        name: worker.name,
        work_type: worker.work_type || '',
        team_name: worker.team_name || '',
        status: worker.status || 'in_service',
        project_id: worker.project_id,
        entry_date: worker.entry_date || '',
        phone: worker.phone || '',
      }));

    const { data: scopeRows, error: scopeError } = await supabase
      .from('site_manager_worker_scopes')
      .select('worker_id')
      .eq('user_id', auth.user.id)
      .eq('project_id', projectId);

    const scopedWorkerIds = scopeError && isMissingTableError(scopeError)
      ? []
      : ((scopeRows || []) as { worker_id: number }[]).map((row) => Number(row.worker_id)).filter(Number.isInteger);

    if (scopeError && !isMissingTableError(scopeError)) throw new Error(scopeError.message);

    const scopedSet = new Set(scopedWorkerIds);
    const visibleWorkerIds = scopedWorkerIds.length > 0
      ? scopedWorkerIds
      : workers.map((worker) => worker.id);

    return apiSuccess({
      workers: workers.map((worker) => ({
        ...worker,
        in_scope: scopedSet.has(worker.id),
      })),
      scoped_worker_ids: scopedWorkerIds,
      visible_worker_ids: visibleWorkerIds,
      has_scope: scopedWorkerIds.length > 0,
      scope_configured: !scopeError,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '出勤人员加载失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const projectId = Number(body?.project_id);
    const workerIds = parseWorkerIds(body?.worker_ids);
    if (!Number.isInteger(projectId) || projectId <= 0) return apiBadRequest('请选择项目');
    if (workerIds.length === 0) return apiBadRequest('请选择需要加入负责范围的工人');

    const supabase = getSupabaseClient();
    const hasAccess = await assertProjectAccess(projectId, supabase, auth.user);
    if (!hasAccess) return apiForbidden('无权维护该项目负责范围');

    const validWorkerIds = (await getProjectActiveWorkers(supabase, projectId, {
      workerIds,
      fields: 'id,name,status,project_id',
    })).map((row) => Number(row.id));
    if (validWorkerIds.length !== workerIds.length) return apiBadRequest('只能加入当前项目花名册中的工人');

    const rows = validWorkerIds.map((workerId) => ({
      user_id: auth.user.id,
      project_id: projectId,
      worker_id: workerId,
      updated_at: new Date().toISOString(),
    }));

    const { error: scopeError } = await supabase
      .from('site_manager_worker_scopes')
      .upsert(rows, { onConflict: 'user_id,project_id,worker_id' });

    if (scopeError) {
      if (isMissingTableError(scopeError)) return apiBadRequest('请先执行数据库迁移后再维护负责范围');
      throw new Error(scopeError.message);
    }

    return apiSuccess({ worker_ids: validWorkerIds });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '负责范围保存失败'));
  }
}
