import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getStorageMode } from '@/lib/oss-storage';

/** 解析 JWT 的 payload（不校验签名，只用于判断 key 类型：service_role / anon） */
function readJwtRole(key: string): string | null {
  try {
    const parts = key.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: string };
    return payload.role || null;
  } catch {
    return null;
  }
}

/**
 * GET /api/system/env-check
 * 部署环境自检：确认数据库用的是什么 key、RLS 能不能安全开启、存储模式等。
 * 只返回布尔值和类型，不返回任何密钥内容。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;

    const url = String(process.env.COZE_SUPABASE_URL || '').trim();
    const serviceKey = String(
      process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    ).trim();
    const anonKey = String(process.env.COZE_SUPABASE_ANON_KEY || '').trim();
    const effectiveKey = serviceKey || anonKey;
    const keyRole = effectiveKey ? readJwtRole(effectiveKey) : null;

    let storageMode: 'oss' | 'supabase' | 'unknown' = 'unknown';
    try {
      storageMode = getStorageMode();
    } catch {
      storageMode = 'unknown';
    }

    const usingServiceRole = Boolean(serviceKey) && (keyRole === 'service_role' || keyRole === null);

    return apiSuccess({
      database: {
        url_configured: Boolean(url),
        service_role_key_configured: Boolean(serviceKey),
        anon_key_configured: Boolean(anonKey),
        effective_key_role: keyRole || (serviceKey ? 'unknown(自定义密钥)' : anonKey ? 'anon' : 'none'),
        using_service_role: usingServiceRole,
      },
      storage: {
        mode: storageMode,
        backup_encryption_configured: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
        approval_link_secret_configured: Boolean(
          process.env.APPROVAL_LINK_SECRET || process.env.DINGTALK_APP_SECRET,
        ),
        cron_token_configured: Boolean(process.env.BACKUP_CRON_TOKEN),
      },
      rls_safety: usingServiceRole
        ? { safe_to_enable: true, reason: '应用使用 service_role 访问数据库，开启 RLS 后仍然正常（匿名 key 会被拒绝）' }
        : {
            safe_to_enable: false,
            reason: '应用当前没有使用 service_role（或 key 类型是 anon），开启 RLS 会导致全站读不到数据',
          },
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '环境自检失败'));
  }
}
