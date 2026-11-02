import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { detectSqlCapability, executeSql, readMigrationFile } from '@/lib/sql-exec';
import { runBackup, todayKey } from '@/lib/data-backup';
import { auditLog } from '@/lib/audit-log';

/**
 * GET  /api/system/sql  探测当前环境能否执行 SQL（是否有 DATABASE_URL / 平台 RPC）
 * POST /api/system/sql  { file, confirm: 'EXECUTE', backupFirst?: boolean }
 *      执行 migrations 白名单里的某个脚本（默认先备份）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;
    const capability = await detectSqlCapability();
    return apiSuccess(capability);
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '探测数据库执行能力失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const file = String(body?.file || '');
    if (!file) return apiBadRequest('请选择要执行的脚本');
    if (String(body?.confirm || '') !== 'EXECUTE') return apiBadRequest('请输入 EXECUTE 确认执行');

    const capability = await detectSqlCapability();
    if (capability.mode === 'none') {
      return apiBadRequest(`${capability.detail}；请在云控制台的 SQL 窗口手动执行该脚本`);
    }

    const sql = readMigrationFile(file);

    let backup: { ok: boolean; message: string } = { ok: false, message: '未备份' };
    if (body?.backupFirst !== false) {
      try {
        const { manifest } = await runBackup({ date: todayKey() });
        backup = { ok: true, message: `已备份 ${manifest.tables.length} 张表 / ${manifest.totalRows} 行` };
      } catch (error) {
        backup = { ok: false, message: `备份失败：${getErrorMessage(error, '未知错误')}` };
      }
    }

    const result = await executeSql(sql);
    await auditLog({
      operationType: 'update',
      resourceType: 'sql_execute',
      details: { file, mode: result.mode, ok: result.ok, backup: backup.message },
      request,
    });

    if (!result.ok) {
      return apiBadRequest(`执行失败（${result.mode}）：${result.detail}`);
    }

    return apiSuccess({
      file,
      mode: result.mode,
      detail: result.detail,
      backup,
      statementCount: sql.split(';').filter((part) => part.trim() && !part.trim().startsWith('--')).length,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '执行脚本失败'));
  }
}
