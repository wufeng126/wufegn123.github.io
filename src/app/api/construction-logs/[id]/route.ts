import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiForbidden, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { detectConstructionLogRisk, enrichConstructionLog } from '@/lib/construction-log-risk';

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

    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);
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

    return apiSuccess({
      ...enrichConstructionLog(log),
      project: project || null,
      attendance_workers: attendanceWorkers || [],
      risk,
      risk_doc: riskDoc || null,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '施工日志详情查询失败'));
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

    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);
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
