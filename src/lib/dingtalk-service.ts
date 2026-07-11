/**
 * 钉钉企业内部应用服务模块
 *
 * 功能：
 * 1. 获取企业内部应用 access_token（带缓存 & 自动刷新）
 * 2. 统一钉钉 API 调用封装（自动带 token、错误处理）
 * 3. API 调用日志记录
 *
 * 所有 AppSecret 只在服务端使用，绝不返回给前端
 */

import { getDingTalkConfig, isDingTalkConfigured } from './dingtalk-config';
import { dingtalkApiLogger, type DingTalkApiLogEntry } from './dingtalk-logger';

// ===== access_token 缓存 =====

interface TokenCache {
  accessToken: string;
  expiresAt: number; // 过期时间戳（ms）
}

/** 模块级 token 缓存（进程内） */
let tokenCache: TokenCache | null = null;

/** 提前刷新窗口（秒）：过期前 5 分钟自动刷新 */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ===== 钉钉 API 常量 =====

const DINGTALK_API_BASE = 'https://oapi.dingtalk.com';

/** 获取 access_token 的接口 */
const TOKEN_URL = `${DINGTALK_API_BASE}/gettoken`;

// ===== 公开类型 =====

/** 钉钉 API 调用结果 */
export interface DingTalkApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  errcode?: number;
  errmsg?: string;
}

// ===== access_token 获取与缓存 =====

/**
 * 获取钉钉企业内部应用的 access_token
 * - 优先使用缓存
 * - 过期前 5 分钟自动刷新
 * - 缓存失效则重新请求
 */
export async function getAccessToken(): Promise<string> {
  // 检查配置
  if (!isDingTalkConfigured()) {
    throw new Error('[DingTalkService] 钉钉企业内部应用未配置（缺少 DINGTALK_APP_KEY 或 DINGTALK_APP_SECRET）');
  }

  const now = Date.now();

  // 缓存有效（未过期且在刷新窗口外）
  if (tokenCache && tokenCache.expiresAt > now + REFRESH_BUFFER_MS) {
    return tokenCache.accessToken;
  }

  // 请求新 token
  const config = getDingTalkConfig()!;
  const logEntry: DingTalkApiLogEntry = {
    api: 'gettoken',
    method: 'GET',
    timestamp: new Date().toISOString(),
  };

  try {
    const url = `${TOKEN_URL}?appkey=${encodeURIComponent(config.appKey)}&appsecret=${encodeURIComponent(config.appSecret)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();

    if (result.errcode !== 0) {
      logEntry.success = false;
      logEntry.errorCode = result.errcode;
      logEntry.errorMessage = result.errmsg;
      dingtalkApiLogger.log(logEntry);

      throw new Error(`[DingTalkService] 获取 access_token 失败: errcode=${result.errcode}, errmsg=${result.errmsg}`);
    }

    // 缓存 token
    const expiresIn: number = result.expires_in || 7200; // 默认 2 小时
    tokenCache = {
      accessToken: result.access_token,
      expiresAt: now + expiresIn * 1000,
    };

    logEntry.success = true;
    dingtalkApiLogger.log(logEntry);

    return result.access_token;
  } catch (error) {
    if (!logEntry.success) {
      // 如果尚未记录错误（即上面 throw 之前的分支已记录，这里是网络错误）
      logEntry.success = false;
      logEntry.errorMessage = error instanceof Error ? error.message : String(error);
      dingtalkApiLogger.log(logEntry);
    }
    throw error;
  }
}

/**
 * 强制刷新 access_token（忽略缓存）
 * 适用于 token 被钉钉端手动失效后需要重新获取的场景
 */
export async function refreshAccessToken(): Promise<string> {
  tokenCache = null;
  return getAccessToken();
}

/**
 * 清除 token 缓存
 */
export function clearTokenCache(): void {
  tokenCache = null;
}

// ===== 统一 API 调用 =====

/**
 * 调用钉钉开放平台 API（自动带 access_token）
 *
 * @param apiPath API 路径（如 '/topapi/v2/user/get'）
 * @param options 请求选项
 * @returns API 响应
 */
export async function callDingTalkApi<T = unknown>(
  apiPath: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    /** GET 请求的额外查询参数 */
    params?: Record<string, string>;
    /** POST 请求的 JSON body */
    body?: Record<string, unknown>;
  } = {}
): Promise<DingTalkApiResponse<T>> {
  const { method = 'GET', params = {}, body } = options;

  // 检查配置
  if (!isDingTalkConfigured()) {
    return {
      success: false,
      data: null,
      errcode: -1,
      errmsg: '钉钉企业内部应用未配置',
    };
  }

  const logEntry: DingTalkApiLogEntry = {
    api: apiPath,
    method,
    timestamp: new Date().toISOString(),
  };

  try {
    // 自动获取 access_token
    const accessToken = await getAccessToken();

    // 构建完整 URL
    const separator = apiPath.includes('?') ? '&' : '?';
    let url = `${DINGTALK_API_BASE}${apiPath}${separator}access_token=${encodeURIComponent(accessToken)}`;

    // 追加额外查询参数
    if (Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url += `&${searchParams.toString()}`;
    }

    // 发起请求
    const fetchOptions: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
      logEntry.requestBody = sanitizeForLog(body);
    }

    const response = await fetch(url, fetchOptions);
    const result = await response.json();

    // token 过期自动重试一次
    if (result.errcode === 40014 || result.errcode === 42001) {
      logEntry.success = false;
      logEntry.errorCode = result.errcode;
      logEntry.errorMessage = 'token 过期，自动刷新重试';
      dingtalkApiLogger.log(logEntry);

      // 清除缓存，重新获取 token
      clearTokenCache();
      const newToken = await getAccessToken();

      // 重新构建 URL
      const retryUrl = url.replace(
        /access_token=[^&]+/,
        `access_token=${encodeURIComponent(newToken)}`
      );

      const retryResponse = await fetch(retryUrl, fetchOptions);
      const retryResult = await retryResponse.json();

      if (retryResult.errcode === 0) {
        const retryLog: DingTalkApiLogEntry = {
          api: apiPath,
          method,
          timestamp: new Date().toISOString(),
          success: true,
        };
        dingtalkApiLogger.log(retryLog);

        return {
          success: true,
          data: retryResult as T,
        };
      }

      const failLog: DingTalkApiLogEntry = {
        api: apiPath,
        method,
        timestamp: new Date().toISOString(),
        success: false,
        errorCode: retryResult.errcode,
        errorMessage: retryResult.errmsg,
      };
      dingtalkApiLogger.log(failLog);

      return {
        success: false,
        data: null,
        errcode: retryResult.errcode,
        errmsg: retryResult.errmsg,
      };
    }

    // 普通响应
    if (result.errcode === 0) {
      logEntry.success = true;
      dingtalkApiLogger.log(logEntry);

      return {
        success: true,
        data: result as T,
      };
    }

    // 业务错误
    logEntry.success = false;
    logEntry.errorCode = result.errcode;
    logEntry.errorMessage = result.errmsg;
    dingtalkApiLogger.log(logEntry);

    return {
      success: false,
      data: null,
      errcode: result.errcode,
      errmsg: result.errmsg,
    };
  } catch (error) {
    logEntry.success = false;
    logEntry.errorMessage = error instanceof Error ? error.message : String(error);
    dingtalkApiLogger.log(logEntry);

    return {
      success: false,
      data: null,
      errcode: -1,
      errmsg: logEntry.errorMessage,
    };
  }
}

// ===== 工具函数 =====

/**
 * 清理日志中的敏感字段
 * 移除 body 中的 secret、password、token 等字段
 */
function sanitizeForLog(body: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['secret', 'app_secret', 'appSecret', 'password', 'token', 'accessToken', 'access_token'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '******';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
