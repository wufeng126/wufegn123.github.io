/**
 * 登录限流工具（内存实现）
 *
 * 策略：
 * - 按 `ip:username` 维度：连续失败 5 次 → 锁定 15 分钟（防针对单账号爆破）
 * - 按 `ip` 维度：连续失败 20 次 → 锁定 30 分钟（防分布式小规模扫描）
 * - 登录成功时清除对应账号的失败计数
 *
 * 说明：
 * - 内存实现，单实例部署有效；多实例部署时各实例独立计数（可接受，后续可换 Redis）
 * - 不影响钉钉免登（钉钉免登走 /api/auth/dingtalk/login，不经过本工具）
 */

type AttemptRecord = {
  failures: number;
  lockedUntil: number;
  updatedAt: number;
};

const ACCOUNT_MAX_FAILURES = 5;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000; // 15 分钟
const IP_MAX_FAILURES = 20;
const IP_LOCK_MS = 30 * 60 * 1000; // 30 分钟
const RECORD_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时无活动自动清理

const accountAttempts = new Map<string, AttemptRecord>();
const ipAttempts = new Map<string, AttemptRecord>();
const ACCOUNT_KEY_PREFIX = 'acct:';
const IP_KEY_PREFIX = 'ip:';

/** 清理过期条目，防止内存泄漏（每次操作时顺带清理） */
function prune(map: Map<string, AttemptRecord>, now: number) {
  for (const [key, record] of map) {
    const expiredLock = record.lockedUntil > 0 && record.lockedUntil < now;
    const staleUnlocked = record.lockedUntil <= now && now - record.updatedAt > RECORD_TTL_MS;
    if (expiredLock || staleUnlocked) {
      map.delete(key);
    }
  }
}

function createRecord(now: number): AttemptRecord {
  return { failures: 0, lockedUntil: 0, updatedAt: now };
}

function getOrCreateRecord(map: Map<string, AttemptRecord>, key: string, now: number): AttemptRecord {
  let record = map.get(key);
  if (!record) {
    record = createRecord(now);
    map.set(key, record);
  }
  record.updatedAt = now;
  return record;
}

function peekRecord(map: Map<string, AttemptRecord>, key: string): AttemptRecord | undefined {
  return map.get(key);
}

/** 检查是否被锁定，返回剩余锁定秒数（0 = 未锁定） */
export function getLoginLockSeconds(ip: string, username: string): number {
  const now = Date.now();
  prune(accountAttempts, now);
  prune(ipAttempts, now);

  const account = peekRecord(accountAttempts, ACCOUNT_KEY_PREFIX + username);
  const ipRecord = peekRecord(ipAttempts, IP_KEY_PREFIX + ip);
  if (account?.lockedUntil && account.lockedUntil > now) return Math.ceil((account.lockedUntil - now) / 1000);
  if (ipRecord?.lockedUntil && ipRecord.lockedUntil > now) return Math.ceil((ipRecord.lockedUntil - now) / 1000);
  return 0;
}

/** 记录一次登录失败，返回是否已触发锁定（true = 刚被锁定）
 *  isAdmin=true 时跳过账号维度锁定：防止攻击者用任意 IP 对管理员账号
 *  连续失败即锁死管理员（拒绝服务）；IP 维度防爆破依然生效。 */
export function recordLoginFailure(ip: string, username: string, isAdmin = false): boolean {
  const now = Date.now();
  prune(accountAttempts, now);
  prune(ipAttempts, now);

  if (!isAdmin) {
    const account = getOrCreateRecord(accountAttempts, ACCOUNT_KEY_PREFIX + username, now);
    account.failures += 1;
    account.updatedAt = now;
    if (account.failures >= ACCOUNT_MAX_FAILURES) {
      account.lockedUntil = now + ACCOUNT_LOCK_MS;
      account.failures = 0;
      account.updatedAt = now;
      return true;
    }
  }

  const ipRecord = getOrCreateRecord(ipAttempts, IP_KEY_PREFIX + ip, now);
  ipRecord.failures += 1;
  ipRecord.updatedAt = now;
  if (ipRecord.failures >= IP_MAX_FAILURES) {
    ipRecord.lockedUntil = now + IP_LOCK_MS;
    ipRecord.failures = 0;
    ipRecord.updatedAt = now;
    return true;
  }

  return false;
}

/** 登录成功：清除该账号及 IP 的失败计数 */
export function clearLoginFailures(ip: string, username: string) {
  accountAttempts.delete(ACCOUNT_KEY_PREFIX + username);
  ipAttempts.delete(IP_KEY_PREFIX + ip);
}
