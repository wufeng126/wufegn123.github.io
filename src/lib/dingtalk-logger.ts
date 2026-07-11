/**
 * 钉钉 API 调用日志模块
 *
 * 功能：
 * 1. 记录每次钉钉 API 调用的类型、成功/失败、错误信息
 * 2. 支持内存缓冲 + 控制台输出
 * 3. 提供查询接口供管理 API 使用
 * 4. 自动脱敏敏感字段
 */

/** 单条钉钉 API 调用日志 */
export interface DingTalkApiLogEntry {
  /** API 路径或标识（如 gettoken, /topapi/v2/user/get） */
  api: string;
  /** HTTP 方法 */
  method: string;
  /** 调用时间 ISO 字符串 */
  timestamp: string;
  /** 是否成功 */
  success?: boolean;
  /** 钉钉错误码 */
  errorCode?: number;
  /** 钉钉错误信息 */
  errorMessage?: string;
  /** 请求体（已脱敏） */
  requestBody?: Record<string, unknown>;
  /** 响应耗时（ms） */
  duration?: number;
}

/** 内存日志缓冲区最大条数 */
const MAX_LOG_ENTRIES = 500;

/**
 * 钉钉 API 调用日志记录器
 */
class DingTalkApiLogger {
  /** 内存日志缓冲 */
  private logs: DingTalkApiLogEntry[] = [];

  /** 记录一条 API 调用日志 */
  log(entry: DingTalkApiLogEntry): void {
    // 控制台输出（开发环境便于调试）
    if (entry.success) {
      console.log(`[DingTalk API] ✓ ${entry.method} ${entry.api}`);
    } else {
      console.error(
        `[DingTalk API] ✗ ${entry.method} ${entry.api}` +
        (entry.errorCode ? ` errcode=${entry.errorCode}` : '') +
        (entry.errorMessage ? ` errmsg=${entry.errorMessage}` : '')
      );
    }

    // 写入内存缓冲
    this.logs.push(entry);

    // 超出上限，移除最早的
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(-MAX_LOG_ENTRIES);
    }
  }

  /**
   * 查询日志
   * @param options 筛选选项
   * @returns 日志列表（倒序，最新在前）
   */
  query(options?: {
    /** 只看失败记录 */
    onlyFailed?: boolean;
    /** 按API路径筛选 */
    apiFilter?: string;
    /** 最大返回条数 */
    limit?: number;
  }): DingTalkApiLogEntry[] {
    const { onlyFailed = false, apiFilter, limit = 100 } = options || {};

    let result = [...this.logs].reverse(); // 倒序

    if (onlyFailed) {
      result = result.filter(log => log.success === false);
    }

    if (apiFilter) {
      result = result.filter(log => log.api.includes(apiFilter));
    }

    return result.slice(0, limit);
  }

  /**
   * 获取统计摘要
   */
  getStats(): {
    total: number;
    success: number;
    failed: number;
    recentErrors: DingTalkApiLogEntry[];
  } {
    const total = this.logs.length;
    const success = this.logs.filter(l => l.success === true).length;
    const failed = this.logs.filter(l => l.success === false).length;
    const recentErrors = this.logs
      .filter(l => l.success === false)
      .slice(-10)
      .reverse();

    return { total, success, failed, recentErrors };
  }

  /** 清空日志缓冲 */
  clear(): void {
    this.logs = [];
  }
}

/** 全局日志记录器单例 */
export const dingtalkApiLogger = new DingTalkApiLogger();
