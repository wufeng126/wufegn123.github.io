import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import {
  buildRiskKnowledgeContent,
  buildRiskKnowledgeTags,
  detectConstructionLogRisk,
  enrichConstructionLog,
  getRiskLevelLabel,
  getRiskTypeLabel,
} from '@/lib/construction-log-risk';

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

    let query = supabase
      .from('construction_logs')
      .select('*', { count: 'exact' })
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', parseInt(projectId));
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
    const body = await request.json();
    const { project_id, log_date, location, content, headcount, issues } = body;

    if (!project_id || !log_date || !content) {
      return apiBadRequest('项目、日期和施工内容不能为空');
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('construction_logs')
      .insert({
        project_id: parseInt(project_id),
        user_id: user?.id || 0,
        user_name: user?.name || user?.username || '未知',
        log_date,
        location: location || null,
        content,
        headcount: headcount ? parseInt(headcount) : null,
        issues: issues || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const risk = detectConstructionLogRisk({ content, issues });

    if (data && risk.hasRisk) {
      const { data: proj } = await supabase
        .from('projects')
        .select('name')
        .eq('id', parseInt(project_id))
        .single();
      const projName = (proj as any)?.name || `项目${project_id}`;
      const typeLabel = risk.primaryType ? getRiskTypeLabel(risk.primaryType) : '风险';
      const levelLabel = getRiskLevelLabel(risk.level);
      const knowledgeContent = buildRiskKnowledgeContent({
        projectName: projName,
        projectId: project_id,
        logId: data.id,
        logDate: log_date,
        location,
        content,
        issues,
        risk,
      });

      const insertDoc: Record<string, any> = {
        title: `${projName} ${log_date || ''} 施工日志 - ${typeLabel}${levelLabel ? `(${levelLabel})` : ''}`,
        category: risk.types.includes('cost') ? '成本分析' : risk.types.includes('visa') ? '签证' : '经验总结',
        source_type: 'construction_log',
        source_ref: `cl:${data.id}`,
        tags: buildRiskKnowledgeTags({ projectId: project_id, projectName: projName, logDate: log_date, risk }),
        content: knowledgeContent,
        status: 'active',
      };
      if (user?.id) insertDoc.created_by = user.id;

      await supabase.from('ai_knowledge_docs').insert(insertDoc);

      const { pushBusinessNotification } = await import('@/lib/business-notification');
      await pushBusinessNotification({
        type: 'construction_log_alert',
        title: `${projName} 施工日志识别到${typeLabel}风险`,
        content: `${log_date || ''} ${risk.summary}。${risk.recommendation}`,
        severity: risk.level === 'high' ? 'danger' : 'warning',
        projectId: parseInt(project_id),
        relatedId: data.id,
        relatedType: 'construction_log',
        metadata: {
          riskTypes: risk.types,
          riskLevel: risk.level,
          matchedKeywords: risk.matchedKeywords,
        },
      });
    }

    return apiSuccess(enrichConstructionLog(data));
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '提交失败'));
  }
}
