'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Loader2, Trash2 } from 'lucide-react';

type ProjectRow = { id: number; name: string; status?: string | null; counts: Record<string, number> };

const COUNT_LABELS: Array<[string, string]> = [
  ['workers', '工人'],
  ['worker_salaries', '工资'],
  ['salary_payments', '发放'],
  ['client_reports', '报量'],
  ['client_payments', '回款'],
  ['construction_logs', '施工日志'],
  ['work_items', '分项'],
  ['miscellaneous_materials', '零星材料'],
  ['supplier_contracts', '供应商合同'],
  ['team_groups', '班组'],
];

export default function ProjectDedupePage() {
  const [name, setName] = useState('山海境TOD');
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [keepId, setKeepId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const search = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/system/projects/duplicates?name=${encodeURIComponent(name)}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '查询失败');
      const list = (json.data?.projects || []) as ProjectRow[];
      setRows(list);
      const withData = list.find((row) => (row.counts?.workers || 0) + (row.counts?.worker_salaries || 0) > 0);
      setKeepId(withData?.id ?? list[0]?.id ?? null);
      if (list.length <= 1) setMessage('没有找到同名重复项目（或只有一条），无需合并');
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [name]);

  const merge = async () => {
    if (!keepId) {
      setError('请先选择要保留的项目');
      return;
    }
    const mergeIds = rows.map((row) => row.id).filter((id) => id !== keepId);
    if (mergeIds.length === 0) return;
    if (!window.confirm(`确认保留项目 #${keepId}，并删除其他 ${mergeIds.length} 个同名项目？\n（有业务数据的项目不会被删除）`)) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/system/projects/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ keepId, mergeIds }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '合并失败');
      if (json.data?.merged) {
        setMessage(`已删除 ${json.data.deletedIds?.length || 0} 个空的重复项目，保留 #${keepId}`);
      } else {
        const blocked = (json.data?.blocked || []) as Array<{ projectId: number; tables: Record<string, number> }>;
        setError(`以下项目仍有业务数据，未删除：${blocked.map((b) => `#${b.projectId}（${Object.keys(b.tables).join('、')}）`).join('；')}`);
      }
      await search();
    } catch (e) {
      setError(e instanceof Error ? e.message : '合并失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <Link href="/system-management" className="text-sm text-[var(--color-primary)] hover:underline">← 返回系统管理</Link>
          <h1 className="mt-2 text-xl font-bold text-[var(--foreground)]">重复项目清理</h1>
          <p className="mt-1 text-sm text-[var(--color-text-3)]">
            同名项目只保留一个。系统会先检查数据量，只有**没有业务数据**的重复项目才会被删除。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="项目名称，例如 山海境TOD"
            className="h-9 w-64 rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
          />
          <button type="button" onClick={() => void search()} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-sm text-white disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 查询
          </button>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}
        {message ? <div className="rounded-xl border border-[#B7EB8F] bg-[#F6FFED] px-4 py-3 text-sm text-[#237804]">{message}</div> : null}

        {rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">保留</th>
                  <th className="px-3 py-2 text-left font-medium">项目ID</th>
                  <th className="px-3 py-2 text-left font-medium">项目名称</th>
                  <th className="px-3 py-2 text-left font-medium">状态</th>
                  <th className="px-3 py-2 text-left font-medium">数据量</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">
                      <input type="radio" name="keep" checked={keepId === row.id} onChange={() => setKeepId(row.id)} />
                    </td>
                    <td className="px-3 py-2 font-medium">#{row.id}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-3)]">{row.status || '-'}</td>
                    <td className="px-3 py-2 text-xs">
                      {COUNT_LABELS
                        .map(([key, label]) => [label, row.counts?.[key] || 0] as const)
                        .filter(([, value]) => value > 0)
                        .map(([label, value]) => `${label} ${value}`)
                        .join('，') || '无业务数据'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end border-t border-[var(--border)] px-4 py-3">
              <button type="button" onClick={() => void merge()} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#CB2634] px-4 text-sm text-white disabled:opacity-60">
                <Trash2 className="h-4 w-4" /> 删除其他重复项目
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
