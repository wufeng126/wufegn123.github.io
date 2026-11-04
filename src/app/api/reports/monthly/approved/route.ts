import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

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
      .select('id, year_month, project_scope, status, submitted_by_name, submitted_at, approved_by, approved_at, updated_at')
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
          submittedByName: String(row.submitted_by_name || ''),
          submittedAt: row.submitted_at || null,
          approvedBy: String(row.approved_by || ''),
          approvedAt: row.approved_at || null,
        };
      }),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '加载已归档月报失败'));
  }
}
