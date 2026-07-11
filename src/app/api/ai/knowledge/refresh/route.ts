import { NextRequest, NextResponse } from 'next/server';
import { addKnowledgeDoc, extractForwardHeaders, createKnowledgeClient, DATASET_NAME } from '@/lib/ai-service';
import { syncAllBusinessData, getSyncStatus } from '@/lib/ai-knowledge-sync';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { Config, KnowledgeClient } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/knowledge/refresh - 一键全量刷新知识库
 * 先清除旧数据，再重新同步所有业务数据+重新入库所有上传文档
 */
export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role') || 'team_leader';
    if (!['super_admin', 'admin'].includes(userRole)) {
      return NextResponse.json({ success: false, error: '仅管理员可刷新知识库' }, { status: 403 });
    }

    const forwardHeaders = extractForwardHeaders(request.headers);

    // Step 1: 全量同步业务数据
    const syncResult = await syncAllBusinessData(forwardHeaders);

    // Step 2: 重新入库所有上传文档（从DB读取content，重新add到向量库）
    const supabase = getSupabaseClient();
    const { data: docs } = await supabase
      .from('ai_knowledge_docs')
      .select('id,title,content,category,source_type')
      .eq('status', 'active')
      .neq('title', '__sync_status__')
      .neq('source_type', 'auto_sync');

    let reIndexed = 0;
    if (docs && docs.length > 0) {
      for (const doc of docs) {
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
      success: syncResult.success,
      data: {
        synced: syncResult.synced,
        reIndexed,
        syncErrors: syncResult.errors,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
