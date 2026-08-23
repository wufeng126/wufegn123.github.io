/**
 * 统一日志工具
 *
 * 目标：
 * - 生产环境自动收敛 debug/info 级别日志，减少噪音与潜在敏感信息泄漏
 * - error/warn 始终输出，便于线上排障
 * - 调用方逐步从原生 console.* 迁移到 logger.*，便于后续接入远程日志/脱敏
 *
 * 注意：本工具不做强脱敏，调用方仍需避免直接打印身份证、银行卡、token 等敏感字段。
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProduction = process.env.NODE_ENV === 'production';

// 生产环境仅输出 warn 及以上；开发环境输出全部
const minLevel: LogLevel = isProduction ? 'warn' : 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatScope(scope?: string): string {
  return scope ? `[${scope}]` : '';
}

export const logger = {
  debug(message: unknown, ...args: unknown[]): void {
    if (!shouldLog('debug')) return;
    if (args.length > 0) console.debug(message, ...args);
    else console.debug(message);
  },

  info(scopeOrMessage: string, ...args: unknown[]): void {
    if (!shouldLog('info')) return;
    console.info(formatScope(scopeOrMessage), ...args);
  },

  warn(message: unknown, ...args: unknown[]): void {
    if (!shouldLog('warn')) return;
    if (args.length > 0) console.warn(message, ...args);
    else console.warn(message);
  },

  error(message: unknown, ...args: unknown[]): void {
    if (!shouldLog('error')) return;
    if (args.length > 0) console.error(message, ...args);
    else console.error(message);
  },
};

/**
 * 对 Error 对象做安全提取，避免直接拼接内部细节。
 * 仅返回 message 与可选 code，堆栈只在开发环境输出。
 */
export function describeError(error: unknown): { message: string; code?: string; stack?: string } {
  const err = error as { message?: string; code?: string; stack?: string } | null;
  return {
    message: err?.message ? String(err.message) : '未知错误',
    code: err?.code ? String(err.code) : undefined,
    stack: isProduction ? undefined : err?.stack,
  };
}
