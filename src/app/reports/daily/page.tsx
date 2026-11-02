'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Copy, Loader2, RefreshCw } from 'lucide-react';

type DailyRow = {
  project_id: number;
  project_name: string;
  project_status: string;
  has_log: boolean;
  log_count: number;
  headcount: number;
  headcount_source: string;
  hours: number;
  issue_count: number;
  issues: string[];
  report_amount: number;
  summary: string;
  weather: string;
};

type DailyData = {
  date: string;
  summary: {
    total_projects: number;
    logged_projects: number;
    missing_projects: number;
    coverage_rate: number;
    total_headcount: number;
    total_hours: number;
    total_issues: number;
    total_report_amount: number;
    log_count: number;
  };
  rows: DailyRow[];
  missing: Array<{ project_id: number; project_name: string }>;
};

function formatMoney(value: number) {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CompanyDailyReportPage() {
  const today = useMemo(() => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/daily/company?date=${encodeURIComponent(target)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '生成失败');
      setData(json.data as DailyData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  const textReport = useMemo(() => {
    if (!data) return '';
    const lines: string[] = [];
    lines.push(`【公司项目日报】${data.date}`);
    lines.push(`在建项目 ${data.summary.total_projects} 个｜有日志 ${data.summary.logged_projects}｜缺报 ${data.summary.missing_projects}｜覆盖率 ${data.summary.coverage_rate}%`);
    lines.push(`出勤 ${data.summary.total_headcount} 人｜工时 ${data.summary.total_hours}｜问题 ${data.summary.total_issues} 项｜当日报量 ¥${formatMoney(data.summary.total_report_amount)}`);
    lines.push('');
    data.rows.filter((row) => row.has_log).forEach((row) => {
      lines.push(`▪ ${row.project_name}：${row.headcount} 人 / ${row.hours} 工时${row.weather ? ` / ${row.weather}` : ''}`);
      if (row.summary) lines.push(`  进展：${row.summary}`);
      if (row.issue_count > 0) lines.push(`  问题：${row.issues.join('；')}${row.issue_count > row.issues.length ? ` 等 ${row.issue_count} 项` : ''}`);
    });
    if (data.missing.length > 0) {
      lines.push('');
      lines.push(`⚠ 今日未交日志：${data.missing.map((item) => item.project_name).join('、')}`);
    }
    return lines.join('\n');
  }, [data]);

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(textReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('复制失败，请手动选择文本复制');
    }
  }, [textReport]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--color-text-3)]">
              <Link href="/business-analysis" className="hover:underline">经营分析</Link> / 公司项目日报
            </p>
            <h1 className="mt-1 text-xl font-bold text-[var(--foreground)]">公司项目总览日报</h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              按天汇总全部在建项目：有日志/缺报、出勤、工时、当日报量、现场问题。数字全部取自数据库，可直接对账。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2 text-sm">
              <CalendarDays className="h-4 w-4 text-[var(--color-text-3)]" />
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="bg-transparent outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void load(date)}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 重新生成
            </button>
            <button
              type="button"
              onClick={() => void copyText()}
              disabled={!data}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-sm text-white disabled:opacity-60"
            >
              <Copy className="h-4 w-4" /> {copied ? '已复制' : '复制日报文本'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div>
        ) : null}

        {data ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {[
              { label: '在建项目', value: String(data.summary.total_projects) },
              { label: '有日志', value: String(data.summary.logged_projects) },
              { label: '缺报', value: String(data.summary.missing_projects) },
              { label: '覆盖率', value: `${data.summary.coverage_rate}%` },
              { label: '出勤人数', value: String(data.summary.total_headcount) },
              { label: '工时', value: String(data.summary.total_hours) },
              { label: '问题项', value: String(data.summary.total_issues) },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-[var(--border)] bg-white p-3">
                <p className="text-xs text-[var(--color-text-3)]">{card.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--foreground)]">{card.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {data && data.missing.length > 0 ? (
          <div className="rounded-xl border border-[#FFE7BA] bg-[#FFFBE6] px-4 py-3">
            <p className="text-sm font-medium text-[#AD6800]">今日未交日志（{data.missing.length} 个）</p>
            <p className="mt-1 text-sm text-[#874D00]">{data.missing.map((item) => item.project_name).join('、')}</p>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">项目</th>
                  <th className="px-3 py-2 text-left font-medium">日志</th>
                  <th className="px-3 py-2 text-right font-medium">出勤</th>
                  <th className="px-3 py-2 text-right font-medium">工时</th>
                  <th className="px-3 py-2 text-right font-medium">当日报量</th>
                  <th className="px-3 py-2 text-right font-medium">问题</th>
                  <th className="px-3 py-2 text-left font-medium">今日进展 / 问题</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-[var(--color-text-3)]">正在萃取…</td></tr>
                ) : null}
                {data?.rows.map((row) => (
                  <tr key={row.project_id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--foreground)]">{row.project_name}</div>
                      <div className="text-xs text-[var(--color-text-3)]">{row.project_status || '状态未填'}</div>
                    </td>
                    <td className="px-3 py-2">
                      {row.has_log ? (
                        <span className="rounded bg-[#E8FFEA] px-1.5 py-0.5 text-xs text-[#00A870]">{row.log_count} 条</span>
                      ) : (
                        <span className="rounded bg-[#FFF1F0] px-1.5 py-0.5 text-xs text-[#CB2634]">未提交</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.headcount}
                      <span className="ml-1 text-xs text-[var(--color-text-3)]">{row.headcount_source}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.hours}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.report_amount > 0 ? `¥${formatMoney(row.report_amount)}` : '-'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.issue_count > 0 ? <span className="text-[#CB2634]">{row.issue_count}</span> : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-2)]">
                      {row.summary || '-'}
                      {row.issues.length > 0 ? (
                        <div className="mt-1 text-[#CB2634]">问题：{row.issues.join('；')}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {data ? (
          <details className="rounded-xl border border-[var(--border)] bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--foreground)]">可复制到钉钉群的日报文本</summary>
            <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[var(--color-text-2)]">{textReport}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
