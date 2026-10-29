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

export function MonthlyReportWorkflowBar({ month, projectId }: { month: string; projectId: string }) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<WorkflowContent>({});
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const json = await res.json();
        const user = json?.user || json?.data;
        setPermissions(Array.isArray(user?.permissions) ? user.permissions : []);
        setIsSuperAdmin(user?.role === 'super_admin');
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
        {statusHint && <span className="text-xs text-muted-foreground">{statusHint}</span>}
        {workflow?.reject_reason && status === 'rejected' && (
          <span className="text-xs text-red-600">驳回原因：{workflow.reject_reason}</span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
                <PenLine className="mr-1 h-3.5 w-3.5" />
                {expanded ? '收起填写' : '填写/查看内容'}
                {expanded ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
              </Button>
              {['draft', 'rejected'].includes(status) && canFill && (
                <Button size="sm" variant="outline" disabled={saving} onClick={() => void postAction('save', { content })}>
                  {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}保存草稿
                </Button>
              )}
              {['draft', 'rejected'].includes(status) && canFill && (
                <Button size="sm" disabled={saving} onClick={() => void postAction('submit_manager', { content })}>
                  <Send className="mr-1 h-3.5 w-3.5" />提交项目经理
                </Button>
              )}
              {status === 'pending_manager' && canSupplement && (
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
          {!editable && (
            <p className="text-xs text-muted-foreground md:col-span-2">当前状态不可编辑，需流转到对应角色后填写。</p>
          )}
        </div>
      )}
    </div>
  );
}
