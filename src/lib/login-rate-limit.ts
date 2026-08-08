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
};

const ACCOUNT_MAX_FAILURES = 5;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000; // 15 分钟
const IP_MAX_FAILURES = 20;
const IP_LOCK_MS = 30 * 60 * 1000; // 30 分钟

const accountAttempts = new Map<string, AttemptRecord>();
const ipAttempts = new Map<string, AttemptRecord>();
const ACCOUNT_KEY_PREFIX = 'acct:';
const IP_KEY_PREFIX = 'ip:';

/** 清理过期条目，防止内存泄漏（每次操作时顺带清理） */
function prune(map: Map<string, AttemptRecord>, now: number) {
  if (map.size < 500) return; // 小规模不清理
  for (const [key, record] of map) {
    if (record.lockedUntil > 0 && record.lockedUntil < now) {
      map.delete(key);
    }
  }
}

function getRecord(map: Map<string, AttemptRecord>, key: string): AttemptRecord {
  let record = map.get(key);
  if (!record) {
    record = { failures: 0, lockedUntil: 0 };
    map.set(key, record);
  }
  return record;
}

/** 检查是否被锁定，返回剩余锁定秒数（0 = 未锁定） */
export function getLoginLockSeconds(ip: string, username: string): number {
  const now = Date.now();
  const account = getRecord(accountAttempts, ACCOUNT_KEY_PREFIX + username);
  const ipRecord = getRecord(ipAttempts, IP_KEY_PREFIX + ip);
  if (account.lockedUntil > now) return Math.ceil((account.lockedUntil - now) / 1000);
  if (ipRecord.lockedUntil > now) return Math.ceil((ipRecord.lockedUntil - now) / 1000);
  return 0;
}

/** 记录一次登录失败，返回是否已触发锁定（true = 刚被锁定） */
export function recordLoginFailure(ip: string, username: string): boolean {
  const now = Date.now();
  prune(accountAttempts, now);
  prune(ipAttempts, now);

  const account = getRecord(accountAttempts, ACCOUNT_KEY_PREFIX + username);
  account.failures += 1;
  if (account.failures >= ACCOUNT_MAX_FAILURES) {
    account.lockedUntil = now + ACCOUNT_LOCK_MS;
    account.failures = 0;
    return true;
  }

  const ipRecord = getRecord(ipAttempts, IP_KEY_PREFIX + ip);
  ipRecord.failures += 1;
  if (ipRecord.failures >= IP_MAX_FAILURES) {
    ipRecord.lockedUntil = now + IP_LOCK_MS;
    ipRecord.failures = 0;
    return true;
  }

  return false;
}

/** 登录成功：清除该账号及 IP 的失败计数 */
export function clearLoginFailures(ip: string, username: string) {
  accountAttempts.delete(ACCOUNT_KEY_PREFIX + username);
  ipAttempts.delete(IP_KEY_PREFIX + ip);
}
