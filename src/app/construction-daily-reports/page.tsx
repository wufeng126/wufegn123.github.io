'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Clock3, FileText, Loader2, RefreshCw, UsersRound } from 'lucide-react';
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
  ai_sections?: {
    construction_content?: string;
    labor_teams?: string;
    materials_machinery?: string;
    quality_safety?: string;
    progress_risks?: string;
    tomorrow_plan?: string;
  };
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
    narrative?: string;
    key_points?: string[];
    risk_summary?: string;
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
  read_status?: {
    read_count: number;
    total_count: number;
  };
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

function SectionBlock({ title, children, tone = 'default' }: { title: string; children: string; tone?: 'default' | 'risk' }) {
  return (
    <div className={tone === 'risk' ? 'rounded-lg border border-amber-100 bg-amber-50 p-3' : 'rounded-lg border border-slate-100 bg-slate-50 p-3'}>
      <div className={tone === 'risk' ? 'mb-1 text-xs font-semibold text-amber-700' : 'mb-1 text-xs font-semibold text-slate-500'}>{title}</div>
      <p className={tone === 'risk' ? 'text-sm leading-6 text-amber-900' : 'text-sm leading-6 text-slate-700'}>{children || '日志中未单独记录。'}</p>
    </div>
  );
}

function getProjectSections(project: ProjectDetail) {
  return {
    construction_content: project.ai_sections?.construction_content || project.contents.slice(0, 4).join('；') || '日志中未单独记录。',
    labor_teams: project.ai_sections?.labor_teams || `当日提交 ${project.submitted_users.length}/${project.expected_users.length} 人，现场出勤合计 ${project.headcount_total} 人。`,
    materials_machinery: project.ai_sections?.materials_machinery || '日志中未单独记录材料、机械使用情况。',
    quality_safety: project.ai_sections?.quality_safety || (project.issues.length ? `记录问题/异常：${project.issues.slice(0, 4).join('；')}` : '未记录质量、安全异常。'),
    progress_risks: project.ai_sections?.progress_risks || (project.issue_count > 0 || project.missing_users.length > 0 ? '存在需跟进事项，请项目负责人核查。' : '未识别到明显进度风险。'),
    tomorrow_plan: project.ai_sections?.tomorrow_plan || '日志中未单独记录明日计划。',
  };
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
    <div className="min-h-full bg-[#F5F6FA] p-3 text-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto max-w-[1320px] space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/workspace" className="rounded-lg p-2 hover:bg-white">
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold">项目日报汇总</h1>
              <p className="mt-1 text-xs text-slate-500">按日期查看公司项目总览和各项目施工日志汇总</p>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:flex sm:flex-wrap">
            <label className="inline-flex h-11 min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:h-10">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              <input
                type="date"
                value={date}
                onChange={event => setDate(event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <button
              type="button"
              onClick={refreshReport}
              disabled={refreshing || loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 sm:h-10"
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
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-blue-700">项目施工日报</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-normal text-slate-950 sm:text-2xl">{getReadableDate(summary.report_date)} 项目施工日报</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      生成时间：{report?.generated_at ? new Date(report.generated_at).toLocaleString('zh-CN') : '-'}
                      {report?.pushed_at ? `，已推送：${new Date(report.pushed_at).toLocaleString('zh-CN')}` : '，尚未自动推送'}
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    AI 萃取：{report?.ai_status === 'done' ? '已生成' : report?.ai_status === 'fallback' ? '本地兜底' : '待生成'}
                  </div>
                  <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                    已阅 {report?.read_status?.read_count || 0}/{report?.read_status?.total_count || 0} 人
                  </div>
                </div>
              </div>

              <div className="space-y-6 p-4 sm:p-5">
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-xs font-semibold text-white">一</span>
                    <h3 className="text-base font-semibold text-slate-950">公司整体情况</h3>
                  </div>
                  <p className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                    {summary.company.narrative || `当日公司项目日报覆盖 ${summary.company.submitted_projects} 个有日志项目，现场出勤合计 ${summary.company.headcount_total} 人。`}
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="有日志项目" value={`${summary.company.submitted_projects}/${summary.company.total_projects}`} tone="text-blue-700" />
                    <StatCard label="已交人员" value={`${summary.company.submitted_user_count}/${summary.company.expected_user_count}`} tone="text-emerald-700" />
                    <StatCard label="逾期补交" value={summary.company.late_user_count} tone="text-amber-700" />
                    <StatCard label="未交项目人员项" value={summary.company.missing_assignment_count} tone="text-red-600" />
                    <StatCard label="日志条数" value={summary.company.log_count} tone="text-slate-900" />
                    <StatCard label="出勤合计" value={summary.company.headcount_total} tone="text-slate-900" />
                    <StatCard label="问题异常" value={summary.company.issue_count} tone="text-orange-600" />
                    <StatCard label="项目明细" value={projects.length} tone="text-slate-900" />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_0.8fr]">
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                      <div className="mb-2 text-xs font-semibold text-blue-700">日报要点</div>
                      <ul className="space-y-1 text-sm leading-6 text-blue-900">
                        {(summary.company.key_points?.length ? summary.company.key_points : [
                          `当日 ${summary.company.submitted_projects}/${summary.company.total_projects} 个项目有施工日志。`,
                          `出勤合计 ${summary.company.headcount_total} 人，日志 ${summary.company.log_count} 条。`,
                        ]).map((item, index) => <li key={index}>· {item}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                      <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />风险提醒
                      </div>
                      <p className="text-sm leading-6 text-amber-900">
                        {summary.company.risk_summary || (summary.company.issue_count > 0 || summary.company.missing_assignment_count > 0 ? `存在 ${summary.company.issue_count} 条问题异常、${summary.company.missing_assignment_count} 个未提交项目人员项。` : '未识别到明显日报风险。')}
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-xs font-semibold text-white">二</span>
                    <h3 className="text-base font-semibold text-slate-950">各项目情况</h3>
                  </div>

                  <div className="space-y-4">
                    {projects.map((project, index) => {
                      const sections = getProjectSections(project);
                      return (
                        <article key={project.project_id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h4 className="text-base font-semibold">{index + 1}. {project.project_name}</h4>
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

                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <SectionBlock title="今日施工内容">{sections.construction_content}</SectionBlock>
                            <SectionBlock title="人员/班组情况">{sections.labor_teams}</SectionBlock>
                            <SectionBlock title="材料机械情况">{sections.materials_machinery}</SectionBlock>
                            <SectionBlock title="质量安全问题" tone={project.issue_count > 0 ? 'risk' : 'default'}>{sections.quality_safety}</SectionBlock>
                            <SectionBlock title="进度风险" tone={project.issue_count > 0 || project.missing_users.length > 0 ? 'risk' : 'default'}>{sections.progress_risks}</SectionBlock>
                            <SectionBlock title="明日计划">{sections.tomorrow_plan}</SectionBlock>
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
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>
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
