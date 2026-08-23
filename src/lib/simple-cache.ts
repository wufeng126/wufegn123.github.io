/**
 * 轻量内存 TTL 缓存
 *
 * 用途：缓存"读多写少 + 计算昂贵"的聚合查询结果（首页 dashboard、月报 summary 等），
 * 在 TTL 窗口内直接返回缓存，避免每次请求都触发几十次 DB 查询。
 *
 * 设计说明：
 * - 单实例部署：直接命中内存。
 * - 多实例部署：每个实例各持一份缓存，存在短暂不一致窗口，但属于统计聚合数据，可接受。
 *   如需强一致可后续替换为 Redis。
 * - 写操作（新增结算/付款/工资等）应调用 invalidateByPrefix 主动失效。
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// 定期清理过期项，避免内存无限增长（每 5 分钟一次）
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt <= now) store.delete(key);
    }
  }, 5 * 60 * 1000).unref?.();
}

export interface CacheOptions {
  /** 缓存有效期（毫秒） */
  ttlMs: number;
  /** 缓存 key 前缀，用于按业务域批量失效 */
  prefix?: string;
}

/**
 * 读取缓存；未命中或已过期时调用 factory 计算并写入。
 */
export async function cached<T>(
  key: string,
  options: CacheOptions,
  factory: () => Promise<T>
): Promise<T> {
  const cacheKey = options.prefix ? `${options.prefix}:${key}` : key;
  const existing = store.get(cacheKey) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) {
    return existing.value;
  }
  const value = await factory();
  store.set(cacheKey, { value, expiresAt: Date.now() + options.ttlMs });
  return value;
}

/**
 * 按前缀批量失效缓存。
 * 例如写操作后调用 invalidateByPrefix('dashboard') 清空所有首页相关缓存。
 */
export function invalidateByPrefix(prefix: string): void {
  const target = prefix.endsWith(':') ? prefix : `${prefix}:`;
  for (const key of store.keys()) {
    if (key.startsWith(target)) store.delete(key);
  }
}

/** 清空全部缓存（主要用于测试） */
export function clearCache(): void {
  store.clear();
}
