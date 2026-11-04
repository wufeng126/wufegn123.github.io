'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Search } from 'lucide-react';

type Project = { id: number; name: string };
type Voucher = { id: number; project_id: number; year_month: string; doc_type: string; page_count: number; first_file_url?: string | null };

export default function VouchersProjectSummaryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [projRes, voucherRes] = await Promise.all([
        fetch('/api/projects', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/vouchers', { credentials: 'include', cache: 'no-store' }),
      ]);
      const projJson = await projRes.json();
      const voucherJson = await voucherRes.json();
      const list = Array.isArray(projJson.projects) ? projJson.projects : Array.isArray(projJson.data) ? projJson.data : [];
      setProjects((list as Project[]).map((p) => ({ id: Number(p.id), name: String(p.name || '') })));
      setVouchers((voucherJson.data?.vouchers || []) as Voucher[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    return projects
      .map((project) => {
        const list = vouchers.filter((v) => Number(v.project_id) === project.id);
        const months = Array.from(new Set(list.map((v) => v.year_month))).sort().reverse();
        const latest = months[0] || '';
        const latestRows = list.filter((v) => v.year_month === latest);
        return {
          project,
          count: list.length,
          months,
          latest,
          latestHasSettlement: latestRows.some((v) => v.doc_type === 'settlement'),
          latestHasAttendance: latestRows.some((v) => v.doc_type === 'attendance'),
          cover: list[0]?.first_file_url || null,
        };
      })
      .filter((row) => (keyword ? row.project.name.includes(keyword) : true))
      .sort((a, b) => (b.latest || '').localeCompare(a.latest || '') || a.project.name.localeCompare(b.project.name, 'zh-CN'));
  }, [projects, vouchers, keyword]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/business-analysis/ledger" className="text-sm text-[var(--color-primary)] hover:underline">← 返回台账总览</Link>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <FileText className="h-5 w-5 text-[var(--color-primary)]" /> 月度凭证（查账）
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-3)]">
              按项目汇总，点进项目查看每月凭证原件；仅用于查账留档，不影响成本计算。
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
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-white py-16 text-center text-sm text-[var(--color-text-3)]">暂无项目</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <Link
                key={row.project.id}
                href={`/workers/vouchers/${row.project.id}`}
                className="group rounded-xl border border-[var(--border)] bg-white p-4 transition hover:border-[var(--color-primary)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--foreground)] group-hover:text-[var(--color-primary)]">{row.project.name}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-3)]">
                      {row.count > 0 ? `共 ${row.count} 份 · 最近 ${row.latest}` : '暂无凭证'}
                    </p>
                  </div>
                  {row.cover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={row.cover} alt="封面" className="h-14 w-10 rounded border border-[var(--border)] object-cover" />
                  ) : (
                    <div className="flex h-14 w-10 items-center justify-center rounded border border-dashed border-[var(--border)] text-[10px] text-[var(--color-text-3)]">无</div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  {row.count > 0 ? (
                    <>
                      <span className={`rounded px-2 py-0.5 ${row.latestHasSettlement ? 'bg-[#E8FFEA] text-[#00A870]' : 'bg-[#FFF1F0] text-[#CB2634]'}`}>
                        结算单{row.latestHasSettlement ? '✓' : '✗'}
                      </span>
                      <span className={`rounded px-2 py-0.5 ${row.latestHasAttendance ? 'bg-[#E8FFEA] text-[#00A870]' : 'bg-[#FFF1F0] text-[#CB2634]'}`}>
                        考勤表{row.latestHasAttendance ? '✓' : '✗'}
                      </span>
                      <span className="rounded bg-[var(--color-muted)] px-2 py-0.5 text-[var(--color-text-3)]">{row.months.length} 个月</span>
                    </>
                  ) : (
                    <span className="rounded bg-[#FFF7E8] px-2 py-0.5 text-[#B35B00]">尚未上传</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
