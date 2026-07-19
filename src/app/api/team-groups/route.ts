import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('relation') ||
    message.includes('could not find') ||
    message.includes('schema cache')
  );
}

async function assertProjectAccess(supabase: ReturnType<typeof getSupabaseClient>, user: Parameters<typeof getAccessibleProjectIds>[1], projectId: number) {
  const accessibleProjectIds = await getAccessibleProjectIds(supabase, user);
  if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(projectId)) {
    return false;
  }
  return true;
}

async function loadProjectNames(supabase: ReturnType<typeof getSupabaseClient>, projectIds: number[]) {
  if (projectIds.length === 0) return new Map<number, string>();
  const { data } = await supabase
    .from('projects')
    .select('id,name')
    .in('id', Array.from(new Set(projectIds)));
  return new Map((data || []).map((project) => [Number(project.id), String(project.name || '')]));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const projectId = parseId(request.nextUrl.searchParams.get('projectId'));
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true';

    if (projectId) {
      const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
      if (!hasAccess) return apiForbidden('无权查看该项目班组');
    }

    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);
    if (!projectId && Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) {
      return apiSuccess({ groups: [] });
    }

    let query = supabase
      .from('team_groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    else if (Array.isArray(accessibleProjectIds)) query = query.in('project_id', accessibleProjectIds);
    if (!includeInactive) query = query.neq('status', 'inactive');

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) return apiSuccess({ groups: [], needs_migration: true });
      throw new Error(error.message);
    }

    const projectNameMap = await loadProjectNames(
      supabase,
      (data || []).map((row) => Number(row.project_id)).filter(Boolean),
    );

    const groups = (data || []).map((group) => ({
      ...group,
      project_name: projectNameMap.get(Number(group.project_id)) || '',
    }));

    return apiSuccess({ groups });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组档案加载失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const projectId = parseId(body?.project_id);
    const name = String(body?.name || '').trim();

    if (!projectId) return apiBadRequest('请选择所属项目');
    if (!name) return apiBadRequest('请填写班组名称');

    const supabase = getSupabaseClient();
    const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
    if (!hasAccess) return apiForbidden('无权维护该项目班组');

    const { data, error } = await insertWithSequenceFix('team_groups', {
      project_id: projectId,
      name,
      leader_name: body?.leader_name || null,
      phone: body?.phone || null,
      work_type: body?.work_type || null,
      remark: body?.remark || null,
      status: body?.status || 'active',
      updated_at: new Date().toISOString(),
    }, supabase);

    if (error) throw new Error(error.message);
    const group = Array.isArray(data) ? data[0] : data;

    await auditLog({
      operationType: 'create',
      resourceType: 'team_group',
      resourceId: group?.id,
      details: { project_id: projectId, name },
      request,
    });

    return apiSuccess({ group });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组档案保存失败'));
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const id = parseId(body?.id);
    const projectId = parseId(body?.project_id);
    const name = String(body?.name || '').trim();

    if (!id) return apiBadRequest('缺少班组ID');
    if (!projectId) return apiBadRequest('请选择所属项目');
    if (!name) return apiBadRequest('请填写班组名称');

    const supabase = getSupabaseClient();
    const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
    if (!hasAccess) return apiForbidden('无权维护该项目班组');

    const { data, error } = await supabase
      .from('team_groups')
      .update({
        project_id: projectId,
        name,
        leader_name: body?.leader_name || null,
        phone: body?.phone || null,
        work_type: body?.work_type || null,
        remark: body?.remark || null,
        status: body?.status || 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await auditLog({
      operationType: 'update',
      resourceType: 'team_group',
      resourceId: id,
      details: { project_id: projectId, name },
      request,
    });

    return apiSuccess({ group: data });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '班组档案更新失败'));
  }
}
