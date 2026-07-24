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
      setExpandedProjects(Object.fromEntries(projectGroups.map(group => [String(group.project_id), true])));
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
    <div className="min-h-full bg-[#F5F6FA] p-3 sm:p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/construction-logs?tab=logs" className="rounded-lg border border-[#E5E6EB] bg-white p-2 text-[#4E5969] hover:border-[#165DFF]/40 hover:text-[#165DFF]">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-[#1D2129] sm:text-2xl">人员出勤统计</h1>
              <p className="mt-1 text-sm text-[#86909C]">按项目、月份、工人汇总施工日志中记录的实际出勤工时，统计周期为每月 26 日至次月 25 日</p>
            </div>
          </div>
          <Link href="/construction-logs/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#0E49D8]">
            <UserRoundCheck className="h-4 w-4" />
            录入施工日志
          </Link>
        </div>

        <section className="mb-4 rounded-xl border border-[#E5E6EB] bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[160px_1fr_160px_1fr]">
            <input
              type="month"
              value={month}
              onChange={event => setMonth(event.target.value)}
              className="h-10 rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm outline-none focus:border-[#165DFF]"
            />
            <select
              value={projectId}
              onChange={event => setProjectId(event.target.value)}
              className="h-10 rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm outline-none focus:border-[#165DFF]"
            >
              <option value="all">全部项目</option>
              {projectOptions.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <select
              value={workType}
              onChange={event => setWorkType(event.target.value)}
              className="h-10 rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm outline-none focus:border-[#165DFF]"
            >
              <option value="">全部工种</option>
              {workTypes.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86909C]" />
              <input
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
                placeholder="搜索项目、工人、班组"
                className="h-10 w-full rounded-lg border border-[#E5E6EB] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#165DFF]"
              />
            </div>
          </div>
        </section>

        {message && (
          <div className="mb-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
            {message}
          </div>
        )}

        <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
            <UsersRound className="mb-2 h-5 w-5 text-[#165DFF]" />
            <p className="text-2xl font-bold text-[#1D2129]">{summary.worker_count}</p>
            <p className="text-xs text-[#86909C]">出勤人员</p>
          </div>
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
            <CalendarDays className="mb-2 h-5 w-5 text-[#10B981]" />
            <p className="text-2xl font-bold text-[#1D2129]">{summary.attendance_days}</p>
            <p className="text-xs text-[#86909C]">出勤人次</p>
          </div>
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
            <Clock3 className="mb-2 h-5 w-5 text-[#F59E0B]" />
            <p className="text-2xl font-bold text-[#1D2129]">{formatHours(summary.total_hours)}</p>
            <p className="text-xs text-[#86909C]">总工时</p>
          </div>
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
            <UserRoundCheck className="mb-2 h-5 w-5 text-[#7C3AED]" />
            <p className="text-2xl font-bold text-[#1D2129]">{summary.project_count}</p>
            <p className="text-xs text-[#86909C]">涉及项目</p>
          </div>
        </section>

        <section className="rounded-xl border border-[#E5E6EB] bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[#E5E6EB] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-[#1D2129]">项目人员出勤台账</h2>
              <p className="mt-1 text-xs text-[#86909C]">按项目折叠展示，展开后查看对应工人出勤明细</p>
            </div>
            {!loading && projectGroups.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={expandAllProjects}
                  className="h-8 rounded-lg border border-[#E5E6EB] px-3 text-xs font-medium text-[#4E5969] hover:border-[#165DFF]/40 hover:text-[#165DFF]"
                >
                  全部展开
                </button>
                <button
                  type="button"
                  onClick={collapseAllProjects}
                  className="h-8 rounded-lg border border-[#E5E6EB] px-3 text-xs font-medium text-[#4E5969] hover:border-[#165DFF]/40 hover:text-[#165DFF]"
                >
                  全部折叠
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-[#86909C]">加载中...</div>
          ) : projectGroups.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#86909C]">暂无出勤工时数据</div>
          ) : (
            <div className="divide-y divide-[#F2F3F5]">
              {projectGroups.map((group) => {
                const projectKey = String(group.project_id);
                const isOpen = Boolean(expandedProjects[projectKey]);
                return (
                  <article key={projectKey} className="bg-white">
                    <button
                      type="button"
                      onClick={() => toggleProject(projectKey)}
                      className="flex w-full flex-col gap-3 px-4 py-4 text-left hover:bg-[#FAFBFF] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={`h-4 w-4 shrink-0 text-[#86909C] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          <h3 className="truncate font-semibold text-[#1D2129]">{group.project_name}</h3>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#86909C]">
                          <span className="rounded-full bg-[#F2F3F5] px-2.5 py-1">人员 {group.worker_count} 人</span>
                          <span className="rounded-full bg-[#F2F3F5] px-2.5 py-1">出勤人次 {group.attendance_days}</span>
                          <span className="rounded-full bg-[#E8F3FF] px-2.5 py-1 text-[#165DFF]">总工时 {formatHours(group.total_hours)}</span>
                          <span className="rounded-full bg-[#F2F3F5] px-2.5 py-1">最近 {group.last_date || '-'}</span>
                        </div>
                      </div>
                      <span className="rounded-lg bg-[#F5F6FA] px-3 py-2 text-sm font-semibold text-[#1D2129]">
                        {isOpen ? '收起明细' : '查看明细'}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-[#F2F3F5] bg-[#FAFBFF] px-3 pb-4 sm:px-4">
                        <div className="hidden overflow-x-auto rounded-lg border border-[#E5E6EB] bg-white md:block">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-[#F7F8FA] text-[#86909C]">
                                <th className="px-4 py-3 text-left font-medium">工人</th>
                                <th className="px-4 py-3 text-left font-medium">工种/班组</th>
                                <th className="px-4 py-3 text-center font-medium">出勤天数</th>
                                <th className="px-4 py-3 text-center font-medium">总工时</th>
                                <th className="px-4 py-3 text-center font-medium">最近出勤</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map(row => (
                                <tr key={`${row.project_id}-${row.worker_id}`} className="border-t border-[#F2F3F5]">
                                  <td className="px-4 py-3 text-[#1D2129]">{row.worker_name}</td>
                                  <td className="px-4 py-3 text-[#4E5969]">{[row.work_type, row.team_name].filter(Boolean).join(' / ') || '-'}</td>
                                  <td className="px-4 py-3 text-center text-[#4E5969]">{row.attendance_days}</td>
                                  <td className="px-4 py-3 text-center font-semibold text-[#165DFF]">{formatHours(row.total_hours)}</td>
                                  <td className="px-4 py-3 text-center text-[#86909C]">{row.last_date || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="divide-y divide-[#F2F3F5] rounded-lg border border-[#E5E6EB] bg-white md:hidden">
                          {group.rows.map(row => (
                            <article key={`${row.project_id}-${row.worker_id}`} className="space-y-3 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="truncate font-medium text-[#1D2129]">{row.worker_name}</h3>
                                  <p className="mt-1 truncate text-xs text-[#86909C]">{[row.work_type, row.team_name].filter(Boolean).join(' / ') || '-'}</p>
                                </div>
                                <span className="rounded-full bg-[#E8F3FF] px-2.5 py-1 text-sm font-semibold text-[#165DFF]">
                                  {formatHours(row.total_hours)} 小时
                                </span>
                              </div>
                              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div><dt className="text-xs text-[#86909C]">出勤天数</dt><dd className="mt-0.5 text-[#4E5969]">{row.attendance_days}</dd></div>
                                <div><dt className="text-xs text-[#86909C]">最近出勤</dt><dd className="mt-0.5 text-[#4E5969]">{row.last_date || '-'}</dd></div>
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

        <section className="hidden">
          <div className="border-b border-[#E5E6EB] p-4">
            <h2 className="font-semibold text-[#1D2129]">项目人员出勤台账</h2>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F7F8FA] text-[#86909C]">
                  <th className="px-4 py-3 text-left font-medium">项目</th>
                  <th className="px-4 py-3 text-left font-medium">工人</th>
                  <th className="px-4 py-3 text-left font-medium">工种/班组</th>
                  <th className="px-4 py-3 text-center font-medium">出勤天数</th>
                  <th className="px-4 py-3 text-center font-medium">总工时</th>
                  <th className="px-4 py-3 text-center font-medium">最近出勤</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#86909C]">加载中...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#86909C]">暂无出勤工时数据</td></tr>
                ) : rows.map(row => (
                  <tr key={`${row.project_id}-${row.worker_id}`} className="border-t border-[#F2F3F5] hover:bg-[#FAFBFF]">
                    <td className="px-4 py-3 font-medium text-[#1D2129]">{row.project_name}</td>
                    <td className="px-4 py-3 text-[#1D2129]">{row.worker_name}</td>
                    <td className="px-4 py-3 text-[#4E5969]">{[row.work_type, row.team_name].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="px-4 py-3 text-center text-[#4E5969]">{row.attendance_days}</td>
                    <td className="px-4 py-3 text-center font-semibold text-[#165DFF]">{formatHours(row.total_hours)}</td>
                    <td className="px-4 py-3 text-center text-[#86909C]">{row.last_date || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-[#F2F3F5] md:hidden">
            {loading ? (
              <div className="p-6 text-center text-sm text-[#86909C]">加载中...</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#86909C]">暂无出勤工时数据</div>
            ) : rows.map(row => (
              <article key={`${row.project_id}-${row.worker_id}`} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium text-[#1D2129]">{row.worker_name}</h3>
                    <p className="mt-1 truncate text-xs text-[#86909C]">{row.project_name}</p>
                  </div>
                  <span className="rounded-full bg-[#E8F3FF] px-2.5 py-1 text-sm font-semibold text-[#165DFF]">
                    {formatHours(row.total_hours)} 小时
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-xs text-[#86909C]">工种/班组</dt><dd className="mt-0.5 text-[#4E5969]">{[row.work_type, row.team_name].filter(Boolean).join(' / ') || '-'}</dd></div>
                  <div><dt className="text-xs text-[#86909C]">出勤天数</dt><dd className="mt-0.5 text-[#4E5969]">{row.attendance_days}</dd></div>
                  <div><dt className="text-xs text-[#86909C]">最近出勤</dt><dd className="mt-0.5 text-[#4E5969]">{row.last_date || '-'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
