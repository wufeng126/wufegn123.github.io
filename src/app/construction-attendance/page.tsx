'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, ChevronDown, Clock3, Search, UserRoundCheck, UsersRound } from 'lucide-react';

type Project = { id: number | string; name: string };

type AttendanceSummaryRow = {
  project_id: number;
  project_name: string;
  worker_id: number;
  worker_name: string;
  work_type: string;
  team_name: string;
  attendance_days: number;
  total_hours: number;
  last_date: string;
};

type Summary = {
  worker_count: number;
  project_count: number;
  total_hours: number;
  attendance_days: number;
};

type ProjectAttendanceGroup = {
  project_id: number;
  project_name: string;
  rows: AttendanceSummaryRow[];
  worker_count: number;
  attendance_days: number;
  total_hours: number;
  last_date: string;
};

const emptySummary: Summary = {
  worker_count: 0,
  project_count: 0,
  total_hours: 0,
  attendance_days: 0,
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatHours(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

export default function ConstructionAttendancePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [month, setMonth] = useState(currentMonth());
  const [projectId, setProjectId] = useState('all');
  const [workType, setWorkType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(json => setProjects(Array.isArray(json.projects) ? json.projects : []))
      .catch(() => setProjects([]));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ month, projectId });
      if (workType) params.set('workType', workType);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await fetch(`/api/construction-logs/attendance-summary?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '人员出勤统计加载失败');
      setRows(Array.isArray(json.data) ? json.data : []);
      setSummary(json.summary || emptySummary);
      setWorkTypes(Array.isArray(json.work_types) ? json.work_types : []);
    } catch (error) {
      setRows([]);
      setSummary(emptySummary);
      setMessage(error instanceof Error ? error.message : '人员出勤统计加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, month, projectId, workType]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const projectOptions = useMemo(() => projects.map(project => ({
    id: String(project.id),
    name: project.name,
  })), [projects]);

  const projectGroups = useMemo<ProjectAttendanceGroup[]>(() => {
    const groupMap = new Map<number, ProjectAttendanceGroup>();
    rows.forEach((row) => {
      const group = groupMap.get(row.project_id) || {
        project_id: row.project_id,
        project_name: row.project_name,
        rows: [],
        worker_count: 0,
        attendance_days: 0,
        total_hours: 0,
        last_date: '',
      };
      group.rows.push(row);
      group.worker_count += 1;
      group.attendance_days += Number(row.attendance_days || 0);
      group.total_hours += Number(row.total_hours || 0);
      if (row.last_date && (!group.last_date || row.last_date > group.last_date)) group.last_date = row.last_date;
      groupMap.set(row.project_id, group);
    });
    return Array.from(groupMap.values())
      .map((group) => ({
        ...group,
        total_hours: Math.round(group.total_hours * 100) / 100,
        rows: [...group.rows].sort((a, b) => b.total_hours - a.total_hours || a.worker_name.localeCompare(b.worker_name, 'zh-Hans-CN')),
      }))
      .sort((a, b) => b.total_hours - a.total_hours || a.project_name.localeCompare(b.project_name, 'zh-Hans-CN'));
  }, [rows]);

  useEffect(() => {
    if (projectId !== 'all' && projectGroups.length > 0) {
      const timer = window.setTimeout(() => {
        setExpandedProjects(Object.fromEntries(projectGroups.map(group => [String(group.project_id), true])));
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [projectGroups, projectId]);

  function toggleProject(projectKey: string) {
    setExpandedProjects(current => ({ ...current, [projectKey]: !current[projectKey] }));
  }

  function expandAllProjects() {
    setExpandedProjects(Object.fromEntries(projectGroups.map(group => [String(group.project_id), true])));
  }

  function collapseAllProjects() {
    setExpandedProjects({});
  }

  return (
    <div className="min-h-full bg-[var(--color-muted)] p-3 text-foreground sm:p-4 md:p-6">
      <div className="mx-auto max-w-[1360px] space-y-5">
        <header className="rounded-xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/construction-logs?tab=logs" className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:border-primary/25 hover:bg-accent hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/15">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <UserRoundCheck className="h-3.5 w-3.5 text-primary" />
                <span>施工管理 / 人员台账</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">人员出勤统计</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">按项目、月份、工人汇总施工日志中记录的实际出勤工时，统计周期为每月 26 日至次月 25 日。</p>
            </div>
          </div>
          <Link href="/construction-logs/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/15">
            <UserRoundCheck className="h-4 w-4" />
            录入施工日志
          </Link>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[160px_minmax(180px,1fr)_160px_minmax(220px,1.2fr)]">
            <input
              type="month"
              value={month}
              onChange={event => setMonth(event.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground/80 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <select
              value={projectId}
              onChange={event => setProjectId(event.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground/80 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              <option value="all">全部项目</option>
              {projectOptions.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <select
              value={workType}
              onChange={event => setWorkType(event.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground/80 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              <option value="">全部工种</option>
              {workTypes.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <input
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
                placeholder="搜索项目、工人、班组"
                className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground/80 outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>
        </section>

        {message && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {message}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <UsersRound className="mb-2 h-5 w-5 text-primary" />
            <p className="text-2xl font-semibold tabular-nums text-foreground">{summary.worker_count}</p>
            <p className="text-xs text-muted-foreground">出勤人员</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <CalendarDays className="mb-2 h-5 w-5 text-emerald-700" />
            <p className="text-2xl font-semibold tabular-nums text-foreground">{summary.attendance_days}</p>
            <p className="text-xs text-muted-foreground">出勤人次</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <Clock3 className="mb-2 h-5 w-5 text-amber-600" />
            <p className="text-2xl font-semibold tabular-nums text-foreground">{formatHours(summary.total_hours)}</p>
            <p className="text-xs text-muted-foreground">总工时</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <UserRoundCheck className="mb-2 h-5 w-5 text-violet-700" />
            <p className="text-2xl font-semibold tabular-nums text-foreground">{summary.project_count}</p>
            <p className="text-xs text-muted-foreground">涉及项目</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-foreground">项目人员出勤台账</h2>
              <p className="mt-1 text-xs text-muted-foreground">按项目折叠展示，展开后查看对应工人出勤明细</p>
            </div>
            {!loading && projectGroups.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={expandAllProjects}
                  className="h-8 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/25 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                >
                  全部展开
                </button>
                <button
                  type="button"
                  onClick={collapseAllProjects}
                  className="h-8 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/25 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                >
                  全部折叠
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map(item => (
                <div key={item} className="animate-pulse rounded-lg border border-border/60 bg-card p-4">
                  <div className="h-4 w-1/3 rounded bg-muted-foreground/20" />
                  <div className="mt-3 flex gap-2">
                    <div className="h-6 w-20 rounded-full bg-muted" />
                    <div className="h-6 w-24 rounded-full bg-muted" />
                    <div className="h-6 w-20 rounded-full bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : projectGroups.length === 0 ? (
            <div className="p-10 text-center">
              <UsersRound className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-foreground/80">暂无出勤工时数据</p>
              <p className="mt-1 text-xs text-muted-foreground">调整月份、项目或工种后再查看。</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {projectGroups.map((group) => {
                const projectKey = String(group.project_id);
                const isOpen = Boolean(expandedProjects[projectKey]);
                return (
                  <article key={projectKey} className="bg-card">
                    <button
                      type="button"
                      onClick={() => toggleProject(projectKey)}
                      className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/15"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          <h3 className="truncate font-semibold text-foreground">{group.project_name}</h3>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full bg-muted px-2.5 py-1">人员 {group.worker_count} 人</span>
                          <span className="rounded-full bg-muted px-2.5 py-1">出勤人次 {group.attendance_days}</span>
                          <span className="rounded-full bg-accent px-2.5 py-1 font-medium text-primary">总工时 {formatHours(group.total_hours)}</span>
                          <span className="rounded-full bg-muted px-2.5 py-1">最近 {group.last_date || '-'}</span>
                        </div>
                      </div>
                      <span className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-foreground/80">
                        {isOpen ? '收起明细' : '查看明细'}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border/60 bg-muted/50 px-3 pb-4 sm:px-4">
                        <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/50 text-muted-foreground">
                                <th className="px-4 py-3 text-left font-medium">工人</th>
                                <th className="px-4 py-3 text-left font-medium">工种/班组</th>
                                <th className="px-4 py-3 text-center font-medium">出勤天数</th>
                                <th className="px-4 py-3 text-center font-medium">总工时</th>
                                <th className="px-4 py-3 text-center font-medium">最近出勤</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map(row => (
                                <tr key={`${row.project_id}-${row.worker_id}`} className="border-t border-border/60 hover:bg-muted/50">
                                  <td className="px-4 py-3 font-medium text-foreground">{row.worker_name}</td>
                                  <td className="px-4 py-3 text-muted-foreground">{[row.work_type, row.team_name].filter(Boolean).join(' / ') || '-'}</td>
                                  <td className="px-4 py-3 text-center text-muted-foreground">{row.attendance_days}</td>
                                  <td className="px-4 py-3 text-center font-semibold tabular-nums text-primary">{formatHours(row.total_hours)}</td>
                                  <td className="px-4 py-3 text-center text-muted-foreground">{row.last_date || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="divide-y divide-border/60 rounded-lg border border-border bg-card md:hidden">
                          {group.rows.map(row => (
                            <article key={`${row.project_id}-${row.worker_id}`} className="space-y-3 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="truncate font-medium text-foreground">{row.worker_name}</h3>
                                  <p className="mt-1 truncate text-xs text-muted-foreground">{[row.work_type, row.team_name].filter(Boolean).join(' / ') || '-'}</p>
                                </div>
                                <span className="rounded-full bg-accent px-2.5 py-1 text-sm font-semibold text-primary">
                                  {formatHours(row.total_hours)} 小时
                                </span>
                              </div>
                              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div><dt className="text-xs text-muted-foreground">出勤天数</dt><dd className="mt-0.5 text-muted-foreground">{row.attendance_days}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">最近出勤</dt><dd className="mt-0.5 text-muted-foreground">{row.last_date || '-'}</dd></div>
                              </dl>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
