'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, FileText, Loader2, RefreshCw, Save, ClipboardList, Plus, Send } from 'lucide-react';

type Project = {
  id: string | number;
  name: string;
};

type MonthlyBrief = {
  contractAmount: number;
  monthlyReportAmount: number;
  cumulativeReportAmount: number;
  monthlySalary: number;
  cumulativeSalary: number;
  monthlyManagementFee: number;
  monthlyProfit: number;
  profitRate: number;
  clientPaymentRate: number;
};

type MonthlyData = {
  projectId: number;
  projectName: string;
  yearMonth: string;
  brief: MonthlyBrief;
  monthly?: Record<string, number>;
  cumulative?: Record<string, number>;
};

type MonthlyRiskReminder = {
  log_id: number;
  project_name?: string;
  log_date?: string;
  location?: string;
  content?: string;
  issues?: string;
  risk_level?: 'low' | 'medium' | 'high' | null;
  risk_types?: string[];
  risk_summary?: string;
  risk_recommendation?: string;
  workflow_status?: string;
};

type ConstructionLogBrief = {
  log_date?: string;
  user_name?: string;
  location?: string;
  content?: string;
  issues?: string;
};

type AppUser = {
  id: number;
  username?: string | null;
  name?: string | null;
  dingtalk_name?: string | null;
  dingtalkName?: string | null;
  role?: string | null;
  is_disabled?: boolean | null;
  roles?: Array<{ name?: string | null; code?: string | null; level?: number | null }>;
};

const planOptions = ['报量', '结算', '签证', '单价谈判', '其他'];

const riskLevelLabels: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

const riskTypeLabels: Record<string, string> = {
  change: '变更',
  visa: '签证',
  delay: '工期',
  quality: '质量',
  safety: '安全',
  cost: '成本',
};

function getUserDisplayName(user: AppUser) {
  return user.dingtalk_name || user.dingtalkName || user.name || user.username || `用户${user.id}`;
}

function userHasRole(user: AppUser, role: 'project_manager' | 'boss') {
  if (user.role === role) return true;
  return (user.roles || []).some(item => {
    const code = String(item.code || '').toLowerCase();
    const name = String(item.name || '');
    if (role === 'project_manager') return code === 'project_manager' || name.includes('项目经理');
    return code === 'boss' || name.includes('老板') || name.includes('总经理');
  });
}

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatAmount(value?: number | null) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} 元`;
}

function formatPercent(value?: number | null) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function buildKnowledgeContent(params: {
  data: MonthlyData;
  costException: string;
  upstreamDownstreamChange: string;
  nextMonthAttention: string;
  experienceNote: string;
  selectedPlans: string[];
  otherPlan: string;
  selectedRiskReminders: MonthlyRiskReminder[];
}) {
  const {
    data,
    costException,
    upstreamDownstreamChange,
    nextMonthAttention,
    experienceNote,
    selectedPlans,
    otherPlan,
    selectedRiskReminders,
  } = params;
  const brief = data.brief;
  const plans = selectedPlans
    .map(plan => (plan === '其他' ? otherPlan.trim() : plan))
    .filter(Boolean);
  const riskReminderText = selectedRiskReminders.length > 0
    ? selectedRiskReminders.map(risk => {
      const level = risk.risk_level ? `${riskLevelLabels[risk.risk_level] || risk.risk_level}风险` : '风险';
      const types = (risk.risk_types || []).map(type => riskTypeLabels[type] || type).join('、') || '未分类';
      const location = risk.location ? `，部位：${risk.location}` : '';
      const issues = risk.issues ? `，异常：${risk.issues}` : '';
      const recommendation = risk.risk_recommendation ? `，建议：${risk.risk_recommendation}` : '';
      return `- ${risk.log_date || '未填日期'} ${level}（${types}）${location}：${risk.risk_summary || risk.content || '无摘要'}${issues}${recommendation}`;
    }).join('\n')
    : '- 暂无待入月报风险提醒';

  return `# ${data.projectName} ${data.yearMonth} 月度分析

## 本月数据简报

| 指标 | 数值 |
| --- | ---: |
| 合同额 | ${formatAmount(brief.contractAmount)} |
| 本月报量 | ${formatAmount(brief.monthlyReportAmount)} |
| 累计报量 | ${formatAmount(brief.cumulativeReportAmount)} |
| 本月工资 | ${formatAmount(brief.monthlySalary)} |
| 累计工资 | ${formatAmount(brief.cumulativeSalary)} |
| 本月管理费 | ${formatAmount(brief.monthlyManagementFee)} |
| 本月利润 | ${formatAmount(brief.monthlyProfit)} |
| 利润率 | ${formatPercent(brief.profitRate)} |
| 甲方回款率 | ${formatPercent(brief.clientPaymentRate)} |

## 本月成本有什么异常？

${costException.trim() || '暂无记录'}

## 对上对下有什么变化？

${upstreamDownstreamChange.trim() || '暂无记录'}

## 下月需要注意什么？

${nextMonthAttention.trim() || '暂无记录'}

## 本月风险提醒

${riskReminderText}

## 下月计划

${plans.length > 0 ? plans.map(plan => `- ${plan}`).join('\n') : '- 暂无计划'}

${experienceNote.trim() ? `## 经验随笔\n\n${experienceNote.trim()}\n` : ''}`;
}

export default function NewMonthlyKnowledgePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportFromUrl = searchParams.get('from');
  const reportMonth = searchParams.get('month');
  const reportProject = searchParams.get('project');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(reportProject && reportProject !== 'all' ? reportProject : '');
  const [yearMonth, setYearMonth] = useState(reportFromUrl === 'report' && reportMonth ? reportMonth : getCurrentYearMonth());
  const [monthlyData, setMonthlyData] = useState<MonthlyData | null>(null);
  const [costException, setCostException] = useState('');
  const [upstreamDownstreamChange, setUpstreamDownstreamChange] = useState('');
  const [nextMonthAttention, setNextMonthAttention] = useState('');
  const [experienceNote, setExperienceNote] = useState('');
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [otherPlan, setOtherPlan] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDocId, setSavedDocId] = useState<number | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedApprover, setSelectedApprover] = useState('');
  const [approveComment, setApproveComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 加载用户列表（用于选择审批人）
  useEffect(() => {
    fetch('/api/auth/center/users').then(r => r.json()).then(d => {
      if (d.users) {
        setUsers((d.users as AppUser[]).filter(user => user.username !== 'admin' && user.is_disabled !== true));
      }
    }).catch(() => {});
  }, []);
  const [error, setError] = useState('');
  const [constructionLogs, setConstructionLogs] = useState<ConstructionLogBrief[]>([]);
  const [tradeWages, setTradeWages] = useState<Record<string, number>>({});
  const [tradeWageTotal, setTradeWageTotal] = useState(0);
  const [reportItems, setReportItems] = useState<{name:string;qty:number;unit:string}[]>([]);
  const [selectedLogIndices, setSelectedLogIndices] = useState<number[]>([]);
  const [monthlyRiskReminders, setMonthlyRiskReminders] = useState<MonthlyRiskReminder[]>([]);
  const [selectedMonthlyRiskIds, setSelectedMonthlyRiskIds] = useState<number[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadProjects() {
      try {
        const res = await fetch('/api/projects');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '项目列表加载失败');
        const list = Array.isArray(json.projects) ? json.projects : [];
        if (!mounted) return;
        setProjects(list);
        if (list.length > 0 && !(reportFromUrl === 'report' && reportProject)) setProjectId(String(list[0].id));
      } catch (e: unknown) {
        if (mounted) setError(e instanceof Error ? e.message : '项目列表加载失败');
      } finally {
        if (mounted) setLoadingProjects(false);
      }
    }

    loadProjects();

    if (reportFromUrl === 'report' && reportMonth) {
      setTimeout(() => handleLoadData(), 300);
    }

    return () => {
      mounted = false;
    };
  // 初始化页面时加载项目列表；URL 参数只用于首屏默认值。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProject = useMemo(
    () => projects.find(project => String(project.id) === projectId),
    [projects, projectId],
  );
  const projectManagerUsers = useMemo(
    () => users.filter(user => userHasRole(user, 'project_manager')),
    [users],
  );

  async function handleLoadData() {
    setError('');

    if (!projectId) {
      setError('请选择项目');
      return;
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
      setError('月份格式必须为 YYYY-MM，例如 2026-07');
      return;
    }

    try {
      setLoadingData(true);
      const params = new URLSearchParams({ projectId, yearMonth });
      const res = await fetch(`/api/ai/knowledge/monthly?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.error || '月度数据加载失败');
      }

      setMonthlyData(json.data);

      // 加载已经标记为待入月报的风险提醒，只作为月报写作素材
      try {
        const riskParams = new URLSearchParams({ projectId, status: 'monthly', pageSize: '200' });
        const riskRes = await fetch(`/api/construction-logs/risks?${riskParams.toString()}`);
        const riskJson = await riskRes.json();
        const allRisks = Array.isArray(riskJson.data) ? riskJson.data : [];
        const monthRisks = allRisks
          .filter((risk: MonthlyRiskReminder) => !risk.log_date || risk.log_date.slice(0, 7) === yearMonth)
          .slice(0, 30);
        setMonthlyRiskReminders(monthRisks);
        setSelectedMonthlyRiskIds(monthRisks.map((risk: MonthlyRiskReminder) => Number(risk.log_id)).filter(Boolean));
      } catch {
        setMonthlyRiskReminders([]);
        setSelectedMonthlyRiskIds([]);
      }

      // 同时加载施工日志
      try {
        const logRes = await fetch(`/api/construction-logs?projectId=${projectId}`);
        const logJson = await logRes.json();
        const allLogs = (Array.isArray(logJson.data) ? logJson.data : []) as ConstructionLogBrief[];
        const selectedProj = projects.find(p => String(p.id) === projectId);
        const projName = selectedProj?.name || '';
        const filtered = allLogs.filter(log => log.content?.includes(projName) || log.issues);
        setConstructionLogs(filtered.slice(0, 8));
        setSelectedLogIndices([]);
      } catch { setConstructionLogs([]); }

      // 加载工种工资拆分明细
      try {
        if (json.data?.tradeWages) {
          setTradeWages(json.data.tradeWages);
          setTradeWageTotal(json.data.tradeWageTotal || 0);
          setReportItems(json.data.reportItems || []);
        }
      } catch { /* ignore */ }

    } catch (e: unknown) {
      setMonthlyData(null);
      setError(e instanceof Error ? e.message : '月度数据加载失败');
    } finally {
      setLoadingData(false);
    }
  }

  function togglePlan(plan: string) {
    setSelectedPlans(current => (
      current.includes(plan) ? current.filter(item => item !== plan) : [...current, plan]
    ));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!monthlyData || !selectedProject) {
      setError('请先加载月度数据');
      return;
    }

    const content = buildKnowledgeContent({
      data: monthlyData,
      costException,
      upstreamDownstreamChange,
      nextMonthAttention,
      experienceNote,
      selectedPlans,
      otherPlan,
      selectedRiskReminders: monthlyRiskReminders.filter(risk => selectedMonthlyRiskIds.includes(Number(risk.log_id))),
    });

    try {
      setSaving(true);
      const payload = {
        title: `${selectedProject.name} ${yearMonth} 月度分析`,
        category: '成本分析',
        source_type: 'manual',
        source_ref: `monthly:${selectedProject.id}:${yearMonth}`,
        tags: ['月度分析', selectedProject.name, yearMonth, '状态:草稿'],
        content,
        created_by: '月度分析表单',
      };

      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok || json.success === false) {
        throw new Error(json.error || '保存为知识失败');
      }

      const id = json.data?.id;
      setSavedDocId(id);
      if (id && selectedMonthlyRiskIds.length > 0) {
        await Promise.all(selectedMonthlyRiskIds.map(logId => fetch('/api/construction-logs/risks/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            logId,
            action: 'mark_monthly_included',
            reportMonth: yearMonth,
            monthlyDocId: id,
            note: '月度分析已引用该风险提醒',
          }),
        })));
        setMonthlyRiskReminders(current => current.filter(risk => !selectedMonthlyRiskIds.includes(Number(risk.log_id))));
        setSelectedMonthlyRiskIds([]);
      }
      // 不再自动跳转，展示提交审批面板
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存为知识失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitWorkflow() {
    if (!savedDocId) return;
    if (!selectedApprover) {
      setError('请选择项目经理后再提交');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/ai/knowledge/monthly/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeId: savedDocId,
          action: 'submit_to_manager',
          comment: approveComment,
          targetUserId: Number(selectedApprover),
        }),
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/knowledge/${savedDocId}`);
        router.refresh();
      } else {
        setError(json.error || '提交审批失败');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '提交审批失败');
    } finally {
      setSubmitting(false);
    }
  }

  const brief = monthlyData?.brief;

  return (
    <div className="min-h-full bg-[#F5F7FB] p-4 md:p-6">
      <style jsx global>{`
        .monthly-card {
          border: 1px solid #E5E6EB;
          border-radius: 12px;
          background: #FFFFFF;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
        }

        .monthly-label {
          color: #1D2129;
          font-size: 14px;
          font-weight: 600;
        }

        .monthly-field {
          width: 100%;
          border: 1px solid #E5E6EB;
          border-radius: 10px;
          background: #FBFCFF;
          color: #1D2129;
          font-size: 14px;
          outline: none;
          transition: all 0.2s ease;
        }

        .monthly-field:focus {
          border-color: #165DFF;
          background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(22, 93, 255, 0.1);
        }

        .monthly-readonly {
          border: 1px solid #E5E6EB;
          border-radius: 12px;
          background: #F7F8FA;
        }
      `}</style>

      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1D2129]">📝 写月度分析</h1>
            <p className="mt-1 text-sm text-[#86909C]">加载项目月度财务数据，沉淀成本异常、上下游变化和下月计划。</p>
          </div>
          <Link
            href="/knowledge"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#E5E6EB] bg-white px-3 text-sm font-medium text-[#4E5969] transition hover:border-[#165DFF]/40 hover:text-[#165DFF]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Link>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <section className="monthly-card p-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
              <label className="space-y-2">
                <span className="monthly-label">项目选择</span>
                <select
                  value={projectId}
                  onChange={event => {
                    setProjectId(event.target.value);
                    setMonthlyData(null);
                    setMonthlyRiskReminders([]);
                    setSelectedMonthlyRiskIds([]);
                  }}
                  className="monthly-field h-11 px-3"
                  disabled={loadingProjects}
                >
                  <option value="">{loadingProjects ? '正在加载项目...' : '请选择项目'}</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="monthly-label">月份</span>
                <input
                  value={yearMonth}
                  onChange={event => {
                    setYearMonth(event.target.value);
                    setMonthlyData(null);
                    setMonthlyRiskReminders([]);
                    setSelectedMonthlyRiskIds([]);
                  }}
                  className="monthly-field h-11 px-3"
                  placeholder="2026-07"
                  inputMode="numeric"
                />
              </label>

              <button
                type="button"
                onClick={handleLoadData}
                disabled={loadingData || loadingProjects}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#165DFF] px-5 text-sm font-medium text-white shadow-[0_8px_18px_rgba(22,93,255,0.22)] transition hover:bg-[#0E49D8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                加载数据
              </button>
            </div>
          </section>

          <section className="monthly-readonly p-5">
            <div className="mb-4 flex items-center gap-2 text-[#165DFF]">
              <FileText className="h-5 w-5" />
              <h2 className="text-lg font-semibold text-[#1D2129]">📊 本月数据简报</h2>
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-lg bg-white px-4 py-3">
                <span className="text-[#86909C]">合同额：</span>
                <strong className="text-[#1D2129]">{brief ? formatAmount(brief.contractAmount) : '待加载'}</strong>
              </div>
              <div className="rounded-lg bg-white px-4 py-3">
                <span className="text-[#86909C]">本月报量：</span>
                <strong className="text-[#1D2129]">{brief ? formatAmount(brief.monthlyReportAmount) : '待加载'}</strong>
                <span className="mx-3 text-[#C9CDD4]">|</span>
                <span className="text-[#86909C]">累计报量：</span>
                <strong className="text-[#1D2129]">{brief ? formatAmount(brief.cumulativeReportAmount) : '待加载'}</strong>
              </div>
              <div className="rounded-lg bg-white px-4 py-3">
                <span className="text-[#86909C]">本月工资：</span>
                <strong className="text-[#1D2129]">{brief ? formatAmount(brief.monthlySalary) : '待加载'}</strong>
                <span className="mx-3 text-[#C9CDD4]">|</span>
                <span className="text-[#86909C]">累计工资：</span>
                <strong className="text-[#1D2129]">{brief ? formatAmount(brief.cumulativeSalary) : '待加载'}</strong>
              </div>
              <div className="rounded-lg bg-white px-4 py-3">
                <span className="text-[#86909C]">本月管理费：</span>
                <strong className="text-[#1D2129]">{brief ? formatAmount(brief.monthlyManagementFee) : '待加载'}</strong>
              </div>
              <div className="rounded-lg bg-white px-4 py-3">
                <span className="text-[#86909C]">本月利润：</span>
                <strong className={brief && brief.monthlyProfit < 0 ? 'text-[#F53F3F]' : 'text-[#1D2129]'}>
                  {brief ? formatAmount(brief.monthlyProfit) : '待加载'}
                </strong>
                <span className="mx-3 text-[#C9CDD4]">|</span>
                <span className="text-[#86909C]">利润率：</span>
                <strong className={brief && brief.profitRate < 0 ? 'text-[#F53F3F]' : 'text-[#1D2129]'}>
                  {brief ? formatPercent(brief.profitRate) : '待加载'}
                </strong>
              </div>
              <div className="rounded-lg bg-white px-4 py-3">
                <span className="text-[#86909C]">甲方回款率：</span>
                <strong className="text-[#1D2129]">{brief ? formatPercent(brief.clientPaymentRate) : '待加载'}</strong>
              </div>
            </div>
          </section>
          {Object.keys(tradeWages).length > 0 && (
            <section className="monthly-readonly p-5">
              <div className="mb-3 flex items-center gap-2 text-[#165DFF]">
                <FileText className="h-5 w-5" />
                <h2 className="text-lg font-semibold text-[#1D2129]">👷 工种工资拆分</h2>
              </div>
              <div className="rounded-lg border border-[rgba(0,0,0,0.06)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#FAFBFC] border-b border-[rgba(0,0,0,0.06)]">
                    <th className="text-left px-4 py-2.5 text-[#4E5969] font-medium">工种</th>
                    <th className="text-right px-4 py-2.5 text-[#4E5969] font-medium">金额（元）</th>
                    <th className="text-right px-4 py-2.5 text-[#4E5969] font-medium">占比</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(tradeWages)
                      .sort(([,a]:[string,number],[,b]:[string,number]) => b - a)
                      .map(([trade, amount]) => (
                      <tr key={trade} className="border-b border-[rgba(0,0,0,0.04)] last:border-0">
                        <td className="px-4 py-2.5">{trade}</td>
                        <td className="text-right px-4 py-2.5 tabular-nums">{(amount as number).toLocaleString()}</td>
                        <td className="text-right px-4 py-2.5 tabular-nums text-[#8A8F98]">
                          {tradeWageTotal > 0 ? ((amount as number / tradeWageTotal) * 100).toFixed(1) + '%' : '-'}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[#FAFBFC] font-medium">
                      <td className="px-4 py-2.5">合计</td>
                      <td className="text-right px-4 py-2.5 tabular-nums">{tradeWageTotal.toLocaleString()}</td>
                      <td className="text-right px-4 py-2.5 text-[#8A8F98]">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {reportItems.length > 0 && (
            <section className="monthly-readonly p-5">
              <div className="mb-3 flex items-center gap-2 text-[#165DFF]">
                <FileText className="h-5 w-5" />
                <h2 className="text-lg font-semibold text-[#1D2129]">📋 对上报量明细</h2>
              </div>
              <div className="rounded-lg border border-[rgba(0,0,0,0.06)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-[#FAFBFC] border-b border-[rgba(0,0,0,0.06)]">
                    <th className="text-left px-4 py-2.5 text-[#4E5969] font-medium">项目子项</th>
                    <th className="text-right px-4 py-2.5 text-[#4E5969] font-medium">本月上报量</th>
                    <th className="text-left px-4 py-2.5 text-[#4E5969] font-medium">单位</th>
                  </tr></thead>
                  <tbody>
                    {reportItems.map((item, i) => (
                      <tr key={i} className="border-b border-[rgba(0,0,0,0.04)] last:border-0">
                        <td className="px-4 py-2.5">{item.name}</td>
                        <td className="text-right px-4 py-2.5 tabular-nums">{item.qty.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-[#8A8F98]">{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 风险池进入月报的提醒 */}
          {monthlyRiskReminders.length > 0 && (
            <section className="monthly-card p-5">
              <div className="flex items-center gap-2 text-[#F53F3F] mb-3">
                <ClipboardList className="h-5 w-5" />
                <h2 className="text-lg font-semibold text-[#1D2129]">本月待入月报风险提醒</h2>
                <span className="text-xs text-[#86909C]">({monthlyRiskReminders.length}条)</span>
              </div>
              <p className="text-xs text-[#86909C] mb-3">这些记录只用于提醒和月报沉淀，不在这里处理业务；保存月报后会标记为已进入月报。</p>
              <div className="space-y-2">
                {monthlyRiskReminders.map(risk => {
                  const logId = Number(risk.log_id);
                  const checked = selectedMonthlyRiskIds.includes(logId);
                  const level = risk.risk_level ? `${riskLevelLabels[risk.risk_level] || risk.risk_level}风险` : '风险提醒';
                  const types = (risk.risk_types || []).map(type => riskTypeLabels[type] || type).join('、');
                  return (
                    <label key={logId} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${checked ? 'border-[#F53F3F] bg-[#FFF7F7]' : 'border-[#E5E6EB] hover:border-[#F53F3F]/30'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedMonthlyRiskIds(prev => (
                          prev.includes(logId) ? prev.filter(id => id !== logId) : [...prev, logId]
                        ))}
                        className="mt-1 h-4 w-4 accent-[#F53F3F]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[#86909C]">
                          {risk.log_date || '未填日期'}{risk.location ? ` · ${risk.location}` : ''} · {level}{types ? ` · ${types}` : ''}
                        </p>
                        <p className="text-sm text-[#4E5969] mt-0.5">{risk.risk_summary || risk.content || '未填写风险摘要'}</p>
                        {risk.issues && <p className="text-xs text-[#F53F3F] mt-0.5">异常：{risk.issues}</p>}
                        {risk.risk_recommendation && <p className="text-xs text-[#86909C] mt-1">建议：{risk.risk_recommendation}</p>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {/* 施工日志相关提醒 */}
          {constructionLogs.length > 0 && (
            <section className="monthly-card p-5">
              <div className="flex items-center gap-2 text-[#F59E0B] mb-3">
                <ClipboardList className="h-5 w-5" />
                <h2 className="text-lg font-semibold text-[#1D2129]">📎 本月相关施工日志</h2>
                <span className="text-xs text-[#86909C]">({constructionLogs.length}条)</span>
              </div>
              <p className="text-xs text-[#86909C] mb-3">勾选后可追加到经验随笔中</p>
              <div className="space-y-2">
                {constructionLogs.map((log, i) => (
                  <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${selectedLogIndices.includes(i) ? 'border-[#165DFF] bg-[#F0F5FF]' : 'border-[#E5E6EB] hover:border-[#165DFF]/30'}`}>
                    <input type="checkbox" checked={selectedLogIndices.includes(i)} onChange={() => {
                      setSelectedLogIndices(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
                    }} className="mt-1 h-4 w-4 accent-[#165DFF]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#86909C]">{log.log_date} · {log.user_name}{log.location ? ` · ${log.location}` : ''}</p>
                      <p className="text-sm text-[#4E5969] mt-0.5">{log.content}</p>
                      {log.issues && <p className="text-xs text-[#F53F3F] mt-0.5">⚠️ {log.issues}</p>}
                    </div>
                  </label>
                ))}
              </div>
              {selectedLogIndices.length > 0 && (
                <button type="button" onClick={() => {
                  const selectedTexts = selectedLogIndices.map(i => {
                    const l = constructionLogs[i];
                    return `- [施工日志 ${l.log_date}] ${l.content}${l.issues ? `（异常：${l.issues}）` : ''}`;
                  }).join('\n');
                  setExperienceNote(prev => (prev ? prev + '\n\n' : '') + '## 引用施工日志\n' + selectedTexts);
                  setSelectedLogIndices([]);
                }} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#165DFF] px-3 text-xs text-white hover:bg-[#0E49D8]">
                  <Plus className="h-3.5 w-3.5" /> 引用选中到经验随笔
                </button>
              )}
            </section>
          )}

          <section className="monthly-card p-5">
            <div className="grid gap-5">
              <label className="space-y-2">
                <span className="monthly-label">① 本月成本有什么异常？</span>
                <textarea
                  value={costException}
                  onChange={event => setCostException(event.target.value)}
                  className="monthly-field min-h-[118px] resize-y p-3 leading-7"
                  placeholder="例如：人工费占比偏高、零星材料增加、管理费异常波动等"
                />
              </label>

              <label className="space-y-2">
                <span className="monthly-label">② 对上对下有什么变化？</span>
                <textarea
                  value={upstreamDownstreamChange}
                  onChange={event => setUpstreamDownstreamChange(event.target.value)}
                  className="monthly-field min-h-[118px] resize-y p-3 leading-7"
                  placeholder="例如：甲方报量、回款、供应商结算、工人工资发放的变化"
                />
              </label>

              <label className="space-y-2">
                <span className="monthly-label">③ 下月需要注意什么？</span>
                <textarea
                  value={nextMonthAttention}
                  onChange={event => setNextMonthAttention(event.target.value)}
                  className="monthly-field min-h-[118px] resize-y p-3 leading-7"
                  placeholder="例如：签证跟进、结算确认、回款节点、成本风险控制"
                />
              </label>
            </div>
          </section>

          <section className="monthly-card p-5">
            <label className="space-y-2">
              <span className="monthly-label">经验随笔（Markdown，可选）</span>
              <textarea
                value={experienceNote}
                onChange={event => setExperienceNote(event.target.value)}
                className="monthly-field min-h-[160px] resize-y p-3 leading-7"
                placeholder="记录可复用的施工、结算、单价、沟通经验"
              />
            </label>
          </section>

          <section className="monthly-card p-5">
            <div className="monthly-label">下月计划</div>
            <div className="mt-3 flex flex-wrap gap-3">
              {planOptions.map(plan => (
                <label
                  key={plan}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E5E6EB] bg-[#FBFCFF] px-3 text-sm text-[#1D2129] transition hover:border-[#165DFF]/40"
                >
                  <input
                    type="checkbox"
                    checked={selectedPlans.includes(plan)}
                    onChange={() => togglePlan(plan)}
                    className="h-4 w-4 accent-[#165DFF]"
                  />
                  {plan}
                </label>
              ))}
              <input
                value={otherPlan}
                onChange={event => setOtherPlan(event.target.value)}
                className="monthly-field h-10 min-w-[180px] max-w-[260px] px-3"
                placeholder="其他计划"
                disabled={!selectedPlans.includes('其他')}
              />
            </div>
          </section>

          {savedDocId ? (
            <section className="monthly-card border-[#DCE6FF] p-5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#1D2129]">提交审批</p>
                  <p className="mt-1 text-xs text-[#86909C]">请选择本项目经理，提交后会生成对方的站内提醒和待办。</p>
                </div>
                <span className="rounded-full bg-[#F0F5FF] px-3 py-1 text-xs font-medium text-[#165DFF]">
                  已保存为知识 #{savedDocId}
                </span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[260px_minmax(0,1fr)_auto] md:items-end">
                <label className="space-y-2">
                  <span className="monthly-label">项目经理</span>
                  <select
                    value={selectedApprover}
                    onChange={event => setSelectedApprover(event.target.value)}
                    className="monthly-field h-11 px-3"
                  >
                    <option value="">请选择项目经理</option>
                    {projectManagerUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {getUserDisplayName(user)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="monthly-label">提交说明</span>
                  <input
                    value={approveComment}
                    onChange={event => setApproveComment(event.target.value)}
                    className="monthly-field h-11 px-3"
                    placeholder="例如：请补充现场情况和下月风险点"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSubmitWorkflow}
                  disabled={submitting || !selectedApprover}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#165DFF] px-5 text-sm font-medium text-white shadow-[0_8px_18px_rgba(22,93,255,0.22)] transition hover:bg-[#0E49D8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  提交给项目经理
                </button>
              </div>
              {projectManagerUsers.length === 0 ? (
                <p className="mt-3 text-xs text-[#F53F3F]">当前没有可选项目经理，请先在权限中心给人员分配项目经理角色。</p>
              ) : null}
            </section>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/knowledge"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E5E6EB] bg-white px-4 text-sm font-medium text-[#4E5969] transition hover:border-[#165DFF]/40 hover:text-[#165DFF]"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={saving || !monthlyData}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#165DFF] px-5 text-sm font-medium text-white shadow-[0_8px_18px_rgba(22,93,255,0.22)] transition hover:bg-[#0E49D8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存为知识
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
