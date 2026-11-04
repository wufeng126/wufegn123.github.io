import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

/**
 * GET /api/labor-analysis/project-summary?project_id=1&year=2026
 * 某项目用工分析：按月份列 + 按工作内容跨月累计（工时/金额/占比）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = Number(searchParams.get('project_id')) || 0;
    const year = String(searchParams.get('year') || '').trim();
    if (!projectId) return apiBadRequest('请选择项目');

    const scope = await getAccessibleProjectIds(client, auth.user);
    if (scope !== null && !scope.includes(projectId)) return apiForbidden('无权查看该项目');

    let query = client
      .from('monthly_labor_analyses')
      .select('id, year_month, total_hours, total_amount, status, submitted_at, updated_at')
      .eq('project_id', projectId)
      .order('year_month', { ascending: false });
    if (/^\d{4}$/.test(year)) query = query.ilike('year_month', `${year}-%`);

    const { data: analyses, error } = await query.limit(240);
    if (error) throw new Error(error.message);

    const ids = (analyses || []).map((row: { id?: unknown }) => Number(row.id)).filter(Boolean);
    const categoryMap = new Map<string, { hours: number; amount: number }>();
    const itemCountByAnalysis = new Map<number, number>();

    if (ids.length > 0) {
      const { data: items } = await client
        .from('monthly_labor_items')
        .select('analysis_id, category, hours, amount')
        .in('analysis_id', ids);
      (items || []).forEach((item: { analysis_id?: unknown; category?: unknown; hours?: unknown; amount?: unknown }) => {
        const key = String(item.category || '其他');
        const bucket = categoryMap.get(key) || { hours: 0, amount: 0 };
        bucket.hours += Number(item.hours) || 0;
        bucket.amount += Number(item.amount) || 0;
        categoryMap.set(key, bucket);
        const analysisId = Number(item.analysis_id);
        itemCountByAnalysis.set(analysisId, (itemCountByAnalysis.get(analysisId) || 0) + 1);
      });
    }

    const totalHours = Array.from(categoryMap.values()).reduce((sum, item) => sum + item.hours, 0);
    const totalAmount = Array.from(categoryMap.values()).reduce((sum, item) => sum + item.amount, 0);

    return apiSuccess({
      months: (analyses || []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        year_month: String(row.year_month || ''),
        total_hours: Number(row.total_hours) || 0,
        total_amount: Number(row.total_amount) || 0,
        status: String(row.status || 'draft'),
        item_count: itemCountByAnalysis.get(Number(row.id)) || 0,
        updated_at: row.updated_at || null,
      })),
      byCategory: Array.from(categoryMap.entries())
        .map(([category, value]) => ({
          category,
          hours: Math.round(value.hours * 100) / 100,
          amount: Math.round(value.amount * 100) / 100,
          ratio: totalHours > 0 ? Math.round((value.hours / totalHours) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.hours - a.hours),
      totals: {
        hours: Math.round(totalHours * 100) / 100,
        amount: Math.round(totalAmount * 100) / 100,
        months: (analyses || []).length,
      },
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '加载项目用工分析失败'));
  }
}
