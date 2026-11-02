import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { restoreTable } from '@/lib/data-backup';
import { auditLog } from '@/lib/audit-log';
import { invalidateAggregationCache } from '@/lib/data-aggregation';

/**
 * POST /api/system/backups/restore
 * body: { date, table, confirm: 'RESTORE' }
 * 只恢复单张表（按 id upsert，不删除现有数据），避免一次性整库覆盖造成二次事故。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const date = String(body?.date || '');
    const table = String(body?.table || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return apiBadRequest('日期不合法');
    if (!table) return apiBadRequest('缺少表名');
    if (String(body?.confirm || '') !== 'RESTORE') return apiBadRequest('请输入 RESTORE 确认恢复');

    const result = await restoreTable({ date, table });
    try {
      invalidateAggregationCache();
    } catch {
      // 缓存失效非致命
    }
    await auditLog({
      operationType: 'update',
      resourceType: 'data_backup_restore',
      details: { date, table, restored: result.restored },
      request,
    });

    return apiSuccess({ date, table, restored: result.restored });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '恢复失败'));
  }
}
