import { NextRequest } from 'next/server';
import { requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import {
  buildRiskKnowledgeContent,
  buildRiskKnowledgeTags,
  detectConstructionLogRisk,
  getRiskLevelLabel,
  getRiskTypeLabel,
  type ConstructionRiskWorkflowStatus,
  upsertRiskWorkflowTags,
} from '@/lib/construction-log-risk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type RiskAction = 'acknowledge' | 'monthly' | 'mark_monthly_included';

const ACTION_CONFIG: Record<RiskAction, { status: ConstructionRiskWorkflowStatus; label: string }> = {
  acknowledge: { status: 'confirmed', label: '已确认' },
  monthly: { status: 'monthly', label: '待入月报' },
  mark_monthly_included: { status: 'monthly_included', label: '已进入月报' },
};

function toArrayTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.filter((tag): tag is string => typeof tag === 'string');
  if (typeof tags === 'string') return tags.split(',').map(tag => tag.trim()).filter(Boolean);
  return [];
}

function appendActionRecord(content: string, label: string, operator: string, note?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const line = `- ${today}：${operator}执行「${label}」${note ? `，说明：${note}` : ''}。`;
  const next = content.includes('**流转状态**：')
    ? content.replace(/\*\*流转状态\*\*：.*\n/, `**流转状态**：${label}\n`)
    : content;
  if (next.includes('### 处理记录')) return `${next}\n${line}`;
  return `${next}\n\n### 处理记录\n${line}`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const logId = Number(body.logId || body.log_id);
    const action = body.action as RiskAction;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const monthlyDocId = body.monthlyDocId ? Number(body.monthlyDocId) : null;
    const reportMonth = typeof body.reportMonth === 'string' ? body.reportMonth.trim() : '';

    if (!logId) return apiBadRequest('缺少施工日志ID');
    if (!ACTION_CONFIG[action]) return apiBadRequest('未知提醒标记');

    const supabase = getSupabaseClient();
    const { data: log, error: logError } = await supabase
      .from('construction_logs')
      .select('*')
      .eq('id', logId)
      .single();
    if (logError || !log) throw new Error(logError?.message || '施工日志不存在');

    const risk = detectConstructionLogRisk({ content: log.content, issues: log.issues });
    if (!risk.hasRisk) return apiBadRequest('该日志未识别到风险，不需要加入风险提醒');

    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', log.project_id)
      .single();
    const projectName = (project as any)?.name || `项目${log.project_id}`;

    const { data: existingDoc } = await supabase
      .from('ai_knowledge_docs')
      .select('*')
      .eq('source_type', 'construction_log')
      .eq('source_ref', `cl:${logId}`)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let doc = existingDoc as any;
    if (!doc) {
      const levelLabel = getRiskLevelLabel(risk.level);
      const typeLabel = risk.primaryType ? getRiskTypeLabel(risk.primaryType) : '风险';
      const insertData: Record<string, any> = {
        title: `${projectName} ${log.log_date || ''} 施工日志 - ${typeLabel}(${levelLabel})`,
        category: risk.types.includes('cost') ? '成本分析' : risk.types.includes('visa') ? '签证' : '经验总结',
        source_type: 'construction_log',
        source_ref: `cl:${logId}`,
        tags: buildRiskKnowledgeTags({ projectId: log.project_id, projectName, logDate: log.log_date, risk }),
        content: buildRiskKnowledgeContent({
          projectName,
          projectId: log.project_id,
          logId,
          logDate: log.log_date,
          location: log.location,
          content: log.content,
          issues: log.issues,
          risk,
        }),
        status: 'active',
      };
      if (auth.user?.id) insertData.created_by = auth.user.id;
      const { data: createdDoc, error: createDocError } = await supabase
        .from('ai_knowledge_docs')
        .insert(insertData)
        .select()
        .single();
      if (createDocError) throw new Error(createDocError.message);
      doc = createdDoc;
    }

    const config = ACTION_CONFIG[action];
    const operator = auth.user?.name || auth.user?.username || '当前用户';
    let nextTags = upsertRiskWorkflowTags(toArrayTags(doc.tags), config.status, config.label);

    if (reportMonth) {
      nextTags = [...nextTags.filter(tag => !tag.startsWith('月报月份:')), `月报月份:${reportMonth}`];
    }
    if (monthlyDocId) {
      nextTags = [...nextTags.filter(tag => !tag.startsWith('月报ID:')), `月报ID:${monthlyDocId}`];
    }

    const nextContent = appendActionRecord(doc.content || '', config.label, operator, note);
    const { data: updatedDoc, error: updateError } = await supabase
      .from('ai_knowledge_docs')
      .update({
        tags: nextTags,
        content: nextContent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', doc.id)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

    return apiSuccess({
      logId,
      action,
      workflow_status: config.status,
      workflow_status_label: config.label,
      knowledge_doc: updatedDoc,
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '风险提醒标记失败'));
  }
}
