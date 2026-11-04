import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { auditLog } from '@/lib/audit-log';

/**
 * POST /api/labor-analysis/change-month
 * body: { project_id, from_month, to_month }
 * 修正填报月份（填错月份时可改）：目标月份不能已有记录（避免覆盖）。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const projectId = Number(body?.project_id) || 0;
    const fromMonth = String(body?.from_month || '').trim();
    const toMonth = String(body?.to_month || '').trim();
    const monthPattern = /^\d{4}-\d{2}$/;

    if (!projectId) return apiBadRequest('项目参数不正确');
    if (!monthPattern.test(fromMonth) || !monthPattern.test(toMonth)) return apiBadRequest('月份格式应为 YYYY-MM');
    if (fromMonth === toMonth) return apiBadRequest('新旧月份相同，无需修改');

    const client = getSupabaseClient();
    const scope = await getAccessibleProjectIds(client, auth.user);
    if (scope !== null && !scope.includes(projectId)) return apiForbidden('无权修改该项目');

    const { data: source } = await client
      .from('monthly_labor_analyses')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('year_month', fromMonth)
      .maybeSingle();
    if (!source) return apiNotFound('原月份没有填报记录');
    if (String(source.status) === 'confirmed') return apiBadRequest('已确认的用工分析不能改月份');

    const { data: conflict } = await client
      .from('monthly_labor_analyses')
      .select('id')
      .eq('project_id', projectId)
      .eq('year_month', toMonth)
      .maybeSingle();
    if (conflict) return apiBadRequest(`目标月份 ${toMonth} 已有填报记录，请先删除或改月份`);

    const { error } = await client
      .from('monthly_labor_analyses')
      .update({ year_month: toMonth, updated_at: new Date().toISOString() })
      .eq('id', Number(source.id));
    if (error) throw new Error(error.message);

    await auditLog({
      operationType: 'update',
      resourceType: 'monthly_labor_analysis',
      resourceId: Number(source.id),
      details: { action: 'change_month', projectId, fromMonth, toMonth },
      request,
    });

    return apiSuccess({ id: Number(source.id), fromMonth, toMonth });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '修改月份失败'));
  }
}
