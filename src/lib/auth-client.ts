/**
 * 客户端认证工具库
 * 支持 Cookie + localStorage 双存储，兼容钉钉 iframe 环境
 */

const TOKEN_KEY = 'auth_token';
const REDIRECT_COUNT_KEY = 'auth_redirect_count';
const MAX_REDIRECTS = 3;

// ============ Token 双存储 ============

/**
 * 保存 token 到 Cookie 和 localStorage
 */
export function saveToken(token: string): void {
  // 写入 localStorage（兜底，iframe 中 Cookie 可能被浏览器阻止）
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage 不可用时忽略
  }
  // Cookie 由服务端 Set-Cookie 设置，客户端无需重复写入
}

/**
 * 从 localStorage 读取 token（Cookie 由浏览器自动携带）
 */
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * 清除 token（Cookie + localStorage）
 */
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
  // Cookie 由服务端清除
}

// ============ 钉钉环境检测 ============

/**
 * 检测是否在钉钉客户端内
 */
export function isDingTalkClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /DingTalk/i.test(navigator.userAgent);
}

/**
 * 检测是否在 iframe 中
 */
export function isInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true; // 跨域 iframe 访问 window.top 会抛异常
  }
}

/**
 * 检测是否在钉钉 iframe 环境中（钉钉客户端 + iframe）
 */
export function isDingTalkIframe(): boolean {
  return isDingTalkClient() && isInIframe();
}

// ============ 跳转次数限制 ============

/**
 * 获取当前重定向次数
 */
export function getRedirectCount(): number {
  if (typeof sessionStorage === 'undefined') return 0;
  try {
    return parseInt(sessionStorage.getItem(REDIRECT_COUNT_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

/**
 * 增加重定向计数
 */
export function incrementRedirectCount(): number {
  if (typeof sessionStorage === 'undefined') return 0;
  try {
    const count = getRedirectCount() + 1;
    sessionStorage.setItem(REDIRECT_COUNT_KEY, String(count));
    return count;
  } catch {
    return 0;
  }
}

/**
 * 重置重定向计数（登录成功后调用）
 */
export function resetRedirectCount(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(REDIRECT_COUNT_KEY);
  } catch {
    // ignore
  }
}

/**
 * 是否超过最大重定向次数
 */
export function isRedirectLimitExceeded(): boolean {
  return getRedirectCount() >= MAX_REDIRECTS;
}

// ============ 带 token 的 fetch 封装 ============

/**
 * 创建带认证信息的 fetch 请求
 * 自动从 localStorage 读取 token 并添加到 Authorization header（兜底 Cookie）
 */
export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const fetchOptions: RequestInit = {
    ...options,
    credentials: 'include',
  };

  // 如果 localStorage 有 token，添加到 Authorization header 作为 Cookie 的兜底
  const storedToken = getStoredToken();
  if (storedToken) {
    const headers = new Headers(fetchOptions.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${storedToken}`);
    }
    fetchOptions.headers = headers;
  }

  return fetch(url, fetchOptions);
}
