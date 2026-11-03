'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, Database, History, ShieldCheck } from 'lucide-react';

type Card = {
  href: string;
  title: string;
  desc: string;
  icon: typeof Activity;
  hint?: string;
};

const CARDS: Card[] = [
  {
    href: '/system/data-health',
    title: '数据健康',
    desc: '重复数据、孤儿数据、状态为空、金额异常、大表截断风险，以及慢接口榜',
    icon: Activity,
  },
  {
    href: '/system/backups',
    title: '数据备份',
    desc: '每日全量备份到对象存储，可查看、下载、按表恢复',
    icon: Database,
  },
  {
    href: '/system/security',
    title: '安全加固',
    desc: '环境自检、开启数据库行级安全（RLS）、执行建表/数据修复脚本',
    icon: ShieldCheck,
  },
  {
    href: '/system-management?tab=audit-logs',
    title: '日志管理',
    desc: '登录日志、操作审计、钉钉调用日志',
    icon: History,
  },
];

export default function SystemOpsPage() {
  const [lastBackup, setLastBackup] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/system/backups', { credentials: 'include', cache: 'no-store' });
        const json = await res.json();
        const at = json?.data?.lastSuccessAt;
        if (!cancelled && at) setLastBackup(new Date(at).toLocaleString('zh-CN'));
      } catch {
        // 忽略
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <Link href="/system-management" className="text-sm text-[var(--color-primary)] hover:underline">← 返回系统管理</Link>
          <h1 className="mt-2 text-xl font-bold text-[var(--foreground)]">数据运维</h1>
          <p className="mt-1 text-sm text-[var(--color-text-3)]">
            数据体检、备份恢复、安全加固、操作日志集中在这里。
            {lastBackup ? <span className="ml-2 text-[var(--color-text-3)]">最近成功备份：{lastBackup}</span> : null}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group flex items-start gap-3 rounded-xl border border-[var(--border)] bg-white p-4 transition-colors hover:border-[var(--color-primary)]"
              >
                <span className="rounded-lg bg-[var(--color-muted)] p-2 text-[var(--color-primary)]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-semibold text-[var(--foreground)]">
                    {card.title}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--color-text-3)]">{card.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>

        <p className="text-xs text-[var(--color-text-3)]">
          提示：权限、账号、钉钉、通知、WPS、AI 配置在「系统管理」首页的各页签里。
        </p>
      </div>
    </div>
  );
}
