'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search, TrendingUp } from 'lucide-react';

type Project = { id: number; name: string };
type Analysis = { project_id: number; year_month: string; total_hours?: number | null; total_amount?: number | null; status: string };

export default function LaborAnalysisProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [projRes, listRes] = await Promise.all([
        fetch('/api/projects', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/labor-analysis', { credentials: 'include', cache: 'no-store' }),
      ]);
      const projJson = await projRes.json();
      const listJson = await listRes.json();
      const list = Array.isArray(projJson.projects) ? projJson.projects : Array.isArray(projJson.data) ? projJson.data : [];
      setProjects((list as Project[]).map((p) => ({ id: Number(p.id), name: String(p.name || '') })));
      setRows((listJson.data?.list || []) as Analysis[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cards = useMemo(() => {
    return projects
      .map((project) => {
        const list = rows.filter((row) => Number(row.project_id) === project.id);
        const hours = list.reduce((sum, row) => sum + Number(row.total_hours || 0), 0);
        const amount = list.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
        const months = Array.from(new Set(list.map((row) => row.year_month))).sort().reverse();
        return { project, months, hours, amount, latest: months[0] || '' };
      })
      .filter((row) => (keyword ? row.project.name.includes(keyword) : true))
      .sort((a, b) => b.hours - a.hours || a.project.name.localeCompare(b.project.name, 'zh-CN'));
  }, [projects, rows, keyword]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/business-analysis/ledger" className="text-sm text-[var(--color-primary)] hover:underline">← 返回台账总览</Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <TrendingUp className="h-5 w-5 text-[var(--color-primary)]" /> 月度用工分析
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              按项目汇总，点进项目查看每月用工与工作内容占比；仅用于分析与查账，不计入成本。
            </p>
          </div>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-2">
            <Search className="h-4 w-4 text-[var(--color-text-3)]" />
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索项目" className="h-full w-40 bg-transparent text-sm outline-none" />
          </div>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}

        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">暂无项目</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <Link
                key={card.project.id}
                href={`/workers/labor-analysis/${card.project.id}`}
                className="group rounded-xl border border-[var(--border)] bg-white p-4 transition hover:border-[var(--color-primary)]"
              >
                <p className="truncate font-medium text-[var(--foreground)] group-hover:text-[var(--color-primary)]">{card.project.name}</p>
                <p className="mt-1 text-xs text-[var(--color-text-3)]">
                  {card.months.length > 0 ? `${card.months.length} 个月 · 最近 ${card.latest}` : '尚未填报'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-[var(--color-text-3)]">累计工时</p>
                    <p className="font-semibold tabular-nums">{card.hours.toLocaleString('zh-CN')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-3)]">累计金额</p>
                    <p className="font-semibold tabular-nums">¥{card.amount.toLocaleString('zh-CN')}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
