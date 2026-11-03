'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, FileText, Loader2, TrendingUp } from 'lucide-react';

type Project = { id: number; name: string };
type Voucher = { project_id: number; doc_type: string; year_month: string };
type Labor = { project_id: number; year_month: string; total_hours?: number | null; status: string };

function currentMonth() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export default function LedgerOverviewPage() {
  const [month, setMonth] = useState(currentMonth());
  const [projects, setProjects] = useState<Project[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [labor, setLabor] = useState<Labor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [projRes, voucherRes, laborRes] = await Promise.all([
        fetch('/api/projects', { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/vouchers?month=${month}`, { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/labor-analysis?filter_month=${month}`, { credentials: 'include', cache: 'no-store' }),
      ]);
      const projJson = await projRes.json();
      const voucherJson = await voucherRes.json();
      const laborJson = await laborRes.json();
      const list = Array.isArray(projJson.projects) ? projJson.projects : Array.isArray(projJson.data) ? projJson.data : [];
      setProjects((list as Project[]).map((p) => ({ id: Number(p.id), name: String(p.name || '') })));
      setVouchers((voucherJson.data?.vouchers || []) as Voucher[]);
      setLabor((laborJson.data?.list || []) as Labor[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    return projects.map((project) => {
      const voucherRows = vouchers.filter((v) => Number(v.project_id) === project.id);
      const hasSettlement = voucherRows.some((v) => v.doc_type === 'settlement');
      const hasAttendance = voucherRows.some((v) => v.doc_type === 'attendance');
      const laborRow = labor.find((l) => Number(l.project_id) === project.id);
      return {
        project,
        hasSettlement,
        hasAttendance,
        laborHours: laborRow ? Number(laborRow.total_hours || 0) : null,
        laborStatus: laborRow?.status || '',
      };
    });
  }, [projects, vouchers, labor]);

  const summary = useMemo(() => ({
    total: rows.length,
    bothVouchers: rows.filter((r) => r.hasSettlement && r.hasAttendance).length,
    laborFilled: rows.filter((r) => r.laborHours !== null).length,
  }), [rows]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <BookOpen className="h-5 w-5 text-[var(--color-primary)]" /> 经营台账总览
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              按月查看各项目资料是否齐全：月度经营月报、月度用工分析、月度凭证（查账）。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm" />
            <button type="button" onClick={() => void load()} className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">刷新</button>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-sm text-[#CB2634]">{error}</div> : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: '项目数', value: summary.total },
            { label: '凭证齐全（结算+考勤）', value: summary.bothVouchers },
            { label: '已填用工分析', value: summary.laborFilled },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-[var(--border)] bg-white p-3">
              <p className="text-xs text-[var(--color-text-3)]">{card.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/reports/monthly?month=${month}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
            <FileText className="h-4 w-4" /> 月度经营月报
          </Link>
          <Link href="/workers/labor-analysis" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
            <TrendingUp className="h-4 w-4" /> 月度用工分析
          </Link>
          <Link href={`/workers/vouchers`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-sm">
            <FileText className="h-4 w-4" /> 月度凭证（查账）
          </Link>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[var(--color-muted)] text-xs text-[var(--color-text-3)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">项目</th>
                <th className="px-3 py-2 text-left font-medium">结算单</th>
                <th className="px-3 py-2 text-left font-medium">考勤表</th>
                <th className="px-3 py-2 text-left font-medium">用工分析</th>
                <th className="px-3 py-2 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-[var(--color-text-3)]"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-[var(--color-text-3)]">没有可访问的项目</td></tr>
              ) : rows.map((row) => (
                <tr key={row.project.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium">{row.project.name}</td>
                  <td className="px-3 py-2">
                    {row.hasSettlement ? <span className="rounded bg-[#E8FFEA] px-2 py-0.5 text-xs text-[#00A870]">已上传</span> : <span className="rounded bg-[#FFF1F0] px-2 py-0.5 text-xs text-[#CB2634]">未上传</span>}
                  </td>
                  <td className="px-3 py-2">
                    {row.hasAttendance ? <span className="rounded bg-[#E8FFEA] px-2 py-0.5 text-xs text-[#00A870]">已上传</span> : <span className="rounded bg-[#FFF1F0] px-2 py-0.5 text-xs text-[#CB2634]">未上传</span>}
                  </td>
                  <td className="px-3 py-2">
                    {row.laborHours === null ? (
                      <span className="rounded bg-[#FFF7E8] px-2 py-0.5 text-xs text-[#B35B00]">未填报</span>
                    ) : (
                      <span className="text-xs">
                        {row.laborHours} 小时
                        <span className="ml-1 text-[var(--color-text-3)]">{row.laborStatus === 'submitted' ? '已提交' : row.laborStatus === 'confirmed' ? '已确认' : '草稿'}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Link className="text-[var(--color-primary)] hover:underline" href={`/workers/labor-analysis/${row.project.id}/${month}`}>用工分析</Link>
                      <Link className="text-[var(--color-primary)] hover:underline" href="/workers/vouchers">凭证</Link>
                      <Link className="text-[var(--color-primary)] hover:underline" href={`/reports/monthly?month=${month}&projectId=${row.project.id}`}>月报</Link>
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
