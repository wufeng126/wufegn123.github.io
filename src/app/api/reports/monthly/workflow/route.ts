import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireAuth, requirePermission } from '@/lib/api-auth';
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiSuccess,
  getErrorMessage,
} from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { pushBusinessNotification } from '@/lib/business-notification';

/**
 * 月度报表协作审批
 * 流程：draft（预算员填写）→ pending_manager（项目经理补充）→ pending_boss（老板完善+审批）
 *      → approved（通过，锁定归档）/ rejected（驳回，退回预算员修改）
 *
 * GET  /api/reports/monthly/workflow?month=YYYY-MM&projectId=all|123
 * POST /api/reports/monthly/workflow
 *   body: { month, projectId?, action: 'save' | 'submit_manager' | 'supplement' | 'approve' | 'reject', content?, reason? }
 *   权限：save/submit_manager → monthly_report:fill；supplement → monthly_report:supplement；
 *        approve/reject → monthly_report:approve（老板/超管）
 */

type WorkflowStatus = 'draft' | 'pending_manager' | 'pending_boss' | 'approved' | 'rejected';

type WorkflowRow = {
  id?: number;
  year_month: string;
  project_scope: string;
  status: WorkflowStatus;
  content?: Record<string, unknown> | null;
  fill_user?: string | null;
  manager_user?: string | null;
  approved_by?: string | null;
  submitted_manager_at?: string | null;
  submitted_boss_at?: string | null;
  approved_at?: string | null;
  reject_reason?: string | null;
  created_by?: number | null;
  updated_at?: string | null;
};

function normalizeMonth(value: unknown): string | null {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : null;
}

function normalizeScope(projectId: unknown): string {
  if (projectId === undefined || projectId === null || projectId === '' || projectId === 'all') return 'all';
  const id = Number(projectId);
  return Number.isInteger(id) && id > 0 ? String(id) : 'all';
}

function isMissingTableError(error: { message?: string; code?: string } | null): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('schema cache')
  );
}

async function loadWorkflow(client: ReturnType<typeof getSupabaseClient>, month: string, scope: string) {
  const { data, error } = await client
    .from('monthly_report_workflows')
    .select('*')
    .eq('year_month', month)
    .eq('project_scope', scope)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { workflow: null, needsMigration: true };
    throw new Error(error.message);
  }
  return { workflow: (data as WorkflowRow) || null, needsMigration: false };
}

async function assertScopeAccess(
  client: ReturnType<typeof getSupabaseClient>,
  user: Parameters<typeof getAccessibleProjectIds>[1],
  scope: string,
): Promise<boolean> {
  if (scope === 'all') return true;
  const projectId = Number(scope);
  if (!Number.isInteger(projectId) || projectId <= 0) return false;
  const accessible = await getAccessibleProjectIds(client, user);
  // null = 超管无限制
  if (accessible === null) return true;
  return accessible.includes(projectId);
}

function contentIsEmpty(content: Record<string, unknown> | null | undefined): boolean {
  if (!content) return true;
  return !['analysis', 'risk', 'nextPlan', 'remark'].some((key) => String(content[key] || '').trim() !== '');
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const month = normalizeMonth(request.nextUrl.searchParams.get('month'));
    if (!month) return apiBadRequest('请提供正确的月份（YYYY-MM）');

    const scope = normalizeScope(request.nextUrl.searchParams.get('projectId'));
    const client = getSupabaseClient();
    if (!(await assertScopeAccess(client, auth.user, scope))) {
      return apiForbidden('无权查看该项目月报');
    }

    const { workflow, needsMigration } = await loadWorkflow(client, month, scope);
    return apiSuccess({ workflow, needs_migration: needsMigration });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '月报审批状态加载失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const month = normalizeMonth(body?.month);
    const action = String(body?.action || '');
    const reason = body?.reason ? String(body.reason).trim() : '';
    const content = body?.content && typeof body.content === 'object'
      ? {
          analysis: String(body.content.analysis || '').slice(0, 5000),
          risk: String(body.content.risk || '').slice(0, 5000),
          nextPlan: String(body.content.nextPlan || '').slice(0, 5000),
          remark: String(body.content.remark || '').slice(0, 2000),
        }
      : null;

    if (!month) return apiBadRequest('请提供正确的月份（YYYY-MM）');
    if (!['save', 'submit_manager', 'supplement', 'approve', 'reject'].includes(action)) {
      return apiBadRequest('不支持的操作');
    }

    const permission = action === 'supplement'
      ? 'monthly_report:supplement'
      : action === 'approve' || action === 'reject'
        ? 'monthly_report:approve'
        : 'monthly_report:fill';
    const auth = await requirePermission(request, permission);
    if (!auth.ok) return auth.response;

    const scope = normalizeScope(body?.projectId);
    const client = getSupabaseClient();
    if (!(await assertScopeAccess(client, auth.user, scope))) {
      return apiForbidden('无权操作该项目月报');
    }

    const { workflow, needsMigration } = await loadWorkflow(client, month, scope);
    if (needsMigration) {
      return apiBadRequest('月报审批表尚未创建，请先执行迁移 add_monthly_report_workflow.sql');
    }

    const currentStatus = (workflow?.status || 'draft') as WorkflowStatus;
    const now = new Date().toISOString();
    const operatorName = auth.user.name || auth.user.username || 'system';

    // 状态流转校验
    if (action === 'save' && !['draft', 'rejected'].includes(currentStatus)) {
      return apiBadRequest('只有草稿或已驳回状态可以修改');
    }
    if (action === 'submit_manager' && !['draft', 'rejected'].includes(currentStatus)) {
      return apiBadRequest('当前状态不能提交（仅草稿/已驳回可提交）');
    }
    if (action === 'supplement' && currentStatus !== 'pending_manager') {
      return apiBadRequest('只有待项目经理补充状态可以补充提交');
    }
    if (action === 'approve' && currentStatus !== 'pending_boss') {
      return apiBadRequest('只有待老板审批状态可以审批');
    }
    if (action === 'reject' && !['pending_manager', 'pending_boss'].includes(currentStatus)) {
      return apiBadRequest('只有待补充/待审批状态可以驳回');
    }
    if (action === 'reject' && !reason) {
      return apiBadRequest('请填写驳回原因');
    }
    if (action === 'supplement' && content && contentIsEmpty(content)) {
      return apiBadRequest('请填写补充内容后再提交');
    }

    // 组装更新数据
    const patch: Record<string, unknown> = {
      year_month: month,
      project_scope: scope,
      updated_at: now,
    };
    if (content) patch.content = content;

    if (action === 'save') {
      patch.status = 'draft';
      patch.fill_user = operatorName;
      patch.created_by = auth.user.id;
    } else if (action === 'submit_manager') {
      patch.status = 'pending_manager';
      patch.fill_user = operatorName;
      patch.created_by = auth.user.id;
      patch.submitted_manager_at = now;
      patch.reject_reason = null;
    } else if (action === 'supplement') {
      patch.status = 'pending_boss';
      patch.manager_user = operatorName;
      patch.submitted_boss_at = now;
    } else if (action === 'approve') {
      patch.status = 'approved';
      patch.approved_by = operatorName;
      patch.approved_at = now;
    } else {
      patch.status = 'rejected';
      patch.reject_reason = reason;
      patch.approved_by = operatorName;
    }

    const { data: saved, error: saveError } = await client
      .from('monthly_report_workflows')
      .upsert(patch, { onConflict: 'year_month,project_scope' })
      .select('*')
      .maybeSingle();
    if (saveError) throw new Error(saveError.message);

    // 流转通知（系统通知 + 钉钉；失败不阻断主流程）
    try {
      const scopeLabel = scope === 'all' ? '全公司' : `项目 #${scope}`;
      if (action === 'submit_manager') {
        await pushBusinessNotification({
          type: 'monthly_report_fill',
          title: `月度报表待补充：${month}（${scopeLabel}）`,
          content: `${operatorName} 已完成 ${month} 月报填写，请项目经理补充后提交老板审批。`,
          severity: 'warning',
          projectId: scope === 'all' ? undefined : Number(scope),
          relatedId: Number(saved?.id) || undefined,
          relatedType: 'monthly_report',
          recipientRole: 'project_manager',
          metadata: {
            消息分类: '月报协作',
            业务摘要: `${month} 月报待项目经理补充`,
            建议动作: '打开月报补充经营分析/风险说明/下月计划',
            处理入口: `/reports/monthly?month=${month}${scope !== 'all' ? `&projectId=${scope}` : ''}`,
          },
        });
      } else if (action === 'supplement') {
        const { data: bosses } = await client
          .from('users')
          .select('id')
          .eq('role', 'super_admin')
          .eq('is_disabled', false);
        const bossIds = (bosses || []).map((row: { id?: unknown }) => Number(row.id)).filter(Boolean);
        await pushBusinessNotification({
          type: 'monthly_report_approval',
          title: `月度报表待审批：${month}（${scopeLabel}）`,
          content: `项目经理已完成补充，请老板完善并审批 ${month} 月报。`,
          severity: 'warning',
          projectId: scope === 'all' ? undefined : Number(scope),
          relatedId: Number(saved?.id) || undefined,
          relatedType: 'monthly_report',
          recipientUserIds: bossIds.length > 0 ? bossIds : undefined,
          metadata: {
            消息分类: '月报协作',
            业务摘要: `${month} 月报待老板审批`,
            建议动作: '打开月报完善后审批',
            处理入口: `/reports/monthly?month=${month}${scope !== 'all' ? `&projectId=${scope}` : ''}`,
          },
        });
      } else if (action === 'approve' || action === 'reject') {
        const creatorId = Number(workflow?.created_by);
        await pushBusinessNotification({
          type: action === 'approve' ? 'monthly_report_approved' : 'monthly_report_rejected',
          title: `月度报表${action === 'approve' ? '已审批通过' : '被驳回'}：${month}（${scopeLabel}）`,
          content: action === 'approve'
            ? `${month} 月报已审批通过并锁定归档。`
            : `${month} 月报被驳回：${reason}`,
          severity: action === 'approve' ? 'info' : 'warning',
          projectId: scope === 'all' ? undefined : Number(scope),
          relatedId: Number(saved?.id) || undefined,
          relatedType: 'monthly_report',
          recipientUserIds: creatorId > 0 ? [creatorId] : undefined,
          metadata: {
            消息分类: '月报协作',
            业务摘要: action === 'approve' ? '审批通过' : `驳回：${reason}`,
            建议动作: action === 'approve' ? '查看月报' : '修改后重新提交',
            处理入口: `/reports/monthly?month=${month}${scope !== 'all' ? `&projectId=${scope}` : ''}`,
          },
        });
      }
    } catch (notifyError) {
      console.error('[monthly-report-workflow] 通知发送失败:', notifyError);
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'monthly_report',
      resourceId: Number(saved?.id) || 0,
      details: {
        action,
        month,
        project_scope: scope,
        from_status: currentStatus,
        to_status: patch.status,
        reason: reason || undefined,
      },
      request,
    });

    return apiSuccess({ workflow: saved });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '月报审批操作失败'));
  }
}
