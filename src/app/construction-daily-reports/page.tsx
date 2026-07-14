'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, FileText, Loader2, RefreshCw, UsersRound } from 'lucide-react';
import { getDefaultDailyReportDate, getReadableDate } from '@/lib/construction-log-deadline';

type Person = { id: number; name: string; status?: string };

type ProjectDetail = {
  project_id: number;
  project_name: string;
  expected_users: Person[];
  submitted_users: Person[];
  late_users: Person[];
  missing_users: Person[];
  log_count: number;
  headcount_total: number;
  issue_count: number;
  contents: string[];
  issues: string[];
};

type ReportSummary = {
  report_date: string;
  company: {
    total_projects: number;
    submitted_projects: number;
    expected_user_count: number;
    submitted_user_count: number;
    late_user_count: number;
    missing_assignment_count: number;
    log_count: number;
    issue_count: number;
    headcount_total: number;
  };
  projects: ProjectDetail[];
};

type Report = {
  id: number;
  report_date: string;
  summary: ReportSummary;
  content: string;
  ai_summary?: string | null;
  ai_status?: string | null;
  generated_at?: string;
  pushed_at?: string | null;
};

function StatCard({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function PersonList({ users, empty }: { users: Person[]; empty: string }) {
  if (!users.length) return <span className="text-slate-400">{empty}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {users.map(user => (
        <span key={user.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
          {user.name}
        </span>
      ))}
    </span>
  );
}

export default function ConstructionDailyReportsPage() {
  const [date, setDate] = useState(getDefaultDailyReportDate());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  async function loadReport(targetDate = date) {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`/api/construction-daily-reports?date=${targetDate}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '日报加载失败');
      setReport(json.data || null);
    } catch (error) {
      setReport(null);
      setMessage(error instanceof Error ? error.message : '日报加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function refreshReport() {
    setRefreshing(true);
    setMessage('');
    try {
      const res = await fetch('/api/construction-daily-reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, force: true, push: false }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '日报刷新失败');
      setReport(json.data || null);
      setMessage('日报已按当前数据重新生成');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '日报刷新失败');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReport(date);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [date]);

  const summary = report?.summary;
  const projects = useMemo(() => summary?.projects || [], [summary]);

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-[1320px] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/workspace" className="rounded-lg p-2 hover:bg-white">
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold">项目日报汇总</h1>
              <p className="mt-1 text-xs text-slate-500">按日期查看公司项目总览和各项目施工日志汇总</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              <input
                type="date"
                value={date}
                onChange={event => setDate(event.target.value)}
                className="bg-transparent outline-none"
              />
            </label>
            <button
              type="button"
              onClick={refreshReport}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              重新生成
            </button>
          </div>
        </div>

        {message ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm text-slate-500">正在加载日报...</span>
          </div>
        ) : summary ? (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{getReadableDate(summary.report_date)} 公司总览</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    生成时间：{report?.generated_at ? new Date(report.generated_at).toLocaleString('zh-CN') : '-'}
                    {report?.pushed_at ? `，已推送：${new Date(report.pushed_at).toLocaleString('zh-CN')}` : '，尚未自动推送'}
                  </p>
                </div>
                <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  AI 总结：{report?.ai_status === 'done' ? '已生成' : '预留'}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="有日志项目" value={`${summary.company.submitted_projects}/${summary.company.total_projects}`} tone="text-blue-700" />
                <StatCard label="已交人员" value={`${summary.company.submitted_user_count}/${summary.company.expected_user_count}`} tone="text-emerald-700" />
                <StatCard label="逾期补交" value={summary.company.late_user_count} tone="text-amber-700" />
                <StatCard label="未交项目人员项" value={summary.company.missing_assignment_count} tone="text-red-600" />
                <StatCard label="日志条数" value={summary.company.log_count} tone="text-slate-900" />
                <StatCard label="出勤合计" value={summary.company.headcount_total} tone="text-slate-900" />
                <StatCard label="问题异常" value={summary.company.issue_count} tone="text-orange-600" />
                <StatCard label="项目明细" value={projects.length} tone="text-slate-900" />
              </div>
            </section>

            <section className="space-y-3">
              {projects.map(project => (
                <div key={project.project_id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">{project.project_name}</h3>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-blue-700">
                          <FileText className="h-3.5 w-3.5" />日志 {project.log_count}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
                          <UsersRound className="h-3.5 w-3.5" />出勤 {project.headcount_total}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-700">
                          <Clock3 className="h-3.5 w-3.5" />逾期 {project.late_users.length}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />已交 {project.submitted_users.length}/{project.expected_users.length}
                        </span>
                      </div>
                    </div>
                    {project.issue_count > 0 ? (
                      <span className="rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
                        {project.issue_count} 条问题异常
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="mb-2 text-xs font-medium text-slate-500">已提交人员</div>
                      <PersonList users={project.submitted_users} empty="暂无提交" />
                    </div>
                    <div className="rounded-lg bg-amber-50 p-3">
                      <div className="mb-2 text-xs font-medium text-amber-700">逾期提交人员</div>
                      <PersonList users={project.late_users} empty="无逾期" />
                    </div>
                    <div className="rounded-lg bg-red-50 p-3">
                      <div className="mb-2 text-xs font-medium text-red-700">未提交人员</div>
                      <PersonList users={project.missing_users} empty="无未交" />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs font-medium text-slate-500">施工内容摘要</div>
                      <div className="space-y-2">
                        {project.contents.length ? project.contents.slice(0, 5).map((item, index) => (
                          <p key={index} className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">{item}</p>
                        )) : <p className="text-sm text-slate-400">暂无施工内容</p>}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-medium text-slate-500">问题异常摘要</div>
                      <div className="space-y-2">
                        {project.issues.length ? project.issues.slice(0, 5).map((item, index) => (
                          <p key={index} className="rounded-lg bg-orange-50 px-3 py-2 text-sm leading-6 text-orange-800">{item}</p>
                        )) : <p className="text-sm text-slate-400">暂无问题异常</p>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            暂无日报数据
          </div>
        )}
      </div>
    </div>
  );
}
