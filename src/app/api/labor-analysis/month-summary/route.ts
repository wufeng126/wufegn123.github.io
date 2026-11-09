import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

/**
 * GET /api/labor-analysis/month-summary?month=YYYY-MM&project_id=all|123
 * 某月用工分析汇总（供月报展示）：总工时/总金额 + 按工作内容 + 按项目。
 * 只读展示，不参与成本计算。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const month = String(searchParams.get('month') || '').trim();
    const projectIdParam = String(searchParams.get('project_id') || 'all');
    if (!/^\d{4}-\d{2}$/.test(month)) return apiBadRequest('月份格式应为 YYYY-MM');

    const projectId = projectIdParam === 'all' ? 0 : Number(projectIdParam);
    if (projectIdParam !== 'all' && (!Number.isInteger(projectId) || projectId <= 0)) {
      return apiBadRequest('项目参数不正确');
    }

    const scope = await getAccessibleProjectIds(client, auth.user);
    if (projectId > 0 && scope !== null && !scope.includes(projectId)) {
      return apiForbidden('无权查看该项目');
    }

    let query = client
      .from('monthly_labor_analyses')
      .select('id, project_id, total_hours, total_amount, status')
      .eq('year_month', month);
    if (projectId > 0) query = query.eq('project_id', projectId);
    else if (scope !== null) {
      if (scope.length === 0) return apiSuccess({ month, hasData: false, totals: { hours: 0, amount: 0, projects: 0 }, byCategory: [], byProject: [] });
      query = query.in('project_id', scope);
    }

    const { data: analyses, error } = await query.limit(500);
    if (error) throw new Error(error.message);

    const ids = (analyses || []).map((row: { id?: unknown }) => Number(row.id)).filter(Boolean);
    const categoryMap = new Map<string, { hours: number; amount: number }>();
    if (ids.length > 0) {
      const { data: items } = await client
        .from('monthly_labor_items')
        .select('analysis_id, category, hours, amount')
        .in('analysis_id', ids);
      (items || []).forEach((item: { category?: unknown; hours?: unknown; amount?: unknown }) => {
        const key = String(item.category || '其他');
        const bucket = categoryMap.get(key) || { hours: 0, amount: 0 };
        bucket.hours += Number(item.hours) || 0;
        bucket.amount += Number(item.amount) || 0;
        categoryMap.set(key, bucket);
      });
    }

    const projectIds = Array.from(new Set((analyses || []).map((row: { project_id?: unknown }) => Number(row.project_id)).filter(Boolean)));
    const projectNameMap = new Map<number, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await client.from('projects').select('id, name').in('id', projectIds);
      (projects || []).forEach((project: { id?: unknown; name?: unknown }) => {
        projectNameMap.set(Number(project.id), String(project.name || ''));
      });
    }

    const totalHours = Array.from(categoryMap.values()).reduce((sum, item) => sum + item.hours, 0);
    const totalAmount = Array.from(categoryMap.values()).reduce((sum, item) => sum + item.amount, 0);

    return apiSuccess({
      month,
      hasData: (analyses || []).length > 0,
      totals: {
        hours: Math.round(totalHours * 100) / 100,
        amount: Math.round(totalAmount * 100) / 100,
        projects: (analyses || []).length,
      },
      byCategory: Array.from(categoryMap.entries())
        .map(([category, value]) => ({
          category,
          hours: Math.round(value.hours * 100) / 100,
          amount: Math.round(value.amount * 100) / 100,
          ratio: totalHours > 0 ? Math.round((value.hours / totalHours) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.hours - a.hours),
      byProject: (analyses || []).map((row: Record<string, unknown>) => ({
        projectId: Number(row.project_id),
        projectName: projectNameMap.get(Number(row.project_id)) || `项目#${row.project_id}`,
        hours: Number(row.total_hours) || 0,
        amount: Number(row.total_amount) || 0,
        status: String(row.status || 'draft'),
      })),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '加载月度用工汇总失败'));
  }
}
