import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getConstructionLogAccessibleProjectIds } from '@/lib/public-log-project';
import {
  getConstructionLogSubmitterIds,
  getProjectSubmitterCandidates,
  hasBudgetRoleInDatabase,
} from '@/lib/construction-log-submitters';

function normalizeUserIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0),
  ));
}

async function canManageProjectSubmitters(
  supabase: ReturnType<typeof getSupabaseClient>,
  user: Parameters<typeof hasBudgetRoleInDatabase>[1],
  projectId: number,
) {
  const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, user);
  if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(projectId)) return false;
  return hasBudgetRoleInDatabase(supabase, user);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const projectId = Number(request.nextUrl.searchParams.get('projectId') || 0);
    if (!Number.isInteger(projectId) || projectId <= 0) return apiBadRequest('项目不能为空');

    const supabase = getSupabaseClient();
    const allowed = await canManageProjectSubmitters(supabase, auth.user, projectId);
    if (!allowed) return apiForbidden('只有预算员可以配置施工日志提交人员');

    const [scope, candidates] = await Promise.all([
      getConstructionLogSubmitterIds(supabase, projectId),
      getProjectSubmitterCandidates(supabase, projectId),
    ]);

    return apiSuccess({
      project_id: projectId,
      configured: scope.configured,
      submitter_user_ids: scope.userIds,
      users: candidates,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '施工日志提交人员配置加载失败'));
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const projectId = Number(body?.project_id || body?.projectId || 0);
    const userIds = normalizeUserIds(body?.user_ids || body?.userIds);
    if (!Number.isInteger(projectId) || projectId <= 0) return apiBadRequest('项目不能为空');

    const supabase = getSupabaseClient();
    const allowed = await canManageProjectSubmitters(supabase, auth.user, projectId);
    if (!allowed) return apiForbidden('只有预算员可以配置施工日志提交人员');

    const { error: deleteError } = await supabase
      .from('construction_log_submitters')
      .delete()
      .eq('project_id', projectId);
    if (deleteError) throw new Error(deleteError.message);

    if (userIds.length > 0) {
      const now = new Date().toISOString();
      const rows = userIds.map((userId) => ({
        project_id: projectId,
        user_id: userId,
        created_by: auth.user.id,
        updated_at: now,
      }));
      const { error: insertError } = await supabase.from('construction_log_submitters').insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    return apiSuccess({
      project_id: projectId,
      configured: userIds.length > 0,
      submitter_user_ids: userIds,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '施工日志提交人员配置保存失败'));
  }
}
