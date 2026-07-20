import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getConstructionLogAccessibleProjectIds, isPublicLogProject } from '@/lib/public-log-project';
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
import { getProjectActiveWorkers } from '@/lib/project-workers';
import { canUserSubmitConstructionLog, hasBudgetRoleInDatabase } from '@/lib/construction-log-submitters';

type ConstructionLogDraft = {
  project_id: number;
  location?: string | null;
  content: string;
  headcount?: number | string | null;
  attachments?: LogAttachment[];
  attendance_worker_ids?: number[];
  attendance_workers?: AttendanceWorkerDraft[];
  scope_worker_ids?: number[];
  issues?: string | null;
};

type LogAttachment = {
  name?: string;
  size?: number;
  storageKey?: string;
  type?: string;
  uploadedAt?: string;
};

type AttendanceWorkerDraft = {
  worker_id: number;
  work_hours: number;
};

type ConstructionLogPayload = Record<string, unknown>;

type InsertedConstructionLogRow = {
  id: number;
};

type ScheduledConstructionLogRow = InsertedConstructionLogRow & ConstructionLogDraft & {
  log_date: string;
  scheduled_submit_at?: string | null;
  user_id?: number | null;
};

type AttendanceWorkerRow = {
  id: number;
  name: string;
  work_type?: string | null;
  team_name?: string | null;
  status?: string | null;
};

type ProjectArchiveCheckRow = {
  id: number;
  name?: string | null;
  is_archived?: boolean | null;
};

const OPTIONAL_CONSTRUCTION_LOG_COLUMNS = [
  'source_type',
  'daily_group_id',
  'submission_status',
] as const;

function getMissingConstructionLogColumn(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || '');
  const lowerMessage = message.toLowerCase();
  if (
    error?.code !== '42703' &&
    error?.code !== 'PGRST204' &&
    !lowerMessage.includes('schema cache') &&
    !lowerMessage.includes('does not exist') &&
    !lowerMessage.includes('could not find')
  ) {
    return null;
  }

  const quotedMatch = message.match(/'([^']+)' column of 'construction_logs'/i);
  if (quotedMatch?.[1]) return quotedMatch[1];

  return OPTIONAL_CONSTRUCTION_LOG_COLUMNS.find((column) => lowerMessage.includes(column)) || null;
}

function withoutConstructionLogColumn<T extends Record<string, unknown>>(rows: T[], column: string) {
  return rows.map((row) => {
    const next = { ...row };
    delete next[column];
    return next;
  });
}

async function insertConstructionLogsWithColumnFallback(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
) {
  let insertRows = rows;
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt <= OPTIONAL_CONSTRUCTION_LOG_COLUMNS.length; attempt += 1) {
    const result = await supabase
      .from('construction_logs')
      .insert(insertRows)
      .select();

    if (!result.error) return result;

    const missingColumn = getMissingConstructionLogColumn(result.error);
    if (
      missingColumn &&
      OPTIONAL_CONSTRUCTION_LOG_COLUMNS.includes(missingColumn as typeof OPTIONAL_CONSTRUCTION_LOG_COLUMNS[number]) &&
      !removedColumns.has(missingColumn)
    ) {
      removedColumns.add(missingColumn);
      insertRows = withoutConstructionLogColumn(insertRows, missingColumn);
      continue;
    }

    return result;
  }

  return supabase
    .from('construction_logs')
    .insert(insertRows)
    .select();
}

function isMissingArchiveColumnError(error: { message?: string; code?: string } | null) {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    (
      message.includes('is_archived') &&
      (message.includes('does not exist') || message.includes('could not find') || message.includes('schema cache'))
    )
  );
}

async function loadProjectsForArchiveCheck(supabase: SupabaseClient, projectIds: number[]) {
  const fullResult = await supabase
    .from('projects')
    .select('id,name,is_archived')
    .in('id', projectIds);

  if (!fullResult.error) return fullResult;
  if (!isMissingArchiveColumnError(fullResult.error)) return fullResult;

  const fallbackResult = await supabase
    .from('projects')
    .select('id,name')
    .in('id', projectIds);

  return {
    ...fallbackResult,
    data: fallbackResult.data?.map((project) => ({
      ...project,
      is_archived: false,
    })),
  };
}

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

function normalizeAttendanceWorkers(value: unknown, fallbackIds?: number[]) {
  const rows = Array.isArray(value)
    ? value.map((item) => {
      const payload = asPayload(item);
      return {
        worker_id: Number(payload.worker_id ?? payload.id),
        work_hours: Number(payload.work_hours ?? 0),
      };
    })
    : (fallbackIds || []).map((workerId) => ({ worker_id: workerId, work_hours: 0 }));

  const map = new Map<number, AttendanceWorkerDraft>();
  rows.forEach((row) => {
    if (!Number.isInteger(row.worker_id) || row.worker_id <= 0) return;
    const hours = Number.isFinite(row.work_hours) ? Math.round(row.work_hours * 100) / 100 : 0;
    map.set(row.worker_id, { worker_id: row.worker_id, work_hours: hours });
  });
  return Array.from(map.values());
}

function normalizeAttachments(value: unknown): LogAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): LogAttachment | null => {
      const payload = asPayload(item);
      const storageKey = payload.storageKey ? String(payload.storageKey) : '';
      if (!storageKey) return null;
      return {
        name: payload.name ? String(payload.name) : '',
        size: Number.isFinite(Number(payload.size)) ? Number(payload.size) : 0,
        storageKey,
        type: payload.type ? String(payload.type) : 'image',
        uploadedAt: payload.uploadedAt ? String(payload.uploadedAt) : new Date().toISOString(),
      };
    })
    .filter((item): item is LogAttachment => item !== null);
}

function normalizeLogDrafts(body: ConstructionLogPayload): ConstructionLogDraft[] {
  if (Array.isArray(body.project_logs)) {
    return body.project_logs
      .map((item) => {
        const payload = asPayload(item);
        const attendanceWorkerIds = normalizeOptionalIdList(payload.attendance_worker_ids);
        const attendanceWorkers = normalizeAttendanceWorkers(payload.attendance_workers, attendanceWorkerIds);
        return {
          project_id: Number(payload.project_id),
          location: payload.location ? String(payload.location) : null,
          content: String(payload.content || '').trim(),
          attachments: normalizeAttachments(payload.attachments),
          headcount: typeof payload.headcount === 'number' || typeof payload.headcount === 'string'
            ? payload.headcount
            : null,
          attendance_worker_ids: attendanceWorkers.map(worker => worker.worker_id),
          attendance_workers: attendanceWorkers,
          scope_worker_ids: normalizeOptionalIdList(payload.scope_worker_ids),
          issues: payload.issues ? String(payload.issues) : null,
        };
      })
      .filter((item: ConstructionLogDraft) => item.project_id && item.content);
  }

  const attendanceWorkerIds = normalizeOptionalIdList(body.attendance_worker_ids);
  const attendanceWorkers = normalizeAttendanceWorkers(body.attendance_workers, attendanceWorkerIds);
  return [{
    project_id: Number(body.project_id),
    location: body.location ? String(body.location) : null,
    content: String(body.content || '').trim(),
    attachments: normalizeAttachments(body.attachments),
    headcount: typeof body.headcount === 'number' || typeof body.headcount === 'string' ? body.headcount : null,
    attendance_worker_ids: attendanceWorkers.map(worker => worker.worker_id),
    attendance_workers: attendanceWorkers,
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

function normalizeScheduledSubmitAt(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
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
      logDate,
      projectName: projName,
      businessSummary: `${projName} ${logDate || ''}施工日志识别到${typeLabel}风险${levelLabel ? `（${levelLabel}）` : ''}：${risk.summary}`,
    },
  });
}

async function processDueScheduledConstructionLogs(supabase: SupabaseClient) {
  const nowIso = new Date().toISOString();
  const { data: dueLogs, error } = await supabase
    .from('construction_logs')
    .select('id,project_id,location,content,issues,log_date,scheduled_submit_at,user_id')
    .eq('status', 'pending')
    .lte('scheduled_submit_at', nowIso)
    .limit(50);

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (error.code === '42703' || error.code === 'PGRST204' || message.includes('status') || message.includes('scheduled_submit_at')) return;
    throw new Error(error.message);
  }

  for (const log of ((dueLogs || []) as ScheduledConstructionLogRow[])) {
    const scheduledAt = log.scheduled_submit_at ? new Date(log.scheduled_submit_at) : new Date();
    const window = getConstructionLogSubmissionWindow(log.log_date, scheduledAt);
    if (!window.submissionStatus) continue;

    const submittedAt = log.scheduled_submit_at || nowIso;
    const updatePayload: Record<string, unknown> = {
      status: 'submitted',
      submission_status: window.submissionStatus,
      submitted_at: submittedAt,
    };
    let updateResult = await supabase
      .from('construction_logs')
      .update(updatePayload)
      .eq('id', log.id)
      .eq('status', 'pending')
      .select('id');

    if (updateResult.error && getMissingConstructionLogColumn(updateResult.error) === 'submission_status') {
      delete updatePayload.submission_status;
      updateResult = await supabase
        .from('construction_logs')
        .update(updatePayload)
        .eq('id', log.id)
        .eq('status', 'pending')
        .select('id');
    }

    const { data: updatedRows, error: updateError } = updateResult;
    if (updateError) throw new Error(updateError.message);
    if (!updatedRows || updatedRows.length === 0) continue;

    await createRiskSideEffects(supabase, { id: log.id }, {
      project_id: Number(log.project_id),
      location: log.location || null,
      content: log.content || '',
      issues: log.issues || null,
    }, log.log_date, Number(log.user_id || 0) || undefined);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    await processDueScheduledConstructionLogs(supabase);
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const userId = searchParams.get('userId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);
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
    const hasScheduledSubmitInput = typeof body.scheduled_submit_at === 'string' && body.scheduled_submit_at.trim() !== '';
    const scheduledSubmitDate = normalizeScheduledSubmitAt(body.scheduled_submit_at);
    if (hasScheduledSubmitInput && !scheduledSubmitDate) return apiBadRequest('预约提交时间格式不正确');
    const isScheduled = hasScheduledSubmitInput;

    if (!log_date || drafts.length === 0) {
      return apiBadRequest('项目、日期和施工内容不能为空');
    }

    const uniqueProjectIds = Array.from(new Set(drafts.map((draft) => draft.project_id)));
    if (uniqueProjectIds.length !== drafts.length) {
      return apiBadRequest('同一份施工日志中不能重复选择同一个项目');
    }

    const submissionWindow = getConstructionLogSubmissionWindow(log_date, scheduledSubmitDate || new Date());
    if (!submissionWindow.allowed || !submissionWindow.submissionStatus) {
      return apiBadRequest(submissionWindow.message);
    }

    const supabase = getSupabaseClient();
    if (isScheduled) {
      if (!scheduledSubmitDate || scheduledSubmitDate.getTime() <= Date.now()) {
        return apiBadRequest('预约提交时间必须晚于当前时间');
      }
      const canSchedule = await hasBudgetRoleInDatabase(supabase, user);
      if (!canSchedule) return apiForbidden('只有预算员可以预约提交施工日志');
    }

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
    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, user);
    if (Array.isArray(accessibleProjectIds)) {
      const forbiddenProject = uniqueProjectIds.find((projectId) => !accessibleProjectIds.includes(projectId));
      if (forbiddenProject) return apiForbidden('无权提交该项目施工日志');
    }

    for (const projectId of uniqueProjectIds) {
      const canSubmit = await canUserSubmitConstructionLog(supabase, projectId, user.id);
      if (!canSubmit) return apiForbidden('该项目未将你配置为施工日志提交人员');
    }

    const { data: projectRows, error: projectRowsError } = await loadProjectsForArchiveCheck(supabase, uniqueProjectIds);
    if (projectRowsError) throw new Error(projectRowsError.message);
    const archivedProject = ((projectRows || []) as ProjectArchiveCheckRow[]).find((project) => project.is_archived && !isPublicLogProject(project));
    if (archivedProject) {
      return apiBadRequest(`项目已归档，不能再提交施工日志：${archivedProject.name || archivedProject.id}`);
    }

    const { data: existingLog, error: existingError } = await supabase
      .from('construction_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('log_date', log_date)
      .neq('status', 'cancelled')
      .limit(1);

    if (existingError) throw new Error(existingError.message);
    if (existingLog && existingLog.length > 0) {
      return apiBadRequest('当天施工日志已提交。如需调整，请先在日志详情中修改原记录。');
    }

    const attendanceWorkersByProject = new Map<number, Map<number, AttendanceWorkerRow>>();
    for (const projectId of uniqueProjectIds) {
      const invalidHours = drafts
        .filter((draft) => draft.project_id === projectId)
        .flatMap((draft) => draft.attendance_workers || [])
        .find((worker) => !Number.isFinite(worker.work_hours) || worker.work_hours < 0 || worker.work_hours > 24);
      if (invalidHours) {
        return apiBadRequest('出勤工时需在0到24小时之间');
      }

      const draftIds = drafts
        .filter((draft) => draft.project_id === projectId)
        .flatMap((draft) => [
          ...(draft.attendance_worker_ids || []),
          ...(draft.scope_worker_ids || []),
        ]);
      const workerIds = Array.from(new Set(draftIds));
      if (workerIds.length === 0) continue;

      const activeWorkers = await getProjectActiveWorkers(supabase, projectId, {
        workerIds,
        fields: 'id,name,work_type,team_name,status,project_id',
      }) as AttendanceWorkerRow[];
      const workerMap = new Map(activeWorkers.map((worker) => [Number(worker.id), worker]));
      const invalidWorkerId = workerIds.find((workerId) => !workerMap.has(workerId));
      if (invalidWorkerId) {
        return apiBadRequest('出勤人员只能选择当前项目在场花名册中的工人');
      }
      attendanceWorkersByProject.set(projectId, workerMap);
    }

    const dailyGroupId = randomUUID();
    const submittedAt = new Date().toISOString();
    const scheduledSubmitAt = scheduledSubmitDate?.toISOString() || null;
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
      attachments: draft.attachments || [],
      daily_group_id: dailyGroupId,
      status: isScheduled ? 'pending' : 'submitted',
      scheduled_submit_at: scheduledSubmitAt,
      scheduled_by: isScheduled ? user.id : null,
      scheduled_cancelled_at: null,
      submission_status: isScheduled ? null : submissionWindow.submissionStatus,
      submitted_at: isScheduled ? null : submittedAt,
      source_type: sourceType,
    }));

    const { data, error } = await insertConstructionLogsWithColumnFallback(supabase, insertRows);

    if (error) throw new Error(error.message);

    const insertedRows = data || [];
    const attendanceRows = insertedRows.flatMap((row, index) => {
      const draft = drafts[index];
      const workerMap = attendanceWorkersByProject.get(draft.project_id);
      return (draft.attendance_workers || []).map((attendanceWorker) => {
        const worker = workerMap?.get(attendanceWorker.worker_id);
        return {
          log_id: row.id,
          project_id: draft.project_id,
          worker_id: attendanceWorker.worker_id,
          worker_name: worker?.name || null,
          work_type: worker?.work_type || null,
          team_name: worker?.team_name || null,
          work_hours: attendanceWorker.work_hours || 0,
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

    if (!isScheduled) {
      for (let index = 0; index < insertedRows.length; index += 1) {
        await createRiskSideEffects(supabase, insertedRows[index], drafts[index], log_date, user?.id);
      }
    }

    const enrichedRows = insertedRows.map(enrichConstructionLog);
    const isMultiProject = Array.isArray(body.project_logs);
    return apiSuccess(isMultiProject ? enrichedRows : enrichedRows[0]);
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '提交失败'));
  }
}
