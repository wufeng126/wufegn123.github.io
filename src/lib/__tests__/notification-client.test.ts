import { describe, it, expect } from 'vitest';
import { isNotificationUnread, isNotificationRead } from '@/lib/notification-client';

describe('notification-client 已读判断（is_read 兼容 varchar/NULL/boolean）', () => {
  it('NULL → 未读', () => {
    expect(isNotificationUnread(null)).toBe(true);
    expect(isNotificationUnread(undefined)).toBe(true);
  });

  it("字符串 'false' → 未读（历史核心 bug）", () => {
    expect(isNotificationUnread('false')).toBe(true);
    expect(isNotificationUnread('FALSE')).toBe(true);
  });

  it('布尔 false / 数字 0 → 未读', () => {
    expect(isNotificationUnread(false)).toBe(true);
    expect(isNotificationUnread(0)).toBe(true);
    expect(isNotificationUnread('0')).toBe(true);
  });

  it("字符串 'true' / 布尔 true / 1 → 已读", () => {
    expect(isNotificationUnread('true')).toBe(false);
    expect(isNotificationUnread('TRUE')).toBe(false);
    expect(isNotificationUnread(true)).toBe(false);
    expect(isNotificationUnread(1)).toBe(false);
    expect(isNotificationUnread('1')).toBe(false);
  });

  it('isNotificationRead 与 unread 互为反义', () => {
    expect(isNotificationRead('false')).toBe(false);
    expect(isNotificationRead(null)).toBe(false);
    expect(isNotificationRead('true')).toBe(true);
    expect(isNotificationRead(true)).toBe(true);
  });
});
