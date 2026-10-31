'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Bot, FileBarChart } from 'lucide-react';

const WorkbenchPage = dynamic(() => import('@/components/workspace/workbench-content'), { ssr: false });

/**
 * 工作台首页
 * 导航统一走左侧菜单，这里不再放 Tab 条；只在右上角保留两个高频快捷入口。
 */
export default function WorkspacePage() {
  return (
    <div className="min-h-full">
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-4 pb-1 sm:px-6">
        <Link
          href="/reports/monthly"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <FileBarChart className="h-4 w-4" />
          月度经营月报
        </Link>
        <Link
          href="/ai-assistant"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-sm font-medium text-white transition hover:bg-[var(--color-primary-dark)]"
        >
          <Bot className="h-4 w-4" />
          AI 劳务助手
        </Link>
      </div>
      <WorkbenchPage />
    </div>
  );
}
