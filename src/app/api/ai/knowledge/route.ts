import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { addKnowledgeDoc, extractForwardHeaders } from '@/lib/ai-service';
import { syncAllBusinessData, syncSingleDataType } from '@/lib/ai-knowledge-sync';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiResult, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getKnowledgeQuality, normalizeKnowledgeTags, upsertKnowledgeQualityTag } from '@/lib/knowledge-taxonomy';

// GET /api/ai/knowledge - 获取知识库文档列表
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status') || 'active';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '20');

    let query = supabase.from('ai_knowledge_docs').select('*', { count: 'exact' });

    if (category) query = query.eq('category', category);
    if (status) query = query.eq('status', status);

    query = query.order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return apiServerError(error.message);
    }

    return apiSuccess(data || [], {
      meta: { pagination: { page, pageSize, total: count || 0 } },
    });
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '知识库列表查询失败'));
  }
}

// POST /api/ai/knowledge - 新增知识库文档
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { title, category, source_type, content, source_ref, created_by, tags } = body;

    if (!title || !category || !content) {
      return apiBadRequest('标题、分类和内容不能为空');
    }

    const sourceType = source_type || 'manual';
    const normalizedTags = normalizeKnowledgeTags(tags);
    const tagsWithQuality = normalizedTags.some(tag => tag.startsWith('知识等级:'))
      ? normalizedTags
      : upsertKnowledgeQualityTag(normalizedTags, getKnowledgeQuality(normalizedTags, sourceType, category));

    // 添加到向量知识库
    const forwardHeaders = extractForwardHeaders(request.headers);
    const kbSuccess = await addKnowledgeDoc(title, content, undefined, forwardHeaders);

    // 保存到数据库
    const supabase = getSupabaseClient();
    const insertData: Record<string, any> = {
      title,
      category,
      source_type: sourceType,
      source_ref,
      content,
      tags: tagsWithQuality,
      status: kbSuccess ? 'active' : 'error',
      error_message: kbSuccess ? null : '向量库同步失败',
      chunk_count: kbSuccess ? 1 : 0,
      last_sync_at: kbSuccess ? new Date().toISOString() : null,
    };
    if (body.file_key) insertData.file_key = body.file_key;
    if (body.file_name) insertData.file_name = body.file_name;
    if (body.file_size) insertData.file_size = body.file_size;
    // created_by 为整数时才传入，避免字符串写入 integer 字段报错
    const createdByNum = typeof created_by === 'number' ? created_by :
      (typeof created_by === 'string' && /^\d+$/.test(created_by) ? parseInt(created_by, 10) : NaN);
    if (!isNaN(createdByNum)) insertData.created_by = createdByNum;

    const { data, error } = await supabase.from('ai_knowledge_docs').insert(insertData).select().single();

    if (error) {
      return apiServerError(error.message);
    }

    return apiSuccess(data);
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '知识库文档新增失败'));
  }
}

// DELETE /api/ai/knowledge - 删除知识库文档
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return apiBadRequest('缺少文档ID');
    }

    const supabase = getSupabaseClient();
    const { data: existingDoc, error: fetchError } = await supabase
      .from('ai_knowledge_docs')
      .select('id,tags')
      .eq('id', id)
      .single();

    if (fetchError || !existingDoc) {
      return apiServerError(fetchError?.message || '知识文档不存在');
    }

    const tags = normalizeKnowledgeTags(existingDoc.tags);
    const isMonthlyAnalysis = tags.includes('月度分析');
    const isDraft = tags.includes('状态:草稿');
    if (isMonthlyAnalysis && !isDraft) {
      return apiBadRequest('月度分析已进入流转，只有草稿状态可以删除');
    }

    const { error } = await supabase.from('ai_knowledge_docs').update({
      status: 'deleted',
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (error) {
      return apiServerError(error.message);
    }

    return apiSuccess(null);
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '知识库文档删除失败'));
  }
}

// PUT /api/ai/knowledge - 同步业务数据到知识库
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { action, data_type } = body;

    if (action === 'sync_business') {
      const forwardHeaders = extractForwardHeaders(request.headers);
      const result = await syncSingleDataType(data_type || 'all', forwardHeaders);
      return apiResult(result.success, result.synced, {
        code: result.success ? 'OK' : 'SYNC_FAILED',
        error: '业务数据同步未完全成功',
        meta: { errors: result.errors },
      });
    }

    if (action === 'refresh_all') {
      const forwardHeaders = extractForwardHeaders(request.headers);
      const result = await syncAllBusinessData(forwardHeaders);
      return apiResult(result.success, result.synced, {
        code: result.success ? 'OK' : 'SYNC_FAILED',
        error: '知识库刷新未完全成功',
        meta: { errors: result.errors },
      });
    }

    return apiBadRequest('未知操作');
  } catch (e: unknown) {
    return apiServerError(getErrorMessage(e, '知识库同步失败'));
  }
}
