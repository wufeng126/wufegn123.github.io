import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { readBackupFile } from '@/lib/data-backup';

/** GET /api/system/backups/manifest?date=YYYY-MM-DD：读取某次备份的清单 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const date = String(new URL(request.url).searchParams.get('date') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return apiBadRequest('日期不合法');

    const buffer = await readBackupFile(`backup/${date}/manifest.json`);
    const manifest = JSON.parse(buffer.toString('utf8'));
    return apiSuccess(manifest);
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '读取备份清单失败'));
  }
}
