import { NextRequest } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getConstructionLogAccessibleProjectIds } from '@/lib/public-log-project';
import { detectConstructionLogRisk, enrichConstructionLog } from '@/lib/construction-log-risk';
import { getConstructionLogSubmissionWindow } from '@/lib/construction-log-deadline';
import { hasBudgetRoleInDatabase } from '@/lib/construction-log-submitters';
import { validateAttendanceCountConsistency } from '@/lib/construction-log-attendance-risk';

type LogAttachment = {
  name?: string;
  size?: number;
  storageKey?: string;
  fileKey?: string;
  key?: string;
  type?: string;
  uploadedAt?: string;
  url?: string;
};

function asPayload(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return undefined;
  return value.trim();
}

function isPendingBeforeSchedule(log: { status?: string | null; scheduled_submit_at?: string | null }) {
  if (log.status !== 'pending') return false;
  if (!log.scheduled_submit_at) return true;
  const scheduledAt = new Date(log.scheduled_submit_at);
  if (Number.isNaN(scheduledAt.getTime())) return true;
  return scheduledAt.getTime() > Date.now();
}

function createStorage() {
  return new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: '',
    secretKey: '',
    bucketName: process.env.COZE_BUCKET_NAME,
    region: 'cn-beijing',
  });
}

function getAttachmentKey(attachment: LogAttachment) {
  return attachment.storageKey || attachment.fileKey || attachment.key || '';
}

async function attachSignedUrls(attachments: unknown) {
  if (!Array.isArray(attachments)) return [];
  const storage = createStorage();
  return Promise.all(attachments.map(async (item) => {
    const attachment = item && typeof item === 'object' ? item as LogAttachment : {};
    const key = getAttachmentKey(attachment);
    if (!key) return attachment;
    try {
      const url = await storage.generatePresignedUrl({ key, expireTime: 3600 });
      return { ...attachment, storageKey: attachment.storageKey || key, url };
    } catch (error) {
      console.warn('[construction-logs] attachment url sign failed', error);
      return { ...attachment, storageKey: attachment.storageKey || key };
    }
  }));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const logId = Number(id);
    if (!Number.isFinite(logId)) return apiNotFound('施工日志不存在');

    const supabase = getSupabaseClient();
    const { data: log, error } = await supabase
      .from('construction_logs')
      .select('*')
      .eq('id', logId)
      .single();

    if (error || !log) return apiNotFound('施工日志不存在');

    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);
    if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(Number(log.project_id))) {
      return apiForbidden('无权查看该项目施工日志');
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id,name,year,address,partner,contract_amount')
      .eq('id', log.project_id)
      .maybeSingle();

    const { data: riskDoc } = await supabase
      .from('ai_knowledge_docs')
      .select('id,title,tags,updated_at')
      .eq('source_type', 'construction_log')
      .eq('source_ref', `cl:${logId}`)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: attendanceWorkers, error: attendanceError } = await supabase
      .from('construction_log_attendance')
      .select('worker_id,worker_name,work_type,team_name,work_hours')
      .eq('log_id', logId)
      .order('worker_name', { ascending: true });
    if (attendanceError) console.warn('[construction-logs] attendance workers load failed', attendanceError.message);

    const risk = detectConstructionLogRisk({ content: log.content, issues: log.issues });
    const attachments = await attachSignedUrls(log.attachments);

    return apiSuccess({
      ...enrichConstructionLog(log),
      attachments,
      project: project || null,
      attendance_workers: attendanceWorkers || [],
      risk,
      risk_doc: riskDoc || null,
      can_edit_schedule: Number(log.user_id) === Number(auth.user.id) && isPendingBeforeSchedule(log),
      can_cancel_schedule: Number(log.user_id) === Number(auth.user.id) && isPendingBeforeSchedule(log),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '施工日志详情查询失败'));
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const logId = Number(id);
    if (!Number.isFinite(logId)) return apiNotFound('施工日志不存在');

    const body = asPayload(await request.json());
    const supabase = getSupabaseClient();
    const { data: log, error } = await supabase
      .from('construction_logs')
      .select('id,project_id,user_id,status,scheduled_submit_at,log_date')
      .eq('id', logId)
      .single();

    if (error || !log) return apiNotFound('施工日志不存在');

    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);
    if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(Number(log.project_id))) {
      return apiForbidden('无权修改该项目施工日志');
    }
    if (Number(log.user_id) !== Number(auth.user.id)) return apiForbidden('只能修改本人预约的施工日志');
    if (!isPendingBeforeSchedule(log)) return apiBadRequest('只有到点前的待提交日志可以修改或取消预约');

    if (body.action === 'cancel_schedule') {
      const { error: updateError } = await supabase
        .from('construction_logs')
        .update({
          status: 'cancelled',
          scheduled_cancelled_at: new Date().toISOString(),
        })
        .eq('id', logId)
        .eq('status', 'pending');
      if (updateError) throw new Error(updateError.message);
      return apiSuccess({ id: logId, status: 'cancelled' });
    }

    const patch: Record<string, unknown> = {};
    const location = normalizeOptionalText(body.location);
    const content = normalizeOptionalText(body.content);
    const issues = normalizeOptionalText(body.issues);
    if (location !== undefined) patch.location = location || null;
    if (content !== undefined) {
      if (!content) return apiBadRequest('施工内容不能为空');
      patch.content = content;
    }
    if (issues !== undefined) patch.issues = issues || null;

    if (content !== undefined) {
      const { count: attendanceCount, error: attendanceCountError } = await supabase
        .from('construction_log_attendance')
        .select('id', { count: 'exact', head: true })
        .eq('log_id', logId);
      if (attendanceCountError) throw new Error(attendanceCountError.message);
      const attendanceValidation = validateAttendanceCountConsistency({
        content,
        selectedCount: attendanceCount || 0,
      });
      if (!attendanceValidation.ok && attendanceValidation.message) {
        return apiBadRequest(attendanceValidation.message);
      }
    }

    if (typeof body.scheduled_submit_at === 'string' && body.scheduled_submit_at.trim()) {
      const canSchedule = await hasBudgetRoleInDatabase(supabase, auth.user);
      if (!canSchedule) return apiForbidden('只有预算员可以调整预约提交时间');
      const nextScheduledAt = new Date(body.scheduled_submit_at);
      if (Number.isNaN(nextScheduledAt.getTime())) return apiBadRequest('预约提交时间格式不正确');
      if (nextScheduledAt.getTime() <= Date.now()) return apiBadRequest('预约提交时间必须晚于当前时间');
      const window = getConstructionLogSubmissionWindow(String(log.log_date || ''), nextScheduledAt);
      if (!window.allowed) return apiBadRequest(window.message);
      patch.scheduled_submit_at = nextScheduledAt.toISOString();
    }

    if (Object.keys(patch).length === 0) return apiBadRequest('没有需要修改的内容');
    const { data: updated, error: updateError } = await supabase
      .from('construction_logs')
      .update(patch)
      .eq('id', logId)
      .eq('status', 'pending')
      .select('*')
      .single();
    if (updateError) throw new Error(updateError.message);
    return apiSuccess(enrichConstructionLog(updated));
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '施工日志修改失败'));
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const logId = Number(id);
    if (!Number.isFinite(logId)) return apiNotFound('施工日志不存在');

    const supabase = getSupabaseClient();
    const { data: log, error } = await supabase
      .from('construction_logs')
      .select('id,project_id')
      .eq('id', logId)
      .single();

    if (error || !log) return apiNotFound('施工日志不存在');

    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);
    if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(Number(log.project_id))) {
      return apiForbidden('无权删除该项目施工日志');
    }

    const { error: deleteDocError } = await supabase
      .from('ai_knowledge_docs')
      .delete()
      .eq('source_type', 'construction_log')
      .eq('source_ref', `cl:${logId}`);
    if (deleteDocError) console.warn('[construction-logs] cleanup knowledge docs failed', deleteDocError.message);

    const { error: deleteNotificationError } = await supabase
      .from('notifications')
      .delete()
      .eq('related_type', 'construction_log')
      .eq('related_id', logId);
    if (deleteNotificationError) console.warn('[construction-logs] cleanup notifications failed', deleteNotificationError.message);

    const { error: deleteLogError } = await supabase
      .from('construction_logs')
      .delete()
      .eq('id', logId);

    if (deleteLogError) throw new Error(deleteLogError.message);

    return apiSuccess({ id: logId });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '施工日志删除失败'));
  }
}
