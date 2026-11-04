'use client';

import { useEffect, useState } from 'react';

/**
 * 凭证缩略图：用 fetch 取字节再转 blob URL 展示。
 * 原因：内嵌（iframe）环境下 <img src="/api/..."> 的子请求可能不带 Cookie 而被 401。
 */
export function VoucherThumb({
  fileId,
  url,
  className = 'h-12 w-9',
  alt = '缩略图',
}: {
  fileId?: number | null;
  url?: string | null;
  className?: string;
  alt?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!fileId && !url) return;
    let cancelled = false;
    let created = '';
    (async () => {
      try {
        const res = await fetch(url || `/api/vouchers/files/${fileId}`, { credentials: 'include' });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        created = URL.createObjectURL(blob);
        if (!cancelled) setObjectUrl(created);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [fileId, url]);

  if (failed || (!fileId && !url)) {
    return (
      <div className={`flex items-center justify-center rounded border border-dashed border-[var(--border)] text-[10px] text-[var(--color-text-3)] ${className}`}>
        无预览
      </div>
    );
  }

  if (!objectUrl) {
    return <div className={`animate-pulse rounded border border-[var(--border)] bg-[var(--color-muted)] ${className}`} />;
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={objectUrl} alt={alt} className={`rounded border border-[var(--border)] object-cover ${className}`} />
  );
}
