'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock3, FileText, RefreshCw, Send, XCircle } from 'lucide-react';

type ReportRow = {
  id: number;
  year_month: string;
  project_scope: string;
  project_name?: string | null;
  status: string;
  fill_user?: string | null;
  manager_user?: string | null;
  approved_by?: string | null;
  submitted_manager_at?: string | null;
  submitted_boss_at?: string | null;
  approved_at?: string | null;
  reject_reason?: string | null;
  updated_at?: string | null;
};

type SettlementRow = {
  id: number;
  settlement_no?: string | null;
  settlement_month: string;
  project_id?: number | null;
  team_id?: number | null;
  status: string;
  submitted_at?: string | null;
  submitted_by?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reject_reason?: string | null;
  created_at?: string | null;
  projects?: { name?: string | null } | Array<{ name?: string | null }> | null;
  team_groups?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

const REPORT_STATUS: Record<string, { label: string; className: string; step: number }> = {
  draft: { label: '填写中', className: 'bg-slate-100 text-slate-600', step: 1 },
  rejected: { label: '已驳回', className: 'bg-red-50 text-red-600', step: 1 },
  pending_manager: { label: '待项目经理补充', className: 'bg-amber-50 text-amber-700', step: 2 },
  pending_boss: { label: '待老板审批', className: 'bg-blue-50 text-blue-700', step: 3 },
  approved: { label: '已通过', className: 'bg-emerald-50 text-emerald-700', step: 4 },
};

const SETTLEMENT_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-slate-100 text-slate-600' },
  pending: { label: '待审批', className: 'bg-amber-50 text-amber-700' },
  reviewed: { label: '已通过', className: 'bg-emerald-50 text-emerald-700' },
  confirmed: { label: '已通过', className: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '已驳回', className: 'bg-red-50 text-red-600' },
};

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function pickName(value: SettlementRow['projects'] | SettlementRow['team_groups']): string {
  if (!value) return '';
  const row = Array.isArray(value) ? value[0] : value;
  return String(row?.name || '');
}

export default function MySubmissionsPage() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'mine' | 'pending'>('mine');
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingReportList, setPendingReportList] = useState<Array<{ id: number; month: string; status: string; projectScope: string; projectName: string; updatedAt?: string | null }>>([]);
  const [pendingSettlementList, setPendingSettlementList] = useState<Array<{ id: number; settlementNo: string; month: string; projectName: string; submittedBy?: string; submittedAt?: string | null }>>([]);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await fetch('/api/my-pending-approvals', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载待审批失败');
      setPendingReportList(Array.isArray(json.data?.reports) ? json.data.reports : []);
      setPendingSettlementList(Array.isArray(json.data?.settlements) ? json.data.settlements : []);
    } catch {
      setPendingReportList([]);
      setPendingSettlementList([]);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/my-submissions', { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '加载失败');
      setReports(Array.isArray(json.data?.reports) ? json.data.reports : []);
      setSettlements(Array.isArray(json.data?.settlements) ? json.data.settlements : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const pendingTotal = pendingReportList.length + pendingSettlementList.length;

  const pendingReports = reports.filter((row) => ['pending_manager', 'pending_boss'].includes(row.status)).length;
  const pendingSettlements = settlements.filter((row) => row.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[var(--color-muted)] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--color-text-3)] hover:text-[var(--color-primary)]">
              <ArrowLeft className="h-4 w-4" /> 返回工作台
            </Link>
            <h1 className="text-xl font-bold text-[var(--foreground)] sm:text-2xl">我的提交</h1>
            <p className="mt-0.5 text-sm text-[var(--color-text-3)]">
              查看我提交的月报与班组结算的审批进度
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 items-center rounded-full bg-amber-50 px-3 text-xs font-medium text-amber-700">
              待处理 {pendingReports + pendingSettlements} 项
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-medium text-[var(--foreground)] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <div className="mb-4 inline-flex rounded-lg border border-[var(--border)] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setTab('mine')}
            className={`h-8 rounded-md px-4 text-sm ${tab === 'mine' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-3)]'}`}
          >
            我提交的
          </button>
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`h-8 rounded-md px-4 text-sm ${tab === 'pending' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-3)]'}`}
          >
            待我审批{pendingTotal > 0 ? `（${pendingTotal}）` : ''}
          </button>
        </div>

        {tab === 'pending' ? (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                <h2 className="font-semibold text-[var(--foreground)]">待我审批的月报</h2>
                <span className="text-xs text-[var(--color-text-3)]">{pendingReportList.length} 条</span>
              </div>
              {pendingLoading ? (
                <div className="px-5 py-8 text-center text-sm text-[var(--color-text-3)]">加载中…</div>
              ) : pendingReportList.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[var(--color-text-3)]">暂无待你审批的月报</div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {pendingReportList.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                      <div>
                        <div className="font-medium text-[var(--foreground)]">{row.month} 月报 · {row.projectName}</div>
                        <div className="mt-0.5 text-xs text-[var(--color-text-3)]">
                          {row.status === 'pending_manager' ? '待项目经理补充' : '待老板审批'}
                          {row.updatedAt ? ` · 更新 ${formatTime(row.updatedAt)}` : ''}
                        </div>
                      </div>
                      <Link
                        href={`/reports/monthly/fill?month=${encodeURIComponent(row.month)}${row.projectScope !== 'all' ? `&projectId=${row.projectScope}` : ''}`}
                        className="text-xs text-[var(--color-primary)] hover:underline"
                      >
                        去处理
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                <h2 className="font-semibold text-[var(--foreground)]">待我审批的班组结算</h2>
                <span className="text-xs text-[var(--color-text-3)]">{pendingSettlementList.length} 条</span>
              </div>
              {pendingLoading ? (
                <div className="px-5 py-8 text-center text-sm text-[var(--color-text-3)]">加载中…</div>
              ) : pendingSettlementList.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[var(--color-text-3)]">暂无待你审批的班组结算</div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {pendingSettlementList.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                      <div>
                        <div className="font-medium text-[var(--foreground)]">{row.settlementNo} · {row.projectName}</div>
                        <div className="mt-0.5 text-xs text-[var(--color-text-3)]">
                          {row.month}
                          {row.submittedBy ? ` · 提交人 ${row.submittedBy}` : ''}
                          {row.submittedAt ? ` · ${formatTime(row.submittedAt)}` : ''}
                        </div>
                      </div>
                      <Link href={`/team-management/settlements/${row.id}`} className="text-xs text-[var(--color-primary)] hover:underline">
                        去审批
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
        <>
        {/* 月报 */}
        <section className="mb-5 overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--color-primary)]" />
              <h2 className="font-semibold text-[var(--foreground)]">月度经营月报</h2>
              <span className="text-xs text-[var(--color-text-3)]">{reports.length} 条</span>
            </div>
          </div>
          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-[var(--color-text-3)]">加载中…</div>
          ) : reports.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[var(--color-text-3)]">还没有提交过的月报</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {reports.map((row) => {
                const meta = REPORT_STATUS[row.status] || REPORT_STATUS.draft;
                const step = meta.step;
                return (
                  <div key={row.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--foreground)]">{row.year_month} 月报</span>
                        <span className="text-xs text-[var(--color-text-3)]">
                          {row.project_name || (row.project_scope === 'all' ? '全公司' : `项目 #${row.project_scope}`)}
                        </span>
                      </div>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                    </div>
                    {/* 进度：预算员填报 → 项目经理补充 → 老板审批 → 已通过 */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {['预算员填报', '项目经理补充', '老板审批', '已通过'].map((label, index) => {
                        const done = step > index + 1;
                        const current = step === index + 1;
                        return (
                          <div key={label} className="flex items-center gap-2">
                            {index > 0 && <span className={`h-px w-5 ${done || current ? 'bg-[var(--color-primary)]' : 'bg-[var(--border)]'}`} />}
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                              done
                                ? 'bg-emerald-50 text-emerald-700'
                                : current
                                  ? 'bg-[var(--color-accent)] font-medium text-[var(--color-primary)]'
                                  : 'bg-[var(--color-muted)] text-[var(--color-text-3)]'
                            }`}>
                              {done ? <CheckCircle2 className="h-3 w-3" /> : current ? <Clock3 className="h-3 w-3" /> : null}
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-3)]">
                      <span>提交：{formatTime(row.submitted_manager_at || row.updated_at)}</span>
                      {row.reject_reason ? (
                        <span className="text-red-600">驳回原因：{row.reject_reason}</span>
                      ) : null}
                      <Link
                        href={`/reports/monthly?month=${encodeURIComponent(row.year_month)}${row.project_scope !== 'all' ? `&projectId=${row.project_scope}` : ''}`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        查看月报
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 班组结算 */}
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-[var(--color-primary)]" />
              <h2 className="font-semibold text-[var(--foreground)]">班组结算</h2>
              <span className="text-xs text-[var(--color-text-3)]">{settlements.length} 条</span>
            </div>
            <Link href="/team-management/settlements" className="text-xs text-[var(--color-primary)] hover:underline">
              去结算台账
            </Link>
          </div>
          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-[var(--color-text-3)]">加载中…</div>
          ) : settlements.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[var(--color-text-3)]">还没有提交过的班组结算</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {settlements.map((row) => {
                const meta = SETTLEMENT_STATUS[row.status] || SETTLEMENT_STATUS.draft;
                const rejected = row.status === 'rejected';
                return (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--foreground)]">{row.settlement_no || `#${row.id}`}</span>
                        <span className="text-xs text-[var(--color-text-3)]">
                          {pickName(row.projects) || `项目 #${row.project_id ?? '-'}`}
                          {pickName(row.team_groups) ? ` · ${pickName(row.team_groups)}` : ''}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-3)]">
                        <span>{row.settlement_month}</span>
                        <span>提交：{formatTime(row.submitted_at || row.created_at)}</span>
                        {row.reviewed_by ? <span>审批人：{row.reviewed_by}</span> : null}
                        {rejected && row.reject_reason ? (
                          <span className="text-red-600">驳回：{row.reject_reason}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                      <Link href={`/team-management/settlements/${row.id}`} className="text-xs text-[var(--color-primary)] hover:underline">
                        查看
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        </>
        )}
      </div>
    </div>
  );
}
