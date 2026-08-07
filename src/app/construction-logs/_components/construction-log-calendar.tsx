'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  FileText,
  Plus,
  Sun,
  Users,
  X,
} from 'lucide-react';

type CalendarDay = {
  date: string;
  day: number;
  hasLog: boolean;
  logId?: number;
  headcount?: number;
  riskCount?: number;
  weatherCondition?: string | null;
  weatherTemperature?: number | null;
  status?: 'submitted' | 'pending' | 'cancelled' | null;
  hasRisk?: boolean;
  isLate?: boolean;
  logCount?: number;
  totalHeadcount?: number;
  weather?: string | null;
  temperature?: number | string | null;
  logs?: CalendarLogItem[];
};

type CalendarLogItem = {
  id: number;
  content: string;
  headcount: number | null;
  userName: string | null;
  location?: string | null;
  status?: string | null;
  submissionStatus?: string | null;
  hasRisk?: boolean;
};

type CalendarData = {
  month: string;
  year: number;
  monthNum: number;
  lastDay: number;
  calendarDays: CalendarDay[];
  stats: {
    totalLogs: number;
    daysWithLogs: number;
    daysWithoutLogs: number;
    totalHeadcount: number;
    riskCount: number;
  };
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const WEATHER_ICONS: Record<string, typeof Sun> = {
  '晴': Sun,
  '多云': Cloud,
  '阴': Cloud,
  '小雨': CloudRain,
  '中雨': CloudRain,
  '大雨': CloudRain,
  '暴雨': CloudRain,
  '雷阵雨': CloudLightning,
  '雪': CloudSnow,
  '雾': CloudFog,
  '霾': CloudFog,
};

function getWeatherIcon(condition: string | null | undefined) {
  if (!condition) return null;
  const Icon = WEATHER_ICONS[condition] || Cloud;
  return <Icon className="h-4 w-4" />;
}

function getWeatherColor(condition: string | null | undefined) {
  if (!condition) return 'text-slate-400';
  if (condition.includes('晴')) return 'text-amber-500';
  if (condition.includes('雨') || condition.includes('雪')) return 'text-blue-500';
  if (condition.includes('雷')) return 'text-violet-500';
  return 'text-slate-400';
}

type Project = {
  id: number;
  name: string;
};

function getDayLogs(day: CalendarDay) {
  return day.logs || [];
}

function getDayLogCount(day: CalendarDay) {
  return day.logCount ?? getDayLogs(day).length ?? (day.hasLog ? 1 : 0);
}

function getDayHeadcount(day: CalendarDay) {
  return day.totalHeadcount ?? day.headcount ?? getDayLogs(day).reduce((sum, log) => sum + (log.headcount || 0), 0);
}

function getDayRiskCount(day: CalendarDay) {
  return day.riskCount ?? getDayLogs(day).filter((log) => log.hasRisk).length ?? (day.hasRisk ? 1 : 0);
}

function getDayWeather(day: CalendarDay) {
  return day.weatherCondition ?? day.weather ?? null;
}

function getDayTemperature(day: CalendarDay) {
  const value = day.weatherTemperature ?? day.temperature ?? null;
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getPrimaryLogId(day: CalendarDay) {
  return day.logId ?? getDayLogs(day)[0]?.id;
}

function CalendarMetric({
  label,
  value,
  tone = 'text-slate-950',
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function LegendItem({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className={`h-2.5 w-2.5 rounded-sm ring-1 ${className}`} />
      {label}
    </span>
  );
}

export default function ConstructionLogCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [message, setMessage] = useState('');

  // 获取项目列表
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects?includePublicLog=1');
        const json = await res.json();
        const list = Array.isArray(json.projects)
          ? json.projects
          : Array.isArray(json.data?.projects)
            ? json.data.projects
            : [];
        const nextProjects = list.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name }));
        setProjects(nextProjects);
        if (nextProjects.length > 0) {
          setSelectedProjectId(current => current || String(nextProjects[0].id));
        } else {
          setMessage('暂无可查看的项目');
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
        setMessage('项目列表加载失败，请稍后重试');
      }
    }
    fetchProjects();
  }, []);

  const fetchCalendar = useCallback(async () => {
    if (!selectedProjectId) {
      setCalendarData(null);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ month: currentMonth, project_id: selectedProjectId });
      const res = await fetch(`/api/construction-logs/calendar?${params}`);
      const json = await res.json();
      if (json.success) {
        setCalendarData(json.data);
      } else {
        setCalendarData(null);
        setMessage(json.error || '日历数据加载失败');
      }
    } catch (err) {
      console.error('Failed to fetch calendar:', err);
      setCalendarData(null);
      setMessage('日历数据加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [currentMonth, selectedProjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCalendar();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchCalendar]);

  const handlePrevMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 2, 1);
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month, 1);
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  };

  const calendarGrid = useMemo(() => {
    if (!calendarData) return [];
    
    const [year, month] = currentMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1).getDay();
    const lastDay = calendarData.lastDay;
    
    const grid: (CalendarDay | null)[] = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      grid.push(null);
    }
    
    // Add cells for each day of the month
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`;
      const calendarDay = calendarData.calendarDays.find(d => d.date === dateStr);
      grid.push(calendarDay || { date: dateStr, day, hasLog: false });
    }
    
    return grid;
  }, [calendarData, currentMonth]);

  const isToday = (date: string) => {
    const today = new Date().toISOString().split('T')[0];
    return date === today;
  };

  const isPast = (date: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    return checkDate < today;
  };

  const selectedProjectName = projects.find((project) => String(project.id) === selectedProjectId)?.name;
  const selectedMonthLabel = `${currentMonth.replace('-', '年')}月`;
  const selectedLogs = selectedDay ? getDayLogs(selectedDay) : [];
  const selectedLogId = selectedDay ? getPrimaryLogId(selectedDay) : undefined;
  const selectedHeadcount = selectedDay ? getDayHeadcount(selectedDay) : 0;
  const selectedRiskCount = selectedDay ? getDayRiskCount(selectedDay) : 0;
  const selectedWeather = selectedDay ? getDayWeather(selectedDay) : null;
  const selectedTemperature = selectedDay ? getDayTemperature(selectedDay) : null;

  return (
    <div className="mx-auto max-w-[1360px] space-y-5 p-3 text-slate-700 sm:p-4 md:p-6">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
            <CalendarDays className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
            日历视图
          </div>
        </div>
        <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">{selectedProjectName || '选择项目查看施工日志日历'}</h2>
            <p className="mt-1 text-sm text-slate-500">{selectedProjectId ? `${selectedMonthLabel}，按日期查看提交、风险和出勤情况` : '先选择项目，再查看当月每一天的记录状态'}</p>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(220px,320px)_auto]">
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setSelectedDay(null);
              }}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">请选择项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="flex items-center rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-slate-950"
                aria-label="上个月"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="h-8 rounded-md px-3 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-blue-700"
              >
                今天
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-slate-950"
                aria-label="下个月"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>
          </div>
        </div>
        </div>
      </section>

      {message && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {message}
        </div>
      )}

      {!selectedProjectId ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-300" strokeWidth={1.6} />
          <p className="mt-3 text-sm font-medium text-slate-700">请选择项目</p>
          <p className="mt-1 text-xs text-slate-500">选择后会展示该项目当月施工日志提交情况。</p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[0, 1, 2, 3, 4].map(item => (
            <div key={item} className="h-[82px] animate-pulse rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="h-3 w-16 rounded bg-slate-100" />
              <div className="mt-3 h-6 w-12 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : calendarData && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <CalendarMetric label="日志总数" value={calendarData.stats.totalLogs} tone="text-blue-700" />
          <CalendarMetric label="已记录天数" value={calendarData.stats.daysWithLogs} tone="text-emerald-700" />
          <CalendarMetric label="未记录天数" value={calendarData.stats.daysWithoutLogs} tone="text-amber-700" />
          <CalendarMetric label="出勤人次" value={calendarData.stats.totalHeadcount} />
          <CalendarMetric label="风险记录" value={calendarData.stats.riskCount} tone="text-rose-700" />
        </div>
      )}

      {selectedProjectId && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-950">{selectedMonthLabel}</h3>
                {loading && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">加载中...</span>}
              </div>
              <div className="flex flex-wrap gap-3">
                <LegendItem className="bg-emerald-100 ring-emerald-200" label="已提交" />
                <LegendItem className="bg-amber-100 ring-amber-200" label="未提交" />
                <LegendItem className="bg-rose-100 ring-rose-200" label="有风险" />
                <LegendItem className="bg-slate-100 ring-slate-200" label="暂无记录" />
              </div>
            </div>

            <div className="overflow-x-auto">
            <div className="min-w-[680px]">
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
              {WEEKDAYS.map((day, i) => (
                <div
                  key={day}
                  className={`py-2 text-center text-xs font-medium ${i === 0 || i === 6 ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {loading ? (
                <div className="col-span-7 grid grid-cols-7 gap-px bg-slate-100 p-px">
                  {Array.from({ length: 35 }).map((_, item) => (
                    <div key={item} className="min-h-[108px] animate-pulse bg-white p-2">
                      <div className="h-5 w-6 rounded bg-slate-100" />
                      <div className="mt-3 h-5 w-16 rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              ) : calendarGrid.map((day, i) => {
                if (!day) {
                  return <div key={`empty-${i}`} className="min-h-[112px] border-b border-r border-slate-100 bg-slate-50/70" />;
                }

                const riskCount = getDayRiskCount(day);
                const headcount = getDayHeadcount(day);
                const logCount = getDayLogCount(day);
                const weather = getDayWeather(day);
                const temperature = getDayTemperature(day);
                const hasRisk = riskCount > 0;
                const hasLate = Boolean(day.isLate);
                const isSelected = selectedDay?.date === day.date;
                let cellClass = 'bg-white hover:bg-slate-50';
                if (day.hasLog) cellClass = hasRisk ? 'bg-rose-50/70 hover:bg-rose-50' : 'bg-emerald-50/60 hover:bg-emerald-50';
                else if (isPast(day.date)) cellClass = 'bg-amber-50/60 hover:bg-amber-50';
                if (isSelected) cellClass += ' shadow-[inset_0_0_0_2px_rgb(37,99,235)]';

                return (
                  <button
                    key={day.date}
                    type="button"
                    className={`min-h-[108px] border-b border-r border-slate-100 p-2 text-left transition ${cellClass}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md text-sm font-semibold tabular-nums ${isToday(day.date) ? 'bg-blue-600 px-1.5 text-white' : 'text-slate-700'}`}>
                        {day.day}
                      </span>
                      {weather && (
                        <span className={`inline-flex items-center gap-0.5 text-xs ${getWeatherColor(weather)}`}>
                          {getWeatherIcon(weather)}
                          {temperature != null && <span>{temperature}°</span>}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {day.hasLog ? (
                        <>
                          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${hasRisk ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {hasRisk ? <AlertTriangle className="h-3 w-3" strokeWidth={1.8} /> : <CheckCircle2 className="h-3 w-3" strokeWidth={1.8} />}
                            {hasRisk ? `${riskCount}条风险` : hasLate ? '补交' : '已提交'}
                          </span>
                          {logCount > 1 && (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <FileText className="h-3 w-3" strokeWidth={1.8} />
                              {logCount}条
                            </span>
                          )}
                          {headcount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <Users className="h-3 w-3" strokeWidth={1.8} />
                              {headcount}人
                            </span>
                          )}
                        </>
                      ) : isPast(day.date) ? (
                        <span className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">未提交</span>
                      ) : (
                        <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">暂无记录</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            </div>
            </div>
          </section>

          <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 xl:self-start">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-950">日期详情</div>
                {selectedDay && (
                  <button
                    type="button"
                    onClick={() => setSelectedDay(null)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
                    aria-label="关闭日期详情"
                  >
                    <X className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                )}
              </div>
            </div>
            <div className="p-4">
            {selectedDay ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">当前日期</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">{selectedDay.date}</h3>
                  </div>
                </div>

                {selectedDay.hasLog && selectedLogId ? (
                  <>
                    <div className="space-y-2 rounded-lg bg-slate-50/80 p-3 text-sm ring-1 ring-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">状态</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${selectedRiskCount > 0 ? 'bg-rose-50 text-rose-700 ring-rose-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-100'}`}>
                          {selectedRiskCount > 0 ? '有风险' : selectedDay.isLate ? '补交' : '已提交'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">日志</span>
                        <span className="font-medium text-slate-900">{getDayLogCount(selectedDay)} 条</span>
                      </div>
                      {selectedHeadcount > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">出勤</span>
                          <span className="font-medium text-slate-900">{selectedHeadcount} 人</span>
                        </div>
                      )}
                      {selectedWeather && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">天气</span>
                          <span className={getWeatherColor(selectedWeather)}>
                            {selectedWeather}
                            {selectedTemperature != null && ` ${selectedTemperature}°C`}
                          </span>
                        </div>
                      )}
                      {selectedRiskCount > 0 && (
                        <div className="flex items-center justify-between text-rose-700">
                          <span>风险</span>
                          <span className="font-medium">{selectedRiskCount} 条</span>
                        </div>
                      )}
                    </div>
                    {selectedLogs.length > 1 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-500">当天日志</p>
                        <div className="space-y-2">
                          {selectedLogs.map((log) => (
                            <Link
                              key={log.id}
                              href={`/construction-logs/${log.id}`}
                              className="block rounded-lg border border-slate-200 bg-white p-3 text-sm transition hover:border-blue-200 hover:bg-blue-50"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-slate-900">{log.userName || '提交人'}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] ${log.hasRisk ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {log.hasRisk ? '风险' : log.submissionStatus === 'late' ? '补交' : log.status || '已提交'}
                                </span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{log.content || '暂无施工内容摘要'}</p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    <Link
                      href={`/construction-logs/${selectedLogId}`}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
                    >
                      <FileText className="h-4 w-4" strokeWidth={1.8} />
                      查看日志详情
                    </Link>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      {isPast(selectedDay.date) ? '这一天还没有施工日志记录。' : '这一天暂时没有记录，可直接创建日志。'}
                    </div>
                    {!isPast(selectedDay.date) && (
                      <Link
                        href={`/construction-logs/new?date=${selectedDay.date}${selectedProjectId ? `&project_id=${selectedProjectId}` : ''}`}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4" strokeWidth={1.8} />
                        去填写日志
                      </Link>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <CalendarDays className="mx-auto h-9 w-9 text-slate-300" strokeWidth={1.6} />
                <p className="mt-3 text-sm font-medium text-slate-700">点击日期查看详情</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">可以快速查看当天是否提交、是否存在风险，以及进入日志详情。</p>
              </div>
            )}
            </div>
          </aside>
        </div>
      )}

    </div>
  );
}
