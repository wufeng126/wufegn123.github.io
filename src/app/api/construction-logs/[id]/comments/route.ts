import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getConstructionLogAccessibleProjectIds } from '@/lib/public-log-project';
import { getUserDisplayName } from '@/lib/user-display-name';
import { getProjectBudgetRecipients } from '@/lib/project-notification-recipients';
import { getProjectRoleUserIds } from '@/lib/user-project-roles';
import { pushBusinessNotification } from '@/lib/business-notification';

type ConstructionLogRow = {
  id: number;
  project_id: number;
  user_id: number;
  log_date: string;
};

type CommentRow = {
  id: number;
  log_id: number;
  project_id: number;
  user_id: number;
  user_name?: string | null;
  content: string;
  mentioned_user_ids?: number[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function asPayload(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function parseIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
}

async function resolveCommentRecipients(
  client: ReturnType<typeof getSupabaseClient>,
  projectId: number,
  logAuthorId: number,
  commenterId: number,
  mentionedUserIds: number[] = [],
) {
  const recipientIds = new Set<number>();

  try {
    const budgetRecipients = await getProjectBudgetRecipients(client, projectId);
    budgetRecipients.forEach((recipient) => recipientIds.add(Number(recipient.id)));
  } catch (error) {
    console.warn('[construction-logs/comments] load budget recipients failed:', error);
  }

  try {
    const managerIds = await getProjectRoleUserIds(client, projectId, 'project_manager');
    managerIds.forEach((id) => recipientIds.add(Number(id)));
  } catch (error) {
    console.warn('[construction-logs/comments] load project managers failed:', error);
  }

  if (logAuthorId) recipientIds.add(Number(logAuthorId));
  mentionedUserIds.forEach((id) => recipientIds.add(Number(id)));
  recipientIds.delete(Number(commenterId));

  return Array.from(recipientIds).filter((id) => Number.isInteger(id) && id > 0);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const logId = Number(id);
    if (!Number.isFinite(logId)) return apiNotFound('施工日志不存在');

    const supabase = getSupabaseClient();
    const { data: log, error: logError } = await supabase
      .from('construction_logs')
      .select('id,project_id,user_id,log_date')
      .eq('id', logId)
      .single();

    if (logError || !log) return apiNotFound('施工日志不存在');

    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);
    if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(Number(log.project_id))) {
      return apiForbidden('无权查看该项目施工日志评论');
    }

    const { data, error } = await supabase
      .from('construction_log_comments')
      .select('id,log_id,project_id,user_id,user_name,content,mentioned_user_ids,created_at,updated_at')
      .eq('log_id', logId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return apiSuccess({
      comments: (data || []) as CommentRow[],
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '施工日志评论查询失败'));
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const logId = Number(id);
    if (!Number.isFinite(logId)) return apiNotFound('施工日志不存在');

    const body = asPayload(await request.json());
    const content = normalizeText(body.content);
    if (!content) return apiBadRequest('评论内容不能为空');

    const mentionedUserIds = parseIds(body.mentionedUserIds || body.mentioned_user_ids);
    const supabase = getSupabaseClient();

    const { data: log, error: logError } = await supabase
      .from('construction_logs')
      .select('id,project_id,user_id,log_date')
      .eq('id', logId)
      .single();

    if (logError || !log) return apiNotFound('施工日志不存在');

    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);
    if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(Number(log.project_id))) {
      return apiForbidden('无权评论该项目施工日志');
    }

    const userName = getUserDisplayName(auth.user);
    const { data: inserted, error } = await supabase
      .from('construction_log_comments')
      .insert({
        log_id: logId,
        project_id: Number(log.project_id),
        user_id: Number(auth.user.id),
        user_name: userName || null,
        content,
        mentioned_user_ids: mentionedUserIds,
      })
      .select('id,log_id,project_id,user_id,user_name,content,mentioned_user_ids,created_at,updated_at')
      .single();

    if (error) throw new Error(error.message);

    const recipientUserIds = await resolveCommentRecipients(
      supabase,
      Number(log.project_id),
      Number(log.user_id),
      Number(auth.user.id),
      mentionedUserIds,
    );

    if (recipientUserIds.length > 0) {
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', Number(log.project_id))
        .maybeSingle();

      const projectName = project?.name || '项目';
      const commenterDisplayName = userName || '未知用户';
      const notificationTitle = `${projectName} 施工日志评论`;
      const notificationContent = `${commenterDisplayName} 评论了 ${projectName} ${log.log_date || ''} 的施工日志：${content}`;

      await pushBusinessNotification({
        type: 'construction_log_comment',
        title: notificationTitle,
        content: notificationContent,
        severity: 'info',
        projectId: Number(log.project_id),
        relatedId: Number(log.id),
        relatedType: 'construction_log',
        recipientUserIds,
        metadata: {
          commentId: inserted.id,
          comment_id: inserted.id,
          section: 'comments',
          projectName: project?.name || '',
          logDate: log.log_date || '',
          commenterName: commenterDisplayName,
          commentContent: content,
          businessSummary: `${projectName} ${log.log_date || ''} 施工日志：${commenterDisplayName} 评论了「${content.length > 50 ? content.slice(0, 50) + '...' : content}」`,
        },
      });
    }

    return apiSuccess({
      comment: inserted as CommentRow,
      recipientCount: recipientUserIds.length,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '施工日志评论保存失败'));
  }
}
