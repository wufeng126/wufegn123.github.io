'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, FileText, Users, CalendarDays, BarChart3, ClipboardList, ArrowRight } from 'lucide-react';

type LogItem = { id: number; project_id: number; user_name: string; log_date: string; location: string; content: string; headcount: number; issues: string; created_at: string };
type StatItem = { user_id: number; user_name: string; count: number; last_date: string };
type Project = { id: number; name: string };

export default function ConstructionLogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [stats, setStats] = useState<StatItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'logs' | 'stats'>('stats');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const projectMap = useMemo(() => {
    const m: Record<number, string> = {};
    projects.forEach(p => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [logRes, statsRes, projRes] = await Promise.all([
          fetch('/api/construction-logs?pageSize=100'),
          fetch(`/api/construction-logs/stats?month=${month}`),
          fetch('/api/projects'),
        ]);
        const logJson = await logRes.json();
        const statsJson = await statsRes.json();
        const projJson = await projRes.json();
        if (!mounted) return;
        setLogs(Array.isArray(logJson.data) ? logJson.data : []);
        setStats(Array.isArray(statsJson.data) ? statsJson.data : []);
        setProjects(Array.isArray(projJson.projects) ? projJson.projects : []);
      } catch {} finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, [month]);

  const totalLogs = logs.length;
  const totalPeople = stats.length;
  const weekLogs = logs.filter(l => {
    const d = new Date(l.log_date);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  }).length;

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-[#1D2129]">📋 施工日志</h1>
            <p className="mt-1 text-sm text-[#86909C]">现场人员每日记录，自动沉淀成本相关知识点</p>
          </div>
          <Link href="/construction-logs/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm font-medium text-white shadow-md hover:bg-[#0E49D8]">
            <Plus className="h-4 w-4" />写日志
          </Link>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-[#E5E6EB] p-4 text-center">
            <FileText className="h-5 w-5 text-[#165DFF] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1D2129]">{totalLogs}</p>
            <p className="text-xs text-[#86909C]">总日志数</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E5E6EB] p-4 text-center">
            <Users className="h-5 w-5 text-[#7C3AED] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1D2129]">{totalPeople}</p>
            <p className="text-xs text-[#86909C]">提交人员</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E5E6EB] p-4 text-center">
            <CalendarDays className="h-5 w-5 text-[#10B981] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1D2129]">{weekLogs}</p>
            <p className="text-xs text-[#86909C]">本周提交</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#F2F3F5] rounded-xl p-1 mb-5">
          <button onClick={() => setTab('stats')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${tab === 'stats' ? 'bg-white text-[#165DFF] shadow-sm' : 'text-[#4E5969]'}`}>
            <BarChart3 className="h-4 w-4 inline mr-1" />提交统计
          </button>
          <button onClick={() => setTab('logs')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${tab === 'logs' ? 'bg-white text-[#165DFF] shadow-sm' : 'text-[#4E5969]'}`}>
            <ClipboardList className="h-4 w-4 inline mr-1" />日志记录
          </button>
        </div>

        {/* Stats Tab */}
        {tab === 'stats' && (
          <div className="bg-white rounded-xl border border-[#E5E6EB] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[#E5E6EB]">
              <h2 className="font-semibold text-[#1D2129]">📊 管理员提交次数统计</h2>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-9 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F7F8FA] text-[#86909C]">
                    <th className="text-left py-3 px-4 font-medium">排名</th>
                    <th className="text-left py-3 px-4 font-medium">姓名</th>
                    <th className="text-center py-3 px-4 font-medium">提交次数</th>
                    <th className="text-center py-3 px-4 font-medium">最近提交</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} className="text-center py-8 text-[#86909C]">加载中...</td></tr>
                  ) : stats.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-[#86909C]">本月暂无提交记录</td></tr>
                  ) : stats.map((s, i) => (
                    <tr key={s.user_id} className="border-t border-[#F2F3F5] hover:bg-[#FAFBFF]">
                      <td className="py-3 px-4 text-[#86909C]">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#1D2129]">{s.user_name}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[32px] h-7 rounded-full text-sm font-bold ${s.count >= 20 ? 'bg-[#E8FFEA] text-[#00A870]' : s.count >= 10 ? 'bg-[#E8F3FF] text-[#165DFF]' : 'bg-[#F2F3F5] text-[#4E5969]'}`}>
                          {s.count}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-[#86909C]">{s.last_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Logs Tab */}
        {tab === 'logs' && (
          <div className="space-y-3">
            {loading ? (
              <div className="bg-white rounded-xl border border-[#E5E6EB] p-8 text-center text-sm text-[#86909C]">加载中...</div>
            ) : logs.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E5E6EB] p-8 text-center text-sm text-[#86909C]">暂无日志记录</div>
            ) : logs.slice(0, 50).map(log => (
              <div key={log.id} className="bg-white rounded-xl border border-[#E5E6EB] p-4 hover:border-[#165DFF]/30 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-[#86909C] mb-1">
                      <span>{log.log_date}</span>
                      <span className="w-px h-3 bg-[#E5E6EB]" />
                      <span>{log.user_name}</span>
                      {log.location && <><span className="w-px h-3 bg-[#E5E6EB]" /><span>📍 {log.location}</span></>}
                    </div>
                    <p className="text-sm text-[#1D2129]">{log.content}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-[#86909C]">
                      {log.headcount != null && <span>👥 {log.headcount}人</span>}
                      {log.issues && <span className="text-[#F53F3F]">⚠️ {log.issues}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
