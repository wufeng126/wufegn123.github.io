import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireSuperAdmin } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { auditLog } from '@/lib/audit-log';

/**
 * POST /api/reports/monthly/workflow/cleanup
 * { mode: 'delete' | 'to_boss' }
 * 处理历史遗留的 pending_manager（待项目经理补充）月报：
 * - delete：直接删除这些月报流程记录（内容不可恢复，需二次确认）
 * - to_boss：改为 pending_boss，交给老板继续审批（保留内容）
 * 仅超级管理员。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const mode = String(body?.mode || 'delete');
    if (!['delete', 'to_boss'].includes(mode)) return apiBadRequest('mode 只能是 delete 或 to_boss');

    const client = getSupabaseClient();
    const { data: rows, error } = await client
      .from('monthly_report_workflows')
      .select('id, year_month, project_scope, status, updated_at')
      .eq('status', 'pending_manager');
    if (error) throw new Error(error.message);

    const targets = rows || [];
    if (targets.length === 0) return apiSuccess({ affected: 0, mode, message: '没有待项目经理补充的月报' });

    const ids = targets.map((row: { id?: unknown }) => Number(row.id)).filter(Boolean);

    if (mode === 'delete') {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error: deleteError } = await client.from('monthly_report_workflows').delete().in('id', chunk);
        if (deleteError) throw new Error(deleteError.message);
      }
    } else {
      const { error: updateError } = await client
        .from('monthly_report_workflows')
        .update({ status: 'pending_boss', updated_at: new Date().toISOString() })
        .in('id', ids);
      if (updateError) throw new Error(updateError.message);
    }

    await auditLog({
      operationType: mode === 'delete' ? 'delete' : 'update',
      resourceType: 'monthly_report_workflow',
      resourceId: 0,
      details: { action: 'cleanup_pending_manager', mode, ids, months: targets.map((row: { year_month?: string }) => row.year_month) },
      request,
    });

    return apiSuccess({ affected: ids.length, mode, message: mode === 'delete' ? '已删除待项目经理补充的月报' : '已转为待老板审批' });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '清理待项目经理月报失败'));
  }
}
