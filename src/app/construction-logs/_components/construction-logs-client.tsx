'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
  Settings2,
} from 'lucide-react';
import { usePermission } from '@/contexts/permission-context';

type RiskLevel = 'low' | 'medium' | 'high';
type RiskType = 'change' | 'visa' | 'delay' | 'quality' | 'safety' | 'cost';
type WorkflowStatus = 'pending' | 'confirmed';

type LogItem = {
  id: number;
  project_id: number;
  user_id?: number;
  user_name: string;
  log_date: string;
  location: string;
  content: string;
  headcount: number;
  issues: string;
  created_at: string;
  updated_at?: string | null;
  submitted_at?: string | null;
  status?: 'submitted' | 'pending' | 'cancelled' | null;
  scheduled_submit_at?: string | null;
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
type LogViewStatus = 'all' | 'risk' | 'late' | 'pending';
type RiskLevelFilter = 'all' | RiskLevel;

type SubmitterUser = {
  id: number;
  name: string;
  username?: string;
  role?: string;
};

const LOG_PAGE_SIZE = 200;

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
  confirmed: '已确认',
};

function riskBadgeClass(level?: RiskLevel | null) {
  if (level === 'high') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (level === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function statusClass(status: WorkflowStatus) {
  if (status === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'confirmed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function riskLevelWeight(level?: RiskLevel | null) {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  if (level === 'low') return 1;
  return 0;
}

function logStatusLabel(log: LogItem) {
  if (log.status === 'pending') return '待提交';
  if (log.status === 'cancelled') return '已取消';
  return log.submission_status === 'late' ? '逾期补交' : '正常提交';
}

function logStatusClass(log: LogItem) {
  if (log.status === 'pending') return 'bg-blue-50 text-blue-700 ring-1 ring-blue-100';
  if (log.status === 'cancelled') return 'bg-slate-100 text-slate-500 ring-1 ring-slate-200';
  return log.submission_status === 'late' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100';
}

function formatDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function normalizeLogDate(value?: string | null) {
  if (!value) return '未填写日期';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function getLogDate(log: LogItem) {
  return normalizeLogDate(log.log_date || log.created_at);
}

function getLogSortTime(log: LogItem) {
  const value = log.submitted_at || log.updated_at || log.created_at || log.scheduled_submit_at || log.log_date;
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatLogDateLabel(value: string) {
  if (value === '未填写日期') return value;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
}

function groupLogsByDate(items: LogItem[]) {
  const map = new Map<string, LogItem[]>();
  items.forEach(log => {
    const dateKey = getLogDate(log);
    const list = map.get(dateKey) || [];
    list.push(log);
    map.set(dateKey, list);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dateLogs]) => {
      const sortedLogs = [...dateLogs].sort((a, b) => getLogSortTime(b) - getLogSortTime(a));
      return {
        date,
        logs: sortedLogs,
        projectCount: new Set(sortedLogs.map(log => Number(log.project_id))).size,
        submitterCount: new Set(sortedLogs.map(log => log.user_name || String(log.user_id || ''))).size,
        riskCount: sortedLogs.filter(log => Boolean(log.risk_level)).length,
        lateCount: sortedLogs.filter(log => log.submission_status === 'late').length,
        pendingCount: sortedLogs.filter(log => log.status === 'pending').length,
      };
    });
}

function getProjectBreakdown(logs: LogItem[], projectNameById: Map<number, string>) {
  const counts = new Map<string, number>();
  logs.forEach(log => {
    const name = projectNameById.get(Number(log.project_id)) || `项目${log.project_id}`;
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function includesKeyword(log: LogItem, projectName: string, keyword: string) {
  if (!keyword) return true;
  const target = [
    projectName,
    log.user_name,
    log.location,
    log.content,
    log.issues,
    log.risk_summary,
  ].filter(Boolean).join(' ').toLowerCase();
  return target.includes(keyword.toLowerCase());
}

function includesRiskKeyword(risk: RiskItem, keyword: string) {
  if (!keyword) return true;
  const target = [
    risk.project_name,
    risk.user_name,
    risk.location,
    risk.content,
    risk.issues,
    risk.risk_summary,
    risk.risk_recommendation,
    ...(risk.risk_types || []).map(type => RISK_TYPE_LABELS[type] || type),
  ].filter(Boolean).join(' ').toLowerCase();
  return target.includes(keyword.toLowerCase());
}

function MetricItem({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: string;
}) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${tone}`} strokeWidth={1.8} />
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</p>
    </div>
  );
}
function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-slate-500 hover:bg-white hover:text-slate-950'
      } focus:outline-none focus:ring-2 focus:ring-blue-100`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
      {children}
    </button>
  );
}

export default function ConstructionLogsClient() {
  const { user, isSuperAdmin } = usePermission();
  const canManageSubmitters = useMemo(() => {
    const roleText = `${user?.role || ''} ${user?.name || ''}`.toLowerCase();
    return isSuperAdmin || roleText.includes('budget') || roleText.includes('cost') || roleText.includes('estimate') || roleText.includes('预算') || roleText.includes('造价') || roleText.includes('经营');
  }, [isSuperAdmin, user?.name, user?.role]);
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const statusParam = searchParams.get('status');
  const mineOnly = searchParams.get('mine') === '1';
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);
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
  const [tab, setTab] = useState<'stats' | 'logs' | 'risks' | 'submitters'>(
    tabParam === 'stats' || tabParam === 'logs' || tabParam === 'risks' || tabParam === 'submitters' ? tabParam : 'logs',
  );
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [statsProjectId, setStatsProjectId] = useState('all');
  const [logProjectId, setLogProjectId] = useState(searchParams.get('projectId') || 'all');
  const [logDateFrom, setLogDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [logDateTo, setLogDateTo] = useState(searchParams.get('dateTo') || '');
  const [logViewStatus, setLogViewStatus] = useState<LogViewStatus>('all');
  const [logKeyword, setLogKeyword] = useState('');
  const [riskProjectId, setRiskProjectId] = useState('all');
  const [riskLevelFilter, setRiskLevelFilter] = useState<RiskLevelFilter>('all');
  const [riskKeyword, setRiskKeyword] = useState('');
  const [riskStatus, setRiskStatus] = useState<'all' | WorkflowStatus>(
    statusParam === 'pending' || statusParam === 'confirmed'
      ? statusParam
      : 'all',
  );
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null);
  const [cancelingLogId, setCancelingLogId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [submitterProjectId, setSubmitterProjectId] = useState('');
  const [submitterUsers, setSubmitterUsers] = useState<SubmitterUser[]>([]);
  const [submitterIds, setSubmitterIds] = useState<number[]>([]);
  const [submitterConfigured, setSubmitterConfigured] = useState(false);
  const [submitterLoading, setSubmitterLoading] = useState(false);
  const [submitterSaving, setSubmitterSaving] = useState(false);

  const buildLogUserFilter = useCallback(async function buildLogUserFilter() {
    if (!mineOnly) return '';
    const meRes = await fetch('/api/auth/me');
    const meJson = await meRes.json();
    const currentUserId = meJson?.user?.id || meJson?.data?.id;
    return currentUserId ? `&userId=${currentUserId}` : '';
  }, [mineOnly]);

  const loadBase = useCallback(async function loadBase() {
    setLoading(true);
    try {
      const userFilter = await buildLogUserFilter();

      const [logRes, statsRes, projRes] = await Promise.all([
        fetch(`/api/construction-logs?page=1&pageSize=${LOG_PAGE_SIZE}${userFilter}`),
        fetch(`/api/construction-logs/stats?month=${month}${statsProjectId !== 'all' ? `&projectId=${statsProjectId}` : ''}`),
        fetch('/api/projects?includePublicLog=1'),
      ]);
      const logJson = await logRes.json();
      const statsJson = await statsRes.json();
      const projJson = await projRes.json();
      if (!logRes.ok || logJson.success === false) throw new Error(logJson.error || '施工日志加载失败');
      if (!statsRes.ok || statsJson.success === false) throw new Error(statsJson.error || '施工日志统计加载失败');
      if (!projRes.ok || projJson.success === false) throw new Error(projJson.error || '项目列表加载失败');
      const nextLogs = Array.isArray(logJson.data) ? logJson.data : [];
      setLogs(nextLogs);
      setLogPage(1);
      setLogTotal(Number(logJson.meta?.pagination?.total || nextLogs.length || 0));
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
      const nextProjects = Array.isArray(projJson.projects) ? projJson.projects : [];
      setProjects(nextProjects);
      setSubmitterProjectId(current => current || (nextProjects[0] ? String(nextProjects[0].id) : ''));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '施工日志数据加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [buildLogUserFilter, month, statsProjectId]);

  const loadMoreLogs = useCallback(async function loadMoreLogs() {
    if (loadingMoreLogs) return;
    setLoadingMoreLogs(true);
    setMessage('');
    try {
      const nextPage = logPage + 1;
      const userFilter = await buildLogUserFilter();
      const res = await fetch(`/api/construction-logs?page=${nextPage}&pageSize=${LOG_PAGE_SIZE}${userFilter}`);
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '更多日志加载失败');
      const nextLogs = Array.isArray(json.data) ? json.data : [];
      setLogs(current => {
        const existingIds = new Set(current.map(log => Number(log.id)));
        const merged = [...current];
        nextLogs.forEach((log: LogItem) => {
          if (!existingIds.has(Number(log.id))) merged.push(log);
        });
        return merged;
      });
      setLogPage(nextPage);
      setLogTotal(Number(json.meta?.pagination?.total || logTotal || nextLogs.length || 0));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更多日志加载失败');
    } finally {
      setLoadingMoreLogs(false);
    }
  }, [buildLogUserFilter, loadingMoreLogs, logPage, logTotal]);

  const loadSubmitters = useCallback(async function loadSubmitters(projectId: string) {
    if (!projectId || !canManageSubmitters) return;
    setSubmitterLoading(true);
    setMessage('');
    try {
      const res = await fetch(`/api/construction-logs/submitters?projectId=${projectId}`);
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '提交人员配置加载失败');
      const data = json.data || {};
      setSubmitterUsers(Array.isArray(data.users) ? data.users : []);
      setSubmitterIds(Array.isArray(data.submitter_user_ids) ? data.submitter_user_ids.map(Number) : []);
      setSubmitterConfigured(Boolean(data.configured));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交人员配置加载失败');
      setSubmitterUsers([]);
      setSubmitterIds([]);
      setSubmitterConfigured(false);
    } finally {
      setSubmitterLoading(false);
    }
  }, [canManageSubmitters]);

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

  // 通知直达收拢：从通知/待办进入风险池时，自动标记对应通知已读并滚动定位到目标风险项
  useEffect(() => {
    if (tab !== 'risks' || risks.length === 0) return;

    const notificationId = searchParams.get('notification_id');
    if (notificationId) {
      import('@/lib/notification-client').then(({ markNotificationRead, emitNotificationsUpdated }) => {
        void markNotificationRead(notificationId).then((marked) => {
          if (marked) emitNotificationsUpdated();
        });
      });
    }

    const targetRiskId = searchParams.get('risk_id') || searchParams.get('log_id');
    if (!targetRiskId) return;

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`risk-item-${targetRiskId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('ring-2', 'ring-blue-300', 'ring-offset-2');
      window.setTimeout(() => {
        target.classList.remove('ring-2', 'ring-blue-300', 'ring-offset-2');
      }, 4500);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [risks.length, searchParams, tab]);

  useEffect(() => {
    if (tab !== 'submitters' || !submitterProjectId) return;
    const timeoutId = window.setTimeout(() => {
      void loadSubmitters(submitterProjectId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSubmitters, submitterProjectId, tab]);

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
  const filteredLogs = useMemo(() => logs.filter(log => {
    const date = getLogDate(log);
    const projectName = projectNameById.get(Number(log.project_id)) || `项目${log.project_id}`;
    if (logProjectId !== 'all' && String(log.project_id) !== logProjectId) return false;
    if (logDateFrom && date < logDateFrom) return false;
    if (logDateTo && date > logDateTo) return false;
    if (logViewStatus === 'risk' && !log.risk_level) return false;
    if (logViewStatus === 'late' && log.submission_status !== 'late') return false;
    if (logViewStatus === 'pending' && log.status !== 'pending') return false;
    return includesKeyword(log, projectName, logKeyword.trim());
  }), [logDateFrom, logDateTo, logKeyword, logProjectId, logViewStatus, logs, projectNameById]);
  const hasActiveLogFilter = logProjectId !== 'all' || Boolean(logDateFrom) || Boolean(logDateTo) || logViewStatus !== 'all' || Boolean(logKeyword.trim());
  const hasMoreLogs = logTotal > logs.length;
  const logDateGroups = useMemo(() => groupLogsByDate(filteredLogs), [filteredLogs]);
  const visibleLogDateGroups = useMemo(() => logDateGroups.map(group => ({
    ...group,
    projectBreakdown: getProjectBreakdown(group.logs, projectNameById),
  })), [logDateGroups, projectNameById]);
  const filteredRisks = useMemo(() => risks
    .filter(risk => {
      if (riskProjectId !== 'all' && String(risk.project_id) !== riskProjectId) return false;
      if (riskLevelFilter !== 'all' && risk.risk_level !== riskLevelFilter) return false;
      return includesRiskKeyword(risk, riskKeyword.trim());
    })
    .sort((a, b) => {
      if (a.workflow_status !== b.workflow_status) return a.workflow_status === 'pending' ? -1 : 1;
      const levelDiff = riskLevelWeight(b.risk_level) - riskLevelWeight(a.risk_level);
      if (levelDiff !== 0) return levelDiff;
      return getLogSortTime(b) - getLogSortTime(a);
    }), [riskKeyword, riskLevelFilter, riskProjectId, risks]);
  const hasActiveRiskFilter = riskProjectId !== 'all' || riskLevelFilter !== 'all' || Boolean(riskKeyword.trim());
  const highRiskReminders = risks.filter(risk => risk.risk_level === 'high').length;

  async function handleRiskAction(logId: number) {
    setActionBusy(logId);
    setMessage('');
    try {
      const res = await fetch('/api/construction-logs/risks/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId,
          action: 'acknowledge',
          note: '风险提醒已人工确认',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '标记失败');
      setMessage('已确认该风险提醒');
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

  async function handleCancelSchedule(logId: number) {
    if (!window.confirm('确认取消这条预约提交吗？取消后不会自动提交。')) return;
    setCancelingLogId(logId);
    setMessage('');
    try {
      const res = await fetch(`/api/construction-logs/${logId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_schedule' }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '取消预约失败');
      setMessage('预约提交已取消');
      await loadBase();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '取消预约失败');
    } finally {
      setCancelingLogId(null);
    }
  }

  function toggleSubmitter(userId: number) {
    setSubmitterIds(current => (
      current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId]
    ));
  }

  async function handleSaveSubmitters() {
    if (!submitterProjectId) return;
    setSubmitterSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/construction-logs/submitters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: Number(submitterProjectId), user_ids: submitterIds }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || '提交人员配置保存失败');
      setSubmitterConfigured(submitterIds.length > 0);
      setMessage(submitterIds.length > 0 ? '提交人员配置已保存' : '已恢复默认：所有项目人员都可以提交');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交人员配置保存失败');
    } finally {
      setSubmitterSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-transparent p-3 text-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto max-w-[1280px] space-y-6">
        <header className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span>施工管理 / 现场记录</span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">施工日志</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">现场记录、风险提醒、提交统计集中查看，最新记录和待确认风险优先展示。</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link href="/construction-logs/scan" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 text-sm font-medium text-blue-700 shadow-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <Camera className="h-4 w-4" strokeWidth={1.8} />拍照识别
            </Link>
            <Link href="/construction-logs/new" className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:col-span-1">
              <Plus className="h-4 w-4" strokeWidth={1.8} />写日志
            </Link>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricItem label="总日志数" value={totalLogs} icon={FileText} tone="text-blue-700" />
          <MetricItem label="提交人员" value={totalPeople} icon={Users} tone="text-violet-700" />
          <MetricItem label="有日志项目" value={submittedProjects} icon={ClipboardList} tone="text-emerald-700" />
          <MetricItem label="风险日志" value={totalRisks} icon={AlertTriangle} tone="text-amber-700" />
          <MetricItem label="待确认风险" value={pendingRisks} icon={FileCheck2} tone="text-rose-700" />
        </section>

        {message && (
          <div className="rounded-lg border border-blue-100 bg-white px-4 py-3 text-sm text-slate-600">
            {message}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <div className="flex min-w-max gap-1">
          <TabButton active={tab === 'risks'} onClick={() => setTab('risks')} icon={AlertTriangle}>风险池</TabButton>
          <TabButton active={tab === 'stats'} onClick={() => setTab('stats')} icon={BarChart3}>提交统计</TabButton>
          <TabButton active={tab === 'logs'} onClick={() => setTab('logs')} icon={ClipboardList}>日志记录</TabButton>
          {canManageSubmitters && (
            <TabButton active={tab === 'submitters'} onClick={() => setTab('submitters')} icon={Settings2}>提交人员</TabButton>
          )}
          </div>
        </div>

        {tab === 'risks' && (
          <div className="space-y-3">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-950">风险提醒</h2>
                  <p className="mt-1 text-xs text-slate-500">当前显示 {filteredRisks.length}/{risks.length} 条，待确认风险会优先排在前面</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap">
                  <span className="rounded-full bg-amber-50 px-3 py-1.5 font-medium text-amber-700 ring-1 ring-amber-100">待确认 {pendingRisks}</span>
                  <span className="rounded-full bg-rose-50 px-3 py-1.5 font-medium text-rose-700 ring-1 ring-rose-100">高风险 {highRiskReminders}</span>
                </div>
              </div>
              <div className="grid gap-3 p-4 lg:grid-cols-[1.2fr_1fr_1fr_1.6fr_auto]">
                <select
                  value={riskProjectId}
                  onChange={event => setRiskProjectId(event.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">全部项目</option>
                  {projects.map(project => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
                </select>
                <select value={riskStatus} onChange={event => setRiskStatus(event.target.value as 'all' | WorkflowStatus)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                  <option value="all">全部状态</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select
                  value={riskLevelFilter}
                  onChange={event => setRiskLevelFilter(event.target.value as RiskLevelFilter)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">全部等级</option>
                  <option value="high">高风险</option>
                  <option value="medium">中风险</option>
                  <option value="low">低风险</option>
                </select>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={riskKeyword}
                    onChange={event => setRiskKeyword(event.target.value)}
                    placeholder="搜索项目、部位、内容、建议"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                {hasActiveRiskFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setRiskProjectId('all');
                      setRiskLevelFilter('all');
                      setRiskKeyword('');
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    重置
                  </button>
                )}
              </div>
            </section>

            {riskLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">加载中...</div>
            ) : risks.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">暂无符合条件的风险记录</div>
            ) : filteredRisks.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">没有符合筛选条件的风险提醒</div>
            ) : filteredRisks.map(risk => {
              const isPending = risk.workflow_status === 'pending';
              return (
              <div id={`risk-item-${risk.log_id}`} key={risk.log_id} className={`rounded-xl border border-l-4 bg-white p-4 shadow-sm transition ${isPending ? 'border-amber-200 border-l-amber-400 hover:border-amber-300 hover:bg-amber-50/20' : 'border-slate-200 border-l-slate-300 hover:border-blue-200 hover:border-l-blue-300'}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className={`rounded-full border px-2 py-0.5 font-medium ${statusClass(risk.workflow_status)}`}>
                        {risk.workflow_status_label || STATUS_LABELS[risk.workflow_status]}
                      </span>
                      {risk.risk_level && (
                        <span className={`rounded-full border px-2 py-0.5 font-medium ${riskBadgeClass(risk.risk_level)}`}>
                          {RISK_LEVEL_LABELS[risk.risk_level]}风险
                        </span>
                      )}
                      <span>{risk.project_name}</span>
                      <span className="h-3 w-px bg-slate-200" />
                      <span>{risk.log_date}</span>
                      <span>{risk.location || '未填部位'}</span>
                    </div>
                    <p className="text-base font-semibold text-slate-950">{risk.risk_summary || '施工日志风险提醒'}</p>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{risk.content}</p>
                    {risk.issues && <p className="mt-2 text-sm text-rose-700">异常：{risk.issues}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {risk.risk_types.map(type => (
                        <span key={type} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {RISK_TYPE_LABELS[type] || type}
                        </span>
                      ))}
                    </div>
                    {risk.risk_recommendation && (
                      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 ring-1 ring-slate-200">
                        跟进建议：{risk.risk_recommendation}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 md:min-w-[150px]">
                    <Link href={`/construction-logs/${risk.log_id}`} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:border-blue-200 hover:text-blue-700">
                      <Eye className="h-3.5 w-3.5" />
                      查看详情
                    </Link>
                    <button disabled={actionBusy === risk.log_id || !isPending} onClick={() => handleRiskAction(risk.log_id)} className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${isPending ? 'border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                      {isPending ? <FileCheck2 className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {risk.workflow_status === 'confirmed' ? '已确认' : '确认提醒'}
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {tab === 'stats' && (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200">
                    <BarChart3 className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">施工日志完整率统计</h2>
                    <p className="mt-0.5 text-xs text-slate-500">按项目和人员查看当月提交情况</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <select value={statsProjectId} onChange={event => setStatsProjectId(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-auto">
                    <option value="all">全部项目</option>
                    {projects.map(project => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
                  </select>
                  <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-auto" />
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <h3 className="text-sm font-semibold text-slate-950">按项目统计</h3>
                </div>
                <span className="text-xs text-slate-500">{projectStats.length} 个项目</span>
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
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
                      <tr><td colSpan={6} className="py-8 text-center text-slate-500">加载中...</td></tr>
                    ) : projectStats.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-slate-500">本月暂无项目提交记录</td></tr>
                    ) : projectStats.map(item => (
                      <tr key={item.project_id} className="border-t border-slate-100 transition hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-950">{item.project_name || projectNameById.get(Number(item.project_id)) || `项目${item.project_id}`}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex h-7 min-w-[48px] items-center justify-center rounded-full px-2 text-sm font-bold ${item.completeness_rate >= 90 ? 'bg-emerald-50 text-emerald-700' : item.completeness_rate >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                            {item.completeness_rate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{item.submitted_days}/{item.expected_days} 天</td>
                        <td className="px-4 py-3 text-center font-semibold text-blue-700">{item.count}</td>
                        <td className="px-4 py-3 text-center">{(item.risk_count || 0) > 0 ? <span className="text-amber-700">{item.risk_count}</span> : <span className="text-xs text-slate-300">无</span>}</td>
                        <td className="px-4 py-3 text-center text-slate-500">{item.last_date || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-slate-100 md:hidden">
                {loading ? (
                  <div className="p-6 text-center text-sm text-slate-500">加载中...</div>
                ) : projectStats.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">本月暂无项目提交记录</div>
                ) : projectStats.map(item => (
                  <article key={item.project_id} className="space-y-3 border-l-4 border-l-emerald-300 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="min-w-0 font-medium text-slate-950">{item.project_name || projectNameById.get(Number(item.project_id)) || `项目${item.project_id}`}</h4>
                      <span className={`inline-flex h-7 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold ${item.completeness_rate >= 90 ? 'bg-emerald-50 text-emerald-700' : item.completeness_rate >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                        {item.completeness_rate}%
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div><dt className="text-xs text-slate-500">提交天数</dt><dd className="mt-0.5 text-slate-600">{item.submitted_days}/{item.expected_days} 天</dd></div>
                      <div><dt className="text-xs text-slate-500">提交次数</dt><dd className="mt-0.5 font-semibold text-blue-700">{item.count}</dd></div>
                      <div><dt className="text-xs text-slate-500">风险日志</dt><dd className="mt-0.5 text-amber-700">{item.risk_count || 0}</dd></div>
                      <div><dt className="text-xs text-slate-500">最近提交</dt><dd className="mt-0.5 text-slate-600">{item.last_date || '-'}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <h3 className="text-sm font-semibold text-slate-950">按人员统计</h3>
                </div>
                <span className="text-xs text-slate-500">{stats.length} 人</span>
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
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
                      <tr><td colSpan={7} className="py-8 text-center text-slate-500">加载中...</td></tr>
                    ) : stats.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-slate-500">本月暂无提交记录</td></tr>
                    ) : stats.map((item, index) => (
                      <tr key={item.user_id} className="border-t border-slate-100 transition hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-950">{item.user_name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex h-7 min-w-[48px] items-center justify-center rounded-full px-2 text-sm font-bold ${(item.completeness_rate || 0) >= 90 ? 'bg-emerald-50 text-emerald-700' : (item.completeness_rate || 0) >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                            {item.completeness_rate || 0}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{item.submitted_days || 0}/{item.expected_days || 0} 天</td>
                        <td className="px-4 py-3 text-center"><span className="inline-flex h-7 min-w-[32px] items-center justify-center rounded-full bg-blue-50 px-2 text-sm font-bold text-blue-700">{item.count}</span></td>
                        <td className="px-4 py-3 text-center">{(item.risk_count || 0) > 0 ? <span className="inline-flex h-7 min-w-[32px] items-center justify-center rounded-full bg-amber-50 px-2 text-sm font-bold text-amber-700">{item.risk_count}</span> : <span className="text-xs text-slate-300">无</span>}</td>
                        <td className="px-4 py-3 text-center text-slate-500">{item.last_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-slate-100 md:hidden">
                {loading ? (
                  <div className="p-6 text-center text-sm text-slate-500">加载中...</div>
                ) : stats.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">本月暂无提交记录</div>
                ) : stats.map((item, index) => (
                  <article key={item.user_id} className="space-y-3 border-l-4 border-l-blue-300 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0"><span className="mr-2 text-xs text-slate-500">#{index + 1}</span><span className="font-medium text-slate-950">{item.user_name}</span></div>
                      <span className={`inline-flex h-7 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold ${(item.completeness_rate || 0) >= 90 ? 'bg-emerald-50 text-emerald-700' : (item.completeness_rate || 0) >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                        {item.completeness_rate || 0}%
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div><dt className="text-xs text-slate-500">提交天数</dt><dd className="mt-0.5 text-slate-600">{item.submitted_days || 0}/{item.expected_days || 0} 天</dd></div>
                      <div><dt className="text-xs text-slate-500">提交次数</dt><dd className="mt-0.5 font-semibold text-blue-700">{item.count}</dd></div>
                      <div><dt className="text-xs text-slate-500">风险日志</dt><dd className="mt-0.5 text-amber-700">{item.risk_count || 0}</dd></div>
                      <div><dt className="text-xs text-slate-500">最近提交</dt><dd className="mt-0.5 text-slate-600">{item.last_date || '-'}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-3">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200">
                    <Filter className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">日志筛选</h2>
                    <p className="mt-0.5 text-xs text-slate-500">当前显示 {filteredLogs.length}/{logs.length} 条，最新日期在上</p>
                  </div>
                </div>
                {hasActiveLogFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogProjectId('all');
                      setLogDateFrom('');
                      setLogDateTo('');
                      setLogViewStatus('all');
                      setLogKeyword('');
                    }}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
                    重置筛选
                  </button>
                )}
              </div>
              <div className="grid gap-3 p-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1.4fr]">
                <select
                  value={logProjectId}
                  onChange={event => setLogProjectId(event.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">全部项目</option>
                  {projects.map(project => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
                </select>
                <input
                  type="date"
                  value={logDateFrom}
                  onChange={event => setLogDateFrom(event.target.value)}
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  aria-label="开始日期"
                />
                <input
                  type="date"
                  value={logDateTo}
                  onChange={event => setLogDateTo(event.target.value)}
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  aria-label="结束日期"
                />
                <select
                  value={logViewStatus}
                  onChange={event => setLogViewStatus(event.target.value as LogViewStatus)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">全部状态</option>
                  <option value="risk">有风险</option>
                  <option value="late">逾期补交</option>
                  <option value="pending">待提交</option>
                </select>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={logKeyword}
                    onChange={event => setLogKeyword(event.target.value)}
                    placeholder="搜索项目、人员、部位、内容"
                    className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>
            </section>
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">加载中...</div>
            ) : logs.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">暂无日志记录</div>
            ) : filteredLogs.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">没有符合筛选条件的日志</div>
            ) : (
              <>
                {visibleLogDateGroups.map((group, index) => (
              <details key={group.date} open={index === 0} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <CalendarDays className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-slate-950">{formatLogDateLabel(group.date)}</h2>
                        {index === 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">最新</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        共 {group.logs.length} 篇，涉及 {group.projectCount} 个项目，{group.submitterCount} 人提交
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {group.projectBreakdown.slice(0, 4).map(item => (
                          <span key={item.name} className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
                            {item.name} {item.count}篇
                          </span>
                        ))}
                        {group.projectBreakdown.length > 4 && (
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                            +{group.projectBreakdown.length - 4} 项目
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {group.pendingCount > 0 && <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">待提交 {group.pendingCount}</span>}
                    {group.lateCount > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">逾期 {group.lateCount}</span>}
                    {group.riskCount > 0 && <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">风险 {group.riskCount}</span>}
                    <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" strokeWidth={1.8} />
                  </div>
                </summary>

                <div className="space-y-3 border-t border-slate-100 bg-slate-50/80 p-3 sm:p-4">
                  {group.logs.map(log => (
                    <div key={log.id} className={`rounded-lg border border-l-4 bg-white p-4 transition hover:border-blue-200 ${log.risk_level ? 'border-l-rose-300' : log.status === 'pending' ? 'border-l-blue-300' : 'border-l-slate-200'}`}>
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{projectNameById.get(Number(log.project_id)) || `项目${log.project_id}`}</span>
                        <span className="h-3 w-px bg-slate-200" />
                        <span>{formatDateTime(log.submitted_at || log.updated_at || log.created_at) || log.log_date}</span>
                        <span>{log.user_name}</span>
                        <span className={`rounded-full px-2 py-0.5 ${logStatusClass(log)}`}>
                          {logStatusLabel(log)}
                        </span>
                        {log.status === 'pending' && log.scheduled_submit_at && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                            <CalendarClock className="h-3 w-3" strokeWidth={1.8} />
                            预约 {formatDateTime(log.scheduled_submit_at)}
                          </span>
                        )}
                        {log.location && <span>{log.location}</span>}
                      </div>
                      <p className="text-sm leading-6 text-slate-800">{log.content}</p>
                      {log.risk_level && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${riskBadgeClass(log.risk_level)}`}>
                            <AlertTriangle className="h-3 w-3" strokeWidth={1.8} />
                            {RISK_LEVEL_LABELS[log.risk_level]}风险
                          </span>
                          {(log.risk_types || []).slice(0, 4).map(type => (
                            <span key={type} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{RISK_TYPE_LABELS[type] || type}</span>
                          ))}
                          {log.risk_summary && <span className="text-xs text-slate-500">{log.risk_summary}</span>}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        {log.headcount != null && <span>{log.headcount}人</span>}
                        {highRisks > 0 && log.risk_level === 'high' && <span className="text-rose-700">高风险需优先确认</span>}
                        {log.issues && <span className="text-rose-700">异常：{log.issues}</span>}
                        <div className="flex w-full shrink-0 items-center justify-end gap-2 md:ml-auto md:w-auto">
                          <Link href={`/construction-logs/${log.id}`} className="inline-flex h-8 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 px-3 font-medium text-blue-700 hover:border-blue-200">查看详情</Link>
                          {log.status === 'pending' && Number(log.user_id) === Number(user?.id) && (
                            <button
                              type="button"
                              disabled={cancelingLogId === log.id}
                              onClick={() => handleCancelSchedule(log.id)}
                              className="inline-flex items-center gap-1 font-medium text-amber-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.8} />
                              {cancelingLogId === log.id ? '取消中...' : '取消预约'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={deletingLogId === log.id}
                            onClick={() => handleDeleteLog(log.id)}
                            className="inline-flex items-center gap-1 font-medium text-rose-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                            {deletingLogId === log.id ? '删除中' : '删除'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
                ))}
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                  <span>已显示 {logs.length}/{logTotal || logs.length} 条施工日志</span>
                  {hasMoreLogs && (
                    <button
                      type="button"
                      onClick={() => void loadMoreLogs()}
                      disabled={loadingMoreLogs}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-blue-200 bg-white px-4 text-sm font-medium text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingMoreLogs ? '加载中...' : '加载更多历史日志'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'submitters' && canManageSubmitters && (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200">
                    <Settings2 className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">施工日志提交人员设置</h2>
                    <p className="mt-0.5 text-xs text-slate-500">选择项目后维护可提交人员</p>
                  </div>
                </div>
                <select
                  value={submitterProjectId}
                  onChange={event => setSubmitterProjectId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-72"
                >
                  <option value="">请选择项目</option>
                  {projects.map(project => <option key={project.id} value={String(project.id)}>{project.name}</option>)}
                </select>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-950">
                    {submitterConfigured ? `已配置 ${submitterIds.length} 人` : '默认全员可提交'}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">清空勾选并保存，即恢复默认全员可提交。</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setSubmitterIds(submitterUsers.map(item => item.id))}
                    disabled={submitterLoading || submitterUsers.length === 0}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:border-blue-200 hover:text-blue-700 disabled:opacity-50"
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmitterIds([])}
                    disabled={submitterLoading}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:border-blue-200 hover:text-blue-700 disabled:opacity-50"
                  >
                    恢复默认
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSubmitters}
                    disabled={submitterSaving || submitterLoading || !submitterProjectId}
                    className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    {submitterSaving ? '保存中...' : '保存配置'}
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-5">
                {submitterLoading ? (
                  <div className="rounded-lg bg-slate-50 p-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">正在加载人员...</div>
                ) : submitterUsers.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 p-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">当前项目暂无可配置人员</div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {submitterUsers.map(item => {
                      const checked = submitterIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleSubmitter(item.id)}
                          className={`flex items-center gap-3 rounded-lg border border-l-4 p-3 text-left transition ${
                            checked ? 'border-blue-200 border-l-blue-500 bg-blue-50 ring-1 ring-blue-100' : 'border-slate-200 border-l-slate-200 bg-white hover:border-blue-200 hover:border-l-blue-300'
                          }`}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                            checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {checked ? '✓' : ''}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-950">{item.name || item.username || `用户${item.id}`}</span>
                            <span className="mt-1 block truncate text-xs text-slate-500">{item.role || '项目人员'}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
