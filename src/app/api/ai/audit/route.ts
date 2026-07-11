import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/ai/audit - 获取审计日志
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const action = searchParams.get('action');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '20');

    let query = supabase.from('ai_audit_logs').select('*', { count: 'exact' });

    if (userId) query = query.eq('user_id', userId);
    if (action) query = query.eq('action', action);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate + 'T23:59:59');

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

// POST /api/ai/audit/export - 导出审计日志
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { user_id, action, start_date, end_date } = body;

    let query = supabase.from('ai_audit_logs').select('*');

    if (user_id) query = query.eq('user_id', user_id);
    if (action) query = query.eq('action', action);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date + 'T23:59:59');

    query = query.order('created_at', { ascending: false }).limit(5000);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 生成CSV
    const headers = ['时间', '用户ID', '用户名', '操作', '输入摘要', '输出摘要', '页面', '模型', 'Token数', '耗时ms', '成功', '错误信息'];
    const rows = (data || []).map((r: any) => [
      r.created_at, r.user_id, r.username, r.action,
      (r.input_summary || '').replace(/[,\n]/g, ' '),
      (r.output_summary || '').replace(/[,\n]/g, ' '),
      r.page_context, r.model_id, r.token_usage, r.response_time_ms,
      r.is_success ? '是' : '否', (r.error_message || '').replace(/[,\n]/g, ' '),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    return NextResponse.json({
      success: true,
      data: csv,
      filename: `ai_audit_${new Date().toISOString().slice(0, 10)}.csv`,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
