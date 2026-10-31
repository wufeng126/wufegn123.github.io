import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

/**
 * GET /api/my-pending-approvals
 * 待我审批：月报（项目经理补充 / 老板审批）+ 班组结算
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const userId = Number(auth.user.id);
    const isBoss = Boolean(auth.user.is_super_admin) || auth.user.role === 'boss';
    const client = getSupabaseClient();

    const [{ data: reportRows }, { data: settlementRows }, { data: approvedReportRows }, { data: approvedSettlementRows }] = await Promise.all([
      client
        .from('monthly_report_workflows')
        .select('id, year_month, project_scope, status, content, updated_at')
        .in('status', ['pending_manager', 'pending_boss'])
        .order('updated_at', { ascending: false })
        .limit(200),
      client
        .from('team_settlements')
        .select('id, settlement_no, settlement_month, project_id, team_id, status, approver_user_id, approver_name, submitted_at, submitted_by')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })
        .limit(200),
      // 我审批过的（按审批人姓名匹配，历史数据没有 id 只能这样关联）
      client
        .from('monthly_report_workflows')
        .select('id, year_month, project_scope, status, approved_by, approved_at')
        .in('status', ['approved', 'rejected'])
        .order('approved_at', { ascending: false })
        .limit(100),
      client
        .from('team_settlements')
        .select('id, settlement_no, settlement_month, project_id, status, reviewed_by, reviewed_at')
        .in('status', ['reviewed', 'rejected'])
        .order('reviewed_at', { ascending: false })
        .limit(100),
    ]);

    const reports = (reportRows || []).filter((row: Record<string, unknown>) => {
      const content = (row.content || {}) as Record<string, unknown>;
      if (row.status === 'pending_manager') {
        const designated = Number(content.managerApproverId) || 0;
        return isBoss || (designated > 0 && designated === userId);
      }
      const designated = Number(content.bossApproverId) || 0;
      return isBoss || (designated > 0 && designated === userId);
    });

    const settlements = (settlementRows || []).filter((row: Record<string, unknown>) => {
      const designated = Number(row.approver_user_id) || 0;
      return isBoss || (designated > 0 && designated === userId);
    });

    const operatorName = String(auth.user.name || auth.user.username || '');
    const approvedReports = (approvedReportRows || []).filter(
      (row: Record<string, unknown>) => operatorName && String(row.approved_by || '') === operatorName,
    );
    const approvedSettlements = (approvedSettlementRows || []).filter(
      (row: Record<string, unknown>) => operatorName && String(row.reviewed_by || '') === operatorName,
    );

    const projectIds = Array.from(new Set([
      ...reports.map((row: Record<string, unknown>) => Number(row.project_scope) || 0),
      ...settlements.map((row: Record<string, unknown>) => Number(row.project_id) || 0),
      ...approvedReports.map((row: Record<string, unknown>) => Number(row.project_scope) || 0),
      ...approvedSettlements.map((row: Record<string, unknown>) => Number(row.project_id) || 0),
    ].filter(Boolean)));
    const projectNameById = new Map<number, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await client.from('projects').select('id, name').in('id', projectIds);
      (projects || []).forEach((project: { id?: unknown; name?: unknown }) => {
        projectNameById.set(Number(project.id), String(project.name || ''));
      });
    }

    return apiSuccess({
      reports: reports.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        month: String(row.year_month || ''),
        status: String(row.status || ''),
        projectScope: String(row.project_scope || 'all'),
        projectName: String(row.project_scope) === 'all'
          ? '全公司'
          : projectNameById.get(Number(row.project_scope)) || `项目 #${row.project_scope}`,
        updatedAt: row.updated_at || null,
      })),
      settlements: settlements.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        settlementNo: String(row.settlement_no || `#${row.id}`),
        month: String(row.settlement_month || ''),
        projectName: projectNameById.get(Number(row.project_id)) || `项目 #${row.project_id ?? '-'}`,
        submittedBy: String(row.submitted_by || ''),
        submittedAt: row.submitted_at || null,
      })),
      approvedReports: approvedReports.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        month: String(row.year_month || ''),
        status: String(row.status || ''),
        projectScope: String(row.project_scope || 'all'),
        projectName: String(row.project_scope) === 'all'
          ? '全公司'
          : projectNameById.get(Number(row.project_scope)) || `项目 #${row.project_scope}`,
        approvedAt: row.approved_at || null,
      })),
      approvedSettlements: approvedSettlements.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        settlementNo: String(row.settlement_no || `#${row.id}`),
        month: String(row.settlement_month || ''),
        status: String(row.status || ''),
        projectName: projectNameById.get(Number(row.project_id)) || `项目 #${row.project_id ?? '-'}`,
        reviewedAt: row.reviewed_at || null,
      })),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '加载待审批列表失败'));
  }
}
