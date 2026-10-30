import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

/**
 * GET /api/my-submissions
 * 当前用户提交的审批进度：月报 + 班组结算
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const userId = Number(auth.user.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return apiSuccess({ reports: [], settlements: [] });
    }

    const client = getSupabaseClient();

    const [{ data: reports, error: reportError }, { data: settlements, error: settlementError }] = await Promise.all([
      client
        .from('monthly_report_workflows')
        .select('id, year_month, project_scope, status, fill_user, manager_user, approved_by, submitted_manager_at, submitted_boss_at, approved_at, reject_reason, updated_at')
        .eq('created_by', userId)
        .order('updated_at', { ascending: false })
        .limit(100),
      client
        .from('team_settlements')
        .select('id, settlement_no, settlement_month, project_id, team_id, status, submitted_at, submitted_by, reviewed_at, reviewed_by, reject_reason, created_at, projects(name), team_groups(name)')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (reportError && !String(reportError.message || '').includes('monthly_report_workflows')) {
      throw new Error(reportError.message);
    }
    if (settlementError) throw new Error(settlementError.message);

    const projectIds = Array.from(new Set(
      [
        ...(reports || []).map((row: { project_scope?: string | null }) => Number(row.project_scope) || 0),
        ...(settlements || []).map((row: { project_id?: number | null }) => Number(row.project_id) || 0),
      ].filter(Boolean),
    ));
    const projectNameById = new Map<number, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await client
        .from('projects')
        .select('id, name')
        .in('id', projectIds);
      (projects || []).forEach((project: { id?: unknown; name?: unknown }) => {
        projectNameById.set(Number(project.id), String(project.name || ''));
      });
    }

    return apiSuccess({
      reports: (reports || []).map((row: Record<string, unknown>) => ({
        ...row,
        project_name:
          String(row.project_scope) === 'all'
            ? '全公司'
            : projectNameById.get(Number(row.project_scope)) || null,
      })),
      settlements: settlements || [],
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '加载我的提交失败'));
  }
}
