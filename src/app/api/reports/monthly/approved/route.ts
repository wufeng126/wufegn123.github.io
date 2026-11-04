import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { auditLog } from '@/lib/audit-log';

/**
 * GET /api/reports/monthly/approved
 * 已审批（归档）的月报清单：monthly_report_workflows 中 status=approved 的记录。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { data: rows, error } = await client
      .from('monthly_report_workflows')
      .select('id, year_month, project_scope, status, fill_user, manager_user, submitted_manager_at, submitted_boss_at, approved_by, approved_at, updated_at')
      .eq('status', 'approved')
      .order('year_month', { ascending: false })
      .order('approved_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const projectIds = Array.from(new Set((rows || [])
      .map((row: { project_scope?: unknown }) => Number(row.project_scope) || 0)
      .filter(Boolean)));
    const projectMap = new Map<number, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await client.from('projects').select('id, name').in('id', projectIds);
      (projects || []).forEach((project: { id?: unknown; name?: unknown }) => {
        projectMap.set(Number(project.id), String(project.name || ''));
      });
    }

    return apiSuccess({
      reports: (rows || []).map((row: Record<string, unknown>) => {
        const scope = String(row.project_scope || 'all');
        return {
          id: Number(row.id),
          month: String(row.year_month || ''),
          projectScope: scope,
          projectName: scope === 'all' ? '全公司' : (projectMap.get(Number(scope)) || `项目#${scope}`),
          submittedByName: String(row.manager_user || row.fill_user || ''),
          submittedAt: row.submitted_boss_at || row.submitted_manager_at || null,
          approvedBy: String(row.approved_by || ''),
          approvedAt: row.approved_at || null,
        };
      }),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '加载已归档月报失败'));
  }
}

/** DELETE /api/reports/monthly/approved?id=123 —— 删除已归档（已审批）月报，仅管理员；用于清理测试数据 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const isAdmin = Boolean(auth.user.is_super_admin) || ['admin', 'boss'].includes(String(auth.user.role || ''));
    if (!isAdmin) return apiForbidden('只有管理员可以删除已归档月报');

    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return apiBadRequest('参数不正确');

    const client = getSupabaseClient();
    const { data: row } = await client
      .from('monthly_report_workflows')
      .select('id, year_month, project_scope, status')
      .eq('id', id)
      .maybeSingle();
    if (!row) return apiNotFound('记录不存在');
    if (String(row.status) !== 'approved') return apiBadRequest('只有已审批归档的月报可以删除');

    const { error } = await client.from('monthly_report_workflows').delete().eq('id', id);
    if (error) throw new Error(error.message);

    await auditLog({
      operationType: 'delete',
      resourceType: 'monthly_report',
      resourceId: id,
      details: { action: 'delete_archived_report', month: row.year_month, scope: row.project_scope },
      request,
    });

    return apiSuccess({ id });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '删除失败'));
  }
}
