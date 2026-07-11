import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { pushBusinessNotification } from '@/lib/business-notification';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type WorkflowState = 'draft' | 'manager_review' | 'budget_confirm' | 'boss_review' | 'completed';
type WorkflowAction = 'submit_to_manager' | 'manager_review' | 'budget_confirm' | 'boss_approve';

const STATE_TAGS: Record<WorkflowState, string> = {
  draft: '状态:草稿',
  manager_review: '状态:待项目经理补充',
  budget_confirm: '状态:待预算确认',
  boss_review: '状态:待老板批复',
  completed: '状态:已完成',
};

const ACTION_CONFIG: Record<WorkflowAction, {
  from: WorkflowState;
  to: WorkflowState;
  actor: 'budget' | 'project_manager' | 'boss';
  commentTitle: string;
  notificationTitle: string;
  notifyTo: string;
}> = {
  submit_to_manager: {
    from: 'draft',
    to: 'manager_review',
    actor: 'budget',
    commentTitle: '预算员提交意见',
    notificationTitle: '月度分析已提交项目经理补充',
    notifyTo: '项目经理',
  },
  manager_review: {
    from: 'manager_review',
    to: 'budget_confirm',
    actor: 'project_manager',
    commentTitle: '项目经理补充意见',
    notificationTitle: '月度分析已由项目经理补充',
    notifyTo: '预算员/管理员',
  },
  budget_confirm: {
    from: 'budget_confirm',
    to: 'boss_review',
    actor: 'budget',
    commentTitle: '预算确认意见',
    notificationTitle: '月度分析已提交老板批复',
    notifyTo: '老板',
  },
  boss_approve: {
    from: 'boss_review',
    to: 'completed',
    actor: 'boss',
    commentTitle: '老板批复意见',
    notificationTitle: '月度分析已批复完成',
    notifyTo: '预算员/管理员、项目经理',
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

function updateStateTag(tags: string[], nextState: WorkflowState): string[] {
  return [...tags.filter(tag => !tag.startsWith('状态:')), STATE_TAGS[nextState]];
}

function canAct(role: string | undefined, actor: 'budget' | 'project_manager' | 'boss') {
  if (actor === 'budget') return role === 'admin' || role === 'super_admin';
  if (actor === 'project_manager') return role === 'project_manager';
  return role === 'boss';
}

function appendComment(content: string, title: string, comment: string, username: string) {
  const trimmed = comment.trim();
  if (!trimmed) return content;

  const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
  const prefix = content.includes('## 审批流程意见') ? '' : '\n\n## 审批流程意见\n';
  return `${content || ''}${prefix}\n### ${title}\n- ${timestamp} ${username}：${trimmed}\n`;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const role = String(user?.role || '');
    const username = user?.name || user?.username || '当前用户';
    const body = await request.json();
    const knowledgeId = body.knowledgeId;
    const action = body.action as WorkflowAction;
    const comment = typeof body.comment === 'string' ? body.comment : '';

    if (!knowledgeId || !action || !ACTION_CONFIG[action]) {
      return NextResponse.json({ success: false, error: '缺少有效的 knowledgeId 或 action' }, { status: 400 });
    }

    const config = ACTION_CONFIG[action];
    if (!canAct(role, config.actor)) {
      return NextResponse.json({ success: false, error: '当前角色无权执行该审批操作' }, { status: 403 });
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
    if (currentState !== config.from) {
      return NextResponse.json({
        success: false,
        error: `当前状态为 ${STATE_TAGS[currentState]}，不能执行该操作`,
      }, { status: 400 });
    }

    const nextTags = updateStateTag(tags, config.to);
    const nextContent = appendComment(doc.content || '', config.commentTitle, comment, username);

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
      title: config.notificationTitle,
      content: `《${doc.title}》状态已更新为「${STATE_TAGS[config.to].replace('状态:', '')}」。本步骤通知对象：${config.notifyTo}。${comment.trim() ? `意见：${comment.trim()}` : ''}`,
      severity: config.to === 'completed' ? 'info' : 'warning',
      relatedId: Number(knowledgeId),
      relatedType: 'ai_knowledge_docs',
      metadata: {
        knowledgeId,
        action,
        from: currentState,
        to: config.to,
        notifyTo: config.notifyTo,
        operatorRole: role,
        operatorName: username,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || '月度分析审批流处理失败' }, { status: 500 });
  }
}
