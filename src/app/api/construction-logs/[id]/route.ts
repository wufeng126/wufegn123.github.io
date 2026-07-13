import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
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

    const risk = detectConstructionLogRisk({ content: log.content, issues: log.issues });

    return apiSuccess({
      ...enrichConstructionLog(log),
      project: project || null,
      risk,
      risk_doc: riskDoc || null,
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '施工日志详情查询失败'));
  }
}
