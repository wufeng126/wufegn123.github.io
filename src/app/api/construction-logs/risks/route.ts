import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { detectConstructionLogRisk, loadConstructionRiskEvents } from '@/lib/construction-log-risk';
import { getConstructionLogAccessibleProjectIds } from '@/lib/public-log-project';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type NotificationRow = {
  related_id?: number | null;
  is_read?: boolean | string | number | null;
  recipient_user_id?: number | null;
};

function emptyStats() {
  return {
    total: 0,
    pending: 0,
    confirmed: 0,
    visaCreated: 0,
    monthly: 0,
    monthlyIncluded: 0,
    resolved: 0,
    ignored: 0,
  };
}

function isUnread(value: unknown) {
  return value === false || value === 'false' || value === 0 || value === '0' || value === null || value === undefined;
}

function isMissingRecipientColumn(error: unknown) {
  const err = error as { message?: string; details?: string } | null;
  const message = String(err?.message || err?.details || '');
  return message.includes('recipient_user_id');
}

async function loadRiskNotifications(supabase: ReturnType<typeof getSupabaseClient>, logIds: number[], userId: number) {
  if (logIds.length === 0) return new Map<number, NotificationRow[]>();

  let result: {
    data: NotificationRow[] | null;
    error: { message: string; details?: string } | null;
  } = await supabase
    .from('notifications')
    .select('related_id,is_read,recipient_user_id')
    .eq('type', 'construction_log_alert')
    .eq('related_type', 'construction_log')
    .in('related_id', logIds);

  if (result.error && isMissingRecipientColumn(result.error)) {
    result = await supabase
      .from('notifications')
      .select('related_id,is_read')
      .eq('type', 'construction_log_alert')
      .eq('related_type', 'construction_log')
      .in('related_id', logIds);
  }

  if (result.error) throw new Error(result.error.message);

  const map = new Map<number, NotificationRow[]>();
  ((result.data || []) as NotificationRow[]).forEach((row) => {
    const logId = Number(row.related_id);
    if (!logId) return;
    if (row.recipient_user_id && Number(row.recipient_user_id) !== Number(userId)) return;
    const rows = map.get(logId) || [];
    rows.push(row);
    map.set(logId, rows);
  });
  return map;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status') || 'all';
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '100', 10), 300);
    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);

    let query = supabase
      .from('construction_logs')
      .select('*')
      .neq('status', 'pending')
      .neq('status', 'cancelled')
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(pageSize);

    if (projectId && projectId !== 'all') {
      const parsedProjectId = parseInt(projectId, 10);
      if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(parsedProjectId)) {
        return apiSuccess([], { meta: { stats: emptyStats() } });
      }
      query = query.eq('project_id', parsedProjectId);
    } else if (Array.isArray(accessibleProjectIds)) {
      if (accessibleProjectIds.length === 0) {
        return apiSuccess([], { meta: { stats: emptyStats() } });
      }
      query = query.in('project_id', accessibleProjectIds);
    }

    const [{ data: logs, error: logError }, { data: projects }] = await Promise.all([
      query,
      supabase.from('projects').select('id,name'),
    ]);

    if (logError) throw new Error(logError.message);

    const riskRows = (logs || [])
      .map((log: any) => {
        const risk = detectConstructionLogRisk({ content: log.content, issues: log.issues });
        return risk.hasRisk ? { log, risk } : null;
      })
      .filter(Boolean) as Array<{ log: any; risk: ReturnType<typeof detectConstructionLogRisk> }>;

    const notificationsByLogId = await loadRiskNotifications(
      supabase,
      riskRows.map((item) => Number(item.log.id)).filter(Boolean),
      Number(auth.user.id),
    );

    // 风险事件流：优先使用事件表的状态（支持 pending/confirmed/ignored/resolved 等完整状态机）
    const riskEvents = await loadConstructionRiskEvents(
      supabase,
      Array.isArray(accessibleProjectIds)
        ? { projectIds: accessibleProjectIds }
        : { projectIds: riskRows.map((item) => Number(item.log.project_id)).filter(Boolean) },
    );
    const riskEventByLogId = new Map<number, { status: string }>();
    riskEvents.forEach((event) => riskEventByLogId.set(Number(event.log_id), { status: event.status }));

    const projectMap = new Map<number, string>();
    (projects || []).forEach((project: any) => projectMap.set(Number(project.id), project.name));

    const risks = riskRows
      .map(({ log, risk }) => {
        const notificationRows = notificationsByLogId.get(Number(log.id)) || [];
        const hasConfirmedNotification = notificationRows.length > 0 && notificationRows.every((row) => !isUnread(row.is_read));
        const eventStatus = riskEventByLogId.get(Number(log.id))?.status;
        const workflowStatus = eventStatus || (hasConfirmedNotification ? 'confirmed' : 'pending');

        return {
          id: log.id,
          log_id: log.id,
          knowledge_doc_id: null,
          project_id: log.project_id,
          project_name: projectMap.get(Number(log.project_id)) || `项目${log.project_id}`,
          user_name: log.user_name,
          log_date: log.log_date,
          location: log.location,
          content: log.content,
          issues: log.issues,
          risk_type: risk.primaryType,
          risk_types: risk.types,
          risk_level: risk.level,
          risk_summary: risk.summary,
          risk_recommendation: risk.recommendation,
          risk_matched_keywords: risk.matchedKeywords,
          workflow_status: workflowStatus,
          workflow_status_label: workflowStatus === 'confirmed' ? '已确认' : workflowStatus === 'resolved' ? '已处理' : workflowStatus === 'ignored' ? '确认无影响' : '待确认',
          workflow_tags: [],
          updated_at: log.updated_at || log.created_at,
        };
      })
      .filter((item) => status === 'all' || item.workflow_status === status);

    return apiSuccess(risks, {
      meta: {
        stats: {
          ...emptyStats(),
          total: risks.length,
          pending: risks.filter((item) => item.workflow_status === 'pending').length,
          confirmed: risks.filter((item) => item.workflow_status === 'confirmed').length,
        },
      },
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '风险池查询失败'));
  }
}
