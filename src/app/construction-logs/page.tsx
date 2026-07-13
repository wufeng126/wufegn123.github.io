'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  Plus,
  Users,
  XCircle,
} from 'lucide-react';

type RiskLevel = 'low' | 'medium' | 'high';
type RiskType = 'change' | 'visa' | 'delay' | 'quality' | 'safety' | 'cost';
type WorkflowStatus = 'pending' | 'ignored' | 'resolved' | 'monthly' | 'visa_created';

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
  last_date: string;
  risk_count?: number;
  high_risk_count?: number;
  cost_risk_count?: number;
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
  monthly: '加入月报说明',
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
  if (status === 'resolved') return 'border-[#10B981] bg-[#E8FFEA] text-[#047857]';
  return 'border-[#C9CDD4] bg-[#F7F8FA] text-[#4E5969]';
}

export default function ConstructionLogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [stats, setStats] = useState<StatItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(false);
  const [tab, setTab] = useState<'stats' | 'logs' | 'risks'>('risks');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [riskStatus, setRiskStatus] = useState<'all' | WorkflowStatus>('all');
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  async function loadBase() {
    setLoading(true);
    try {
      const [logRes, statsRes, projRes] = await Promise.all([
        fetch('/api/construction-logs?pageSize=100'),
        fetch(`/api/construction-logs/stats?month=${month}`),
        fetch('/api/projects'),
      ]);
      const logJson = await logRes.json();
      const statsJson = await statsRes.json();
      const projJson = await projRes.json();
      setLogs(Array.isArray(logJson.data) ? logJson.data : []);
      setStats(Array.isArray(statsJson.data) ? statsJson.data : []);
      setProjects(Array.isArray(projJson.projects) ? projJson.projects : []);
    } catch {
      setMessage('施工日志数据加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function loadRisks() {
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
  }

  useEffect(() => {
    loadBase();
  }, [month]);

  useEffect(() => {
    loadRisks();
  }, [riskStatus]);

  const projectNameById = useMemo(() => {
    const map = new Map<number, string>();
    projects.forEach(project => map.set(Number(project.id), project.name));
    return map;
  }, [projects]);

  const totalLogs = logs.length;
  const totalPeople = stats.length;
  const totalRisks = logs.filter(log => log.risk_level).length;
  const highRisks = logs.filter(log => log.risk_level === 'high').length;
  const pendingRisks = risks.filter(risk => risk.workflow_status === 'pending').length;
  const weekLogs = logs.filter(log => {
    const date = new Date(log.log_date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return date >= weekAgo;
  }).length;

  async function handleRiskAction(logId: number, action: 'ignore' | 'resolve' | 'monthly' | 'create_visa') {
    setActionBusy(logId);
    setMessage('');
    try {
      const noteMap = {
        ignore: '现场复核后确认暂无业务影响',
        resolve: '已完成现场闭环处理',
        monthly: '纳入月度报告风险说明',
        create_visa: '人工确认需要转入签证台账跟进',
      };
      const res = await fetch('/api/construction-logs/risks/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId, action, note: noteMap[action] }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '处理失败');
      setMessage(action === 'create_visa' ? '已生成待办理签证草稿，并同步知识库状态' : '风险状态已更新，并同步到知识库');
      await loadRisks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '处理失败');
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="min-h-full bg-[#F5F6FA] p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1D2129]">施工日志</h1>
            <p className="mt-1 text-sm text-[#86909C]">现场记录、风险确认、知识沉淀集中处理</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/construction-logs/scan" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#165DFF] bg-white px-4 text-sm font-medium text-[#165DFF] hover:bg-[#E8F3FF]">
              <Camera className="h-4 w-4" />拍照识别
            </Link>
            <Link href="/construction-logs/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#165DFF] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#0E49D8]">
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
            <p className="text-2xl font-bold text-[#1D2129]">{weekLogs}</p>
            <p className="text-xs text-[#86909C]">本周提交</p>
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
                <h2 className="font-semibold text-[#1D2129]">风险业务流转</h2>
                <p className="mt-1 text-xs text-[#86909C]">识别只是入口，转签证、入月报、忽略或闭环都需要人工确认</p>
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
                  <div className="grid min-w-[280px] grid-cols-2 gap-2">
                    <button disabled={actionBusy === risk.log_id || risk.workflow_status !== 'pending'} onClick={() => handleRiskAction(risk.log_id, 'create_visa')} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#165DFF] px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                      <FileCheck2 className="h-3.5 w-3.5" />转签证
                    </button>
                    <button disabled={actionBusy === risk.log_id || risk.workflow_status !== 'pending'} onClick={() => handleRiskAction(risk.log_id, 'monthly')} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[#7C3AED] px-3 text-xs font-medium text-[#6D28D9] disabled:cursor-not-allowed disabled:opacity-50">
                      <BookOpenCheck className="h-3.5 w-3.5" />入月报
                    </button>
                    <button disabled={actionBusy === risk.log_id || risk.workflow_status !== 'pending'} onClick={() => handleRiskAction(risk.log_id, 'resolve')} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[#10B981] px-3 text-xs font-medium text-[#047857] disabled:cursor-not-allowed disabled:opacity-50">
                      <CheckCircle2 className="h-3.5 w-3.5" />已处理
                    </button>
                    <button disabled={actionBusy === risk.log_id || risk.workflow_status !== 'pending'} onClick={() => handleRiskAction(risk.log_id, 'ignore')} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[#C9CDD4] px-3 text-xs font-medium text-[#4E5969] disabled:cursor-not-allowed disabled:opacity-50">
                      <XCircle className="h-3.5 w-3.5" />无影响
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'stats' && (
          <div className="overflow-hidden rounded-xl border border-[#E5E6EB] bg-white">
            <div className="flex items-center justify-between border-b border-[#E5E6EB] p-4">
              <h2 className="font-semibold text-[#1D2129]">管理员提交次数统计</h2>
              <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-9 rounded-lg border border-[#E5E6EB] px-3 text-sm outline-none focus:border-[#165DFF]" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F7F8FA] text-[#86909C]">
                    <th className="px-4 py-3 text-left font-medium">排名</th>
                    <th className="px-4 py-3 text-left font-medium">姓名</th>
                    <th className="px-4 py-3 text-center font-medium">提交次数</th>
                    <th className="px-4 py-3 text-center font-medium">风险日志</th>
                    <th className="px-4 py-3 text-center font-medium">最近提交</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="py-8 text-center text-[#86909C]">加载中...</td></tr>
                  ) : stats.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-[#86909C]">本月暂无提交记录</td></tr>
                  ) : stats.map((item, index) => (
                    <tr key={item.user_id} className="border-t border-[#F2F3F5] hover:bg-[#FAFBFF]">
                      <td className="px-4 py-3 text-[#86909C]">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-[#1D2129]">{item.user_name}</td>
                      <td className="px-4 py-3 text-center"><span className="inline-flex h-7 min-w-[32px] items-center justify-center rounded-full bg-[#E8F3FF] px-2 text-sm font-bold text-[#165DFF]">{item.count}</span></td>
                      <td className="px-4 py-3 text-center">{(item.risk_count || 0) > 0 ? <span className="inline-flex h-7 min-w-[32px] items-center justify-center rounded-full bg-[#FFF7E8] px-2 text-sm font-bold text-[#D46B08]">{item.risk_count}</span> : <span className="text-xs text-[#C9CDD4]">无</span>}</td>
                      <td className="px-4 py-3 text-center text-[#86909C]">{item.last_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                <div className="mt-2 flex items-center gap-3 text-xs text-[#86909C]">
                  {log.headcount != null && <span>{log.headcount}人</span>}
                  {highRisks > 0 && log.risk_level === 'high' && <span className="text-[#F53F3F]">高风险需优先确认</span>}
                  {log.issues && <span className="text-[#F53F3F]">异常：{log.issues}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
