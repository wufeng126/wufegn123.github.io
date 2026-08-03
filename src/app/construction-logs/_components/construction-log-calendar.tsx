'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Cloud, CloudRain, CloudSnow, CloudLightning, Sun, CloudFog, Wind, Droplets, AlertTriangle } from 'lucide-react';

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
  if (!condition) return 'text-muted-foreground';
  if (condition.includes('晴')) return 'text-amber-500';
  if (condition.includes('雨') || condition.includes('雪')) return 'text-blue-500';
  if (condition.includes('雷')) return 'text-purple-500';
  return 'text-muted-foreground';
}

type Project = {
  id: number;
  name: string;
};

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

  // 获取项目列表
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects?includePublicLog=1');
        const json = await res.json();
        if (json.success && json.data?.projects) {
          setProjects(json.data.projects.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })));
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
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
    try {
      const params = new URLSearchParams({ month: currentMonth, project_id: selectedProjectId });
      const res = await fetch(`/api/construction-logs/calendar?${params}`);
      const json = await res.json();
      if (json.success) {
        setCalendarData(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch calendar:', err);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, selectedProjectId]);

  useEffect(() => {
    fetchCalendar();
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

  return (
    <div className="space-y-4">
      {/* Project Selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-foreground">选择项目：</label>
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">请选择项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="rounded-md border border-border bg-background p-2 hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handleToday}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
          >
            今天
          </button>
          <button
            onClick={handleNextMonth}
            className="rounded-md border border-border bg-background p-2 hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-lg font-semibold">
            {currentMonth.replace('-', '年')}月
          </span>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-emerald-100 border border-emerald-300"></div>
            <span className="text-muted-foreground">已提交</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-300"></div>
            <span className="text-muted-foreground">待提交</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-red-100 border border-red-300"></div>
            <span className="text-muted-foreground">有风险</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-muted border border-border"></div>
            <span className="text-muted-foreground">无记录</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      {!selectedProjectId ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">请先选择一个项目以查看日历</p>
        </div>
      ) : calendarData && (
        <div className="grid grid-cols-5 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-sm text-muted-foreground">日志总数</div>
            <div className="text-2xl font-bold">{calendarData.stats.totalLogs}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-sm text-muted-foreground">已记录天数</div>
            <div className="text-2xl font-bold text-emerald-600">{calendarData.stats.daysWithLogs}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-sm text-muted-foreground">未记录天数</div>
            <div className="text-2xl font-bold text-red-600">{calendarData.stats.daysWithoutLogs}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-sm text-muted-foreground">出勤人次</div>
            <div className="text-2xl font-bold">{calendarData.stats.totalHeadcount}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-sm text-muted-foreground">风险记录</div>
            <div className="text-2xl font-bold text-amber-600">{calendarData.stats.riskCount}</div>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      {selectedProjectId && (
      <div className="rounded-lg border border-border bg-card">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((day, i) => (
            <div
              key={day}
              className={`py-2 text-center text-sm font-medium ${i === 0 || i === 6 ? 'text-muted-foreground' : ''}`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {loading ? (
            <div className="col-span-7 py-12 text-center text-muted-foreground">加载中...</div>
          ) : calendarGrid.map((day, i) => {
            if (!day) {
              return <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border bg-muted/30"></div>;
            }

            const todayClass = isToday(day.date) ? 'ring-2 ring-primary ring-inset' : '';
            const pastClass = isPast(day.date) && !day.hasLog ? 'bg-red-50/50' : '';
            
            let cellBg = 'bg-background';
            if (day.hasLog) {
              if ((day.riskCount || 0) > 0) {
                cellBg = 'bg-red-50';
              } else {
                cellBg = 'bg-emerald-50';
              }
            } else if (isPast(day.date)) {
              cellBg = 'bg-amber-50';
            }

            return (
              <div
                key={day.date}
                className={`min-h-[100px] border-b border-r border-border p-2 ${cellBg} ${todayClass} ${pastClass} cursor-pointer hover:bg-muted/50 transition-colors`}
                onClick={() => setSelectedDay(day)}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${isToday(day.date) ? 'text-primary' : ''}`}>
                    {day.day}
                  </span>
                  {day.weatherCondition && (
                    <div className={`flex items-center gap-0.5 ${getWeatherColor(day.weatherCondition)}`}>
                      {getWeatherIcon(day.weatherCondition)}
                      {day.weatherTemperature != null && (
                        <span className="text-xs">{day.weatherTemperature}°</span>
                      )}
                    </div>
                  )}
                </div>
                
                {day.hasLog && (
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="rounded bg-emerald-100 px-1 text-emerald-700">已提交</span>
                    </div>
                    {day.headcount != null && day.headcount > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {day.headcount}人
                      </div>
                    )}
                    {(day.riskCount || 0) > 0 && (
                      <div className="flex items-center gap-0.5 text-xs text-red-600">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{day.riskCount}条风险</span>
                      </div>
                    )}
                  </div>
                )}
                
                {!day.hasLog && isPast(day.date) && (
                  <div className="mt-1">
                    <span className="rounded bg-amber-100 px-1 text-xs text-amber-700">未提交</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Selected Day Detail */}
      {selectedDay && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">
              {selectedDay.date} 详情
            </h3>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              关闭
            </button>
          </div>
          
          {selectedDay.hasLog && selectedDay.logId ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">已提交</span>
                {selectedDay.headcount != null && (
                  <span className="text-sm text-muted-foreground">出勤 {selectedDay.headcount} 人</span>
                )}
              </div>
              {selectedDay.weatherCondition && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">天气：</span>
                  <span className={getWeatherColor(selectedDay.weatherCondition)}>
                    {selectedDay.weatherCondition}
                    {selectedDay.weatherTemperature != null && ` ${selectedDay.weatherTemperature}°C`}
                  </span>
                </div>
              )}
              {(selectedDay.riskCount || 0) > 0 && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>发现 {selectedDay.riskCount} 条风险记录</span>
                </div>
              )}
              <a
                href={`/construction-logs/${selectedDay.logId}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                查看详情 →
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                {isPast(selectedDay.date) ? '未提交' : '暂无记录'}
              </span>
              {!isPast(selectedDay.date) && (
                <a
                  href={`/construction-logs/new?date=${selectedDay.date}${selectedProjectId ? `&project_id=${selectedProjectId}` : ''}`}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  去填写 →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      )}
    </div>
  );
}
