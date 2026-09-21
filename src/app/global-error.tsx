'use client';

import { useEffect } from 'react';

const RECOVERY_KEY_PREFIX = 'app-client-error-recovery:';
const RECOVERY_WINDOW_MS = 30_000;

function isChunkLoadingError(error: Error & { digest?: string }) {
  const message = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  return /chunkloaderror|loading chunk|failed to fetch dynamically imported module|importing a module script failed|module script failed/.test(message);
}

function tryRecoverFromStaleChunk() {
  if (typeof window === 'undefined') return;

  try {
    if (typeof sessionStorage === 'undefined') return;

    const key = `${RECOVERY_KEY_PREFIX}${window.location.pathname}`;
    const now = Date.now();
    const lastRecovery = Number(sessionStorage.getItem(key) || 0);

    // 只自动恢复一次。若资源仍然有问题，保留错误页供用户查看和手动重试，
    // 避免在钉钉 WebView 或普通浏览器中形成无限刷新循环。
    if (lastRecovery && now - lastRecovery < RECOVERY_WINDOW_MS) return;

    sessionStorage.setItem(key, String(now));
    window.location.reload();
  } catch (storageError) {
    console.warn('[GlobalError] client error recovery skipped:', storageError);
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isChunkLoadingError(error)) {
      tryRecoverFromStaleChunk();
    }
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <main className="flex min-h-screen items-center justify-center px-6 py-12">
          <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              !
            </div>
            <h1 className="text-lg font-semibold">页面暂时没有加载完成</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              可能是网络波动或页面刚完成更新，请重新加载后继续使用。
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => reset()}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                重试
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                刷新页面
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
