'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, TrendingUp } from 'lucide-react';

type Project = { id: number; name: string };
type Row = {
  id: number;
  project_id: number;
  project_name: string;
  year_month: string;
  total_hours?: number | null;
  total_amount?: number | null;
  status: string;
  submitted_by_name?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
};

function currentMonth() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export default function LaborAnalysisListPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [filterProject, setFilterProject] = useState('all');
  const [filterMonth, setFilterMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects', { credentials: 'include', cache: 'no-store' });
        const json = await res.json();
        const list = Array.isArray(json.projects) ? json.projects : Array.isArray(json.data) ? json.data : [];
        setProjects((list as Project[]).map((p) => ({ id: Number(p.id), name: String(p.name || '') })));
      } catch {
        setProjects([]);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterProject !== 'all') params.set('filter_project_id', filterProject);
      if (filterMonth) params.set('filter_month', filterMonth);
      const res = await fetch(`/api/labor-analysis?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载失败');
      setRows((json.data?.list || []) as Row[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filterProject, filterMonth]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/hr-salary" className="text-sm text-[var(--color-primary)] hover:underline">← 返回人力与工资</Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <TrendingUp className="h-5 w-5 text-[var(--color-primary)]" /> 月度用工分析
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              按项目 + 月份查看用工分析；点某一行进入填报/查看详情。
            </p>
          </div>
          <Link
            href={`/workers/labor-analysis/${filterProject !== 'all' ? filterProject : (projects[0]?.id ?? 0)}/${filterMonth || currentMonth()}`}
            className="inline-flex h-9 items-center rounded-lg bg-[var(--color-primary)] px-3 text-sm text-white"
          >
            新增填报
          </Link>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}

        <div className="rounded-xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
            <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm">
              <option value="all">全部项目</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm" />
            <button type="button" onClick={() => void load()} className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm">刷新</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">项目</th>
                  <th className="px-3 py-2 text-left font-medium">月份</th>
                  <th className="px-3 py-2 text-right font-medium">总工时</th>
                  <th className="px-3 py-2 text-right font-medium">总金额</th>
                  <th className="px-3 py-2 text-left font-medium">状态</th>
                  <th className="px-3 py-2 text-left font-medium">提交人</th>
                  <th className="px-3 py-2 text-left font-medium">更新时间</th>
                  <th className="px-3 py-2 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-[var(--color-text-3)]"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-[var(--color-text-3)]">暂无用工分析，点右上角「新增填报」</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)] hover:bg-[var(--color-muted)]/40">
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/workers/labor-analysis/${row.project_id}/${row.year_month}`} className="text-[var(--color-primary)] hover:underline">
                        {row.project_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/workers/labor-analysis/${row.project_id}/${row.year_month}`} className="hover:underline">
                        {row.year_month}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(row.total_hours || 0).toLocaleString('zh-CN')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(row.total_amount || 0).toLocaleString('zh-CN')}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${row.status === 'confirmed' ? 'bg-[#E8FFEA] text-[#00A870]' : row.status === 'submitted' ? 'bg-[#E8F3FF] text-[#165DFF]' : 'bg-[#FFF7E8] text-[#B35B00]'}`}>
                        {row.status === 'confirmed' ? '已确认' : row.status === 'submitted' ? '已提交' : '草稿'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{row.submitted_by_name || '-'}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-3)]">
                      {row.updated_at ? new Date(row.updated_at).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/workers/labor-analysis/${row.project_id}/${row.year_month}`} className="text-xs text-[var(--color-primary)] hover:underline">
                        查看/编辑
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
