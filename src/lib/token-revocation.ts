/**
 * Token 撤销黑名单 — 数据库持久化 + 内存缓存。
 *
 * - 单实例：内存 Set 即时生效。
 * - 多实例：DB 写入后由其他实例最多 60s 后通过定时刷新同步。
 * - expired 的记录由 lazy cleanup + 周期刷新清理，避免无限增长。
 * - 边缘环境（proxy）若 Supabase 凭据未就绪会自动降级为纯内存模式，保证登录链路不阻断。
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

const REFRESH_INTERVAL_MS = 60_000;
const CLEANUP_THRESHOLD = 500;

// 内存缓存：jti -> 过期时间戳（ms）
const revokedCache = new Map<string, number>();
let lastRefresh = 0;
let refreshInFlight: Promise<void> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

function isBrowserLike(): boolean {
  // proxy.ts 在 Edge Runtime 中也会引用本模块；只在能拿到 Supabase 客户端时才做 DB 查询
  return typeof process === 'undefined' || !process.env.COZE_SUPABASE_URL;
}

function schedulePeriodicRefresh() {
  if (periodicTimer || isBrowserLike()) return;
  try {
    periodicTimer = setInterval(() => {
      void refreshFromDb().catch(() => {});
    }, REFRESH_INTERVAL_MS);
    // 不阻止进程退出
    if (periodicTimer && typeof periodicTimer.unref === 'function') {
      periodicTimer.unref();
    }
  } catch {
    // ignore
  }
}

async function refreshFromDb(): Promise<void> {
  if (isBrowserLike()) return;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const client = getSupabaseClient();
      const nowIso = new Date().toISOString();
      const { data, error } = await client
        .from('revoked_tokens')
        .select('jti, expires_at')
        .gt('expires_at', nowIso)
        .limit(5000);

      if (error || !data) return;

      const next = new Map<string, number>();
      for (const row of data as Array<{ jti: string; expires_at: string }>) {
        const exp = Date.parse(row.expires_at);
        if (!Number.isNaN(exp)) next.set(row.jti, exp);
      }
      revokedCache.clear();
      for (const [k, v] of next) revokedCache.set(k, v);
      lastRefresh = Date.now();
    } catch {
      // 降级：保持现有内存缓存
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function cleanupExpiredLocked() {
  if (revokedCache.size < CLEANUP_THRESHOLD) return;
  const now = Date.now();
  for (const [jti, exp] of revokedCache) {
    if (exp <= now) revokedCache.delete(jti);
  }
}

/**
 * 撤销一个 JWT（按 jti）。
 * @param jti JWT ID
 * @param expMs JWT 的 exp 时间戳（ms），用于在 DB 中自动过期清理
 * @param userId 可选，关联的用户 ID
 */
export async function revokeJti(jti: string, expMs?: number, userId?: number): Promise<void> {
  if (!jti) return;
  const expiresAtMs = expMs && expMs > Date.now()
    ? expMs
    : Date.now() + 7 * 24 * 60 * 60 * 1000; // 默认 7 天后过期

  revokedCache.set(jti, expiresAtMs);
  cleanupExpiredLocked();

  if (isBrowserLike()) return;

  schedulePeriodicRefresh();
  try {
    const client = getSupabaseClient();
    await client
      .from('revoked_tokens')
      .upsert({
        jti,
        user_id: userId ?? null,
        expires_at: new Date(expiresAtMs).toISOString(),
        revoked_at: new Date().toISOString(),
      }, { onConflict: 'jti' });
  } catch {
    // 内存撤销已生效，DB 写入失败不阻断登出
  }
}

/** 判断 jti 是否已撤销；首次访问会异步从 DB 拉取。 */
export async function isJtiRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;

  const cached = revokedCache.get(jti);
  if (cached !== undefined) {
    if (cached > Date.now()) return true;
    revokedCache.delete(jti);
    return false;
  }

  // 缓存未命中且超过刷新间隔时，同步拉一次（最多 60s 一次）
  if (!isBrowserLike() && Date.now() - lastRefresh > REFRESH_INTERVAL_MS) {
    await refreshFromDb();
    const hit = revokedCache.get(jti);
    if (hit !== undefined) return hit > Date.now();
  }

  return false;
}

/** 启动时预热（可选）；API 路由可在模块加载时调用。 */
export async function warmupRevocationCache(): Promise<void> {
  if (isBrowserLike() || lastRefresh > 0) return;
  await refreshFromDb();
  schedulePeriodicRefresh();
}
