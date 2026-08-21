import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getLoginLockSeconds,
  recordLoginFailure,
  clearLoginFailures,
} from '@/lib/login-rate-limit';

describe('login-rate-limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // 清空内部状态（通过成功清除达到 reset 目的）
    clearLoginFailures('1.2.3.4', 'admin');
    clearLoginFailures('1.2.3.4', 'other');
    clearLoginFailures('9.9.9.9', 'admin');
  });

  it('初始状态未锁定', () => {
    expect(getLoginLockSeconds('1.2.3.4', 'admin')).toBe(0);
  });

  it('连续失败 5 次触发账号锁定', () => {
    for (let i = 0; i < 4; i += 1) {
      expect(recordLoginFailure('1.2.3.4', 'admin')).toBe(false);
      expect(getLoginLockSeconds('1.2.3.4', 'admin')).toBe(0);
    }
    // 第 5 次触发锁定
    expect(recordLoginFailure('1.2.3.4', 'admin')).toBe(true);
    const lockSeconds = getLoginLockSeconds('1.2.3.4', 'admin');
    expect(lockSeconds).toBeGreaterThan(0);
    expect(lockSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it('锁定期间即使换了 IP 也不能登录同一账号', () => {
    for (let i = 0; i < 5; i += 1) {
      recordLoginFailure('1.2.3.4', 'admin');
    }
    expect(getLoginLockSeconds('9.9.9.9', 'admin')).toBeGreaterThan(0);
  });

  it('不同账号互不影响（IP 维度 20 次才锁）', () => {
    for (let i = 0; i < 5; i += 1) {
      recordLoginFailure('1.2.3.4', 'admin');
    }
    // admin 已锁，但 other 账号仍可尝试
    expect(getLoginLockSeconds('1.2.3.4', 'other')).toBe(0);
  });

  it('登录成功清除失败计数', () => {
    for (let i = 0; i < 4; i += 1) {
      recordLoginFailure('1.2.3.4', 'admin');
    }
    clearLoginFailures('1.2.3.4', 'admin');
    expect(getLoginLockSeconds('1.2.3.4', 'admin')).toBe(0);
    // 清除后重新计数（不会因历史失败直接触发）
    expect(recordLoginFailure('1.2.3.4', 'admin')).toBe(false);
  });

  it('锁定到期后自动解锁', () => {
    for (let i = 0; i < 5; i += 1) {
      recordLoginFailure('1.2.3.4', 'admin');
    }
    expect(getLoginLockSeconds('1.2.3.4', 'admin')).toBeGreaterThan(0);
    // 推进 16 分钟
    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(getLoginLockSeconds('1.2.3.4', 'admin')).toBe(0);
  });

  it('长时间无活动后会重新计数，不会一直累积旧失败', () => {
    expect(recordLoginFailure('1.2.3.4', 'stale-user')).toBe(false);

    // 先推进 25 小时，让旧记录过期清理
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    // 重新从 1 次失败开始计数，而不是沿用旧记录
    for (let i = 0; i < 4; i += 1) {
      expect(recordLoginFailure('1.2.3.4', 'stale-user')).toBe(false);
    }
    expect(recordLoginFailure('1.2.3.4', 'stale-user')).toBe(true);
  });
});
