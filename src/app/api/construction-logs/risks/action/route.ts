import { NextRequest } from 'next/server';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { detectConstructionLogRisk, updateConstructionRiskEventStatus } from '@/lib/construction-log-risk';
import { getConstructionLogAccessibleProjectIds } from '@/lib/public-log-project';
import { getSupabaseClient } from '@/storage/database/supabase-client';

function isMissingColumn(error: unknown, column: string) {
  const err = error as { message?: string; details?: string; code?: string } | null;
  const message = String(err?.message || err?.details || '').toLowerCase();
  return err?.code === '42703' || message.includes(column.toLowerCase());
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const logId = Number(body.logId || body.log_id);
    const action = String(body.action || 'acknowledge');

    if (!logId) return apiBadRequest('缺少施工日志ID');
    if (action !== 'acknowledge') return apiBadRequest('风险池只支持确认提醒');

    const supabase = getSupabaseClient();
    const { data: log, error: logError } = await supabase
      .from('construction_logs')
      .select('id,project_id,content,issues')
      .eq('id', logId)
      .single();

    if (logError || !log) throw new Error(logError?.message || '施工日志不存在');

    const accessibleProjectIds = await getConstructionLogAccessibleProjectIds(supabase, auth.user);
    if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(Number(log.project_id))) {
      return apiForbidden('无权确认该项目施工日志风险提醒');
    }

    const risk = detectConstructionLogRisk({ content: log.content, issues: log.issues });
    if (!risk.hasRisk) return apiBadRequest('该日志未识别到风险，无需确认');

    const now = new Date().toISOString();
    // is_read 是 varchar 字符串列，写入统一用字符串 'true'
    const query = supabase
      .from('notifications')
      .update({ is_read: 'true', read_at: now })
      .eq('type', 'construction_log_alert')
      .eq('related_type', 'construction_log')
      .eq('related_id', logId)
      .eq('recipient_user_id', auth.user.id);

    let result = await query.select('id');

    if (result.error && isMissingColumn(result.error, 'read_at')) {
      result = await supabase
        .from('notifications')
        .update({ is_read: 'true' })
        .eq('type', 'construction_log_alert')
        .eq('related_type', 'construction_log')
        .eq('related_id', logId)
        .eq('recipient_user_id', auth.user.id)
        .select('id');
    }

    if (result.error && isMissingColumn(result.error, 'recipient_user_id')) {
      result = await supabase
        .from('notifications')
        .update({ is_read: 'true' })
        .eq('type', 'construction_log_alert')
        .eq('related_type', 'construction_log')
        .eq('related_id', logId)
        .select('id');
    }

    if (result.error) throw new Error(result.error.message);

    // 同步更新风险事件流状态（confirmed + 操作人/时间）；表不存在时静默跳过（向后兼容）
    await updateConstructionRiskEventStatus(supabase, logId, 'confirmed', Number(auth.user.id));

    return apiSuccess({
      logId,
      action,
      workflow_status: 'confirmed',
      workflow_status_label: '已确认',
      updated_notifications: result.data?.length || 0,
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '风险提醒确认失败'));
  }
}
