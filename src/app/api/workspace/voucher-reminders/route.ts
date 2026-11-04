import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

/**
 * GET /api/workspace/voucher-reminders
 * 工作台提醒：本月哪些项目的月度凭证（结算单/考勤表）或用工分析还没交。
 * 仅返回缺失项，数据齐全时返回空数组（前端不渲染卡片）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const month = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
    const scope = await getAccessibleProjectIds(client, auth.user);

    let projectQuery = client.from('projects').select('id, name').order('name');
    if (scope !== null) {
      if (scope.length === 0) return apiSuccess({ month, missing: [], count: 0 });
      projectQuery = projectQuery.in('id', scope);
    }
    const { data: projects, error } = await projectQuery.limit(500);
    if (error) throw new Error(error.message);

    const { data: vouchers } = await client
      .from('monthly_vouchers')
      .select('project_id, doc_type')
      .eq('year_month', month)
      .neq('status', 'voided');

    const { data: laborRows } = await client
      .from('monthly_labor_analyses')
      .select('project_id')
      .eq('year_month', month);

    const voucherSet = new Set((vouchers || []).map((row: { project_id?: unknown; doc_type?: unknown }) => `${Number(row.project_id)}|${String(row.doc_type)}`));
    const laborSet = new Set((laborRows || []).map((row: { project_id?: unknown }) => Number(row.project_id)));

    const missing = (projects || [])
      .map((project: { id?: unknown; name?: unknown }) => {
        const projectId = Number(project.id);
        const lack: string[] = [];
        if (!voucherSet.has(`${projectId}|settlement`)) lack.push('结算单');
        if (!voucherSet.has(`${projectId}|attendance`)) lack.push('考勤表');
        if (!laborSet.has(projectId)) lack.push('用工分析');
        return { projectId, projectName: String(project.name || ''), missing: lack };
      })
      .filter((row: { missing: string[] }) => row.missing.length > 0);

    return apiSuccess({ month, count: missing.length, missing: missing.slice(0, 12) });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '加载凭证提醒失败'));
  }
}
