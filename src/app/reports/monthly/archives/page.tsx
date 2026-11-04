'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, Loader2 } from 'lucide-react';

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

export default function MonthlyArchivesPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const grouped = useMemo(() => {
    const map = new Map<string, Report[]>();
    reports.forEach((report) => {
      const list = map.get(report.month) || [];
      list.push(report);
      map.set(report.month, list);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [reports]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <Link href="/reports/monthly" className="text-sm text-[var(--color-primary)] hover:underline">← 返回月度经营月报</Link>
          <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
            <Archive className="h-5 w-5 text-[var(--color-primary)]" /> 已审批归档月报
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-3)]">老板已审批通过的月报会归档在这里；点「查看」进入填报/审批记录页（预算员填报、项目经理补充、老板审批的完整内容）。</p>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}

        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">
            还没有已审批归档的月报
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([month, list]) => (
              <div key={month} className="rounded-xl border border-[var(--border)] bg-white">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
                  <p className="text-sm font-semibold">{month}</p>
                  <Link href={`/reports/monthly/fill?month=${month}`} className="text-xs text-[var(--color-primary)] hover:underline">
                    查看该月报表
                  </Link>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">项目范围</th>
                      <th className="px-3 py-2 text-left font-medium">提交人</th>
                      <th className="px-3 py-2 text-left font-medium">审批人</th>
                      <th className="px-3 py-2 text-left font-medium">审批时间</th>
                      <th className="px-3 py-2 text-left font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((report) => (
                      <tr key={report.id} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 font-medium">{report.projectName}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-2)]">{report.submittedByName || '-'}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-2)]">{report.approvedBy || '-'}</td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-3)]">
                          {report.approvedAt ? new Date(report.approvedAt).toLocaleString('zh-CN') : '-'}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/reports/monthly/fill?month=${report.month}${report.projectScope !== 'all' ? `&projectId=${report.projectScope}` : ''}`}
                            className="text-xs text-[var(--color-primary)] hover:underline"
                          >
                            查看
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
