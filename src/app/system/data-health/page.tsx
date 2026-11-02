'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, ShieldCheck, Wrench, XCircle } from 'lucide-react';

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

type DupGroup = {
  key: string;
  workerName: string;
  projectName: string;
  yearMonth: string;
  rows: Array<{ id: number; grossPay: number; netPay: number; paymentStatus: string; source: string; createdAt: string }>;
};

type DetailRow = {
  id: number;
  workerName: string;
  projectName?: string;
  projectId?: number;
  yearMonth: string;
  grossPay: number;
  netPay: number;
  paymentStatus: string;
};

type FixResult = { fixed: number; skipped: number; report: Array<{ action: string; detail: string }> };

const levelMeta: Record<CheckLevel, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pass: { label: '正常', className: 'bg-[#E8FFEA] text-[#00A870]', icon: CheckCircle2 },
  warn: { label: '注意', className: 'bg-[#FFF7E8] text-[#B35B00]', icon: AlertTriangle },
  fail: { label: '异常', className: 'bg-[#FFECE8] text-[#CB2634]', icon: XCircle },
};

/** 哪些检查项支持下钻明细 + 一键修复 */
const DETAIL_CONFIG: Record<string, { type: string; fix?: { action: string; label: string; confirm: string } }> = {
  'dup-salary': {
    type: 'salary-dup',
    fix: { action: 'dedupe-salary', label: '一键去重', confirm: '将保留每组一条（优先有发放记录的），删除没有发放记录的重复行。确定继续？' },
  },
  'orphan-project': {
    type: 'salary-orphan',
    fix: { action: 'relink-salary-project', label: '按工人项目回填', confirm: '按工人当前所属项目回填这些工资的项目。工人本身没有有效项目的会被跳过。确定继续？' },
  },
  'abnormal-amount': {
    type: 'salary-zero',
    fix: { action: 'delete-empty-salary', label: '删除空工资行', confirm: '只删除「应发=0 且实发=0 且无发放记录」的空行。确定继续？' },
  },
};

export default function DataHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<{ groups?: DupGroup[]; rows?: DetailRow[]; totalRows?: number } | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [slowApis, setSlowApis] = useState<Array<{ path: string; count: number; maxMs: number; avgMs: number; failCount: number }>>([]);
  const [slowLoading, setSlowLoading] = useState(false);

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

  const loadSlowApis = useCallback(async () => {
    setSlowLoading(true);
    try {
      const res = await fetch('/api/system/slow-apis?days=7', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success !== false) setSlowApis(json.data?.rows || []);
    } catch {
      // 忽略
    } finally {
      setSlowLoading(false);
    }
  }, []);

  useEffect(() => { void loadSlowApis(); }, [loadSlowApis]);

  const openDetailPanel = useCallback(async (checkId: string) => {
    const config = DETAIL_CONFIG[checkId];
    if (!config) return;
    if (openDetail === checkId) {
      setOpenDetail(null);
      setDetail(null);
      setFixResult(null);
      return;
    }
    setOpenDetail(checkId);
    setDetail(null);
    setFixResult(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/system/data-health/details?type=${config.type}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载明细失败');
      setDetail(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载明细失败');
    } finally {
      setDetailLoading(false);
    }
  }, [openDetail]);

  const runFix = useCallback(async (action: string, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setFixing(true);
    setFixResult(null);
    try {
      const res = await fetch('/api/system/data-health/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '修复失败');
      setFixResult(json.data as FixResult);
      await load();
      if (openDetail) await openDetailPanel(openDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : '修复失败');
    } finally {
      setFixing(false);
    }
  }, [load, openDetail, openDetailPanel]);

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
              检查重复数据、孤儿数据、状态为空、金额异常、大表截断风险；问题项可查看明细并安全修复。
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

        {fixResult ? (
          <div className="rounded-xl border border-[#B7EB8F] bg-[#F6FFED] px-4 py-3 text-sm text-[#237804]">
            修复完成：已处理 <b>{fixResult.fixed}</b> 条，跳过 <b>{fixResult.skipped}</b> 条。
            {fixResult.report.length > 0 ? (
              <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-xs text-[#3F6600]">
                {fixResult.report.map((item, index) => <li key={index}>{item.detail}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}

        {loading && !data ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">正在检查数据…</div>
        ) : null}

        <div className="space-y-3">
          {data?.checks.map((check) => {
            const meta = levelMeta[check.level];
            const Icon = meta.icon;
            const config = DETAIL_CONFIG[check.id];
            const isOpen = openDetail === check.id;
            return (
              <div key={check.id} className="rounded-xl border border-[var(--border)] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color: check.level === 'pass' ? '#00A870' : check.level === 'warn' ? '#FF7D00' : '#F53F3F' }} />
                    <span className="text-sm font-semibold text-[var(--foreground)]">{check.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {config ? (
                      <button
                        type="button"
                        onClick={() => void openDetailPanel(check.id)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs text-[var(--color-text-2)] hover:border-[var(--color-primary)]"
                      >
                        查看明细 <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    ) : null}
                    <span className={`rounded-md px-2 py-0.5 text-xs ${meta.className}`}>{meta.label}</span>
                  </div>
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
                  {check.suggestion ? <p className="mt-2 text-xs text-[#B35B00]">建议：{check.suggestion}</p> : null}

                  {config && isOpen ? (
                    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--color-muted)]/40 p-3">
                      {detailLoading ? (
                        <p className="py-4 text-center text-xs text-[var(--color-text-3)]">加载明细…</p>
                      ) : detail?.groups && detail.groups.length > 0 ? (
                        <div className="max-h-64 space-y-2 overflow-y-auto">
                          {detail.groups.map((group) => (
                            <div key={group.key} className="rounded-md bg-white p-2 text-xs">
                              <div className="font-medium text-[var(--foreground)]">
                                {group.workerName} · {group.projectName} · {group.yearMonth}（{group.rows.length} 条）
                              </div>
                              <div className="mt-1 text-[var(--color-text-3)]">
                                {group.rows.map((row) => (
                                  <span key={row.id} className="mr-2 inline-block">
                                    #{row.id} 应发 {row.grossPay.toFixed(2)} / 实发 {row.netPay.toFixed(2)}
                                    {row.paymentStatus ? ` · ${row.paymentStatus}` : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : detail?.rows && detail.rows.length > 0 ? (
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="text-[var(--color-text-3)]">
                              <tr>
                                <th className="px-2 py-1 text-left">ID</th>
                                <th className="px-2 py-1 text-left">工人</th>
                                <th className="px-2 py-1 text-left">项目</th>
                                <th className="px-2 py-1 text-left">月份</th>
                                <th className="px-2 py-1 text-right">应发</th>
                                <th className="px-2 py-1 text-right">实发</th>
                                <th className="px-2 py-1 text-left">状态</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.rows.map((row) => (
                                <tr key={row.id} className="border-t border-[var(--border)]">
                                  <td className="px-2 py-1">#{row.id}</td>
                                  <td className="px-2 py-1">{row.workerName}</td>
                                  <td className="px-2 py-1">{row.projectName || row.projectId || '-'}</td>
                                  <td className="px-2 py-1">{row.yearMonth}</td>
                                  <td className="px-2 py-1 text-right tabular-nums">{row.grossPay.toFixed(2)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums">{row.netPay.toFixed(2)}</td>
                                  <td className="px-2 py-1">{row.paymentStatus || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="py-3 text-center text-xs text-[var(--color-text-3)]">该检查项没有明细数据</p>
                      )}

                      {config.fix && (detail?.groups?.length || detail?.rows?.length) ? (
                        <div className="mt-3 flex items-center justify-end">
                          <button
                            type="button"
                            disabled={fixing}
                            onClick={() => void runFix(config.fix!.action, config.fix!.confirm)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-medium text-white disabled:opacity-60"
                          >
                            {fixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                            {config.fix.label}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">慢接口（近 7 天，&gt;1.5 秒）</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-3)]">浏览器实测耗时；持续偏慢的接口需要加索引或改成分页/缓存。</p>
            </div>
            <button
              type="button"
              onClick={() => void loadSlowApis()}
              disabled={slowLoading}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs disabled:opacity-60"
            >
              {slowLoading ? '加载中…' : '刷新'}
            </button>
          </div>
          {slowApis.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-text-3)]">暂无慢接口记录（或数据表 api_timing_logs 尚未创建）</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[var(--color-muted)] text-[var(--color-text-3)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">接口</th>
                  <th className="px-3 py-2 text-right font-medium">次数</th>
                  <th className="px-3 py-2 text-right font-medium">最慢</th>
                  <th className="px-3 py-2 text-right font-medium">平均</th>
                  <th className="px-3 py-2 text-right font-medium">失败</th>
                </tr>
              </thead>
              <tbody>
                {slowApis.map((row) => (
                  <tr key={row.path} className="border-t border-[var(--border)]">
                    <td className="px-3 py-1.5 font-mono">{row.path}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{row.count}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[#CB2634]">{row.maxMs} ms</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{row.avgMs} ms</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{row.failCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
