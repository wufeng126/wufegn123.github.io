'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';

type MonthRow = { id: number; year_month: string; total_hours: number; total_amount: number; status: string; item_count: number; updated_at?: string | null };
type CategoryRow = { category: string; hours: number; amount: number; ratio: number };

function currentMonth() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}
function nextMonth(month: string) {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 7);
}

const STATUS_TEXT: Record<string, string> = { draft: '草稿', submitted: '已提交', confirmed: '已确认' };

export default function LaborAnalysisProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = String(params?.projectId || '');
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [byCategory, setByCategory] = useState<CategoryRow[]>([]);
  const [totals, setTotals] = useState({ hours: 0, amount: 0, months: 0 });
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [movingMonth, setMovingMonth] = useState<string>('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/labor-analysis/project-summary?project_id=${projectId}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载失败');
      setMonths((json.data?.months || []) as MonthRow[]);
      setByCategory((json.data?.byCategory || []) as CategoryRow[]);
      setTotals(json.data?.totals || { hours: 0, amount: 0, months: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects', { credentials: 'include', cache: 'no-store' });
        const json = await res.json();
        const list = Array.isArray(json.projects) ? json.projects : Array.isArray(json.data) ? json.data : [];
        const found = (list as Array<{ id: number; name: string }>).find((p) => String(p.id) === projectId);
        setProjectName(found?.name || `项目#${projectId}`);
      } catch {
        setProjectName(`项目#${projectId}`);
      }
    })();
  }, [projectId]);

  const changeMonth = async (fromMonth: string) => {
    const next = window.prompt(`把 ${fromMonth} 的填报改到哪个月份？（格式 YYYY-MM）`, fromMonth);
    if (!next || next === fromMonth) return;
    if (!/^\d{4}-\d{2}$/.test(next)) {
      setError('月份格式应为 YYYY-MM，例如 2026-10');
      return;
    }
    setMovingMonth(fromMonth);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/labor-analysis/change-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ project_id: Number(projectId), from_month: fromMonth, to_month: next }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '修改月份失败');
      setNotice(`已把 ${fromMonth} 的填报改为 ${next}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '修改月份失败');
    } finally {
      setMovingMonth('');
    }
  };

  const maxHours = useMemo(() => Math.max(1, ...byCategory.map((row) => row.hours)), [byCategory]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/workers/labor-analysis" className="text-sm text-[var(--color-primary)] hover:underline">← 返回项目列表</Link>
            <h1 className="mt-2 text-xl font-bold text-[var(--foreground)]">{projectName} · 月度用工分析</h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">按月份填报与查看；上方为该项目工作内容累计统计。</p>
          </div>
          <Link
            href={`/workers/labor-analysis/${projectId}/${currentMonth()}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-sm text-white"
          >
            <Plus className="h-4 w-4" /> 本月填报
          </Link>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-[#B7EB8F] bg-[#F6FFED] px-4 py-3 text-sm text-[#237804]">{notice}</div> : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: '累计工时', value: totals.hours },
            { label: '累计金额', value: totals.amount },
            { label: '已填报月份', value: totals.months },
            { label: '工作内容类别', value: byCategory.length },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs text-[var(--color-text-3)]">{card.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{card.value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <p className="text-sm font-semibold">工作内容累计（跨月）</p>
          {byCategory.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-3)]">暂无数据</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {byCategory.map((row) => (
                <div key={row.category} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{row.category}</span>
                    <span className="text-xs text-[var(--color-text-3)]">{row.ratio}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
                    <div className="h-full bg-[var(--color-primary)]" style={{ width: `${(row.hours / maxHours) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-[var(--color-text-2)]">
                    <span>{row.hours.toLocaleString('zh-CN')} 小时</span>
                    <span>¥{row.amount.toLocaleString('zh-CN')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">月份</th>
                <th className="px-3 py-2 text-right font-medium">工时</th>
                <th className="px-3 py-2 text-right font-medium">金额</th>
                <th className="px-3 py-2 text-left font-medium">明细条数</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                <th className="px-3 py-2 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--color-text-3)]"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中…</td></tr>
              ) : months.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--color-text-3)]">还没有填报记录，点右上角「本月填报」</td></tr>
              ) : months.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/workers/labor-analysis/${projectId}/${row.year_month}`} className="text-[var(--color-primary)] hover:underline">
                      {row.year_month}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(row.total_hours || 0).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">¥{Number(row.total_amount || 0).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-3)]">{row.item_count} 条</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${row.status === 'confirmed' ? 'bg-[#E8FFEA] text-[#00A870]' : row.status === 'submitted' ? 'bg-[#E8F3FF] text-[#165DFF]' : 'bg-[#FFF7E8] text-[#B35B00]'}`}>
                      {STATUS_TEXT[row.status] || row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Link href={`/workers/labor-analysis/${projectId}/${row.year_month}`} className="text-[var(--color-primary)] hover:underline">查看/编辑</Link>
                      <Link href={`/workers/labor-analysis/${projectId}/${nextMonth(row.year_month)}?copyFrom=${row.year_month}`} className="text-[var(--color-text-3)] hover:underline">复制到次月</Link>
                      <button
                        type="button"
                        disabled={movingMonth !== '' || row.status === 'confirmed'}
                        onClick={() => void changeMonth(row.year_month)}
                        className="text-[var(--color-text-3)] hover:underline disabled:opacity-40"
                      >
                        {movingMonth === row.year_month ? '修改中…' : '改月份'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
