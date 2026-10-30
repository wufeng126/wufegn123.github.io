'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock3,
  CloudSun,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  UsersRound,
  type LucideIcon,
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
    decisions?: string[];
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
    label: '暂无动态',
    className: 'bg-muted text-muted-foreground ring-border',
    marker: 'border-l-border',
    rank: 2,
  },
  steady: {
    label: '正常推进',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    marker: 'border-l-emerald-500',
    rank: 1,
  },
};

function getProjectTone(project: ProjectDetail): ProjectTone {
  if (project.issue_count > 0) return 'risk';
  if (project.log_count <= 0) return 'attention';
  return 'steady';
}

function emptyText(value?: string | null, fallback = '日志中未单独记录。') {
  const text = String(value || '').trim();
  return text || fallback;
}

function joinList(items: string[], maxCount = 4) {
  return items.map(item => item.trim()).filter(Boolean).slice(0, maxCount).join('；');
}

function hasSubmissionNoise(value?: string | null) {
  return /应交|已交|未交|未提交|逾期|提交情况|missing|late/i.test(String(value || ''));
}

function getCleanText(value: string | undefined, fallback: string) {
  if (!value || hasSubmissionNoise(value)) return fallback;
  return value;
}

function getProjectSections(project: ProjectDetail) {
  // 去模板化：AI 没写的段落保留空字符串（不兜底成"日志中未单独记录"），由卡片按需隐藏
  const construction = getCleanText(
    project.ai_sections?.construction_content || joinList(project.contents),
    '',
  );
  const laborFallback = project.log_count > 0
    ? `出勤合计 ${project.headcount_total} 人（${project.log_count} 条日志）。`
    : '';
  const quality = getCleanText(
    project.ai_sections?.quality_safety || joinList(project.issues),
    '',
  );

  return {
    construction_content: construction,
    labor_teams: getCleanText(project.ai_sections?.labor_teams || laborFallback, ''),
    materials_machinery: project.ai_sections?.materials_machinery || '',
    quality_safety: quality,
    progress_risks: project.ai_sections?.progress_risks || '',
    tomorrow_plan: project.ai_sections?.tomorrow_plan || '',
  };
}

function cleanCompanyNarrative(summary: ReportSummary) {
  const fallback = `当日公司项目日报覆盖 ${summary.company.submitted_projects} 个有日志项目，现场出勤合计 ${summary.company.headcount_total} 人。`;
  return emptyText(
    getCleanText(summary.company.narrative, fallback),
    fallback,
  );
}

function cleanCompanyRisk(summary: ReportSummary) {
  const fallback = summary.company.issue_count > 0
    ? `当日记录 ${summary.company.issue_count} 条问题异常，请对应项目负责人跟进。`
    : '未识别到明显日报风险。';
  return emptyText(getCleanText(summary.company.risk_summary, fallback), fallback);
}

function getCompanyHighlights(summary: ReportSummary) {
  const cleanPoints = (summary.company.key_points || [])
    .map(item => String(item || '').trim())
    .filter(item => item && !hasSubmissionNoise(item))
    .slice(0, 4);

  if (cleanPoints.length > 0) return cleanPoints;

  return [
    `当日 ${summary.company.submitted_projects}/${summary.company.total_projects} 个项目有施工动态。`,
    `施工日志 ${summary.company.log_count} 条，现场出勤合计 ${summary.company.headcount_total} 人。`,
    summary.company.issue_count > 0 ? `记录 ${summary.company.issue_count} 条问题异常。` : '未记录明显质量、安全异常。',
    '各项目可展开查看施工进展、资源投入、风险提醒和明日计划。',
  ];
}

function SectionBlock({
  title,
  icon: Icon,
  children,
  tone = 'default',
}: {
  title: string;
  icon: LucideIcon;
  children: string;
  tone?: 'default' | 'risk';
}) {
  const isRisk = tone === 'risk';
  return (
    <section className={isRisk ? 'rounded-lg border border-amber-100 bg-amber-50 p-4' : 'rounded-lg bg-muted/50 p-4'}>
      <div className={isRisk ? 'mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800' : 'mb-3 flex items-center gap-2 text-sm font-semibold text-foreground'}>
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <p className={isRisk ? 'text-sm leading-6 text-amber-900' : 'text-sm leading-6 text-foreground/80'}>{children}</p>
    </section>
  );
}

function ProjectCard({ project, defaultOpen }: { project: ProjectDetail; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const tone = getProjectTone(project);
  const meta = toneMeta[tone];
  const sections = getProjectSections(project);
  // 去模板化：只渲染有内容的段落
  const visibleSections = [
    { title: '施工进展', icon: ClipboardList, value: sections.construction_content, tone: 'default' as const },
    { title: '人员情况', icon: UsersRound, value: sections.labor_teams, tone: 'default' as const },
    { title: '材料机械', icon: Truck, value: sections.materials_machinery, tone: 'default' as const },
    { title: '质量安全', icon: ShieldCheck, value: sections.quality_safety, tone: project.issue_count > 0 ? 'risk' as const : 'default' as const },
    { title: '风险与提醒', icon: AlertTriangle, value: sections.progress_risks, tone: project.issue_count > 0 ? 'risk' as const : 'default' as const },
    { title: '明日计划', icon: Clock3, value: sections.tomorrow_plan, tone: 'default' as const },
  ].filter(section => String(section.value || '').trim() !== '');

  return (
    <article className={`overflow-hidden rounded-xl border border-border border-l-4 ${meta.marker} bg-card shadow-sm`}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/15 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{project.project_name}</h3>
            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ${meta.className}`}>
              {meta.label}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
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
              异常 {project.issue_count} 条
            </span>
          </div>
          <p className="mt-3 max-w-5xl text-sm leading-6 text-foreground/80">
            {sections.construction_content || '当日暂无施工内容摘要。'}
          </p>
        </div>
        <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-muted-foreground/80 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="border-t border-border/60 px-4 py-4 sm:px-5">
          {visibleSections.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleSections.map(section => (
                <SectionBlock key={section.title} title={section.title} icon={section.icon} tone={section.tone}>
                  {section.value}
                </SectionBlock>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">今日无异常记录。</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 text-sm font-medium text-foreground/80">{message || '暂无日报数据'}</p>
      <p className="mt-1 text-xs text-muted-foreground">切换日期或重新生成后再查看。</p>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        {[0, 1].map(item => (
          <div key={item} className="animate-pulse rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="h-5 w-1/3 rounded bg-muted-foreground/20" />
            <div className="mt-5 space-y-3">
              <div className="h-3 rounded bg-muted" />
              <div className="h-3 w-5/6 rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
      {[0, 1, 2].map(item => (
        <div key={item} className="animate-pulse rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="h-5 w-1/4 rounded bg-muted-foreground/20" />
          <div className="mt-4 h-3 rounded bg-muted" />
          <div className="mt-2 h-3 w-4/5 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function isReportDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default function ConstructionDailyReportsPage() {
  return (
    <Suspense fallback={null}>
      <ConstructionDailyReportsPageContent />
    </Suspense>
  );
}

function ConstructionDailyReportsPageContent() {
  const searchParams = useSearchParams();
  const queryDate = searchParams.get('date') || searchParams.get('report_date') || '';
  const [date, setDate] = useState(() => (isReportDate(queryDate) ? queryDate : getDefaultDailyReportDate()));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const user = json?.user || json?.data;
        setIsSuperAdmin(user?.role === 'super_admin');
      })
      .catch(() => {
        // 获取失败按无权限处理（后端仍会校验）
      });
    return () => { cancelled = true; };
  }, []);

  const loadReport = useCallback(async (targetDate: string) => {
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
  }, []);

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

  /** 重新生成并推送钉钉（个人互动卡片，失败自动回退工作通知） */
  async function refreshAndPush() {
    setRefreshing(true);
    setMessage('');
    try {
      const res = await fetch('/api/construction-daily-reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, force: true, push: true }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '日报推送失败');
      await loadReport(date);
      const pushedAt = json.data?.pushed_at as string | null | undefined;
      setMessage(
        pushedAt
          ? `日报已生成并推送至钉钉（${new Date(pushedAt).toLocaleString('zh-CN')}）`
          : '日报已生成，但推送未执行（检查钉钉配置或接收人绑定）',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '日报推送失败');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReport(date);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [date, loadReport]);

  useEffect(() => {
    if (!isReportDate(queryDate)) return;
    const timer = window.setTimeout(() => {
      setDate(currentDate => (currentDate === queryDate ? currentDate : queryDate));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [queryDate]);

  const summary = report?.summary;
  const projects = useMemo(() => summary?.projects || [], [summary]);
  const activeProjects = useMemo(
    () => projects.filter(project => project.log_count > 0 || project.issue_count > 0),
    [projects],
  );
  const quietProjects = useMemo(
    () => projects.filter(project => project.log_count <= 0 && project.issue_count <= 0),
    [projects],
  );
  const orderedProjects = useMemo(
    () =>
      activeProjects
        .slice()
        .sort((a, b) => toneMeta[getProjectTone(a)].rank - toneMeta[getProjectTone(b)].rank || a.project_id - b.project_id),
    [activeProjects],
  );
  const focusProjects = useMemo(
    () => orderedProjects.filter(project => getProjectTone(project) === 'risk').slice(0, 4),
    [orderedProjects],
  );
  const readStatus = report?.read_status || { read_count: 0, total_count: 0 };

  return (
    <main className="min-h-full bg-[var(--color-muted)] text-foreground">
      <div className="mx-auto max-w-[1360px] space-y-5 p-3 sm:p-4 md:p-6">
        <header className="rounded-xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Link href="/construction-logs?tab=logs" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/15">
                <ArrowLeft className="h-4 w-4" />
                返回施工日志
              </Link>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/15">
                <Sparkles className="h-3.5 w-3.5" />
                AI 萃取日报
              </div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">项目日报汇总</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                先看公司整体情况，再展开单个项目查看施工进展、资源投入、风险提醒和明日计划。页面面向所有员工阅读，不展示提交统计和人员名单。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="inline-flex h-10 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 shadow-sm">
                已阅 {readStatus.read_count}/{readStatus.total_count} 人
              </div>
              <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground/80 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <CalendarDays className="h-4 w-4 text-primary" />
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
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                重新生成
              </button>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={refreshAndPush}
                  disabled={refreshing || loading}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/30 bg-white px-4 text-sm font-semibold text-primary shadow-sm transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  推送日报
                </button>
              )}
            </div>
          </div>
        </header>

        {message ? (
          <div className="rounded-lg border border-primary/15 bg-accent px-4 py-3 text-sm text-primary">
            {message}
          </div>
        ) : null}

        {loading ? (
          <ReportSkeleton />
        ) : summary ? (
          <>
            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <article className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CloudSun className="h-5 w-5 text-primary" />
                    <h2 className="text-base font-semibold">{getReadableDate(summary.report_date)} 公司项目总览</h2>
                  </div>
                  <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    AI 状态：{report?.ai_status === 'done' ? '已生成' : report?.ai_status === 'fallback' ? '本地兜底' : '待生成'}
                  </div>
                </div>
                <p className="text-sm leading-7 text-foreground/80">
                  {cleanCompanyNarrative(summary)}
                </p>
                {(summary.company.decisions || []).filter(Boolean).length > 0 ? (
                  <div className="mt-4 rounded-lg border border-primary/15 bg-accent/60 p-3">
                    <div className="mb-2 text-sm font-semibold text-primary">待决策 / 需协调</div>
                    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/80">
                      {(summary.company.decisions || []).filter(Boolean).map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {getCompanyHighlights(summary).map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-lg bg-muted/50 px-3 py-3 text-sm leading-6 text-foreground/80 ring-1 ring-border/60">
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h2 className="text-base font-semibold">今日优先关注</h2>
                </div>
                <p className="mb-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                  {cleanCompanyRisk(summary)}
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
                    <div className="rounded-lg bg-muted/50 p-3 text-sm leading-6 text-muted-foreground">
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
                  <p className="mt-1 text-sm text-muted-foreground">按风险优先排序，默认展开需要关注的项目，其他项目可点击查看详情。</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  生成时间：{report?.generated_at ? new Date(report.generated_at).toLocaleString('zh-CN') : '-'}
                </div>
              </div>

              {orderedProjects.length ? (
                orderedProjects.map(project => (
                  <ProjectCard key={project.project_id} project={project} defaultOpen={getProjectTone(project) === 'risk'} />
                ))
              ) : (
                <EmptyState message="当前日期暂无项目施工动态" />
              )}

              {quietProjects.length > 0 ? (
                <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
                  <div className="font-medium text-foreground">当日暂无动态项目</div>
                  <p className="mt-2 leading-6">
                    {quietProjects.map(project => project.project_name).join('、')}
                  </p>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </main>
  );
}
