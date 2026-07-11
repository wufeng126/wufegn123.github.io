import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { searchKnowledge, addKnowledgeDoc, extractForwardHeaders } from '@/lib/ai-service';
import { syncAllBusinessData, syncSingleDataType } from '@/lib/ai-knowledge-sync';

// GET /api/ai/knowledge - 获取知识库文档列表
export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: { page, pageSize, total: count || 0 },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// POST /api/ai/knowledge - 新增知识库文档
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, category, source_type, content, source_ref, created_by, tags } = body;

    if (!title || !category || !content) {
      return NextResponse.json({ success: false, error: '标题、分类和内容不能为空' }, { status: 400 });
    }

    // 添加到向量知识库
    const forwardHeaders = extractForwardHeaders(request.headers);
    const kbSuccess = await addKnowledgeDoc(title, content, undefined, forwardHeaders);

    // 保存到数据库
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('ai_knowledge_docs').insert({
      title,
      category,
      source_type: source_type || 'manual',
      source_ref,
      content,
      tags: Array.isArray(tags)
        ? tags
        : typeof tags === 'string'
          ? tags.split(',').map((tag: string) => tag.trim()).filter(Boolean)
          : [],
      status: kbSuccess ? 'active' : 'error',
      error_message: kbSuccess ? null : '向量库同步失败',
      chunk_count: kbSuccess ? 1 : 0,
      created_by,
      last_sync_at: kbSuccess ? new Date().toISOString() : null,
    }).select().single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// DELETE /api/ai/knowledge - 删除知识库文档
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少文档ID' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from('ai_knowledge_docs').update({
      status: 'deleted',
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// PUT /api/ai/knowledge - 同步业务数据到知识库
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data_type } = body;

    if (action === 'sync_business') {
      const forwardHeaders = extractForwardHeaders(request.headers);
      const result = await syncSingleDataType(data_type || 'all', forwardHeaders);
      return NextResponse.json({ success: result.success, data: result.synced, errors: result.errors });
    }

    if (action === 'refresh_all') {
      const forwardHeaders = extractForwardHeaders(request.headers);
      const result = await syncAllBusinessData(forwardHeaders);
      return NextResponse.json({ success: result.success, data: result.synced, errors: result.errors });
    }

    return NextResponse.json({ success: false, error: '未知操作' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
