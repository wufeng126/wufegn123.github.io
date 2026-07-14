import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { pushBusinessNotification } from '@/lib/business-notification';
import { getUserDisplayName } from '@/lib/user-display-name';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type WorkflowState = 'draft' | 'manager_review' | 'budget_confirm' | 'boss_review' | 'completed';
type ForwardWorkflowAction = 'submit_to_manager' | 'manager_review' | 'budget_confirm' | 'boss_approve';
type WorkflowAction = ForwardWorkflowAction | 'withdraw';
type ActorRole = 'budget' | 'project_manager' | 'boss';
type SupabaseClient = ReturnType<typeof getSupabaseClient>;

type WorkflowUser = {
  id: number;
  username?: string | null;
  name?: string | null;
  dingtalk_name?: string | null;
  role?: string | null;
  is_disabled?: boolean | null;
  roles: Array<{ id?: number; name?: string | null; code?: string | null; level?: number | null }>;
};

const STATE_TAGS: Record<WorkflowState, string> = {
  draft: '状态:草稿',
  manager_review: '状态:待项目经理补充',
  budget_confirm: '状态:待预算确认',
  boss_review: '状态:待老板批复',
  completed: '状态:已完成',
};

const WORKFLOW_TAG_PREFIXES = [
  '发起预算员ID:',
  '发起预算员:',
  '项目经理ID:',
  '项目经理:',
  '老板ID:',
  '老板:',
  '当前负责人ID:',
  '当前负责人:',
];

const ACTION_CONFIG: Record<ForwardWorkflowAction, {
  from: WorkflowState;
  to: WorkflowState;
  actor: ActorRole;
  commentTitle: string;
  notificationTitle: string;
}> = {
  submit_to_manager: {
    from: 'draft',
    to: 'manager_review',
    actor: 'budget',
    commentTitle: '预算员提交意见',
    notificationTitle: '月度分析已提交项目经理补充',
  },
  manager_review: {
    from: 'manager_review',
    to: 'budget_confirm',
    actor: 'project_manager',
    commentTitle: '项目经理补充意见',
    notificationTitle: '月度分析已由项目经理补充',
  },
  budget_confirm: {
    from: 'budget_confirm',
    to: 'boss_review',
    actor: 'budget',
    commentTitle: '预算确认意见',
    notificationTitle: '月度分析已提交老板批复',
  },
  boss_approve: {
    from: 'boss_review',
    to: 'completed',
    actor: 'boss',
    commentTitle: '老板批复意见',
    notificationTitle: '月度分析已批复完成',
  },
};

function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.filter(Boolean).map(String);
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {
      return tags.split(',').map(tag => tag.trim()).filter(Boolean);
    }
  }
  return [];
}

function getStateFromTags(tags: string[]): WorkflowState {
  const stateTag = tags.find(tag => tag.startsWith('状态:'));
  const matched = (Object.entries(STATE_TAGS).find(([, label]) => label === stateTag)?.[0] || 'draft') as WorkflowState;
  return matched;
}

function getWorkflowTagValue(tags: string[], prefix: string) {
  const tag = tags.find(item => item.startsWith(prefix));
  return tag ? tag.slice(prefix.length).trim() : '';
}

function updateWorkflowTags(tags: string[], nextState: WorkflowState, values: Record<string, string | number | null | undefined>) {
  const nextTags = tags.filter(tag => !tag.startsWith('状态:') && !WORKFLOW_TAG_PREFIXES.some(prefix => tag.startsWith(prefix)));
  nextTags.push(STATE_TAGS[nextState]);

  WORKFLOW_TAG_PREFIXES.forEach(prefix => {
    const key = prefix.slice(0, -1);
    const value = values[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      nextTags.push(`${prefix}${String(value).trim()}`);
    }
  });

  return Array.from(new Set(nextTags));
}

function getProjectIdFromSourceRef(sourceRef?: string | null) {
  const match = String(sourceRef || '').match(/^monthly:(\d+):\d{4}-\d{2}$/);
  return match ? Number(match[1]) : undefined;
}

function canAct(role: string | undefined, actor: ActorRole) {
  if (role === 'super_admin') return true;
  if (actor === 'budget') return role === 'admin';
  if (actor === 'project_manager') return role === 'project_manager';
  return role === 'boss';
}

function isAssignedUser(tags: string[], userId?: number | string | null) {
  const currentOwnerId = getWorkflowTagValue(tags, '当前负责人ID:');
  if (!currentOwnerId) return true;
  return Boolean(userId && String(currentOwnerId) === String(userId));
}

function hasRole(user: WorkflowUser, role: ActorRole) {
  if (user.role === 'super_admin') return true;
  if (role === 'budget' && (user.role === 'admin' || user.role === 'super_admin')) return true;
  if (user.role === role) return true;

  return user.roles.some(item => {
    const code = String(item.code || '').toLowerCase();
    const name = String(item.name || '');
    if (role === 'budget') return ['admin', 'budget', 'budget_manager'].includes(code) || name.includes('预算');
    if (role === 'project_manager') return code === 'project_manager' || name.includes('项目经理');
    return code === 'boss' || name.includes('老板') || name.includes('总经理');
  });
}

async function getWorkflowUser(client: SupabaseClient, userId: number): Promise<WorkflowUser | null> {
  const { data: user, error } = await client
    .from('users')
    .select('id,username,name,dingtalk_name,role,is_disabled')
    .eq('id', userId)
    .single();

  if (error || !user) return null;

  const { data: userRoles } = await client
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId);

  const roleIds = Array.from(new Set((userRoles || []).map((item: { role_id?: number }) => item.role_id).filter(Boolean)));
  let roles: WorkflowUser['roles'] = [];

  if (roleIds.length > 0) {
    const { data: roleRows } = await client
      .from('roles')
      .select('id,name,code,level')
      .in('id', roleIds);
    roles = roleRows || [];
  }

  return { ...(user as Omit<WorkflowUser, 'roles'>), roles };
}

function appendComment(content: string, title: string, comment: string, username: string) {
  const trimmed = comment.trim();
  if (!trimmed) return content;

  const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
  const prefix = content.includes('## 审批流程意见') ? '' : '\n\n## 审批流程意见\n';
  return `${content || ''}${prefix}\n### ${title}\n- ${timestamp} ${username}：${trimmed}\n`;
}

async function markWorkflowNotificationsHandled(client: SupabaseClient, knowledgeId: number) {
  const result = await client
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('type', 'monthly_analysis_workflow')
    .eq('related_id', knowledgeId)
    .eq('related_type', 'ai_knowledge_docs')
    .eq('is_read', false);

  if (result.error) {
    const message = String(result.error.message || '');
    if (!message.includes('recipient_user_id') && !message.includes('read_at')) {
      console.error('[Monthly workflow] mark notification handled failed:', result.error);
    }
  }
}

async function resolveNextAssignee(params: {
  client: SupabaseClient;
  action: ForwardWorkflowAction;
  targetUserId?: number;
  tags: string[];
}) {
  const { client, action, targetUserId, tags } = params;

  if (action === 'submit_to_manager') {
    if (!targetUserId) throw new Error('请选择项目经理后再提交');
    const manager = await getWorkflowUser(client, targetUserId);
    if (!manager || manager.is_disabled) throw new Error('所选项目经理不存在或已禁用');
    if (!hasRole(manager, 'project_manager')) throw new Error('所选负责人不是项目经理角色');
    return { user: manager, role: 'project_manager' as ActorRole };
  }

  if (action === 'manager_review') {
    const initiatorId = Number(getWorkflowTagValue(tags, '发起预算员ID:'));
    if (!initiatorId) throw new Error('缺少发起预算员信息，无法自动返回');
    const budgetUser = await getWorkflowUser(client, initiatorId);
    if (!budgetUser || budgetUser.is_disabled) throw new Error('发起预算员不存在或已禁用');
    return { user: budgetUser, role: 'budget' as ActorRole };
  }

  if (action === 'budget_confirm') {
    if (!targetUserId) throw new Error('请选择老板后再提交');
    const boss = await getWorkflowUser(client, targetUserId);
    if (!boss || boss.is_disabled) throw new Error('所选老板不存在或已禁用');
    if (!hasRole(boss, 'boss')) throw new Error('所选负责人不是老板角色');
    return { user: boss, role: 'boss' as ActorRole };
  }

  const initiatorId = Number(getWorkflowTagValue(tags, '发起预算员ID:'));
  if (!initiatorId) return null;
  const budgetUser = await getWorkflowUser(client, initiatorId);
  if (!budgetUser || budgetUser.is_disabled) return null;
  return { user: budgetUser, role: 'budget' as ActorRole };
}

function buildWorkflowTagValues(params: {
  tags: string[];
  action: ForwardWorkflowAction | 'withdraw';
  operatorId: number;
  operatorName: string;
  assignee?: WorkflowUser | null;
}) {
  const { tags, action, operatorId, operatorName, assignee } = params;
  const currentValues: Record<string, string | number> = {};

  WORKFLOW_TAG_PREFIXES.forEach(prefix => {
    const key = prefix.slice(0, -1);
    const value = getWorkflowTagValue(tags, prefix);
    if (value) currentValues[key] = value;
  });

  if (action === 'submit_to_manager') {
    currentValues['发起预算员ID'] = operatorId;
    currentValues['发起预算员'] = operatorName;
  }

  if (action === 'submit_to_manager' && assignee) {
    currentValues['项目经理ID'] = assignee.id;
    currentValues['项目经理'] = getUserDisplayName(assignee, assignee.username || '');
  }

  if (action === 'budget_confirm' && assignee) {
    currentValues['老板ID'] = assignee.id;
    currentValues['老板'] = getUserDisplayName(assignee, assignee.username || '');
  }

  if (action === 'boss_approve') {
    delete currentValues['当前负责人ID'];
    delete currentValues['当前负责人'];
    return currentValues;
  }

  if (action === 'withdraw') {
    currentValues['当前负责人ID'] = operatorId;
    currentValues['当前负责人'] = operatorName;
    return currentValues;
  }

  if (assignee) {
    currentValues['当前负责人ID'] = assignee.id;
    currentValues['当前负责人'] = getUserDisplayName(assignee, assignee.username || '');
  }

  return currentValues;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const role = String(user?.role || '');
    const userId = Number(user?.id);
    const username = getUserDisplayName(user, user?.username || '当前用户');
    const body = await request.json();
    const knowledgeId = Number(body.knowledgeId);
    const action = body.action as WorkflowAction;
    const comment = typeof body.comment === 'string' ? body.comment : '';
    const targetUserId = body.targetUserId || body.approverId ? Number(body.targetUserId || body.approverId) : undefined;

    if (!knowledgeId || !action || (action !== 'withdraw' && !ACTION_CONFIG[action])) {
      return NextResponse.json({ success: false, error: '缺少有效的 knowledgeId 或 action' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data: doc, error: fetchError } = await supabase
      .from('ai_knowledge_docs')
      .select('*')
      .eq('id', knowledgeId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ success: false, error: fetchError?.message || '知识文档不存在' }, { status: 404 });
    }

    const tags = normalizeTags(doc.tags);
    const currentState = getStateFromTags(tags);
    const projectId = getProjectIdFromSourceRef(doc.source_ref);

    if (action === 'withdraw') {
      if (currentState === 'draft' || currentState === 'completed') {
        return NextResponse.json({ success: false, error: '当前状态不能撤回' }, { status: 400 });
      }

      const canWithdraw = role === 'admin' || role === 'super_admin' || Number(doc.created_by) === userId;
      if (!canWithdraw) {
        return NextResponse.json({ success: false, error: '当前角色无权撤回该月度分析' }, { status: 403 });
      }

      const nextTagValues = buildWorkflowTagValues({ tags, action, operatorId: userId, operatorName: username });
      const nextTags = updateWorkflowTags(tags, 'draft', nextTagValues);
      const nextContent = appendComment(doc.content || '', '撤回说明', comment || '撤回到草稿重新修改', username);

      await markWorkflowNotificationsHandled(supabase, knowledgeId);

      const { data: updated, error: updateError } = await supabase
        .from('ai_knowledge_docs')
        .update({
          tags: nextTags,
          content: nextContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', knowledgeId)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
      }

      await pushBusinessNotification({
        type: 'monthly_analysis_workflow',
        title: '月度分析已撤回',
        content: `《${doc.title}》已撤回到「草稿」。${comment.trim() ? `说明：${comment.trim()}` : ''}`,
        severity: 'warning',
        projectId,
        relatedId: knowledgeId,
        relatedType: 'ai_knowledge_docs',
        recipientUserIds: [userId],
        metadata: {
          knowledgeId,
          action,
          from: currentState,
          to: 'draft',
          operatorRole: role,
          operatorName: username,
          targetUserIds: [userId],
          targetNames: [username],
          dingtalkDeferred: true,
        },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    const config = ACTION_CONFIG[action];
    if (!canAct(role, config.actor)) {
      return NextResponse.json({ success: false, error: '当前角色无权执行该审批操作' }, { status: 403 });
    }
    if (currentState !== config.from) {
      return NextResponse.json({
        success: false,
        error: `当前状态为 ${STATE_TAGS[currentState]}，不能执行该操作`,
      }, { status: 400 });
    }
    if (currentState !== 'draft' && role !== 'super_admin' && !isAssignedUser(tags, userId)) {
      return NextResponse.json({ success: false, error: '当前月度分析不属于你的待办' }, { status: 403 });
    }

    const nextAssignee = await resolveNextAssignee({ client: supabase, action, targetUserId, tags });
    const nextTagValues = buildWorkflowTagValues({
      tags,
      action,
      operatorId: userId,
      operatorName: username,
      assignee: nextAssignee?.user || null,
    });
    const nextTags = updateWorkflowTags(tags, config.to, nextTagValues);
    const nextContent = appendComment(doc.content || '', config.commentTitle, comment, username);

    await markWorkflowNotificationsHandled(supabase, knowledgeId);

    const { data: updated, error: updateError } = await supabase
      .from('ai_knowledge_docs')
      .update({
        tags: nextTags,
        content: nextContent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', knowledgeId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    const recipientUser = nextAssignee?.user || null;
    const recipientName = recipientUser ? getUserDisplayName(recipientUser, recipientUser.username || '') : '';

    if (recipientUser) {
      await pushBusinessNotification({
        type: 'monthly_analysis_workflow',
        title: config.notificationTitle,
        content: `《${doc.title}》状态已更新为「${STATE_TAGS[config.to].replace('状态:', '')}」，请${recipientName}处理。${comment.trim() ? `意见：${comment.trim()}` : ''}`,
        severity: config.to === 'completed' ? 'info' : 'warning',
        projectId,
        relatedId: knowledgeId,
        relatedType: 'ai_knowledge_docs',
        recipientUserIds: [recipientUser.id],
        recipientRole: nextAssignee?.role,
        metadata: {
          knowledgeId,
          action,
          from: currentState,
          to: config.to,
          operatorRole: role,
          operatorName: username,
          targetUserIds: [recipientUser.id],
          targetNames: [recipientName],
          dingtalkDeferred: true,
        },
      });
    }

    if (config.to === 'completed') {
      const currentTags = normalizeTags(updated?.tags);
      if (!currentTags.includes('成本分析')) {
        await supabase
          .from('ai_knowledge_docs')
          .update({ tags: [...currentTags, '成本分析'] })
          .eq('id', knowledgeId);
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : '月度分析审批流处理失败',
    }, { status: 500 });
  }
}
