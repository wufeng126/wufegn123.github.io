import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { detectConstructionLogRisk, getRiskWorkflowStatusFromTags } from '@/lib/construction-log-risk';
import { normalizeKnowledgeTags } from '@/lib/knowledge-taxonomy';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type TodoKey = 'constructionLogsPending' | 'monthlyReportsPending' | 'visasPending' | 'knowledgePending';

type TodoItem = {
  key: TodoKey;
  label: string;
  desc: string;
  action: string;
  count: number;
  unit: string;
  href: string;
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
  related_id?: number | null;
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

function hasProjectAccess(projectId: unknown, accessibleProjectIds: number[] | null) {
  if (accessibleProjectIds === null) return true;
  return accessibleProjectIds.includes(Number(projectId));
}

function getLogIdFromSourceRef(sourceRef?: string | null) {
  const match = String(sourceRef || '').match(/^cl:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function getProjectIdFromMonthlySourceRef(sourceRef?: string | null) {
  const match = String(sourceRef || '').match(/^monthly:(\d+):\d{4}-\d{2}$/);
  return match ? Number(match[1]) : null;
}

function isRoleActionableKnowledge(tags: string[], role: string, isSuperAdmin: boolean) {
  if (!tags.includes('月度分析')) return false;

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
  if (!tags.includes('月度分析')) return false;

  const ownerId = getWorkflowTagValue(tags, '当前负责人ID:');
  if (ownerId) return String(userId) === ownerId || isSuperAdmin;

  return isRoleActionableKnowledge(tags, role, isSuperAdmin);
}

function isMissingRecipientColumn(error: unknown) {
  const err = error as { message?: string; details?: string } | null;
  const message = String(err?.message || err?.details || '');
  return message.includes('recipient_user_id') || message.includes('recipient_role');
}

async function countPendingConstructionLogRiskDocs(client: SupabaseClient, accessibleProjectIds: number[] | null) {
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

  const sourceRefs = riskLogs.map((log) => `cl:${log.id}`);
  const { data: docs, error: docError } = await client
    .from('ai_knowledge_docs')
    .select('source_ref,tags')
    .eq('source_type', 'construction_log')
    .eq('status', 'active')
    .in('source_ref', sourceRefs);

  if (docError) throw new Error(docError.message);

  const docsByLogId = new Map<number, KnowledgeDocRow>();
  ((docs || []) as KnowledgeDocRow[]).forEach((doc) => {
    const logId = getLogIdFromSourceRef(doc.source_ref);
    if (logId) docsByLogId.set(logId, doc);
  });

  return riskLogs.filter((log) => {
    const doc = docsByLogId.get(Number(log.id));
    const workflowStatus = getRiskWorkflowStatusFromTags(normalizeKnowledgeTags(doc?.tags));
    return workflowStatus === 'pending';
  }).length;
}

async function countPendingConstructionLogRisks(
  client: SupabaseClient,
  accessibleProjectIds: number[] | null,
  userId: number,
  isSuperAdmin: boolean
) {
  let query = client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'construction_log_alert')
    .eq('is_read', false);

  if (!isSuperAdmin) {
    query = query.eq('recipient_user_id', userId);
  }

  if (Array.isArray(accessibleProjectIds)) {
    if (accessibleProjectIds.length === 0) return 0;
    query = query.in('project_id', accessibleProjectIds);
  }

  const { count, error } = await query;
  if (error && isMissingRecipientColumn(error)) {
    return countPendingConstructionLogRiskDocs(client, accessibleProjectIds);
  }
  if (error) throw new Error(error.message);
  return count || 0;
}

async function countPendingMonthlyReports(client: SupabaseClient, accessibleProjectIds: number[] | null, currentMonth: string) {
  if (Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) return 0;

  let projectsQuery = client
    .from('projects')
    .select('id,name,status')
    .eq('status', '进行中');

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

function isMissingVisaWorkflowColumn(error: unknown) {
  const err = error as { message?: string; details?: string } | null;
  const message = String(err?.message || err?.details || '');
  return message.includes('current_responsible_user_id') || message.includes('workflow_step_updated_at');
}

async function countPendingVisas(
  client: SupabaseClient,
  accessibleProjectIds: number[] | null,
  userId: number,
  isSuperAdmin: boolean
) {
  if (Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) return 0;

  let query = client
    .from('visas')
    .select('id', { count: 'exact', head: true })
    .in('status', ['已提交', '已签字', '待预算员确认']);

  if (!isSuperAdmin) {
    query = query.eq('current_responsible_user_id', userId);
  }

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
    .select('related_id,metadata')
    .eq('type', 'monthly_analysis_workflow')
    .eq('related_type', 'ai_knowledge_docs')
    .eq('recipient_user_id', userId)
    .eq('is_read', false)
    .limit(1000);

  if (error && isMissingRecipientColumn(error)) {
    return countPendingKnowledgeByDocs(client, accessibleProjectIds, role, isSuperAdmin, userId);
  }
  if (error) throw new Error(error.message);

  const notificationRows = (notifications || []) as NotificationRow[];
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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    const currentMonth = getCurrentYearMonth();

    const [
      constructionLogsPending,
      monthlyReportsPending,
      visasPending,
      knowledgePending,
    ] = await Promise.all([
      countPendingConstructionLogRisks(client, accessibleProjectIds, auth.user.id, auth.user.is_super_admin),
      countPendingMonthlyReports(client, accessibleProjectIds, currentMonth),
      countPendingVisas(client, accessibleProjectIds, auth.user.id, auth.user.is_super_admin),
      countPendingKnowledge(client, accessibleProjectIds, auth.user.role, auth.user.is_super_admin, auth.user.id),
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
      },
      {
        key: 'monthlyReportsPending',
        label: '月报待填报',
        desc: '当前权限项目中，本月还没有完成月度分析沉淀',
        action: '去填报',
        count: monthlyReportsPending,
        unit: '项',
        href: '/reports/monthly?todo=pending',
      },
      {
        key: 'visasPending',
        label: '签证待办理',
        desc: '当前需要你推进或确认的签证流程',
        action: '去办理',
        count: visasPending,
        unit: '个',
        href: '/visas?todo=mine',
      },
      {
        key: 'knowledgePending',
        label: '知识待整理',
        desc: '月度分析和经验沉淀流程中，需要你处理的内容',
        action: '去整理',
        count: knowledgePending,
        unit: '条',
        href: '/knowledge?status=pending',
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
