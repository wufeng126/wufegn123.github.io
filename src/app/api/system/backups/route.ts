import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { cleanupOldBackups, runBackup, todayKey } from '@/lib/data-backup';

/** GET /api/system/backups：备份列表（auto=1 时若超过 20 小时没有成功备份会自动补一次） */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const auto = searchParams.get('auto') === '1';

    const { data: rows, error } = await client
      .from('data_backups')
      .select('id, backup_date, status, table_count, row_count, size_bytes, encrypted, error, started_at, finished_at')
      .order('started_at', { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);

    const list = rows || [];
    const lastSuccess = list.find((row) => row.status === 'success');
    const lastAt = lastSuccess?.finished_at ? new Date(String(lastSuccess.finished_at)).getTime() : 0;
    const stale = Date.now() - lastAt > 20 * 60 * 60 * 1000;
    let autoRun: { ran: boolean; message?: string } = { ran: false };

    if (auto && stale) {
      try {
        const { manifest } = await runBackup({ date: todayKey() });
        await cleanupOldBackups();
        autoRun = { ran: true, message: `已自动备份 ${manifest.tables.length} 张表 / ${manifest.totalRows} 行` };
      } catch (error) {
        autoRun = { ran: false, message: getErrorMessage(error, '自动备份失败') };
      }
    }

    return apiSuccess({
      backups: list,
      lastSuccessAt: lastSuccess?.finished_at || null,
      stale,
      autoRun,
      encryptionEnabled: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '查询备份失败'));
  }
}

/** POST /api/system/backups：立即备份 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const date = String(body?.date || todayKey());
    const { manifest } = await runBackup({ date });
    let cleanup: { deleted: number } = { deleted: 0 };
    try {
      cleanup = await cleanupOldBackups();
    } catch {
      // 清理失败不影响备份结果
    }

    return apiSuccess({
      date,
      tableCount: manifest.tables.length,
      rowCount: manifest.totalRows,
      bytes: manifest.totalBytes,
      encrypted: manifest.encrypted,
      skipped: manifest.skipped.length,
      cleaned: cleanup.deleted,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '备份失败'));
  }
}
