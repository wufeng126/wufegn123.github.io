'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, ChevronLeft, ChevronRight, FileText, Loader2, Trash2 } from 'lucide-react';

type Report = {
  id: number;
  month: string;
  projectScope: string;
  projectName: string;
  submittedByName: string;
  submittedAt?: string | null;
  approvedBy: string;
  approvedAt?: string | null;
};

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

export default function MonthlyArchivesPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [activeMonth, setActiveMonth] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/reports/monthly/approved', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载失败');
      setReports((json.data?.reports || []) as Report[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const years = useMemo(() => {
    const set = new Set<string>(reports.map((report) => report.month.slice(0, 4)).filter(Boolean));
    set.add(String(new Date().getFullYear()));
    return Array.from(set).sort().reverse();
  }, [reports]);

  const byMonth = useMemo(() => {
    const map = new Map<string, Report[]>();
    reports.filter((report) => report.month.startsWith(year)).forEach((report) => {
      const list = map.get(report.month) || [];
      list.push(report);
      map.set(report.month, list);
    });
    return map;
  }, [reports, year]);

  const activeReports = activeMonth ? (byMonth.get(activeMonth) || []) : [];

  const remove = async (report: Report) => {
    if (!window.confirm(`删除 ${report.month} · ${report.projectName} 的已归档月报？\n删除后不可恢复（仅建议清理测试数据）。`)) return;
    setError('');
    try {
      const res = await fetch(`/api/reports/monthly/approved?id=${report.id}`, { method: 'DELETE', credentials: 'include' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '删除失败');
      await load();
      if (activeReports.length <= 1) setActiveMonth('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/reports/monthly" className="text-sm text-[var(--color-primary)] hover:underline">← 返回月度经营月报</Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <Archive className="h-5 w-5 text-[var(--color-primary)]" /> 已审批归档月报
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              按月份查看已审批归档的月报，点月份下钻到具体项目；点「查看」进入填报/审批记录页。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setYear(String(Number(year) - 1))} className="h-9 w-9 rounded-lg border border-[var(--border)] bg-white"><ChevronLeft className="mx-auto h-4 w-4" /></button>
            <select value={year} onChange={(e) => { setYear(e.target.value); setActiveMonth(''); }} className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
              {years.map((item) => <option key={item} value={item}>{item} 年</option>)}
            </select>
            <button type="button" onClick={() => setYear(String(Number(year) + 1))} className="h-9 w-9 rounded-lg border border-[var(--border)] bg-white"><ChevronRight className="mx-auto h-4 w-4" /></button>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}

        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {MONTH_LABELS.map((label, index) => {
                const monthKey = `${year}-${String(index + 1).padStart(2, '0')}`;
                const list = byMonth.get(monthKey) || [];
                const isActive = activeMonth === monthKey;
                return (
                  <button
                    key={monthKey}
                    type="button"
                    onClick={() => setActiveMonth(isActive ? '' : monthKey)}
                    className={`rounded-xl border p-3 text-left transition ${isActive ? 'border-[var(--color-primary)] bg-[#E8F3FF]' : list.length > 0 ? 'border-[var(--border)] bg-white hover:border-[var(--color-primary)]' : 'border-dashed border-[var(--border)] bg-white/60'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${list.length > 0 ? 'text-[var(--foreground)]' : 'text-[var(--color-text-3)]'}`}>{label}</span>
                      {list.length > 0 ? (
                        <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[11px] text-white">{list.length}</span>
                      ) : (
                        <span className="text-[11px] text-[var(--color-text-3)]">无</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-[var(--color-text-3)]">
                      {list.length > 0 ? list.slice(0, 2).map((report) => report.projectName).join('、') : '暂无归档'}
                    </p>
                  </button>
                );
              })}
            </div>

            {activeMonth ? (
              <div className="rounded-xl border border-[var(--border)] bg-white">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
                  <p className="text-sm font-semibold">{activeMonth} · {activeReports.length} 份归档</p>
                  <Link href={`/reports/monthly/fill?month=${activeMonth}`} className="text-xs text-[var(--color-primary)] hover:underline">查看整月填报记录</Link>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">项目</th>
                      <th className="px-3 py-2 text-left font-medium">提交人</th>
                      <th className="px-3 py-2 text-left font-medium">审批人</th>
                      <th className="px-3 py-2 text-left font-medium">审批时间</th>
                      <th className="px-3 py-2 text-left font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeReports.map((report) => (
                      <tr key={report.id} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 font-medium">{report.projectName}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-2)]">{report.submittedByName || '-'}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-2)]">{report.approvedBy || '-'}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-3)]">
                          {report.approvedAt ? new Date(report.approvedAt).toLocaleString('zh-CN') : '-'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 text-xs">
                            <Link
                              href={`/reports/monthly/fill?month=${report.month}${report.projectScope !== 'all' ? `&projectId=${report.projectScope}` : ''}`}
                              className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" /> 查看
                            </Link>
                            <button type="button" onClick={() => void remove(report)} className="inline-flex items-center gap-1 text-[#CB2634] hover:underline">
                              <Trash2 className="h-3.5 w-3.5" /> 删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : reports.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">
                还没有已审批归档的月报
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
