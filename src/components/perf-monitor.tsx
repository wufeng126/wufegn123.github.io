'use client';

import { useEffect } from 'react';

/**
 * 慢接口监控：包一层 fetch，记录超过阈值的接口调用（路径 + 耗时 + 是否失败），
 * 通过 sendBeacon 上报到 /api/system/slow-apis。只在浏览器执行，不影响业务。
 */
const THRESHOLD_MS = 1500;
let installed = false;

export function PerfMonitor() {
  useEffect(() => {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const started = performance.now();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      let ok = true;
      try {
        const response = await originalFetch(input, init);
        ok = response.ok;
        return response;
      } catch (error) {
        ok = false;
        throw error;
      } finally {
        const duration = Math.round(performance.now() - started);
        if (duration >= THRESHOLD_MS && url.includes('/api/')) {
          try {
            const body = JSON.stringify({
              path: new URL(url, window.location.origin).pathname,
              duration,
              ok,
              page: window.location.pathname,
            });
            if (navigator.sendBeacon) {
              navigator.sendBeacon('/api/system/slow-apis', new Blob([body], { type: 'application/json' }));
            } else {
              void originalFetch('/api/system/slow-apis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                keepalive: true,
              });
            }
          } catch {
            // 上报失败忽略
          }
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
      installed = false;
    };
  }, []);

  return null;
}
