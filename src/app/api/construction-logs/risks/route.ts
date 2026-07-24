import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { detectConstructionLogRisk, getRiskWorkflowStatusFromTags } from '@/lib/construction-log-risk';
import { getConstructionLogAccessibleProjectIds } from '@/lib/public-log-project';
import { getSupabaseClient } from '@/storage/database/supabase-client';

function toArrayTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.filter((tag): tag is string => typeof tag === 'string');
  if (typeof tags === 'string') {
    return tags.split(',').map(tag => tag.trim()).filter(Boolean);
  }
  return [];
}

function getLogIdFromSourceRef(sourceRef?: string | null) {
  const match = String(sourceRef || '').match(/^cl:(\d+)$/);
  return match ? Number(match[1]) : null;
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
        return apiSuccess([], {
          meta: {
            stats: {
              total: 0,
              pending: 0,
              confirmed: 0,
              visaCreated: 0,
              monthly: 0,
              monthlyIncluded: 0,
              resolved: 0,
              ignored: 0,
            },
          },
        });
      }
      query = query.eq('project_id', parsedProjectId);
    } else if (Array.isArray(accessibleProjectIds)) {
      if (accessibleProjectIds.length === 0) {
        return apiSuccess([], {
          meta: {
            stats: {
              total: 0,
              pending: 0,
              confirmed: 0,
              visaCreated: 0,
              monthly: 0,
              monthlyIncluded: 0,
              resolved: 0,
              ignored: 0,
            },
          },
        });
      }
      query = query.in('project_id', accessibleProjectIds);
    }

    const [{ data: logs, error: logError }, { data: docs, error: docError }, { data: projects }] = await Promise.all([
      query,
      supabase
        .from('ai_knowledge_docs')
        .select('id,title,source_ref,tags,content,updated_at,created_at')
        .eq('source_type', 'construction_log')
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id,name'),
    ]);

    if (logError) throw new Error(logError.message);
    if (docError) throw new Error(docError.message);

    const docsByLogId = new Map<number, any>();
    (docs || []).forEach((doc: any) => {
      const logId = getLogIdFromSourceRef(doc.source_ref);
      if (logId && !docsByLogId.has(logId)) docsByLogId.set(logId, doc);
    });

    const projectMap = new Map<number, string>();
    (projects || []).forEach((project: any) => projectMap.set(Number(project.id), project.name));

    const risks = (logs || [])
      .map((log: any) => {
        const risk = detectConstructionLogRisk({ content: log.content, issues: log.issues });
        if (!risk.hasRisk) return null;

        const doc = docsByLogId.get(Number(log.id));
        const tags = toArrayTags(doc?.tags);
        const workflowStatus = getRiskWorkflowStatusFromTags(tags);

        return {
          id: log.id,
          log_id: log.id,
          knowledge_doc_id: doc?.id || null,
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
          workflow_status_label: tags.find(tag => tag.startsWith('风险状态:'))?.replace('风险状态:', '') || '待确认',
          workflow_tags: tags,
          updated_at: doc?.updated_at || log.created_at,
        };
      })
      .filter(Boolean)
      .filter((item: any) => status === 'all' || item.workflow_status === status);

    return apiSuccess(risks, {
      meta: {
        stats: {
          total: risks.length,
          pending: risks.filter((item: any) => item.workflow_status === 'pending').length,
          confirmed: risks.filter((item: any) => item.workflow_status === 'confirmed').length,
          visaCreated: risks.filter((item: any) => item.workflow_status === 'visa_created').length,
          monthly: risks.filter((item: any) => item.workflow_status === 'monthly').length,
          monthlyIncluded: risks.filter((item: any) => item.workflow_status === 'monthly_included').length,
          resolved: risks.filter((item: any) => item.workflow_status === 'resolved').length,
          ignored: risks.filter((item: any) => item.workflow_status === 'ignored').length,
        },
      },
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '风险池查询失败'));
  }
}
