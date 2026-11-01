'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

type CheckLevel = 'pass' | 'warn' | 'fail';

type CheckItem = {
  id: string;
  title: string;
  level: CheckLevel;
  detail: string;
  metrics?: Record<string, number | string>;
  suggestion?: string;
};

type HealthData = {
  generatedAt: string;
  summary: { pass: number; warn: number; fail: number };
  checks: CheckItem[];
};

const levelMeta: Record<CheckLevel, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pass: { label: '正常', className: 'bg-[#E8FFEA] text-[#00A870]', icon: CheckCircle2 },
  warn: { label: '注意', className: 'bg-[#FFF7E8] text-[#B35B00]', icon: AlertTriangle },
  fail: { label: '异常', className: 'bg-[#FFECE8] text-[#CB2634]', icon: XCircle },
};

export default function DataHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/system/data-health', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '检查失败');
      setData(json.data as HealthData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '检查失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/system-management" className="text-sm text-[var(--color-primary)] hover:underline">← 返回系统管理</Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <ShieldCheck className="h-5 w-5 text-[var(--color-primary)]" /> 数据健康检查
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              一次性检查数据层问题：重复数据、孤儿数据、状态为空、金额异常、大表截断风险，并给出关键指标的数据库直算结果用于对账。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 重新检测
          </button>
        </div>

        {data ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs text-[var(--color-text-3)]">正常项</p>
              <p className="mt-1 text-2xl font-bold text-[#00A870]">{data.summary.pass}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs text-[var(--color-text-3)]">需注意</p>
              <p className="mt-1 text-2xl font-bold text-[#B35B00]">{data.summary.warn}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs text-[var(--color-text-3)]">异常</p>
              <p className="mt-1 text-2xl font-bold text-[#CB2634]">{data.summary.fail}</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div>
        ) : null}

        {loading && !data ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">
            正在检查数据…
          </div>
        ) : null}

        <div className="space-y-3">
          {data?.checks.map((check) => {
            const meta = levelMeta[check.level];
            const Icon = meta.icon;
            return (
              <div key={check.id} className="rounded-xl border border-[var(--border)] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color: check.level === 'pass' ? '#00A870' : check.level === 'warn' ? '#FF7D00' : '#F53F3F' }} />
                    <span className="text-sm font-semibold text-[var(--foreground)]">{check.title}</span>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-xs ${meta.className}`}>{meta.label}</span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm text-[var(--color-text-2)]">{check.detail}</p>
                  {check.metrics && Object.keys(check.metrics).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(check.metrics).map(([key, value]) => (
                        <span key={key} className="rounded-md bg-[var(--color-muted)] px-2 py-1 text-xs text-[var(--color-text-2)]">
                          {key}：<b className="tabular-nums">{typeof value === 'number' ? value.toLocaleString('zh-CN') : value}</b>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {check.suggestion ? (
                    <p className="mt-2 text-xs text-[#B35B00]">建议：{check.suggestion}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {data ? (
          <p className="text-center text-xs text-[var(--color-text-3)]">
            检测时间：{new Date(data.generatedAt).toLocaleString('zh-CN')}（每次打开页面重新检测，不落库）
          </p>
        ) : null}
      </div>
    </div>
  );
}
