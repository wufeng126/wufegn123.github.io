'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  Save,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';

type WorkflowStatus =
  | 'draft'
  | 'pending_manager'
  | 'pending_boss'
  | 'approved'
  | 'rejected';

type SummaryOverview = {
  monthIncome?: number;
  monthCost?: number;
  operatingProfit?: number;
  operatingProfitRate?: number;
  monthReceived?: number;
  paymentRate?: number;
  unreceived?: number;
};

type ProjectRow = {
  id: number;
  name: string;
  monthIncome?: number;
  monthLaborSalaryCost?: number;
  monthSalaryPaid?: number;
  monthTeamSettlementCost?: number;
  tradeWages?: Record<string, number>;
};

const STATUS_LABEL: Record<string, string> = {
  draft: '填写中',
  pending_manager: '待项目经理补充',
  pending_boss: '待老板审批',
  approved: '已通过（锁定）',
  rejected: '已驳回',
};

function fmtWan(value?: number): string {
  const num = Number(value) || 0;
  return `${(num / 10000).toFixed(2)} 万元`;
}

export default function MonthlyReportFillPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const month = searchParams.get('month') || '';
  const projectId = searchParams.get('projectId') || 'all';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState<SummaryOverview>({});
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [status, setStatus] = useState<WorkflowStatus>('draft');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [analysis, setAnalysis] = useState('');
  const [risk, setRisk] = useState('');
  const [nextPlan, setNextPlan] = useState('');
  const [remark, setRemark] = useState('');

  const editable = status === 'draft' || status === 'rejected';

  const load = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (projectId && projectId !== 'all') params.set('projectId', projectId);
      const [summaryRes, workflowRes] = await Promise.all([
        fetch(`/api/reports/monthly/summary?${params.toString()}`, { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/reports/monthly/workflow?${params.toString()}`, { credentials: 'include', cache: 'no-store' }),
      ]);
      const summaryJson = await summaryRes.json().catch(() => ({}));
      const workflowJson = await workflowRes.json().catch(() => ({}));
      if (!summaryRes.ok || summaryJson.success === false) {
        throw new Error(summaryJson.error || '月报数据加载失败');
      }

      setOverview(summaryJson.data?.overview || {});
      const projectList = Array.isArray(summaryJson.data?.projects)
        ? (summaryJson.data.projects as ProjectRow[])
        : [];
      setProjects(projectList);

      const workflow = workflowJson.data?.workflow || null;
      if (workflow) {
        setStatus((workflow.status || 'draft') as WorkflowStatus);
        setRejectReason(String(workflow.reject_reason || ''));
        const content = (workflow.content || {}) as Record<string, string>;
        setAnalysis(String(content.analysis || ''));
        setRisk(String(content.risk || ''));
        setNextPlan(String(content.nextPlan || ''));
        setRemark(String(content.remark || ''));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '月报数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [month, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const tradeWagesMerged = useMemo(() => {
    const merged: Record<string, number> = {};
    projects.forEach((project) => {
      Object.entries(project.tradeWages || {}).forEach(([type, amount]) => {
        merged[type] = (merged[type] || 0) + (Number(amount) || 0);
      });
    });
    return Object.entries(merged).sort((a, b) => b[1] - a[1]);
  }, [projects]);

  const totals = useMemo(() => ({
    laborSalary: projects.reduce((sum, p) => sum + (p.monthLaborSalaryCost || 0), 0),
    salaryPaid: projects.reduce((sum, p) => sum + (p.monthSalaryPaid || 0), 0),
    teamSettlement: projects.reduce((sum, p) => sum + (p.monthTeamSettlementCost || 0), 0),
  }), [projects]);

  async function submit(action: 'save' | 'submit_manager') {
    if (!month) return;
    if (action === 'submit_manager' && !analysis.trim()) {
      toast.error('请先填写经营分析再提交');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        month,
        action,
        content: {
          analysis: analysis.trim(),
          risk: risk.trim(),
          nextPlan: nextPlan.trim(),
          remark: remark.trim(),
        },
      };
      if (projectId && projectId !== 'all') body.projectId = projectId;
      const res = await fetch('/api/reports/monthly/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.error || '保存失败');
      }
      toast.success(action === 'save' ? '草稿已保存' : '已提交项目经理');
      if (action === 'submit_manager') {
        router.push(`/reports/monthly?month=${encodeURIComponent(month)}${projectId !== 'all' ? `&projectId=${projectId}` : ''}`);
      } else {
        setStatus('draft');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-muted)] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href={`/reports/monthly?month=${encodeURIComponent(month)}${projectId !== 'all' ? `&projectId=${projectId}` : ''}`}
              className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--color-text-3)] hover:text-[var(--color-primary)]"
            >
              <ArrowLeft className="h-4 w-4" /> 返回月报
            </Link>
            <h1 className="text-xl font-bold text-[var(--foreground)] sm:text-2xl">
              {month || '本月'} 月度分析填写
            </h1>
            <p className="mt-0.5 text-sm text-[var(--color-text-3)]">
              {projectId === 'all' ? '全公司' : `项目 #${projectId}`} · 系统数据自动带出（不可修改），只需填写分析
            </p>
          </div>
          <span className="inline-flex h-8 items-center rounded-full bg-white px-3 text-xs font-medium text-[var(--foreground)]">
            当前状态：{STATUS_LABEL[status] || status}
          </span>
        </div>

        {rejectReason ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            驳回原因：{rejectReason}
          </div>
        ) : null}

        {/* 系统数据（只读） */}
        <section className="mb-5 overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
            <Lock className="h-4 w-4 text-[var(--color-text-3)]" />
            <h2 className="font-semibold text-[var(--foreground)]">本月经营数据</h2>
            <span className="text-xs text-[var(--color-text-3)]">系统自动带出，不可修改</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
            {[
              { label: '本月报量', value: fmtWan(overview.monthIncome) },
              { label: '工人工资应发', value: fmtWan(totals.laborSalary) },
              { label: '工人实发', value: fmtWan(totals.salaryPaid) },
              { label: '班组结算', value: fmtWan(totals.teamSettlement) },
              { label: '确认成本', value: fmtWan(overview.monthCost) },
              { label: '经营利润', value: fmtWan(overview.operatingProfit) },
              { label: '利润率', value: `${(Number(overview.operatingProfitRate) || 0).toFixed(1)}%` },
              { label: '累计回款率', value: `${(Number(overview.paymentRate) || 0).toFixed(1)}%` },
            ].map((item) => (
              <div key={item.label} className="bg-white px-4 py-3">
                <div className="text-xs text-[var(--color-text-3)]">{item.label}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--foreground)]">{item.value}</div>
              </div>
            ))}
          </div>
          {projects.length > 0 ? (
            <div className="border-t border-[var(--border)] px-5 py-3">
              <div className="mb-2 text-xs font-medium text-[var(--color-text-3)]">分项目明细</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--color-text-3)]">
                      <th className="py-1.5 pr-3 text-left font-medium">项目</th>
                      <th className="py-1.5 pr-3 text-right font-medium">报量</th>
                      <th className="py-1.5 pr-3 text-right font-medium">工人工资</th>
                      <th className="py-1.5 pr-3 text-right font-medium">实发</th>
                      <th className="py-1.5 text-right font-medium">班组结算</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr key={project.id} className="border-t border-[var(--border)]">
                        <td className="py-1.5 pr-3">{project.name}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{fmtWan(project.monthIncome)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{fmtWan(project.monthLaborSalaryCost)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{fmtWan(project.monthSalaryPaid)}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtWan(project.monthTeamSettlementCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {tradeWagesMerged.length > 0 ? (
            <div className="border-t border-[var(--border)] px-5 py-3">
              <div className="mb-2 text-xs font-medium text-[var(--color-text-3)]">各工种工资</div>
              <div className="flex flex-wrap gap-2">
                {tradeWagesMerged.map(([type, amount]) => (
                  <span key={type} className="rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs text-[var(--foreground)]">
                    {type}：{fmtWan(amount)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* 分析填写（可编辑） */}
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
            <FileText className="h-4 w-4 text-[var(--color-primary)]" />
            <h2 className="font-semibold text-[var(--foreground)]">经营分析</h2>
            <span className="text-xs text-[var(--color-text-3)]">仅分析内容可填写</span>
          </div>
          <div className="space-y-4 px-5 py-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-3)]">经营分析 *</span>
              <textarea
                value={analysis}
                onChange={(event) => setAnalysis(event.target.value)}
                rows={6}
                disabled={!editable}
                placeholder="结合上方系统数据，说明本月经营情况（产值/回款/成本/利润）"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-muted)] disabled:text-[var(--color-text-3)]"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-text-3)]">风险说明</span>
                <textarea
                  value={risk}
                  onChange={(event) => setRisk(event.target.value)}
                  rows={4}
                  disabled={!editable}
                  placeholder="需关注的问题与应对措施"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-muted)] disabled:text-[var(--color-text-3)]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-text-3)]">下月计划</span>
                <textarea
                  value={nextPlan}
                  onChange={(event) => setNextPlan(event.target.value)}
                  rows={4}
                  disabled={!editable}
                  placeholder="下月经营计划与目标"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-muted)] disabled:text-[var(--color-text-3)]"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-3)]">备注</span>
              <textarea
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                rows={2}
                disabled={!editable}
                placeholder="其他说明"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-muted)] disabled:text-[var(--color-text-3)]"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
            {!editable ? (
              <span className="mr-auto inline-flex items-center gap-1 text-xs text-[var(--color-text-3)]">
                <CheckCircle2 className="h-3.5 w-3.5" /> 当前状态不可编辑，需流转到对应角色后填写
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => submit('save')}
              disabled={saving || !editable}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--foreground)] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 保存草稿
            </button>
            <button
              type="button"
              onClick={() => submit('submit_manager')}
              disabled={saving || !editable}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 提交项目经理
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
