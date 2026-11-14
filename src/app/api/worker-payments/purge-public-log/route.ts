import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { syncSalaryPaymentStatus } from '@/lib/business-logic';
import { auditLog } from '@/lib/audit-log';

/**
 * POST /api/worker-payments/purge-public-log
 * 清除挂在「公司公共项目/非项目日志」下的工资发放记录（红线项目，只允许施工日志使用）。
 * 仅超级管理员可执行；删除后重算相关工资记录的发放状态。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    if (!auth.user.is_super_admin && !['admin', 'boss'].includes(String(auth.user.role || ''))) {
      return apiForbidden('只有管理员可以执行清理');
    }

    const client = getSupabaseClient();
    const { data: publicLogRows } = await client
      .from('projects')
      .select('id, name')
      .ilike('name', '%公司公共项目%');
    const ids = (publicLogRows || []).map((row: { id?: unknown }) => Number(row.id)).filter(Boolean);
    if (ids.length === 0) return apiSuccess({ deleted: 0, affectedSalaries: 0 });

    const { data: payments } = await client
      .from('salary_payments')
      .select('id, salary_id')
      .in('project_id', ids);

    const paymentIds = (payments || []).map((row: { id?: unknown }) => Number(row.id)).filter(Boolean);
    const salaryIds = Array.from(new Set((payments || [])
      .map((row: { salary_id?: unknown }) => Number(row.salary_id))
      .filter(Boolean)));

    let deleted = 0;
    for (let i = 0; i < paymentIds.length; i += 200) {
      const chunk = paymentIds.slice(i, i + 200);
      const { error } = await client.from('salary_payments').delete().in('id', chunk);
      if (error) throw new Error(error.message);
      deleted += chunk.length;
    }

    for (const salaryId of salaryIds) {
      try {
        await syncSalaryPaymentStatus(salaryId);
      } catch {
        // 单条同步失败不影响清理
      }
    }

    await auditLog({
      operationType: 'delete',
      resourceType: 'salary_payment',
      resourceId: 0,
      details: { action: 'purge_public_log_payments', projects: ids, deleted, affectedSalaries: salaryIds.length },
      request,
    });

    return apiSuccess({ deleted, affectedSalaries: salaryIds.length });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '清理公共项目发放记录失败'));
  }
}
