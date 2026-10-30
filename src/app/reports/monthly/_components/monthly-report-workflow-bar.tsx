'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronUp, Loader2, PenLine, Send, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';

type WorkflowContent = {
  analysis?: string;
  risk?: string;
  nextPlan?: string;
  remark?: string;
};

type Workflow = {
  id: number;
  year_month: string;
  project_scope: string;
  status: string;
  content?: WorkflowContent | null;
  fill_user?: string | null;
  manager_user?: string | null;
  approved_by?: string | null;
  submitted_manager_at?: string | null;
  submitted_boss_at?: string | null;
  approved_at?: string | null;
  reject_reason?: string | null;
  updated_at?: string | null;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: '预算员填写中', className: 'bg-slate-100 text-slate-600' },
  pending_manager: { label: '待项目经理补充', className: 'bg-amber-100 text-amber-700' },
  pending_boss: { label: '待老板审批', className: 'bg-blue-100 text-blue-700' },
  approved: { label: '已审批（锁定）', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '已驳回', className: 'bg-red-100 text-red-600' },
};

const CONTENT_FIELDS: Array<{ key: keyof WorkflowContent; label: string; placeholder: string }> = [
  { key: 'analysis', label: '经营分析', placeholder: '本月经营情况分析（产值/回款/成本/利润）' },
  { key: 'risk', label: '风险说明', placeholder: '需关注的风险与应对措施' },
  { key: 'nextPlan', label: '下月计划', placeholder: '下月经营计划与目标' },
  { key: 'remark', label: '备注', placeholder: '其他需要说明的内容' },
];

function formatTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export type WorkflowSummary = {
  monthIncome?: number;
  laborSalary?: number;
  salaryPaid?: number;
  teamSettlement?: number;
  monthCost?: number;
  operatingProfit?: number;
  operatingProfitRate?: number;
  paymentRate?: number;
  unreceived?: number;
  tradeWages?: Record<string, number>;
  projects?: Array<{
    name?: string;
    monthIncome?: number;
    monthLaborSalaryCost?: number;
    monthSalaryPaid?: number;
    monthTeamSettlementCost?: number;
  }>;
};

function formatWan(value?: number): string {
  return `${((Number(value) || 0) / 10000).toFixed(2)} 万元`;
}

/** 根据月报数据生成经营分析草稿（预算员补充说明后提交） */
function buildDraft(summary: WorkflowSummary): string {
  const projects = (summary.projects || []).filter(
    (p) => (p.monthIncome || 0) > 0 || (p.monthLaborSalaryCost || 0) > 0 || (p.monthTeamSettlementCost || 0) > 0,
  );
  const lines = [
    `本月报量合计 ${formatWan(summary.monthIncome)}，工人工资应发 ${formatWan(summary.laborSalary)}（实发 ${formatWan(summary.salaryPaid)}），班组结算 ${formatWan(summary.teamSettlement)}。`,
    `本月确认成本 ${formatWan(summary.monthCost)}，经营利润 ${formatWan(summary.operatingProfit)}（利润率 ${(Number(summary.operatingProfitRate) || 0).toFixed(1)}%），累计回款率 ${(Number(summary.paymentRate) || 0).toFixed(1)}%，未回款 ${formatWan(summary.unreceived)}。`,
    '',
    '分项目情况：',
    ...projects.map(
      (p) => `- ${p.name || '-'}：报量 ${formatWan(p.monthIncome)}，工人工资 ${formatWan(p.monthLaborSalaryCost)}（实发 ${formatWan(p.monthSalaryPaid)}），班组结算 ${formatWan(p.monthTeamSettlementCost)}`,
    ),
    '',
    '各工种工资：',
    ...Object.entries(summary.tradeWages || {})
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([type, amount]) => `- ${type}：${formatWan(Number(amount))}`),
    '',
    '成本异常说明：（待补充）',
    '对上下游变化：（待补充）',
    '下月需注意事项：（待补充）',
  ];
  return lines.join('\n');
}

export function MonthlyReportWorkflowBar({
  month,
  projectId,
  expanded: expandedProp,
  onExpandedChange,
  summary,
}: {
  month: string;
  projectId: string;
  expanded?: boolean;
  onExpandedChange?: (value: boolean) => void;
  summary?: WorkflowSummary;
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedState, setExpandedState] = useState(false);
  const expanded = expandedProp ?? expandedState;
  const setExpanded = (value: boolean) => {
    setExpandedState(value);
    onExpandedChange?.(value);
  };
  const [content, setContent] = useState<WorkflowContent>({});
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number>(0);
  const [owners, setOwners] = useState<{
    fill?: string | null;
    manager?: string | null;
    fillId?: number | null;
    managerId?: number | null;
  }>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const json = await res.json();
        const user = json?.user || json?.data;
        setPermissions(Array.isArray(user?.permissions) ? user.permissions : []);
        setIsSuperAdmin(user?.role === 'super_admin');
        setCurrentUserId(Number(user?.id) || 0);
      } catch {
        // 权限加载失败按无权限处理（后端仍会二次校验）
      }
    })();
  }, []);

  const loadWorkflow = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (projectId && projectId !== 'all') params.set('projectId', projectId);
      const res = await fetch(`/api/reports/monthly/workflow?${params.toString()}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '月报审批状态加载失败');
      const row = (json?.data?.workflow || null) as Workflow | null;
      setWorkflow(row);
      setContent(row?.content || {});
      setOwners({
        fill: (json?.data?.fill_owner_name as string | null | undefined) ?? null,
        manager: (json?.data?.manager_owner_name as string | null | undefined) ?? null,
        fillId: (json?.data?.fill_owner_id as number | null | undefined) ?? null,
        managerId: (json?.data?.manager_owner_id as number | null | undefined) ?? null,
      });
    } catch (error) {
      // 表未迁移/未配置时不阻断月报查看
      console.warn('[MonthlyReportWorkflowBar] load failed:', error);
      setWorkflow(null);
    } finally {
      setLoading(false);
    }
  }, [month, projectId]);

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  const status = workflow?.status || 'draft';
  const meta = STATUS_META[status] || STATUS_META.draft;
  const canFill = isSuperAdmin || permissions.includes('monthly_report:fill');
  const canSupplement = isSuperAdmin || permissions.includes('monthly_report:supplement');
  const canApprove = isSuperAdmin || permissions.includes('monthly_report:approve');
  // 按项目负责人限制按钮：未配置负责人时不限制；配置了则只有本人（或超管）可见操作
  const canFillThisProject = isSuperAdmin || !owners.fillId || currentUserId === owners.fillId;
  const canSupplementThisProject = isSuperAdmin || !owners.managerId || currentUserId === owners.managerId;

  const editable = ['draft', 'rejected'].includes(status)
    ? canFill
    : status === 'pending_manager' && canSupplement;

  async function postAction(action: string, extra?: { content?: WorkflowContent; reason?: string }) {
    setSaving(true);
    try {
      const res = await fetch('/api/reports/monthly/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ month, projectId: projectId === 'all' ? undefined : projectId, action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '操作失败');
      const row = (json?.data?.workflow || null) as Workflow | null;
      setWorkflow(row);
      setContent(row?.content || {});
      setShowReject(false);
      setRejectReason('');
      const messages: Record<string, string> = {
        save: '已保存草稿',
        submit_manager: '已提交项目经理补充',
        supplement: '已补充提交，待老板审批',
        approve: '审批通过，月报已锁定',
        reject: '已驳回，退回预算员修改',
      };
      toast.success(messages[action] || '操作成功');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setSaving(false);
    }
  }

  const statusHint = status === 'pending_boss' || status === 'pending_manager'
    ? '当前只能由对应角色操作'
    : status === 'approved'
      ? '月报已审批锁定，如需修改请先驳回'
      : '';

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 md:px-4">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">月报审批</span>
        <span className={`rounded-md px-2 py-0.5 text-xs ${meta.className}`}>{meta.label}</span>
        {workflow?.fill_user && <span className="text-xs text-muted-foreground">填写：{workflow.fill_user}</span>}
        {workflow?.manager_user && <span className="text-xs text-muted-foreground">补充：{workflow.manager_user}</span>}
        {workflow?.approved_by && <span className="text-xs text-muted-foreground">审批：{workflow.approved_by}</span>}
        {workflow?.approved_at && <span className="text-xs text-muted-foreground">{formatTime(workflow.approved_at)}</span>}
        {owners.fill && <span className="text-xs text-muted-foreground">预算员：{owners.fill}</span>}
        {owners.manager && <span className="text-xs text-muted-foreground">项目经理：{owners.manager}</span>}
        {statusHint && <span className="text-xs text-muted-foreground">{statusHint}</span>}
        {workflow?.reject_reason && status === 'rejected' && (
          <span className="text-xs text-red-600">驳回原因：{workflow.reject_reason}</span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
                <PenLine className="mr-1 h-3.5 w-3.5" />
                {expanded ? '收起填写' : '填写/查看内容'}
                {expanded ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
              </Button>
              {['draft', 'rejected'].includes(status) && canFill && canFillThisProject && (
                <Button size="sm" variant="outline" disabled={saving} onClick={() => void postAction('save', { content })}>
                  {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}保存草稿
                </Button>
              )}
              {['draft', 'rejected'].includes(status) && canFill && canFillThisProject && (
                <Button size="sm" disabled={saving} onClick={() => void postAction('submit_manager', { content })}>
                  <Send className="mr-1 h-3.5 w-3.5" />提交项目经理
                </Button>
              )}
              {status === 'pending_manager' && canSupplement && canSupplementThisProject && (
                <Button size="sm" disabled={saving} onClick={() => void postAction('supplement', { content })}>
                  <Send className="mr-1 h-3.5 w-3.5" />补充完成，提交老板
                </Button>
              )}
              {status === 'pending_boss' && canApprove && (
                <>
                  <Button size="sm" disabled={saving} onClick={() => void postAction('approve')}>
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />审批通过
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600" disabled={saving} onClick={() => setShowReject((value) => !value)}>
                    <X className="mr-1 h-3.5 w-3.5" />驳回
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showReject && (
        <div className="border-t px-3 py-2.5 md:px-4">
          <Textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            rows={2}
            placeholder="请填写驳回原因（预算员据此修改后重新提交）"
            className="text-sm"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowReject(false)}>取消</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={saving} onClick={() => void postAction('reject', { reason: rejectReason })}>
              确认驳回
            </Button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="grid gap-3 border-t px-3 py-3 md:grid-cols-2 md:px-4">
          {CONTENT_FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{field.label}</span>
              <Textarea
                value={content[field.key] || ''}
                onChange={(event) => setContent((prev) => ({ ...prev, [field.key]: event.target.value }))}
                rows={3}
                placeholder={editable ? field.placeholder : '（无）'}
                disabled={!editable}
                className="text-sm"
              />
            </label>
          ))}
          {editable && summary && (
            <div className="md:col-span-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setContent((prev) => ({ ...prev, analysis: buildDraft(summary) }))}
              >
                带出本月数据
              </Button>
              <span className="ml-2 text-xs text-muted-foreground">将本月报量、工资、班组结算填入经营分析框，再补充说明</span>
            </div>
          )}
          {!editable && (
            <p className="text-xs text-muted-foreground md:col-span-2">当前状态不可编辑，需流转到对应角色后填写。</p>
          )}
        </div>
      )}
    </div>
  );
}
