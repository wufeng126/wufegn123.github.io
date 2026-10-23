import { NextRequest, NextResponse } from 'next/server';
import { addKnowledgeDoc, extractForwardHeaders } from '@/lib/ai-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/knowledge/refresh - 一键全量刷新知识库
 * 先清除旧数据，再重新同步所有业务数据+重新入库所有上传文档
 */
export async function POST(request: NextRequest) {
  try {
    // 修复：不再信任可伪造的 x-user-role 请求头，改服务端 token 鉴权
    const auth = await requirePermission(request, 'system:ai_manage');
    if (!auth.ok) return auth.response;

    const forwardHeaders = extractForwardHeaders(request.headers);

    // 业务数据同步已下线：知识库仅保留经验类内容，此处只做经验类文档的向量索引重建
    // （旧业务同步文档已隔离在废弃数据集 labor_ai_kb，新数据集 labor_ai_kb_exp 只含经验内容）
    // 重新入库所有经验类文档（从DB读取content，重新add到向量库）
    const supabase = getSupabaseClient();
    const { data: docs } = await supabase
      .from('ai_knowledge_docs')
      .select('id,title,content,category,source_type,source_ref')
      .eq('status', 'active')
      .neq('title', '__sync_status__')
      .neq('source_type', 'auto_sync');

    let reIndexed = 0;
    if (docs && docs.length > 0) {
      for (const doc of docs) {
        if (doc.source_type === 'construction_log' || String(doc.source_ref || '').startsWith('cl:')) continue;
        if (doc.content && doc.content.length > 10) {
          const success = await addKnowledgeDoc(
            doc.title,
            doc.content,
            doc.source_type === 'upload' ? 'coze_doc_knowledge' : undefined,
            forwardHeaders,
          );
          if (success) reIndexed++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        reIndexed,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
