import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAIConfig } from '@/lib/ai-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * GET /api/ai/health
 * AI 助手自检：配置是否存在、是否启用、模型与凭据来源、知识库文档数量。
 * 用于前端在不可用时给出明确原因和修复入口，而不是只说"不可用"。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const config = await getAIConfig();

    let knowledgeDocs = 0;
    try {
      const supabase = getSupabaseClient();
      const { count } = await supabase
        .from('ai_knowledge_docs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      knowledgeDocs = count || 0;
    } catch {
      knowledgeDocs = 0;
    }

    const endpoint = String(config?.api_endpoint || '');
    let endpointHost = '';
    try {
      endpointHost = endpoint ? new URL(endpoint).host : '';
    } catch {
      endpointHost = endpoint ? endpoint.slice(0, 40) : '';
    }

    return apiSuccess({
      configured: Boolean(config),
      enabled: Boolean(config?.enabled),
      model: config?.model_id || null,
      has_key: Boolean(config?.api_key),
      endpoint_host: endpointHost,
      daily_limit: config?.daily_limit ?? null,
      knowledge_docs: knowledgeDocs,
      source: config?.id === 0 ? 'env' : 'database',
      ready: Boolean(config?.enabled),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, 'AI 自检失败'));
  }
}
