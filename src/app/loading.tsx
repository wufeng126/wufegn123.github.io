'use client';

import { useEffect } from 'react';
import { Loading } from '@/components/ui/loading';

export default function PageLoading() {
  // 短延迟避免闪屏（数据就绪立即让位）
  useEffect(() => {
    const t = setTimeout(() => undefined, 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-background">
      <Loading type="crane" label="建筑劳务管理系统 · 正在加载..." />
    </div>
  );
}
