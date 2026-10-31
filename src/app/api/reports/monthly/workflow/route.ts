import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { hasPermission, requireAuth, requirePermission } from '@/lib/api-auth';
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
import { addKnowledgeDoc } from '@/lib/ai-service';

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
  if (scope === 'all') {
    // 全公司月报仅超管/老板可访问与操作（避免单项目预算员改写全公司月报）
    return Boolean(user.is_super_admin) || user.role === 'boss';
  }
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

    // 月报内容与审批流转信息需要月报查看权限（避免任意登录用户读取）
    if (!hasPermission(auth.user, 'reports:monthly_view')) {
      return apiForbidden('无权查看月报');
    }

    const month = normalizeMonth(request.nextUrl.searchParams.get('month'));
    if (!month) return apiBadRequest('请提供正确的月份（YYYY-MM）');

    const scope = normalizeScope(request.nextUrl.searchParams.get('projectId'));
    const client = getSupabaseClient();
    if (!(await assertScopeAccess(client, auth.user, scope))) {
      return apiForbidden('无权查看该项目月报');
    }

    const { workflow, needsMigration } = await loadWorkflow(client, month, scope);

    // 项目负责人（预算员/项目经理）：按项目配置带出，便于确认审批人
    let fillOwnerName: string | null = null;
    let managerOwnerName: string | null = null;
    let fillOwnerId: number | null = null;
    let managerOwnerId: number | null = null;
    if (scope !== 'all') {
      const { data: projRow } = await client
        .from('projects')
        .select('budget_user_id, manager_user_id')
        .eq('id', Number(scope))
        .maybeSingle();
      const budgetUserId = Number(projRow?.budget_user_id) || 0;
      const managerUserId = Number(projRow?.manager_user_id) || 0;
      const ownerIds = [budgetUserId, managerUserId].filter(Boolean);
      if (ownerIds.length > 0) {
        const { data: ownerRows } = await client
          .from('users')
          .select('id, name, username')
          .in('id', ownerIds);
        const nameById = new Map(
          (ownerRows || []).map((u: { id?: unknown; name?: unknown; username?: unknown }) => [
            Number(u.id),
            String(u.name || u.username || ''),
          ]),
        );
        fillOwnerName = nameById.get(budgetUserId) || null;
        managerOwnerName = nameById.get(managerUserId) || null;
        fillOwnerId = budgetUserId || null;
        managerOwnerId = managerUserId || null;
      }
    }

    return apiSuccess({
      workflow,
      needs_migration: needsMigration,
      fill_owner_name: fillOwnerName,
      manager_owner_name: managerOwnerName,
      fill_owner_id: fillOwnerId,
      manager_owner_id: managerOwnerId,
    });
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
          managerSupplement: String(body.content.managerSupplement || '').slice(0, 5000),
          bossSupplement: String(body.content.bossSupplement || '').slice(0, 5000),
        }
      : null;
    const managerApproverId = Number(body?.managerApproverId) || 0;
    const managerApproverName = String(body?.managerApproverName || '').trim().slice(0, 100);
    const bossApproverId = Number(body?.bossApproverId) || 0;
    const bossApproverName = String(body?.bossApproverName || '').trim().slice(0, 100);

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
    const existingContent = (workflow?.content || {}) as Record<string, unknown>;
    const isSuperOrBoss = Boolean(auth.user.is_super_admin) || auth.user.role === 'boss';
    const designatedManagerApproverId = Number(existingContent.managerApproverId) || 0;
    const designatedBossApproverId = Number(existingContent.bossApproverId) || 0;

    // 提交时必须选择下一级审批人（每级提交时选）
    if (action === 'submit_manager' && !managerApproverId) {
      return apiBadRequest('请选择项目经理作为下一级审批人');
    }
    if (action === 'supplement' && !bossApproverId) {
      return apiBadRequest('请选择老板作为下一级审批人');
    }
    // 不允许指定自己为审批人
    if (action === 'submit_manager' && managerApproverId === Number(auth.user.id)) {
      return apiBadRequest('项目经理审批人不能选自己');
    }
    if (action === 'supplement' && bossApproverId === Number(auth.user.id)) {
      return apiBadRequest('老板审批人不能选自己');
    }
    // 只有被指定的审批人（或超管/老板）才能处理对应环节
    if (action === 'supplement' && designatedManagerApproverId > 0
      && Number(auth.user.id) !== designatedManagerApproverId && !isSuperOrBoss) {
      return apiForbidden('你不是本流程指定的项目经理，无法补充');
    }
    if ((action === 'approve' || action === 'reject') && designatedBossApproverId > 0
      && Number(auth.user.id) !== designatedBossApproverId && !isSuperOrBoss) {
      return apiForbidden('你不是本流程指定的审批人，无法审批');
    }

    // 状态流转校验
    if (action === 'save' && !['draft', 'rejected'].includes(currentStatus)) {
      return apiBadRequest('只有草稿或已驳回状态可以修改');
    }
    if (action === 'submit_manager' && !['draft', 'rejected'].includes(currentStatus)) {
      return apiBadRequest('当前状态不能提交（仅草稿/已驳回可提交）');
    }
    // 提交项目经理前必须填写经营分析（写分析是审批流程的起点）
    if (action === 'submit_manager') {
      const analysisText = String(content?.analysis || (workflow?.content as Record<string, unknown> | null | undefined)?.analysis || '').trim();
      if (!analysisText) {
        return apiBadRequest('请先填写经营分析再提交');
      }
    }

    // 按项目指定负责人校验：只有该项目预算员可提交、项目经理可补充（超管/老板例外）
    if ((action === 'submit_manager' || action === 'supplement') && scope !== 'all') {
      const { data: ownerRow } = await client
        .from('projects')
        .select('budget_user_id, manager_user_id')
        .eq('id', Number(scope))
        .maybeSingle();
      const isSuper = Boolean(auth.user.is_super_admin) || auth.user.role === 'boss';
      if (action === 'submit_manager') {
        const budgetUserId = Number(ownerRow?.budget_user_id) || 0;
        if (budgetUserId > 0 && Number(auth.user.id) !== budgetUserId && !isSuper) {
          return apiForbidden('只有该项目指定的预算员可以提交月报');
        }
      } else {
        const managerUserId = Number(ownerRow?.manager_user_id) || 0;
        if (managerUserId > 0 && Number(auth.user.id) !== managerUserId && !isSuper) {
          return apiForbidden('只有该项目指定的项目经理可以补充提交');
        }
      }
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
    // 项目经理补充必须填写补充内容（不能直接跳过）
    if (action === 'supplement') {
      const managerText = String(content?.managerSupplement || '').trim();
      if (!managerText) {
        return apiBadRequest('请填写项目经理补充内容后再提交');
      }
    }

    // 内容合并：预算员保存覆盖自己的部分；项目经理/老板只补自己那部分，不覆盖已有内容
    let mergedContent: Record<string, unknown> | null = null;
    if (content) {
      if (action === 'save' || action === 'submit_manager') {
        mergedContent = { ...existingContent, ...content };
      } else {
        mergedContent = { ...existingContent };
        for (const [key, value] of Object.entries(content)) {
          if (String(value || '').trim()) mergedContent[key] = value;
        }
      }
    }
    // 记录每一级提交时指定的下一级审批人
    if (action === 'submit_manager') {
      mergedContent = {
        ...(mergedContent || existingContent),
        managerApproverId,
        managerApproverName: managerApproverName || '',
      };
    }
    if (action === 'supplement' && bossApproverId > 0) {
      mergedContent = {
        ...(mergedContent || existingContent),
        bossApproverId,
        bossApproverName: bossApproverName || '',
      };
    }
    // 驳回后清空指定审批人：重新提交时由预算员/项目经理重新选择
    if (action === 'reject') {
      mergedContent = {
        ...(mergedContent || existingContent),
        managerApproverId: 0,
        managerApproverName: '',
        bossApproverId: 0,
        bossApproverName: '',
      };
    }

    // 组装更新数据
    const patch: Record<string, unknown> = {
      year_month: month,
      project_scope: scope,
      updated_at: now,
    };
    if (mergedContent) patch.content = mergedContent;

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

    // 提交后通知下一级审批人（站内 + 钉钉个人工作通知）
    const notifyApproverId =
      action === 'submit_manager' ? managerApproverId : action === 'supplement' ? bossApproverId : 0;
    const notifyApproverName =
      action === 'submit_manager' ? managerApproverName : action === 'supplement' ? bossApproverName : '';
    if (notifyApproverId > 0) {
      try {
        const { pushBusinessNotification } = await import('@/lib/business-notification');
        const scopeLabel = scope === 'all' ? '全公司' : `项目 #${scope}`;
        const stageLabel = action === 'submit_manager' ? '项目经理补充' : '老板审批';
        const href = `/reports/monthly/fill?month=${encodeURIComponent(month)}${scope !== 'all' ? `&projectId=${encodeURIComponent(scope)}` : ''}`;
        await pushBusinessNotification({
          type: 'monthly_report_approval',
          title: `${month} 月报待你${stageLabel}`,
          content: `${operatorName} 已提交 ${scopeLabel} ${month} 月报，请作为${stageLabel}人处理。`,
          severity: 'info',
          relatedId: Number(saved?.id) || undefined,
          relatedType: 'monthly_report',
          recipientUserIds: [notifyApproverId],
          metadata: {
            业务摘要: `${month} ${scopeLabel} 月报待${stageLabel}`,
            责任人: notifyApproverName || '',
            建议动作: '去处理',
            处理入口: href,
          },
        });
      } catch (notifyError) {
        console.error('[MonthlyWorkflow] 通知审批人失败:', notifyError);
      }
    }

    // 审批结果 → 定向通知月报提交人（通过/驳回都通知本人）
    if (action === 'approve' || action === 'reject') {
      const submitterId = Number((workflow as { created_by?: number } | null)?.created_by) || 0;
      if (submitterId > 0) {
        try {
          const { pushBusinessNotification } = await import('@/lib/business-notification');
          const scopeLabel = scope === 'all' ? '全公司' : `项目 #${scope}`;
          const href = `/reports/monthly/fill?month=${encodeURIComponent(month)}${scope !== 'all' ? `&projectId=${encodeURIComponent(scope)}` : ''}`;
          await pushBusinessNotification({
            type: 'monthly_report_result',
            title: `${month} 月报${action === 'approve' ? '已通过' : '被驳回'}`,
            content: action === 'approve'
              ? `${scopeLabel} ${month} 月报已审批通过并归档。`
              : `${scopeLabel} ${month} 月报被驳回：${reason || '请查看驳回原因'}`,
            severity: action === 'approve' ? 'info' : 'warning',
            relatedId: Number(saved?.id) || undefined,
            relatedType: 'monthly_report',
            recipientUserIds: [submitterId],
            metadata: {
              业务摘要: action === 'approve' ? '月报审批通过' : `驳回：${reason || ''}`,
              建议动作: action === 'approve' ? '查看月报' : '修改后重新提交',
              处理入口: href,
            },
          });
        } catch (notifyError) {
          console.error('[MonthlyWorkflow] 通知提交人失败:', notifyError);
        }
      }
    }
    // 审批通过 → 经营分析沉淀进知识库（幂等：同月同范围只保留一条）
    if (action === 'approve') {
      const approvedContent = (saved?.content || workflow?.content || content || {}) as Record<string, string>;
      const analysisText = String(approvedContent.analysis || '').trim();
      if (analysisText) {
        const kbTitle = `${month} 月度经营分析`;
        const kbContent = [
          `${kbTitle}（${scope === 'all' ? '全公司' : `项目 #${scope}`}）`,
          '',
          analysisText,
          String(approvedContent.risk || '').trim() ? `\n存在问题与风险：\n${String(approvedContent.risk).trim()}` : '',
          String(approvedContent.nextPlan || '').trim() ? `\n下月计划：\n${String(approvedContent.nextPlan).trim()}` : '',
          String(approvedContent.managerSupplement || '').trim() ? `\n项目经理补充：\n${String(approvedContent.managerSupplement).trim()}` : '',
          String(approvedContent.bossSupplement || '').trim() ? `\n老板意见：\n${String(approvedContent.bossSupplement).trim()}` : '',
        ].filter(Boolean).join('\n');
        const sourceRef = `monthly_report:${month}:${scope}`;
        try {
          const { data: existingDoc } = await client
            .from('ai_knowledge_docs')
            .select('id')
            .eq('source_ref', sourceRef)
            .maybeSingle();
          if (existingDoc) {
            await client
              .from('ai_knowledge_docs')
              .update({ title: kbTitle, content: kbContent, updated_at: now })
              .eq('id', existingDoc.id);
          } else {
            const kbSuccess = await addKnowledgeDoc(kbTitle, kbContent);
            await client.from('ai_knowledge_docs').insert({
              title: kbTitle,
              category: 'business_data',
              source_type: 'monthly_report',
              source_ref: sourceRef,
              content: kbContent,
              tags: ['月度经营分析'],
              status: kbSuccess ? 'active' : 'error',
              error_message: kbSuccess ? null : '向量库同步失败',
              chunk_count: kbSuccess ? 1 : 0,
              last_sync_at: kbSuccess ? new Date().toISOString() : null,
            });
          }
        } catch (kbError) {
          console.error('[monthly-workflow] 审批通过后沉淀知识库失败:', kbError);
        }
      }
    }

    // 流转通知（系统通知 + 钉钉；失败不阻断主流程）
    try {
      const scopeLabel = scope === 'all' ? '全公司' : `项目 #${scope}`;
      if (action === 'submit_manager') {
        // 按项目匹配项目经理（项目上指定的 manager_user_id）；全公司月报回退到项目经理角色
        let managerUserId: number | undefined;
        if (scope !== 'all') {
          const { data: projRow } = await client
            .from('projects')
            .select('manager_user_id')
            .eq('id', Number(scope))
            .maybeSingle();
          managerUserId = Number(projRow?.manager_user_id) || undefined;
        }
        await pushBusinessNotification({
          type: 'monthly_report_fill',
          title: `月度报表待补充：${month}（${scopeLabel}）`,
          content: `${operatorName} 已完成 ${month} 月报填写，请项目经理补充后提交老板审批。`,
          severity: 'warning',
          projectId: scope === 'all' ? undefined : Number(scope),
          relatedId: Number(saved?.id) || undefined,
          relatedType: 'monthly_report',
          recipientUserIds: managerUserId ? [managerUserId] : undefined,
          recipientRole: managerUserId ? undefined : 'project_manager',
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
