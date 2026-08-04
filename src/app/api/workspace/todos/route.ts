import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getTodoProjectIds } from '@/lib/api-project-access';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { detectConstructionLogRisk } from '@/lib/construction-log-risk';
import { normalizeKnowledgeTags } from '@/lib/knowledge-taxonomy';
import { getNotificationRulesByTodoKey, type WorkbenchTodoKey } from '@/lib/notification-routing';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type TodoKey = WorkbenchTodoKey;

type TodoItem = {
  key: TodoKey;
  label: string;
  desc: string;
  action: string;
  count: number;
  unit: string;
  href: string;
  notificationTypes?: string[];
  dingtalkChannels?: string[];
};

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

type ConstructionLogRow = {
  id: number;
  project_id?: number | null;
  content?: string | null;
  issues?: string | null;
};

type KnowledgeDocRow = {
  id?: number;
  source_ref?: string | null;
  tags?: string[] | string | null;
};

type NotificationRow = {
  id?: number;
  related_id?: number | null;
  project_id?: number | null;
  is_read?: boolean | string | null;
  metadata?: { knowledgeId?: number | string } | null;
};

type ProjectRow = {
  id: number;
  name?: string | null;
  status?: string | null;
};

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isMonthlyReportCreatorRole(role?: string | null) {
  const value = String(role || '').trim().toLowerCase();
  return (
    value === 'admin' ||
    value === 'budget' ||
    value === 'estimator' ||
    value.includes('budget') ||
    value.includes('cost') ||
    value.includes('预算') ||
    value.includes('造价') ||
    value.includes('经营')
  );
}

function hasProjectAccess(projectId: unknown, accessibleProjectIds: number[] | null) {
  if (accessibleProjectIds === null) return true;
  return accessibleProjectIds.includes(Number(projectId));
}

function getProjectIdFromMonthlySourceRef(sourceRef?: string | null) {
  const match = String(sourceRef || '').match(/^monthly:(\d+):\d{4}-\d{2}$/);
  return match ? Number(match[1]) : null;
}

function isRoleActionableKnowledge(tags: string[], role: string, isSuperAdmin: boolean) {
  if (tags.includes('月度分析')) return false;

  const state = tags.find(tag => tag.startsWith('状态:'))?.replace('状态:', '');
  const isAdmin = isSuperAdmin || role === 'admin' || role === 'super_admin';

  if (state === '草稿' && isAdmin) return true;
  if (state === '待项目经理补充' && role === 'project_manager') return true;
  if (state === '待预算确认' && isAdmin) return true;
  if (state === '待老板批复' && role === 'boss') return true;
  return false;
}

function getWorkflowTagValue(tags: string[], prefix: string) {
  const tag = tags.find(item => item.startsWith(prefix));
  return tag ? tag.slice(prefix.length).trim() : '';
}

function isUserActionableKnowledge(tags: string[], role: string, isSuperAdmin: boolean, userId: number) {
  if (tags.includes('月度分析')) return false;

  const ownerId = getWorkflowTagValue(tags, '当前负责人ID:');
  if (ownerId) return String(userId) === ownerId;

  return isRoleActionableKnowledge(tags, role, isSuperAdmin);
}

function isMissingRecipientColumn(error: unknown) {
  const err = error as { message?: string; details?: string } | null;
  const message = String(err?.message || err?.details || '');
  return message.includes('recipient_user_id') || message.includes('recipient_role');
}

function isUnread(value: unknown) {
  return value === false || value === 'false' || value === 0 || value === '0' || value === null || value === undefined;
}

async function countWithFallback(label: string, countFn: () => Promise<number>) {
  try {
    return await countFn();
  } catch (error) {
    console.error(`[workspace-todos] ${label} failed`, error);
    return 0;
  }
}

async function countPendingConstructionLogRiskLogs(client: SupabaseClient, accessibleProjectIds: number[] | null) {
  if (Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) return 0;

  let logsQuery = client
    .from('construction_logs')
    .select('id,project_id,content,issues')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (Array.isArray(accessibleProjectIds)) {
    logsQuery = logsQuery.in('project_id', accessibleProjectIds);
  }

  const { data: logs, error: logError } = await logsQuery;
  if (logError) throw new Error(logError.message);

  const riskLogs = ((logs || []) as ConstructionLogRow[]).filter((log) =>
    detectConstructionLogRisk({ content: log.content, issues: log.issues }).hasRisk
  );
  if (riskLogs.length === 0) return 0;

  return riskLogs.length;
}

async function countUnreadNotificationsForTodo(
  client: SupabaseClient,
  todoKey: WorkbenchTodoKey,
  accessibleProjectIds: number[] | null,
  userId: number,
): Promise<number | null> {
  const notificationTypes = getNotificationRulesByTodoKey(todoKey).map((rule) => rule.type);
  if (notificationTypes.length === 0) return 0;
  if (Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) return 0;

  let query = client
    .from('notifications')
    .select('id,project_id,is_read')
    .in('type', notificationTypes)
    .eq('recipient_user_id', userId);

  if (Array.isArray(accessibleProjectIds)) {
    query = query.or(`project_id.is.null,project_id.in.(${accessibleProjectIds.join(',')})`);
  }

  const { data, error } = await query.limit(1000);
  if (error && isMissingRecipientColumn(error)) return null;
  if (error) throw new Error(error.message);

  return ((data || []) as NotificationRow[]).filter((item) => isUnread(item.is_read)).length;
}

async function countPendingConstructionLogRisks(
  client: SupabaseClient,
  accessibleProjectIds: number[] | null,
  userId: number
) {
  const routedCount = await countUnreadNotificationsForTodo(client, 'constructionLogsPending', accessibleProjectIds, userId);
  if (routedCount !== null) return routedCount;

  let query = client
    .from('notifications')
    .select('id,project_id,is_read')
    .eq('type', 'construction_log_alert')
    .eq('recipient_user_id', userId);

  if (Array.isArray(accessibleProjectIds)) {
    if (accessibleProjectIds.length === 0) return 0;
    query = query.in('project_id', accessibleProjectIds);
  }

  const { data, error } = await query.limit(1000);
  if (error && isMissingRecipientColumn(error)) {
    return countPendingConstructionLogRiskLogs(client, accessibleProjectIds);
  }
  if (error) throw new Error(error.message);
  return ((data || []) as NotificationRow[]).filter((item) => isUnread(item.is_read)).length;
}

async function countMissingMonthlyReports(client: SupabaseClient, accessibleProjectIds: number[] | null, currentMonth: string) {
  if (Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) return 0;

  let projectsQuery = client
    .from('projects')
    .select('id,name,status')
    .in('status', ['进行中', '在建']);

  if (Array.isArray(accessibleProjectIds)) {
    projectsQuery = projectsQuery.in('id', accessibleProjectIds);
  }

  const { data: projects, error: projectError } = await projectsQuery;
  if (projectError) throw new Error(projectError.message);
  if (!projects?.length) return 0;

  const projectRows = (projects || []) as ProjectRow[];
  const monthlyRefs = projectRows.map((project) => `monthly:${project.id}:${currentMonth}`);
  const { data: docs, error: docError } = await client
    .from('ai_knowledge_docs')
    .select('source_ref')
    .eq('status', 'active')
    .in('source_ref', monthlyRefs);

  if (docError) throw new Error(docError.message);

  const existingRefs = new Set(((docs || []) as KnowledgeDocRow[]).map((doc) => doc.source_ref));
  return projectRows.filter((project) => !existingRefs.has(`monthly:${project.id}:${currentMonth}`)).length;
}

async function countPendingMonthlyReports(
  client: SupabaseClient,
  accessibleProjectIds: number[] | null,
  currentMonth: string,
  role: string,
  userId: number,
) {
  const workflowCount = await countUnreadNotificationsForTodo(client, 'monthlyReportsPending', accessibleProjectIds, userId);
  const pendingWorkflowCount = workflowCount || 0;

  if (!isMonthlyReportCreatorRole(role)) {
    return pendingWorkflowCount;
  }

  const missingReportCount = await countMissingMonthlyReports(client, accessibleProjectIds, currentMonth);
  return missingReportCount + pendingWorkflowCount;
}

function isMissingVisaWorkflowColumn(error: unknown) {
  const err = error as { message?: string; details?: string } | null;
  const message = String(err?.message || err?.details || '');
  return message.includes('current_responsible_user_id') || message.includes('workflow_step_updated_at');
}

async function countPendingVisas(
  client: SupabaseClient,
  accessibleProjectIds: number[] | null,
  userId: number
) {
  if (Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) return 0;

  let query = client
    .from('visas')
    .select('id', { count: 'exact', head: true })
    .in('status', ['已提交', '已签字', '待预算员确认']);

  query = query.eq('current_responsible_user_id', userId);

  if (Array.isArray(accessibleProjectIds)) {
    query = query.in('project_id', accessibleProjectIds);
  }

  const { count, error } = await query;
  if (error && isMissingVisaWorkflowColumn(error)) {
    let legacyQuery = client
      .from('visas')
      .select('id', { count: 'exact', head: true })
      .eq('status', '待办理');

    if (Array.isArray(accessibleProjectIds)) {
      legacyQuery = legacyQuery.in('project_id', accessibleProjectIds);
    }

    const legacyResult = await legacyQuery;
    if (legacyResult.error) throw new Error(legacyResult.error.message);
    return legacyResult.count || 0;
  }
  if (error) throw new Error(error.message);
  return count || 0;
}

async function countPendingKnowledgeByDocs(
  client: SupabaseClient,
  accessibleProjectIds: number[] | null,
  role: string,
  isSuperAdmin: boolean,
  userId: number
) {
  const { data, error } = await client
    .from('ai_knowledge_docs')
    .select('id,source_ref,tags')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (error) throw new Error(error.message);

  return ((data || []) as KnowledgeDocRow[]).filter((doc) => {
    const tags = normalizeKnowledgeTags(doc.tags);
    if (!isUserActionableKnowledge(tags, role, isSuperAdmin, userId)) return false;

    const projectId = getProjectIdFromMonthlySourceRef(doc.source_ref);
    if (projectId && !hasProjectAccess(projectId, accessibleProjectIds)) return false;
    return true;
  }).length;
}

async function countPendingKnowledge(
  client: SupabaseClient,
  accessibleProjectIds: number[] | null,
  role: string,
  isSuperAdmin: boolean,
  userId: number
) {
  const { data: notifications, error } = await client
    .from('notifications')
    .select('related_id,metadata,is_read')
    .neq('type', 'monthly_analysis_workflow')
    .eq('related_type', 'ai_knowledge_docs')
    .eq('recipient_user_id', userId)
    .limit(1000);

  if (error && isMissingRecipientColumn(error)) {
    return countPendingKnowledgeByDocs(client, accessibleProjectIds, role, isSuperAdmin, userId);
  }
  if (error) throw new Error(error.message);

  const notificationRows = ((notifications || []) as NotificationRow[]).filter((item) => isUnread(item.is_read));
  const knowledgeIds = Array.from(new Set(notificationRows
    .map((item) => Number(item.related_id || item.metadata?.knowledgeId))
    .filter(Boolean)));

  if (knowledgeIds.length > 0) {
    const { data: docs, error: docError } = await client
      .from('ai_knowledge_docs')
      .select('id,source_ref,tags')
      .in('id', knowledgeIds);

    if (docError) throw new Error(docError.message);

    const accessibleIds = new Set(
      ((docs || []) as KnowledgeDocRow[])
        .filter((doc) => {
          const tags = normalizeKnowledgeTags(doc.tags);
          if (!isUserActionableKnowledge(tags, role, isSuperAdmin, userId)) return false;
          const projectId = getProjectIdFromMonthlySourceRef(doc.source_ref);
          return !projectId || hasProjectAccess(projectId, accessibleProjectIds);
        })
        .map((doc) => Number(doc.id))
        .filter(Boolean)
    );

    return knowledgeIds.filter((id) => accessibleIds.has(id)).length;
  }

  return countPendingKnowledgeByDocs(client, accessibleProjectIds, role, isSuperAdmin, userId);
}

function buildTodoMeta(key: WorkbenchTodoKey) {
  const rules = getNotificationRulesByTodoKey(key);
  return {
    notificationTypes: rules.map((rule) => rule.type),
    dingtalkChannels: Array.from(new Set(rules.map((rule) => rule.channelLabel))),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const accessibleProjectIds = await getTodoProjectIds(client, auth.user);
    const currentMonth = getCurrentYearMonth();

    const [
      constructionLogsPending,
      monthlyReportsPending,
      visasPending,
      knowledgePending,
      businessNotificationsPending,
    ] = await Promise.all([
      countWithFallback('construction log risks', () => countPendingConstructionLogRisks(client, accessibleProjectIds, auth.user.id)),
      countWithFallback('monthly reports', () =>
        countPendingMonthlyReports(client, accessibleProjectIds, currentMonth, auth.user.role, auth.user.id)
      ),
      countWithFallback('visas', () => countPendingVisas(client, accessibleProjectIds, auth.user.id)),
      countWithFallback('knowledge', () => countPendingKnowledge(client, accessibleProjectIds, auth.user.role, auth.user.is_super_admin, auth.user.id)),
      countWithFallback('business notifications', async () =>
        (await countUnreadNotificationsForTodo(client, 'businessNotificationsPending', accessibleProjectIds, auth.user.id)) || 0
      ),
    ]);

    const items: TodoItem[] = [
      {
        key: 'constructionLogsPending',
        label: '施工日志待确认',
        desc: '照片识别或日志风险已生成，需要人工核对确认',
        action: '去确认',
        count: constructionLogsPending,
        unit: '条',
        href: '/construction-logs?tab=risks&status=pending',
        ...buildTodoMeta('constructionLogsPending'),
      },
      {
        key: 'monthlyReportsPending',
        label: '月度分析待处理',
        desc: '预算员看到待填报项目；项目经理和老板只看到流转到自己名下的确认事项',
        action: '去处理',
        count: monthlyReportsPending,
        unit: '项',
        href: '/reports/monthly?todo=pending',
        ...buildTodoMeta('monthlyReportsPending'),
      },
      {
        key: 'visasPending',
        label: '签证待办理',
        desc: '当前需要你推进或确认的签证流程',
        action: '去办理',
        count: visasPending,
        unit: '个',
        href: '/visas?todo=mine',
        ...buildTodoMeta('visasPending'),
      },
      {
        key: 'knowledgePending',
        label: '知识待整理',
        desc: '月度分析和经验沉淀流程中，需要你处理的内容',
        action: '去整理',
        count: knowledgePending,
        unit: '条',
        href: '/knowledge?status=pending',
        ...buildTodoMeta('knowledgePending'),
      },
      {
        key: 'businessNotificationsPending',
        label: '经营消息待查看',
        desc: '供应商结算、付款、回款、工资等与经营数据相关的自动提醒',
        action: '去查看',
        count: businessNotificationsPending,
        unit: '条',
        href: '/notifications',
        ...buildTodoMeta('businessNotificationsPending'),
      },
    ];

    return apiSuccess({
      total: items.reduce((sum, item) => sum + item.count, 0),
      items,
      scope: {
        projectIds: accessibleProjectIds,
        currentMonth,
      },
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '工作台待办统计失败'));
  }
}
