/**
 * 全局 fetch 拦截器
 * 自动为所有 /api/ 请求注入 Authorization header（从 localStorage 读取 token）
 * 解决钉钉 webview 等环境中 cookie 不被发送的问题
 */

let _patched = false;

export function setupFetchInterceptor() {
  if (_patched) return;
  _patched = true;

  const originalFetch = window.fetch;

  window.fetch = function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // 只拦截 /api/ 请求
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.pathname
        : input.url;

    if (url.startsWith('/api/')) {
      const token = localStorage.getItem('auth_token');
      if (token) {
        const headers = new Headers(init?.headers || {});
        // 如果还没有 Authorization header，自动添加
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        init = { ...init, headers };
      }
    }

    return originalFetch.call(window, input, init);
  };

  // 保持原始 fetch 引用可用
  (window as any).__originalFetch = originalFetch;
}
