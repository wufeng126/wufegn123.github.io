import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { cleanupOldBackups, runBackup, todayKey } from '@/lib/data-backup';

/**
 * GET/POST /api/system/backups/cron
 * 供外部定时任务（如服务器 crontab / 阿里云函数）调用，每天触发一次备份。
 * 鉴权：请求头 x-backup-token 或 ?token= 需等于环境变量 BACKUP_CRON_TOKEN；
 *       未配置该变量时，只允许已登录且有 system:manage 权限的用户调用。
 */
async function handle(request: NextRequest) {
  const expected = String(process.env.BACKUP_CRON_TOKEN || '').trim();
  const headerToken = String(request.headers.get('x-backup-token') || '').trim();
  const queryToken = String(new URL(request.url).searchParams.get('token') || '').trim();
  // 优先请求头；URL 里的 token 会进访问日志，仅做兼容并提示改用请求头
  const provided = headerToken || queryToken;
  const tokenFromQuery = !headerToken && Boolean(queryToken);

  if (expected) {
    if (provided !== expected) return apiForbidden('token 不正确');
  } else {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;
  }

  try {
    const { manifest } = await runBackup({ date: todayKey() });
    let cleaned = 0;
    try {
      cleaned = (await cleanupOldBackups()).deleted;
    } catch {
      // 清理失败不影响备份
    }
    return apiSuccess({
      ...(tokenFromQuery ? { warn: 'token 走 URL 会进入访问日志，建议改用请求头 x-backup-token' } : {}),
      date: manifest.date,
      tableCount: manifest.tables.length,
      rowCount: manifest.totalRows,
      bytes: manifest.totalBytes,
      encrypted: manifest.encrypted,
      cleaned,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '定时备份失败'));
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
