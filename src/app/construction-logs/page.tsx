'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Camera,
  ClipboardList,
  FileCheck2,
  FileText,
  Plus,
  Trash2,
  UserRoundCheck,
  Users,
} from 'lucide-react';

type RiskLevel = 'low' | 'medium' | 'high';
type RiskType = 'change' | 'visa' | 'delay' | 'quality' | 'safety' | 'cost';
type WorkflowStatus = 'pending' | 'ignored' | 'resolved' | 'monthly' | 'monthly_included' | 'visa_created';

type LogItem = {
  id: number;
  project_id: number;
  user_name: string;
  log_date: string;
  location: string;
  content: string;
  headcount: number;
  issues: string;
  created_at: string;
  submission_status?: 'normal' | 'late' | null;
  risk_type?: RiskType | null;
  risk_types?: RiskType[];
  risk_level?: RiskLevel | null;
  risk_summary?: string;
  risk_recommendation?: string;
};

type RiskItem = LogItem & {
  log_id: number;
  project_name: string;
  risk_types: RiskType[];
  risk_level: RiskLevel | null;
  risk_matched_keywords: string[];
  workflow_status: WorkflowStatus;
  workflow_status_label: string;
  knowledge_doc_id?: number | null;
};

type StatItem = {
  user_id: number;
  user_name: string;
  count: number;
  submitted_days?: number;
  expected_days?: number;
  completeness_rate?: number;
  last_date: string;
  risk_count?: number;
  high_risk_count?: number;
  cost_risk_count?: number;
};

type ProjectStatItem = {
  project_id: number;
  project_name?: string;
  count: number;
  submitted_days: number;
  expected_days: number;
  completeness_rate: number;
  last_date: string;
  risk_count?: number;
  high_risk_count?: number;
};

type StatsSummary = {
  expected_days: number;
  total_logs: number;
  total_people: number;
  total_projects: number;
  submitted_projects: number;
  risk_total: number;
  high_risk_total: number;
};

type Project = { id: number; name: string };

const RISK_TYPE_LABELS: Record<RiskType, string> = {
  change: '变更',
  visa: '签证',
  delay: '工期',
  quality: '质量',
  safety: '安全',
  cost: '成本',
};

const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  pending: '待确认',
  ignored: '确认无影响',
  resolved: '已处理',
  monthly: '待入月报',
  monthly_included: '已进入月报',
  visa_created: '已转签证',
};

function riskBadgeClass(level?: RiskLevel | null) {
  if (level === 'high') return 'border-[#F53F3F] bg-[#FFF1F0] text-[#C62828]';
  if (level === 'medium') return 'border-[#F59E0B] bg-[#FFF7E8] text-[#B45309]';
  return 'border-[#165DFF] bg-[#E8F3FF] text-[#165DFF]';
}

function statusClass(status: WorkflowStatus) {
  if (status === 'pending') return 'border-[#F59E0B] bg-[#FFF7E8] text-[#B45309]';
  if (status === 'visa_created') return 'border-[#165DFF] bg-[#E8F3FF] text-[#165DFF]';
  if (status === 'monthly') return 'border-[#7C3AED] bg-[#F3E8FF] text-[#6D28D9]';
  if (status === 'monthly_included') return 'border-[#10B981] bg-[#E8FFEA] text-[#047857]';
  if (status === 'resolved') return 'border-[#10B981] bg-[#E8FFEA] text-[#047857]';
  return 'border-[#C9CDD4] bg-[#F7F8FA] text-[#4E5969]';
}

export default function ConstructionLogsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const statusParam = searchParams.get('status');
  const mineOnly = searchParams.get('mine') === '1';
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [stats, setStats] = useState<StatItem[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStatItem[]>([]);
  const [statsSummary, setStatsSummary] = useState<StatsSummary>({
    expected_days: 0,
    total_logs: 0,
    total_people: 0,
    total_projects: 0,
    submitted_projects: 0,
    risk_total: 0,
    high_risk_total: 0,
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(false);
  const [tab, setTab] = useState<'stats' | 'logs' | 'risks'>(
    tabParam === 'stats' || tabParam === 'logs' || tabParam === 'risks' ? tabParam : 'risks',
  );
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [statsProjectId, setStatsProjectId] = useState('all');
  const [riskStatus, setRiskStatus] = useState<'all' | WorkflowStatus>(
    statusParam === 'pending' || statusParam === 'ignored' || statusParam === 'resolved' || statusParam === 'monthly' || statusParam === 'monthly_included' || statusParam === 'visa_created'
      ? statusParam
      : 'all',
  );
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const loadBase = useCallback(async function loadBase() {
    setLoading(true);
    try {
      let userFilter = '';
      if (mineOnly) {
        const meRes = await fetch('/api/auth/me');
        const meJson = await meRes.json();
        const currentUserId = meJson?.user?.id || meJson?.data?.id;
        if (currentUserId) userFilter = `&userId=${currentUserId}`;
      }

      const [logRes, statsRes, projRes] = await Promise.all([
        fetch(`/api/construction-logs?pageSize=100${userFilter}`),
        fetch(`/api/construction-logs/stats?month=${month}${statsProjectId !== 'all' ? `&projectId=${statsProjectId}` : ''}`),
        fetch('/api/projects'),
      ]);
      const logJson = await logRes.json();
      const statsJson = await statsRes.json();
      const projJson = await projRes.json();
      if (!logRes.ok || logJson.success === false) throw new Error(logJson.error || '施工日志加载失败');
      if (!statsRes.ok || statsJson.success === false) throw new Error(statsJson.error || '施工日志统计加载失败');
      if (!projRes.ok || projJson.success === false) throw new Error(projJson.error || '项目列表加载失败');
      setLogs(Array.isArray(logJson.data) ? logJson.data : []);
      setStats(Array.isArray(statsJson.data) ? statsJson.data : []);
      const nextProjectStats = (
        Array.isArray(statsJson.project_stats)
          ? statsJson.project_stats
          : Array.isArray(statsJson.meta?.project_stats)
            ? statsJson.meta.project_stats
            : []
      ) as ProjectStatItem[];
      setProjectStats(nextProjectStats);
      setStatsSummary({
        expected_days: Number(statsJson.expected_days || statsJson.meta?.expected_days || 0),
        total_logs: Number(statsJson.log_count || nextProjectStats.reduce((sum, item) => sum + Number(item.count || 0), 0)),
        total_people: Array.isArray(statsJson.data) ? statsJson.data.length : 0,
        total_projects: Number(statsJson.project_count || nextProjectStats.length),
        submitted_projects: Number(statsJson.submitted_project_count || nextProjectStats.filter(item => Number(item.count || 0) > 0).length),
        risk_total: Number(statsJson.risk_summary?.total || statsJson.meta?.risk_summary?.total || 0),
        high_risk_total: Number(statsJson.risk_summary?.by_level?.high || statsJson.meta?.risk_summary?.by_level?.high || 0),
      });
      setProjects(Array.isArray(projJson.projects) ? projJson.projects : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '施工日志数据加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [mineOnly, month, statsProjectId]);

  const loadRisks = useCallback(async function loadRisks() {
    setRiskLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '200' });
      if (riskStatus !== 'all') params.set('status', riskStatus);
      const res = await fetch(`/api/construction-logs/risks?${params.toString()}`);
      const json = await res.json();
      setRisks(Array.isArray(json.data) ? json.data : []);
    } catch {
      setMessage('风险池加载失败，请稍后重试');
    } finally {
      setRiskLoading(false);
    }
  }, [riskStatus]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadBase();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadBase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRisks();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadRisks]);

  const projectNameById = useMemo(() => {
    const map = new Map<number, string>();
    projects.forEach(project => map.set(Number(project.id), project.name));
    return map;
  }, [projects]);

  const totalLogs = statsSummary.total_logs;
  const totalPeople = statsSummary.total_people;
  const totalRisks = statsSummary.risk_total;
  const highRisks = statsSummary.high_risk_total;
  const pendingRisks = risks.filter(risk => risk.workflow_status === 'pending').length;
  const submittedProjects = statsSummary.submitted_projects;

  async function handleRiskAction(logId: number) {
    setActionBusy(logId);
    setMessage('');
    try {
      const res = await fetch('/api/construction-logs/risks/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId, action: 'monthly', note: '纳入月度报告风险提醒候选' }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '标记失败');
      setMessage('已标记为待入月报，月报保存后会自动回写为已进入月报');
      await loadRisks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '标记失败');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDeleteLog(logId: number) {
    if (!window.confirm('确认删除这条施工日志吗？删除后相关风险提醒也会同步清理。')) return;
    setDeletingLogId(logId);
    setMessage('');
    try {
      const res = await fetch(`/api/construction-logs/${logId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '施工日志删除失败');
      setMessage('施工日志已删除');
      await Promise.all([loadBase(), loadRisks()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '施工日志删除失败');
    } finally {
      setDeletingLogId(null);
    }
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] p-3 sm:p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1D2129] sm:text-2xl">施工日志</h1>
            <p className="mt-1 text-sm text-[#86909C]">现场记录、风险确认、知识沉淀集中处理</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link href="/construction-attendance" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#E5E6EB] bg-white px-4 text-sm font-medium text-[#4E5969] hover:border-[#165DFF]/40 hover:text-[#165DFF]">
              <UserRoundCheck className="h-4 w-4" />人员出勤
            </Link>
            <Link href="/construction-logs/scan" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#165DFF] bg-white px-4 text-sm font-medium text-[#165DFF] hover:bg-[#E8F3FF]">
              <Camera className="h-4 w-4" />拍照识别
            </Link>
            <Link href="/construction-logs/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#0E49D8]">
              <Plus className="h-4 w-4" />写日志
            </Link>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4 text-center">
            <FileText className="mx-auto mb-1 h-5 w-5 text-[#165DFF]" />
            <p className="text-2xl font-bold text-[#1D2129]">{totalLogs}</p>
            <p className="text-xs text-[#86909C]">总日志数</p>
          </div>
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4 text-center">
            <Users className="mx-auto mb-1 h-5 w-5 text-[#7C3AED]" />
            <p className="text-2xl font-bold text-[#1D2129]">{totalPeople}</p>
            <p className="text-xs text-[#86909C]">提交人员</p>
          </div>
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4 text-center">
            <ClipboardList className="mx-auto mb-1 h-5 w-5 text-[#10B981]" />
            <p className="text-2xl font-bold text-[#1D2129]">{submittedProjects}</p>
            <p className="text-xs text-[#86909C]">有日志项目</p>
          </div>
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4 text-center">
            <AlertTriangle className="mx-auto mb-1 h-5 w-5 text-[#F59E0B]" />
            <p className="text-2xl font-bold text-[#1D2129]">{totalRisks}</p>
            <p className="text-xs text-[#86909C]">风险日志</p>
          </div>
          <div className="rounded-xl border border-[#E5E6EB] bg-white p-4 text-center">
            <FileCheck2 className="mx-auto mb-1 h-5 w-5 text-[#F53F3F]" />
            <p className="text-2xl font-bold text-[#1D2129]">{pendingRisks}</p>
            <p className="text-xs text-[#86909C]">待确认风险</p>
          </div>
        </div>

        {message && (
          <div className="mb-4 rounded-lg border border-[#E5E6EB] bg-white px-4 py-3 text-sm text-[#4E5969]">
            {message}
          </div>
        )}

        <div className="mb-5 flex gap-1 rounded-xl bg-[#F2F3F5] p-1">
          <button onClick={() => setTab('risks')} className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${tab === 'risks' ? 'bg-white text-[#165DFF] shadow-sm' : 'text-[#4E5969]'}`}>
            <AlertTriangle className="mr-1 inline h-4 w-4" />风险池
          </button>
          <button onClick={() => setTab('stats')} className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${tab === 'stats' ? 'bg-white text-[#165DFF] shadow-sm' : 'text-[#4E5969]'}`}>
            <BarChart3 className="mr-1 inline h-4 w-4" />提交统计
          </button>
          <button onClick={() => setTab('logs')} className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${tab === 'logs' ? 'bg-white text-[#165DFF] shadow-sm' : 'text-[#4E5969]'}`}>
            <ClipboardList className="mr-1 inline h-4 w-4" />日志记录
          </button>
        </div>

        {tab === 'risks' && (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-xl border border-[#E5E6EB] bg-white p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-[#1D2129]">风险提醒</h2>
                <p className="mt-1 text-xs text-[#86909C]">风险池只做提醒和月报候选，不在这里实际处理业务</p>
              </div>
              <select value={riskStatus} onChange={event => setRiskStatus(event.target.value as 'all' | WorkflowStatus)} className="h-9 rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm outline-none focus:border-[#165DFF]">
                <option value="all">全部状态</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            {riskLoading ? (
              <div className="rounded-xl border border-[#E5E6EB] bg-white p-8 text-center text-sm text-[#86909C]">加载中...</div>
            ) : risks.length === 0 ? (
              <div className="rounded-xl border border-[#E5E6EB] bg-white p-8 text-center text-sm text-[#86909C]">暂无符合条件的风险记录</div>
            ) : risks.map(risk => (
              <div key={risk.log_id} className="rounded-xl border border-[#E5E6EB] bg-white p-4 transition hover:border-[#165DFF]/30">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#86909C]">
                      <span>{risk.project_name}</span>
                      <span className="h-3 w-px bg-[#E5E6EB]" />
                      <span>{risk.log_date}</span>
                      <span>{risk.location || '未填部位'}</span>
                      <span className={`rounded-full border px-2 py-0.5 font-medium ${statusClass(risk.workflow_status)}`}>
                        {risk.workflow_status_label || STATUS_LABELS[risk.workflow_status]}
                      </span>
                      {risk.risk_level && (
                        <span className={`rounded-full border px-2 py-0.5 font-medium ${riskBadgeClass(risk.risk_level)}`}>
                          {RISK_LEVEL_LABELS[risk.risk_level]}风险
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[#1D2129]">{risk.risk_summary}</p>
                    <p className="mt-2 text-sm text-[#4E5969]">{risk.content}</p>
                    {risk.issues && <p className="mt-2 text-sm text-[#C62828]">异常：{risk.issues}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {risk.risk_types.map(type => (
                        <span key={type} className="rounded-full bg-[#F2F3F5] px-2 py-0.5 text-xs text-[#4E5969]">
                          {RISK_TYPE_LABELS[type] || type}
                        </span>
                      ))}
                    </div>
                    {risk.risk_recommendation && (
                      <p className="mt-3 rounded-lg bg-[#FAFBFF] px-3 py-2 text-xs text-[#4E5969]">
                        跟进建议：{risk.risk_recommendation}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 md:min-w-[150px]">
                    <Link href={`/construction-logs/${risk.log_id}`} className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-[#E5E6EB] px-3 text-xs font-medium text-[#4E5969] hover:border-[#165DFF]/40 hover:text-[#165DFF]">
                      查看详情
                    </Link>
                    <button disabled={actionBusy === risk.log_id || risk.workflow_status !== 'pending'} onClick={() => handleRiskAction(risk.log_id)} className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-[#7C3AED] px-3 text-xs font-medium text-[#6D28D9] disabled:cursor-not-allowed disabled:opacity-50">
                      <BookOpenCheck className="h-3.5 w-3.5" />
                      {risk.workflow_status === 'monthly_included' ? '已进月报' : risk.workflow_status === 'monthly' ? '待入月报' : '纳入月报'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'stats' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#E5E6EB] bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-semibold text-[#1D2129]">施工日志完整率统计</h2>
                  <p className="mt-1 text-xs text-[#86909C]">项目按当月是否有日志统计，人员按当月提交天数和提交次数统计</p>
                </div>
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <select value={statsProjectId} onChange={event => setStatsProjectId(event.target.value)} className="h-9 w-full rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm outline-none focus:border-[#165DFF] sm:w-auto">
                    <option value="all">全部项目</option>
                    {projects.map(project => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
                  </select>
                  <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-9 w-full rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF] sm:w-auto" />
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#E5E6EB] bg-white">
              <div className="border-b border-[#E5E6EB] p-4">
                <h3 className="font-semibold text-[#1D2129]">按项目统计</h3>
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F7F8FA] text-[#86909C]">
                      <th className="px-4 py-3 text-left font-medium">项目</th>
                      <th className="px-4 py-3 text-center font-medium">完整率</th>
                      <th className="px-4 py-3 text-center font-medium">提交天数</th>
                      <th className="px-4 py-3 text-center font-medium">提交次数</th>
                      <th className="px-4 py-3 text-center font-medium">风险日志</th>
                      <th className="px-4 py-3 text-center font-medium">最近提交</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="py-8 text-center text-[#86909C]">加载中...</td></tr>
                    ) : projectStats.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-[#86909C]">本月暂无项目提交记录</td></tr>
                    ) : projectStats.map(item => (
                      <tr key={item.project_id} className="border-t border-[#F2F3F5] hover:bg-[#FAFBFF]">
                        <td className="px-4 py-3 font-medium text-[#1D2129]">{item.project_name || projectNameById.get(Number(item.project_id)) || `项目${item.project_id}`}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex h-7 min-w-[48px] items-center justify-center rounded-full px-2 text-sm font-bold ${item.completeness_rate >= 90 ? 'bg-[#E8FFEA] text-[#047857]' : item.completeness_rate >= 60 ? 'bg-[#FFF7E8] text-[#D46B08]' : 'bg-[#FFF1F0] text-[#C62828]'}`}>
                            {item.completeness_rate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-[#4E5969]">{item.submitted_days}/{item.expected_days} 天</td>
                        <td className="px-4 py-3 text-center font-semibold text-[#165DFF]">{item.count}</td>
                        <td className="px-4 py-3 text-center">{(item.risk_count || 0) > 0 ? <span className="text-[#D46B08]">{item.risk_count}</span> : <span className="text-xs text-[#C9CDD4]">无</span>}</td>
                        <td className="px-4 py-3 text-center text-[#86909C]">{item.last_date || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-[#F2F3F5] md:hidden">
                {loading ? (
                  <div className="p-6 text-center text-sm text-[#86909C]">加载中...</div>
                ) : projectStats.length === 0 ? (
                  <div className="p-6 text-center text-sm text-[#86909C]">本月暂无项目提交记录</div>
                ) : projectStats.map(item => (
                  <article key={item.project_id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="min-w-0 font-medium text-[#1D2129]">{item.project_name || projectNameById.get(Number(item.project_id)) || `项目${item.project_id}`}</h4>
                      <span className={`inline-flex h-7 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold ${item.completeness_rate >= 90 ? 'bg-[#E8FFEA] text-[#047857]' : item.completeness_rate >= 60 ? 'bg-[#FFF7E8] text-[#D46B08]' : 'bg-[#FFF1F0] text-[#C62828]'}`}>
                        {item.completeness_rate}%
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div><dt className="text-xs text-[#86909C]">提交天数</dt><dd className="mt-0.5 text-[#4E5969]">{item.submitted_days}/{item.expected_days} 天</dd></div>
                      <div><dt className="text-xs text-[#86909C]">提交次数</dt><dd className="mt-0.5 font-semibold text-[#165DFF]">{item.count}</dd></div>
                      <div><dt className="text-xs text-[#86909C]">风险日志</dt><dd className="mt-0.5 text-[#D46B08]">{item.risk_count || 0}</dd></div>
                      <div><dt className="text-xs text-[#86909C]">最近提交</dt><dd className="mt-0.5 text-[#4E5969]">{item.last_date || '-'}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#E5E6EB] bg-white">
              <div className="border-b border-[#E5E6EB] p-4">
                <h3 className="font-semibold text-[#1D2129]">按人员统计</h3>
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F7F8FA] text-[#86909C]">
                      <th className="px-4 py-3 text-left font-medium">排名</th>
                      <th className="px-4 py-3 text-left font-medium">姓名</th>
                      <th className="px-4 py-3 text-center font-medium">完整率</th>
                      <th className="px-4 py-3 text-center font-medium">提交天数</th>
                      <th className="px-4 py-3 text-center font-medium">提交次数</th>
                      <th className="px-4 py-3 text-center font-medium">风险日志</th>
                      <th className="px-4 py-3 text-center font-medium">最近提交</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="py-8 text-center text-[#86909C]">加载中...</td></tr>
                    ) : stats.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-[#86909C]">本月暂无提交记录</td></tr>
                    ) : stats.map((item, index) => (
                      <tr key={item.user_id} className="border-t border-[#F2F3F5] hover:bg-[#FAFBFF]">
                        <td className="px-4 py-3 text-[#86909C]">{index + 1}</td>
                        <td className="px-4 py-3 font-medium text-[#1D2129]">{item.user_name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex h-7 min-w-[48px] items-center justify-center rounded-full px-2 text-sm font-bold ${(item.completeness_rate || 0) >= 90 ? 'bg-[#E8FFEA] text-[#047857]' : (item.completeness_rate || 0) >= 60 ? 'bg-[#FFF7E8] text-[#D46B08]' : 'bg-[#FFF1F0] text-[#C62828]'}`}>
                            {item.completeness_rate || 0}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-[#4E5969]">{item.submitted_days || 0}/{item.expected_days || 0} 天</td>
                        <td className="px-4 py-3 text-center"><span className="inline-flex h-7 min-w-[32px] items-center justify-center rounded-full bg-[#E8F3FF] px-2 text-sm font-bold text-[#165DFF]">{item.count}</span></td>
                        <td className="px-4 py-3 text-center">{(item.risk_count || 0) > 0 ? <span className="inline-flex h-7 min-w-[32px] items-center justify-center rounded-full bg-[#FFF7E8] px-2 text-sm font-bold text-[#D46B08]">{item.risk_count}</span> : <span className="text-xs text-[#C9CDD4]">无</span>}</td>
                        <td className="px-4 py-3 text-center text-[#86909C]">{item.last_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-[#F2F3F5] md:hidden">
                {loading ? (
                  <div className="p-6 text-center text-sm text-[#86909C]">加载中...</div>
                ) : stats.length === 0 ? (
                  <div className="p-6 text-center text-sm text-[#86909C]">本月暂无提交记录</div>
                ) : stats.map((item, index) => (
                  <article key={item.user_id} className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0"><span className="mr-2 text-xs text-[#86909C]">#{index + 1}</span><span className="font-medium text-[#1D2129]">{item.user_name}</span></div>
                      <span className={`inline-flex h-7 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold ${(item.completeness_rate || 0) >= 90 ? 'bg-[#E8FFEA] text-[#047857]' : (item.completeness_rate || 0) >= 60 ? 'bg-[#FFF7E8] text-[#D46B08]' : 'bg-[#FFF1F0] text-[#C62828]'}`}>
                        {item.completeness_rate || 0}%
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div><dt className="text-xs text-[#86909C]">提交天数</dt><dd className="mt-0.5 text-[#4E5969]">{item.submitted_days || 0}/{item.expected_days || 0} 天</dd></div>
                      <div><dt className="text-xs text-[#86909C]">提交次数</dt><dd className="mt-0.5 font-semibold text-[#165DFF]">{item.count}</dd></div>
                      <div><dt className="text-xs text-[#86909C]">风险日志</dt><dd className="mt-0.5 text-[#D46B08]">{item.risk_count || 0}</dd></div>
                      <div><dt className="text-xs text-[#86909C]">最近提交</dt><dd className="mt-0.5 text-[#4E5969]">{item.last_date || '-'}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-3">
            {loading ? (
              <div className="rounded-xl border border-[#E5E6EB] bg-white p-8 text-center text-sm text-[#86909C]">加载中...</div>
            ) : logs.length === 0 ? (
              <div className="rounded-xl border border-[#E5E6EB] bg-white p-8 text-center text-sm text-[#86909C]">暂无日志记录</div>
            ) : logs.slice(0, 80).map(log => (
              <div key={log.id} className="rounded-xl border border-[#E5E6EB] bg-white p-4 transition hover:border-[#165DFF]/30">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[#86909C]">
                  <span>{projectNameById.get(Number(log.project_id)) || `项目${log.project_id}`}</span>
                  <span className="h-3 w-px bg-[#E5E6EB]" />
                  <span>{log.log_date}</span>
                  <span>{log.user_name}</span>
                  <span className={`rounded-full px-2 py-0.5 ${
                    log.submission_status === 'late'
                      ? 'bg-[#FFF7E8] text-[#D46B08]'
                      : 'bg-[#E8FFEA] text-[#047857]'
                  }`}>
                    {log.submission_status === 'late' ? '逾期补交' : '正常提交'}
                  </span>
                  {log.location && <span>{log.location}</span>}
                </div>
                <p className="text-sm text-[#1D2129]">{log.content}</p>
                {log.risk_level && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${riskBadgeClass(log.risk_level)}`}>
                      <AlertTriangle className="h-3 w-3" />
                      {RISK_LEVEL_LABELS[log.risk_level]}风险
                    </span>
                    {(log.risk_types || []).slice(0, 4).map(type => (
                      <span key={type} className="rounded-full bg-[#F2F3F5] px-2 py-0.5 text-xs text-[#4E5969]">{RISK_TYPE_LABELS[type] || type}</span>
                    ))}
                    {log.risk_summary && <span className="text-xs text-[#86909C]">{log.risk_summary}</span>}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#F2F3F5] pt-3 text-xs text-[#86909C]">
                  {log.headcount != null && <span>{log.headcount}人</span>}
                  {highRisks > 0 && log.risk_level === 'high' && <span className="text-[#F53F3F]">高风险需优先确认</span>}
                  {log.issues && <span className="text-[#F53F3F]">异常：{log.issues}</span>}
                  <div className="flex w-full shrink-0 items-center justify-end gap-3 md:ml-auto md:w-auto">
                    <Link href={`/construction-logs/${log.id}`} className="font-medium text-[#165DFF] hover:underline">查看详情</Link>
                    <button
                      type="button"
                      disabled={deletingLogId === log.id}
                      onClick={() => handleDeleteLog(log.id)}
                      className="inline-flex items-center gap-1 font-medium text-[#F53F3F] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingLogId === log.id ? '删除中' : '删除'}
                    </button>
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
