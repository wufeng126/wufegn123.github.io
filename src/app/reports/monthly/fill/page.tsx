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
  LockOpen,
  Save,
  Send,
  UserRoundCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type WorkflowContent = {
  analysis?: string;
  risk?: string;
  nextPlan?: string;
  remark?: string;
  managerSupplement?: string;
  bossSupplement?: string;
  managerApproverId?: number;
  managerApproverName?: string;
  bossApproverId?: number;
  bossApproverName?: string;
};

type UserOption = { id: number; name: string; role: string };

type WorkflowRow = {
  status?: string;
  content?: WorkflowContent | null;
  fill_user?: string | null;
  manager_user?: string | null;
  approved_by?: string | null;
  reject_reason?: string | null;
  submitted_manager_at?: string | null;
  submitted_boss_at?: string | null;
  approved_at?: string | null;
};

type SummaryOverview = {
  monthIncome?: number;
  monthCost?: number;
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
  draft: '预算员填写中',
  pending_manager: '待项目经理补充',
  pending_boss: '待老板审批',
  approved: '已通过（已归档）',
  rejected: '已驳回',
};

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_manager: 'bg-amber-50 text-amber-700',
  pending_boss: 'bg-blue-50 text-blue-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
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
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [myId, setMyId] = useState<number>(0);
  const [myRole, setMyRole] = useState<string>('');

  const [overview, setOverview] = useState<SummaryOverview>({});
  const [prevTotals, setPrevTotals] = useState<{ income: number; labor: number; paid: number; team: number; cost: number } | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [status, setStatus] = useState<string>('draft');
  const [content, setContent] = useState<WorkflowContent>({});
  const [fillOwnerId, setFillOwnerId] = useState(0);
  const [managerOwnerId, setManagerOwnerId] = useState(0);
  const [fillOwnerName, setFillOwnerName] = useState('');
  const [managerOwnerName, setManagerOwnerName] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [rejectNote, setRejectNote] = useState('');

  const [analysis, setAnalysis] = useState('');
  const [risk, setRisk] = useState('');
  const [nextPlan, setNextPlan] = useState('');
  const [remark, setRemark] = useState('');
  const [managerSupplement, setManagerSupplement] = useState('');
  const [bossSupplement, setBossSupplement] = useState('');
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [managerApproverId, setManagerApproverId] = useState(0);
  const [bossApproverId, setBossApproverId] = useState(0);
  const [approverKeyword, setApproverKeyword] = useState('');

  const load = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (projectId && projectId !== 'all') params.set('projectId', projectId);
      const [meRes, summaryRes, workflowRes, optionsRes] = await Promise.all([
        fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/reports/monthly/summary?${params.toString()}`, { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/reports/monthly/workflow?${params.toString()}`, { credentials: 'include', cache: 'no-store' }),
        fetch('/api/users/options', { credentials: 'include', cache: 'no-store' }),
      ]);
      const optionsJson = await optionsRes.json().catch(() => ({}));
      const options = (optionsJson?.data?.options || []) as UserOption[];
      setUserOptions(Array.isArray(options) ? options : []);
      const meJson = await meRes.json().catch(() => ({}));
      const me = meJson?.user || meJson?.data || {};
      setMyId(Number(me.id) || 0);
      setMyRole(String(me.role || ''));

      const summaryJson = await summaryRes.json().catch(() => ({}));
      if (!summaryRes.ok || summaryJson.success === false) {
        throw new Error(summaryJson.error || '月报数据加载失败');
      }
      setOverview(summaryJson.data?.overview || {});
      setProjects(Array.isArray(summaryJson.data?.projects) ? (summaryJson.data.projects as ProjectRow[]) : []);

      // 上月对比（取上月汇总用于环比展示，失败不影响主流程）
      try {
        const [yearPart, monthPart] = month.split('-').map((part) => Number(part));
        const prevDate = new Date(yearPart, monthPart - 2, 1);
        const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
        const prevParams = new URLSearchParams({ month: prevMonth });
        if (projectId && projectId !== 'all') prevParams.set('projectId', projectId);
        const prevRes = await fetch(`/api/reports/monthly/summary?${prevParams.toString()}`, { credentials: 'include', cache: 'no-store' });
        const prevJson = await prevRes.json().catch(() => ({}));
        if (prevRes.ok && prevJson.success !== false) {
          const prevProjects = Array.isArray(prevJson.data?.projects) ? (prevJson.data.projects as ProjectRow[]) : [];
          setPrevTotals({
            income: Number(prevJson.data?.overview?.monthIncome) || 0,
            labor: prevProjects.reduce((sum, p) => sum + (p.monthLaborSalaryCost || 0), 0),
            paid: prevProjects.reduce((sum, p) => sum + (p.monthSalaryPaid || 0), 0),
            team: prevProjects.reduce((sum, p) => sum + (p.monthTeamSettlementCost || 0), 0),
            cost: Number(prevJson.data?.overview?.monthCost) || 0,
          });
        }
      } catch {
        setPrevTotals(null);
      }

      const workflowJson = await workflowRes.json().catch(() => ({}));
      const data = workflowJson?.data || {};
      const row = (data.workflow || null) as WorkflowRow | null;
      setStatus(String(row?.status || 'draft'));
      setFillOwnerId(Number(data.fill_owner_id) || 0);
      setManagerOwnerId(Number(data.manager_owner_id) || 0);
      setFillOwnerName(String(data.fill_owner_name || ''));
      setManagerOwnerName(String(data.manager_owner_name || ''));
      setApprovedBy(String(row?.approved_by || ''));
      setRejectNote(String(row?.reject_reason || ''));
      const c = (row?.content || {}) as WorkflowContent;
      setContent(c);
      setAnalysis(String(c.analysis || ''));
      setRisk(String(c.risk || ''));
      setNextPlan(String(c.nextPlan || ''));
      setRemark(String(c.remark || ''));
      setManagerSupplement(String(c.managerSupplement || ''));
      setBossSupplement(String(c.bossSupplement || ''));
      setManagerApproverId(Number(c.managerApproverId) || 0);
      setBossApproverId(Number(c.bossApproverId) || 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '月报数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [month, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 分析内容未提交时离开页面提醒，避免白写
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const dirty = [analysis, risk, nextPlan, remark, managerSupplement, bossSupplement]
        .some((value) => value.trim().length > 0);
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [analysis, risk, nextPlan, remark, managerSupplement, bossSupplement]);

  const isBossOrSuper = myRole === 'super_admin' || myRole === 'boss';
  const isBudgetOwner = fillOwnerId > 0 && myId === fillOwnerId;
  const isManagerOwner = managerOwnerId > 0 && myId === managerOwnerId;
  const designatedManagerId = Number(content.managerApproverId) || 0;
  const designatedBossId = Number(content.bossApproverId) || 0;

  const filteredUserOptions = useMemo(() => {
    const keyword = approverKeyword.trim().toLowerCase();
    return userOptions
      .filter((item) => item.id !== myId)
      .filter((item) => !keyword
        || item.name.toLowerCase().includes(keyword)
        || item.role.toLowerCase().includes(keyword));
  }, [userOptions, approverKeyword, myId]);

  const canFill = (status === 'draft' || status === 'rejected') && (isBudgetOwner || isBossOrSuper || fillOwnerId === 0);
  const canSupplement = status === 'pending_manager' && (
    (designatedManagerId > 0 && myId === designatedManagerId) || isManagerOwner || isBossOrSuper
  );
  const canApprove = status === 'pending_boss' && (
    (designatedBossId > 0 && myId === designatedBossId) || isBossOrSuper
  );

  const tradeWagesMerged = useMemo(() => {
    const merged: Record<string, number> = {};
    projects.forEach((project) => {
      Object.entries(project.tradeWages || {}).forEach(([type, amount]) => {
        merged[type] = (merged[type] || 0) + (Number(amount) || 0);
      });
    });
    return Object.entries(merged).sort((a, b) => b[1] - a[1]);
  }, [projects]);

  // 花名册没填工种时会全部落到「未分类」，此时单独提示，不当作真实工种展示
  const knownTradeWages = tradeWagesMerged.filter(([type]) => type !== '未分类' && type !== '其他');
  const unclassifiedWage = tradeWagesMerged.find(([type]) => type === '未分类')?.[1] || 0;

  const totals = useMemo(() => ({
    laborSalary: projects.reduce((sum, p) => sum + (p.monthLaborSalaryCost || 0), 0),
    salaryPaid: projects.reduce((sum, p) => sum + (p.monthSalaryPaid || 0), 0),
    teamSettlement: projects.reduce((sum, p) => sum + (p.monthTeamSettlementCost || 0), 0),
  }), [projects]);

  async function post(action: string, extra?: { content?: WorkflowContent; reason?: string }) {
    if (!month) return;
    const body: Record<string, unknown> = { month, action };
    if (action === 'submit_manager') {
      if (!managerApproverId) {
        toast.error('请选择项目经理作为下一级审批人');
        return;
      }
      body.managerApproverId = managerApproverId;
      body.managerApproverName = userOptions.find((item) => item.id === managerApproverId)?.name || '';
    }
    if (action === 'supplement') {
      if (!bossApproverId) {
        toast.error('请选择老板作为下一级审批人');
        return;
      }
      body.bossApproverId = bossApproverId;
      body.bossApproverName = userOptions.find((item) => item.id === bossApproverId)?.name || '';
    }
    if (projectId && projectId !== 'all') body.projectId = projectId;
    setSaving(true);
    try {
      if (extra?.content) body.content = extra.content;
      if (extra?.reason) body.reason = extra.reason;
      const res = await fetch('/api/reports/monthly/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) throw new Error(json.error || '操作失败');
      toast.success(
        action === 'save' ? '草稿已保存'
          : action === 'submit_manager' ? '已提交项目经理'
            : action === 'supplement' ? '已提交老板审批'
              : action === 'approve' ? '已通过，分析已归档' : '已驳回',
      );
      setRejectMode(false);
      setRejectReason('');
      await load();
      if (action === 'submit_manager' || action === 'supplement' || action === 'approve' || action === 'reject') {
        router.push(`/reports/monthly?month=${encodeURIComponent(month)}${projectId !== 'all' ? `&projectId=${projectId}` : ''}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setSaving(false);
    }
  }

  const budgetContent: WorkflowContent = { analysis, risk, nextPlan, remark };

  return (
    <div className="min-h-screen bg-[var(--color-muted)] px-3 py-4 sm:p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href={`/reports/monthly?month=${encodeURIComponent(month)}${projectId !== 'all' ? `&projectId=${projectId}` : ''}`}
              className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--color-text-3)] hover:text-[var(--color-primary)]"
            >
              <ArrowLeft className="h-4 w-4" /> 返回月报
            </Link>
            <h1 className="text-xl font-bold text-[var(--foreground)] sm:text-2xl">
              {month || '本月'} 月度分析
            </h1>
            <p className="mt-0.5 text-sm text-[var(--color-text-3)]">
              {projectId === 'all' ? '全公司' : `项目 #${projectId}`} · 系统数据自动带出（不可修改）
            </p>
          </div>
          <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-medium ${STATUS_CLASS[status] || 'bg-slate-100 text-slate-600'}`}>
            当前状态：{STATUS_LABEL[status] || status}
          </span>
        </div>

        {rejectNote && (status === 'rejected' || status === 'draft') ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            驳回原因：{rejectNote}
          </div>
        ) : null}

        {/* 系统数据（只读） */}
        <section className="mb-5 overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
            <Lock className="h-4 w-4 text-[var(--color-text-3)]" />
            <h2 className="font-semibold text-[var(--foreground)]">本月经营数据</h2>
            <span className="text-xs text-[var(--color-text-3)]">系统自动带出，不可修改</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-5">
            {[
              { label: '本月产值（开票额）', value: fmtWan(overview.monthIncome), current: Number(overview.monthIncome) || 0, prev: prevTotals?.income },
              { label: '工人工资应发', value: fmtWan(totals.laborSalary), current: totals.laborSalary, prev: prevTotals?.labor },
              { label: '工人实发', value: fmtWan(totals.salaryPaid), current: totals.salaryPaid, prev: prevTotals?.paid },
              { label: '班组结算', value: fmtWan(totals.teamSettlement), current: totals.teamSettlement, prev: prevTotals?.team },
              { label: '确认成本', value: fmtWan(overview.monthCost), current: Number(overview.monthCost) || 0, prev: prevTotals?.cost },
            ].map((item) => {
              const prevValue = Number(item.prev) || 0;
              const delta = prevValue > 0 ? ((item.current - prevValue) / prevValue) * 100 : null;
              return (
                <div key={item.label} className="bg-white px-4 py-3">
                  <div className="text-xs text-[var(--color-text-3)]">{item.label}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--foreground)]">{item.value}</div>
                  {delta !== null ? (
                    <div className={`mt-0.5 text-[11px] tabular-nums ${
                  item.label === '确认成本'
                    ? (delta >= 0 ? 'text-[#FF7D00]' : 'text-[#00B42A]')
                    : (delta >= 0 ? 'text-[#00B42A]' : 'text-[#F53F3F]')
                }`}>
                      环比 {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                    </div>
                  ) : null}
                </div>
              );
            })}
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
              {knownTradeWages.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {knownTradeWages.map(([type, amount]) => (
                    <span key={type} className="rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs text-[var(--foreground)]">
                      {type}：{fmtWan(amount)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--color-text-3)]">本项目的工人花名册未填写工种，暂时无法按工种统计。</p>
              )}
              {unclassifiedWage > 0 && knownTradeWages.length > 0 ? (
                <p className="mt-1.5 text-[11px] text-[var(--color-text-3)]">
                  另有无工种记录的工资 {fmtWan(unclassifiedWage)}（建议在花名册补填工种）
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 预算员分析 */}
        <section className="mb-5 overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3">
            <FileText className="h-4 w-4 text-[var(--color-primary)]" />
            <h2 className="font-semibold text-[var(--foreground)]">预算员分析</h2>
            <span className="text-xs text-[var(--color-text-3)]">
              {fillOwnerName ? `填报人：${fillOwnerName}` : ''}
            </span>
            {content.analysis && !canFill ? (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--color-text-3)]">
                <Lock className="h-3 w-3" /> 已提交，只读
              </span>
            ) : null}
          </div>
          <div className="space-y-4 px-5 py-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-3)]">经营分析 *</span>
              <textarea
                value={analysis}
                onChange={(event) => setAnalysis(event.target.value)}
                rows={6}
                disabled={!canFill}
                placeholder="结合上方系统数据，说明本月经营情况（产值/成本/工资/班组）"
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
                  disabled={!canFill}
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
                  disabled={!canFill}
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
                disabled={!canFill}
                placeholder="其他说明"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-muted)] disabled:text-[var(--color-text-3)]"
              />
            </label>
          </div>
          {canFill ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
              <label className="mr-auto flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-3)]">
                下一级审批人（项目经理）
                <input
                  value={approverKeyword}
                  onChange={(event) => setApproverKeyword(event.target.value)}
                  placeholder="搜索姓名"
                  className="h-9 w-24 rounded-lg border border-[var(--border)] px-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--color-primary)]"
                />
                <select
                  value={managerApproverId}
                  onChange={(event) => setManagerApproverId(Number(event.target.value) || 0)}
                  className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--color-primary)]"
                >
                  <option value={0}>请选择</option>
                  {filteredUserOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => post('save', { content: budgetContent })}
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--foreground)] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 保存草稿
              </button>
              <button
                type="button"
                onClick={() => post('submit_manager', { content: budgetContent })}
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 提交项目经理
              </button>
            </div>
          ) : null}
        </section>

        {/* 项目经理补充 */}
        {(managerSupplement || canSupplement || ['pending_boss', 'approved', 'pending_manager'].includes(status)) ? (
          <section className="mb-5 overflow-hidden rounded-xl border border-[var(--border)] bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3">
              <UserRoundCheck className="h-4 w-4 text-[var(--color-primary)]" />
              <h2 className="font-semibold text-[var(--foreground)]">项目经理补充</h2>
              <span className="text-xs text-[var(--color-text-3)]">
                {content.managerApproverName
                  ? `指定审批人：${content.managerApproverName}`
                  : managerOwnerName ? `项目经理：${managerOwnerName}` : ''}
              </span>
              {canSupplement ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--color-primary)]">
                  <LockOpen className="h-3 w-3" /> 待你补充
                </span>
              ) : managerSupplement ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--color-text-3)]">
                  <Lock className="h-3 w-3" /> 已补充，只读
                </span>
              ) : null}
            </div>
            <div className="px-5 py-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-text-3)]">补充分析内容 *</span>
                <textarea
                  value={managerSupplement}
                  onChange={(event) => setManagerSupplement(event.target.value)}
                  rows={5}
                  disabled={!canSupplement}
                  placeholder="项目经理补充：现场进度、风险、资源安排等（必填）"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-muted)] disabled:text-[var(--color-text-3)]"
                />
              </label>
            </div>
            {canSupplement ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
                <label className="mr-auto flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-3)]">
                  下一级审批人（老板）
                  <input
                  value={approverKeyword}
                  onChange={(event) => setApproverKeyword(event.target.value)}
                  placeholder="搜索姓名"
                  className="h-9 w-24 rounded-lg border border-[var(--border)] px-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--color-primary)]"
                />
                  <select
                    value={bossApproverId}
                    onChange={(event) => setBossApproverId(Number(event.target.value) || 0)}
                    className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--color-primary)]"
                  >
                    <option value={0}>请选择</option>
                    {filteredUserOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => post('supplement', { content: { managerSupplement } })}
                  disabled={saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 提交老板审批
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* 老板审批 */}
        {(canApprove || bossSupplement || status === 'approved') ? (
          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3">
              <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" />
              <h2 className="font-semibold text-[var(--foreground)]">老板审批</h2>
              {status === 'approved' && approvedBy ? (
                <span className="text-xs text-[var(--color-text-3)]">审批人：{approvedBy}</span>
              ) : content.bossApproverName ? (
                <span className="text-xs text-[var(--color-text-3)]">指定审批人：{content.bossApproverName}</span>
              ) : null}
              {canApprove ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--color-primary)]">
                  <LockOpen className="h-3 w-3" /> 待你审批
                </span>
              ) : null}
            </div>
            <div className="px-5 py-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--color-text-3)]">
                  老板意见 / 补充（{canApprove ? '可填写' : '只读'}）
                </span>
                <textarea
                  value={bossSupplement}
                  onChange={(event) => setBossSupplement(event.target.value)}
                  rows={4}
                  disabled={!canApprove}
                  placeholder="老板补充意见：经营判断、下月要求等（可选）"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-muted)] disabled:text-[var(--color-text-3)]"
                />
              </label>
              {canApprove && rejectMode ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="mb-2 text-xs font-medium text-red-600">驳回原因（必填）</div>
                  <textarea
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    rows={3}
                    placeholder="请说明驳回原因，预算员会看到并修改"
                    className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setRejectMode(false); setRejectReason(''); }}
                      className="inline-flex h-8 items-center rounded-lg border border-[var(--border)] bg-white px-3 text-xs"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => post('reject', { content: { bossSupplement }, reason: rejectReason })}
                      disabled={saving}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#F53F3F] px-3 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} 确认驳回
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            {canApprove ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
                <button
                  type="button"
                  onClick={() => setRejectMode(true)}
                  disabled={saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-[#F53F3F] disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" /> 驳回
                </button>
                <button
                  type="button"
                  onClick={() => post('approve', { content: { bossSupplement } })}
                  disabled={saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#00B42A] px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} 通过并归档
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {!canFill && !canSupplement && !canApprove && status !== 'approved' ? (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--color-text-3)]">
            当前环节由其他角色处理中，你暂无操作权限。
          </div>
        ) : null}
      </div>
    </div>
  );
}
