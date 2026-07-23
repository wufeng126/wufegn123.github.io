'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock3,
  CloudSun,
  FileText,
  HardHat,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
  UsersRound,
} from 'lucide-react';
import { getDefaultDailyReportDate, getReadableDate } from '@/lib/construction-log-deadline';

type ProjectTone = 'steady' | 'attention' | 'risk';

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

const toneMeta: Record<ProjectTone, { label: string; className: string; marker: string; rank: number }> = {
  risk: {
    label: '重点跟进',
    className: 'bg-rose-50 text-rose-700 ring-rose-100',
    marker: 'border-l-rose-500',
    rank: 0,
  },
  attention: {
    label: '需要关注',
    className: 'bg-amber-50 text-amber-700 ring-amber-100',
    marker: 'border-l-amber-500',
    rank: 1,
  },
  steady: {
    label: '正常推进',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    marker: 'border-l-emerald-500',
    rank: 2,
  },
};

function getProjectTone(project: ProjectDetail): ProjectTone {
  if (project.issue_count > 0) return 'risk';
  if (project.missing_users.length > 0 || project.late_users.length > 0) return 'attention';
  return 'steady';
}

function emptyText(value?: string | null, fallback = '日志中未单独记录。') {
  const text = String(value || '').trim();
  return text || fallback;
}

function joinList(items: string[], maxCount = 4) {
  return items.map(item => item.trim()).filter(Boolean).slice(0, maxCount).join('；');
}

function getProjectSections(project: ProjectDetail) {
  return {
    construction_content: emptyText(project.ai_sections?.construction_content || joinList(project.contents)),
    labor_teams: emptyText(
      project.ai_sections?.labor_teams ||
        `当日形成 ${project.log_count} 条施工日志，现场出勤合计 ${project.headcount_total} 人。`,
    ),
    materials_machinery: emptyText(project.ai_sections?.materials_machinery, '日志中未单独记录材料、机械使用情况。'),
    quality_safety: emptyText(
      project.ai_sections?.quality_safety || joinList(project.issues),
      project.issue_count > 0 ? '存在质量、安全或现场异常记录，请项目负责人核查。' : '未记录质量、安全异常。',
    ),
    progress_risks: emptyText(
      project.ai_sections?.progress_risks,
      project.issue_count > 0 || project.missing_users.length > 0 || project.late_users.length > 0
        ? '存在需跟进事项，请相关负责人结合现场情况处理。'
        : '未识别到明显进度风险。',
    ),
    tomorrow_plan: emptyText(project.ai_sections?.tomorrow_plan),
  };
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: typeof FileText;
  tone: string;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </article>
  );
}

function SectionBlock({
  title,
  icon: Icon,
  children,
  tone = 'default',
}: {
  title: string;
  icon: typeof FileText;
  children: string;
  tone?: 'default' | 'risk';
}) {
  const isRisk = tone === 'risk';
  return (
    <section className={isRisk ? 'rounded-lg border border-amber-100 bg-amber-50 p-4' : 'rounded-lg bg-slate-50 p-4'}>
      <div className={isRisk ? 'mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800' : 'mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900'}>
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <p className={isRisk ? 'text-sm leading-6 text-amber-900' : 'text-sm leading-6 text-slate-700'}>{children}</p>
    </section>
  );
}

function ProjectCard({ project, defaultOpen }: { project: ProjectDetail; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const tone = getProjectTone(project);
  const meta = toneMeta[tone];
  const sections = getProjectSections(project);

  return (
    <article className={`overflow-hidden rounded-lg border border-slate-200 border-l-4 ${meta.marker} bg-white shadow-sm`}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left hover:bg-slate-50 sm:px-5"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{project.project_name}</h3>
            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ${meta.className}`}>
              {meta.label}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              日志 {project.log_count} 条
            </span>
            <span className="inline-flex items-center gap-1">
              <UsersRound className="h-3.5 w-3.5" />
              出勤 {project.headcount_total} 人
            </span>
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              问题 {project.issue_count} 条
            </span>
          </div>
          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-700">{sections.construction_content}</p>
        </div>
        <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
          <div className="grid gap-3 lg:grid-cols-2">
            <SectionBlock title="施工进展" icon={ClipboardList}>
              {sections.construction_content}
            </SectionBlock>
            <SectionBlock title="人员情况" icon={UsersRound}>
              {sections.labor_teams}
            </SectionBlock>
            <SectionBlock title="材料机械" icon={Truck}>
              {sections.materials_machinery}
            </SectionBlock>
            <SectionBlock title="质量安全" icon={ShieldCheck} tone={project.issue_count > 0 ? 'risk' : 'default'}>
              {sections.quality_safety}
            </SectionBlock>
            <SectionBlock
              title="风险与提醒"
              icon={AlertTriangle}
              tone={project.issue_count > 0 || project.missing_users.length > 0 || project.late_users.length > 0 ? 'risk' : 'default'}
            >
              {sections.progress_risks}
            </SectionBlock>
            <SectionBlock title="明日计划" icon={Clock3}>
              {sections.tomorrow_plan}
            </SectionBlock>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
      {message || '暂无日报数据'}
    </div>
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
      await loadReport(date);
      setMessage('日报已按当前数据重新生成');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '日报刷新失败');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadReport(date);
  }, [date]);

  const summary = report?.summary;
  const projects = useMemo(() => summary?.projects || [], [summary]);
  const orderedProjects = useMemo(
    () =>
      projects
        .slice()
        .sort((a, b) => toneMeta[getProjectTone(a)].rank - toneMeta[getProjectTone(b)].rank || a.project_id - b.project_id),
    [projects],
  );
  const focusProjects = useMemo(
    () => orderedProjects.filter(project => getProjectTone(project) !== 'steady').slice(0, 4),
    [orderedProjects],
  );
  const readStatus = report?.read_status || { read_count: 0, total_count: 0 };

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto max-w-[1360px] space-y-5 p-3 sm:p-4 md:p-6">
        <header className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Link href="/workspace" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900">
                <ArrowLeft className="h-4 w-4" />
                返回工作台
              </Link>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
                <Sparkles className="h-3.5 w-3.5" />
                AI 萃取日报
              </div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">项目日报汇总</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                先看公司整体项目情况，再展开单个项目查看施工进展、资源投入、风险提醒和明日计划。页面面向全员阅读，只保留日报必要信息。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="inline-flex h-10 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
                已阅 {readStatus.read_count}/{readStatus.total_count} 人
              </div>
              <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
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
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                重新生成
              </button>
            </div>
          </div>
        </header>

        {message ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm text-slate-500">正在加载日报...</span>
          </div>
        ) : summary ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="项目覆盖"
                value={`${summary.company.submitted_projects}/${summary.company.total_projects} 个`}
                note="当日有施工日志的项目"
                icon={HardHat}
                tone="bg-blue-50 text-blue-700 ring-blue-100"
              />
              <StatCard
                label="现场出勤"
                value={`${summary.company.headcount_total} 人`}
                note="按施工日志汇总"
                icon={UsersRound}
                tone="bg-emerald-50 text-emerald-700 ring-emerald-100"
              />
              <StatCard
                label="日志数量"
                value={`${summary.company.log_count} 条`}
                note="当天已提交施工日志"
                icon={FileText}
                tone="bg-violet-50 text-violet-700 ring-violet-100"
              />
              <StatCard
                label="风险提醒"
                value={`${summary.company.issue_count + summary.company.missing_assignment_count} 条`}
                note="问题异常及未提交提醒"
                icon={AlertTriangle}
                tone="bg-rose-50 text-rose-700 ring-rose-100"
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CloudSun className="h-5 w-5 text-blue-600" />
                    <h2 className="text-base font-semibold">{getReadableDate(summary.report_date)} 公司项目总览</h2>
                  </div>
                  <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    AI 状态：{report?.ai_status === 'done' ? '已生成' : report?.ai_status === 'fallback' ? '本地兜底' : '待生成'}
                  </div>
                </div>
                <p className="text-sm leading-7 text-slate-700">
                  {summary.company.narrative || `当日公司项目日报覆盖 ${summary.company.submitted_projects} 个有日志项目，现场出勤合计 ${summary.company.headcount_total} 人。`}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(summary.company.key_points?.length
                    ? summary.company.key_points
                    : [
                        `当日 ${summary.company.submitted_projects}/${summary.company.total_projects} 个项目有施工日志。`,
                        `日志 ${summary.company.log_count} 条，现场出勤合计 ${summary.company.headcount_total} 人。`,
                        summary.company.issue_count > 0 ? `记录 ${summary.company.issue_count} 条问题异常。` : '未记录明显质量、安全异常。',
                        summary.company.missing_assignment_count > 0 ? `存在 ${summary.company.missing_assignment_count} 个未提交项目人员项。` : '项目日报提交情况正常。',
                      ]
                  ).map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-lg bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h2 className="text-base font-semibold">今日优先关注</h2>
                </div>
                <p className="mb-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                  {summary.company.risk_summary || '未识别到明显日报风险。'}
                </p>
                <div className="space-y-3">
                  {focusProjects.length ? (
                    focusProjects.map(project => {
                      const sections = getProjectSections(project);
                      return (
                        <div key={project.project_id} className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                          <div className="font-medium text-amber-900">{project.project_name}</div>
                          <p className="mt-1 text-sm leading-6 text-amber-800">{sections.progress_risks}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                      当前日期暂无需要重点关注的项目。
                    </div>
                  )}
                </div>
              </article>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">单项目日报</h2>
                  <p className="mt-1 text-sm text-slate-500">默认展开需要关注的项目，正常项目可点击查看详情。</p>
                </div>
                <div className="text-xs text-slate-500">
                  生成时间：{report?.generated_at ? new Date(report.generated_at).toLocaleString('zh-CN') : '-'}
                </div>
              </div>

              {orderedProjects.length ? (
                orderedProjects.map(project => (
                  <ProjectCard key={project.project_id} project={project} defaultOpen={getProjectTone(project) !== 'steady'} />
                ))
              ) : (
                <EmptyState message="当前日期暂无项目日报明细" />
              )}
            </section>
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </main>
  );
}
