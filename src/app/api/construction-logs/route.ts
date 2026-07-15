import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { getConstructionLogSubmissionWindow } from '@/lib/construction-log-deadline';
import {
  buildRiskKnowledgeContent,
  buildRiskKnowledgeTags,
  detectConstructionLogRisk,
  enrichConstructionLog,
  getRiskLevelLabel,
  getRiskTypeLabel,
} from '@/lib/construction-log-risk';
import { formatRecipientNames, getProjectBudgetRecipients } from '@/lib/project-notification-recipients';
import { getUserDisplayName } from '@/lib/user-display-name';

type ConstructionLogDraft = {
  project_id: number;
  location?: string | null;
  content: string;
  headcount?: number | string | null;
  attendance_worker_ids?: number[];
  scope_worker_ids?: number[];
  issues?: string | null;
};

type ConstructionLogPayload = Record<string, unknown>;

type InsertedConstructionLogRow = {
  id: number;
};

type AttendanceWorkerRow = {
  id: number;
  name: string;
  work_type?: string | null;
  team_name?: string | null;
  status?: string | null;
};

function asPayload(value: unknown): ConstructionLogPayload {
  return value && typeof value === 'object' ? value as ConstructionLogPayload : {};
}

function normalizeOptionalIdList(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(
    value
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0),
  ));
}

function normalizeLogDrafts(body: ConstructionLogPayload): ConstructionLogDraft[] {
  if (Array.isArray(body.project_logs)) {
    return body.project_logs
      .map((item) => {
        const payload = asPayload(item);
        return {
          project_id: Number(payload.project_id),
          location: payload.location ? String(payload.location) : null,
          content: String(payload.content || '').trim(),
          headcount: typeof payload.headcount === 'number' || typeof payload.headcount === 'string'
            ? payload.headcount
            : null,
          attendance_worker_ids: normalizeOptionalIdList(payload.attendance_worker_ids),
          scope_worker_ids: normalizeOptionalIdList(payload.scope_worker_ids),
          issues: payload.issues ? String(payload.issues) : null,
        };
      })
      .filter((item: ConstructionLogDraft) => item.project_id && item.content);
  }

  return [{
    project_id: Number(body.project_id),
    location: body.location ? String(body.location) : null,
    content: String(body.content || '').trim(),
    headcount: typeof body.headcount === 'number' || typeof body.headcount === 'string' ? body.headcount : null,
    attendance_worker_ids: normalizeOptionalIdList(body.attendance_worker_ids),
    scope_worker_ids: normalizeOptionalIdList(body.scope_worker_ids),
    issues: body.issues ? String(body.issues) : null,
  }].filter((item) => item.project_id && item.content);
}

function toNullableHeadcount(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDraftHeadcount(draft: ConstructionLogDraft) {
  if (Array.isArray(draft.attendance_worker_ids)) return draft.attendance_worker_ids.length;
  return toNullableHeadcount(draft.headcount);
}

async function createRiskSideEffects(
  supabase: SupabaseClient,
  data: InsertedConstructionLogRow | null,
  draft: ConstructionLogDraft,
  logDate: string,
  userId?: number,
) {
  const risk = detectConstructionLogRisk({ content: draft.content, issues: draft.issues || '' });
  if (!data || !risk.hasRisk) return;

  const { data: proj } = await supabase
    .from('projects')
    .select('name')
    .eq('id', draft.project_id)
    .single();
  const projName = (proj as { name?: string } | null)?.name || `项目${draft.project_id}`;
  const typeLabel = risk.primaryType ? getRiskTypeLabel(risk.primaryType) : '风险';
  const levelLabel = getRiskLevelLabel(risk.level);
  const knowledgeContent = buildRiskKnowledgeContent({
    projectName: projName,
    projectId: String(draft.project_id),
    logId: data.id,
    logDate,
    location: draft.location || '',
    content: draft.content,
    issues: draft.issues || '',
    risk,
  });

  const insertDoc: Record<string, unknown> = {
    title: `${projName} ${logDate || ''} 施工日志 - ${typeLabel}${levelLabel ? `(${levelLabel})` : ''}`,
    category: risk.types.includes('cost') ? '成本分析' : risk.types.includes('visa') ? '签证' : '经验总结',
    source_type: 'construction_log',
    source_ref: `cl:${data.id}`,
    tags: buildRiskKnowledgeTags({ projectId: String(draft.project_id), projectName: projName, logDate, risk }),
    content: knowledgeContent,
    status: 'active',
  };
  if (userId) insertDoc.created_by = userId;

  await supabase.from('ai_knowledge_docs').insert(insertDoc);

  const recipients = await getProjectBudgetRecipients(supabase, draft.project_id);
  const targetNames = formatRecipientNames(recipients);

  const { pushBusinessNotification } = await import('@/lib/business-notification');
  await pushBusinessNotification({
    type: 'construction_log_alert',
    title: `${projName} 施工日志识别到${typeLabel}风险`,
    content: `${logDate || ''} ${risk.summary}。${risk.recommendation}`,
    severity: risk.level === 'high' ? 'danger' : 'warning',
    projectId: draft.project_id,
    relatedId: data.id,
    relatedType: 'construction_log',
    recipientUserIds: recipients.map((recipient) => recipient.id),
    recipientRole: 'budget',
    metadata: {
      targetRole: 'budget',
      targetUserIds: recipients.map((recipient) => recipient.id),
      targetNames,
      fallbackToAdmin: recipients.length === 0,
      targetLabel: '项目预算员',
      riskTypes: risk.types,
    riskLevel: risk.level,
      matchedKeywords: risk.matchedKeywords,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const userId = searchParams.get('userId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);
    const parsedProjectId = projectId ? parseInt(projectId, 10) : null;

    if (parsedProjectId && Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(parsedProjectId)) {
      return apiSuccess([], {
        meta: { pagination: { page, pageSize, total: 0 } },
      });
    }

    if (!parsedProjectId && Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) {
      return apiSuccess([], {
        meta: { pagination: { page, pageSize, total: 0 } },
      });
    }

    let query = supabase
      .from('construction_logs')
      .select('*', { count: 'exact' })
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (parsedProjectId) query = query.eq('project_id', parsedProjectId);
    else if (Array.isArray(accessibleProjectIds)) query = query.in('project_id', accessibleProjectIds);
    if (userId) query = query.eq('user_id', parseInt(userId));
    if (dateFrom) query = query.gte('log_date', dateFrom);
    if (dateTo) query = query.lte('log_date', dateTo);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    return apiSuccess((data || []).map(enrichConstructionLog), {
      meta: { pagination: { page, pageSize, total: count || 0 } },
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '查询失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const user = auth.user;
    const body = asPayload(await request.json());
    const log_date = typeof body.log_date === 'string' ? body.log_date : '';
    const drafts = normalizeLogDrafts(body);

    if (!log_date || drafts.length === 0) {
      return apiBadRequest('项目、日期和施工内容不能为空');
    }

    const uniqueProjectIds = Array.from(new Set(drafts.map((draft) => draft.project_id)));
    if (uniqueProjectIds.length !== drafts.length) {
      return apiBadRequest('同一份施工日志中不能重复选择同一个项目');
    }

    const submissionWindow = getConstructionLogSubmissionWindow(log_date);
    if (!submissionWindow.allowed || !submissionWindow.submissionStatus) {
      return apiBadRequest(submissionWindow.message);
    }

    const supabase = getSupabaseClient();
    const { data: currentUserRecord } = await supabase
      .from('users')
      .select('id,username,name,dingtalk_name')
      .eq('id', user.id)
      .maybeSingle();
    user.name = getUserDisplayName({
      id: user.id,
      username: currentUserRecord?.username || user.username,
      name: currentUserRecord?.name || user.name,
      dingtalk_name: currentUserRecord?.dingtalk_name || user.dingtalk_name,
    }, user.name || user.username);
    const accessibleProjectIds = await getAccessibleProjectIds(supabase, user);
    if (Array.isArray(accessibleProjectIds)) {
      const forbiddenProject = uniqueProjectIds.find((projectId) => !accessibleProjectIds.includes(projectId));
      if (forbiddenProject) return apiForbidden('无权提交该项目施工日志');
    }

    const { data: existingLog, error: existingError } = await supabase
      .from('construction_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('log_date', log_date)
      .limit(1);

    if (existingError) throw new Error(existingError.message);
    if (existingLog && existingLog.length > 0) {
      return apiBadRequest('当天施工日志已提交。如需调整，请先在日志详情中修改原记录。');
    }

    const attendanceWorkersByProject = new Map<number, Map<number, AttendanceWorkerRow>>();
    for (const projectId of uniqueProjectIds) {
      const draftIds = drafts
        .filter((draft) => draft.project_id === projectId)
        .flatMap((draft) => [
          ...(draft.attendance_worker_ids || []),
          ...(draft.scope_worker_ids || []),
        ]);
      const workerIds = Array.from(new Set(draftIds));
      if (workerIds.length === 0) continue;

      const { data: workerRows, error: workerError } = await supabase
        .from('workers')
        .select('id,name,work_type,team_name,status')
        .eq('project_id', projectId)
        .in('id', workerIds);
      if (workerError) throw new Error(workerError.message);

      const activeWorkers = ((workerRows || []) as AttendanceWorkerRow[])
        .filter((worker) => (worker.status || 'in_service') !== 'left');
      const workerMap = new Map(activeWorkers.map((worker) => [Number(worker.id), worker]));
      const invalidWorkerId = workerIds.find((workerId) => !workerMap.has(workerId));
      if (invalidWorkerId) {
        return apiBadRequest('出勤人员只能选择当前项目在场花名册中的工人');
      }
      attendanceWorkersByProject.set(projectId, workerMap);
    }

    const dailyGroupId = randomUUID();
    const submittedAt = new Date().toISOString();
    const sourceType = body.source_type === 'ocr' ? 'ocr' : 'manual';
    const insertRows = drafts.map((draft) => ({
      project_id: draft.project_id,
      user_id: user?.id || 0,
      user_name: user?.name || user?.username || '未知',
      log_date,
      location: draft.location || null,
      content: draft.content,
      headcount: getDraftHeadcount(draft),
      issues: draft.issues || null,
      daily_group_id: dailyGroupId,
      submission_status: submissionWindow.submissionStatus,
      submitted_at: submittedAt,
      source_type: sourceType,
    }));

    const { data, error } = await supabase
      .from('construction_logs')
      .insert(insertRows)
      .select();

    if (error) throw new Error(error.message);

    const insertedRows = data || [];
    const attendanceRows = insertedRows.flatMap((row, index) => {
      const draft = drafts[index];
      const workerMap = attendanceWorkersByProject.get(draft.project_id);
      return (draft.attendance_worker_ids || []).map((workerId) => {
        const worker = workerMap?.get(workerId);
        return {
          log_id: row.id,
          project_id: draft.project_id,
          worker_id: workerId,
          worker_name: worker?.name || null,
          work_type: worker?.work_type || null,
          team_name: worker?.team_name || null,
        };
      });
    });
    if (attendanceRows.length > 0) {
      const { error: attendanceError } = await supabase
        .from('construction_log_attendance')
        .insert(attendanceRows);
      if (attendanceError) throw new Error(attendanceError.message);
    }

    const scopeRows = drafts.flatMap((draft) => (
      (draft.scope_worker_ids || []).map((workerId) => ({
        user_id: user.id,
        project_id: draft.project_id,
        worker_id: workerId,
        updated_at: submittedAt,
      }))
    ));
    if (scopeRows.length > 0) {
      const { error: scopeError } = await supabase
        .from('site_manager_worker_scopes')
        .upsert(scopeRows, { onConflict: 'user_id,project_id,worker_id' });
      if (scopeError) throw new Error(scopeError.message);
    }

    for (let index = 0; index < insertedRows.length; index += 1) {
      await createRiskSideEffects(supabase, insertedRows[index], drafts[index], log_date, user?.id);
    }

    const enrichedRows = insertedRows.map(enrichConstructionLog);
    const isMultiProject = Array.isArray(body.project_logs);
    return apiSuccess(isMultiProject ? enrichedRows : enrichedRows[0]);
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '提交失败'));
  }
}
