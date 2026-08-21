import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';

type AiAuditLogRow = {
  created_at?: string | null;
  user_id?: number | string | null;
  username?: string | null;
  action?: string | null;
  input_summary?: string | null;
  output_summary?: string | null;
  page_context?: string | null;
  model_id?: string | null;
  token_usage?: number | string | null;
  response_time_ms?: number | string | null;
  is_success?: boolean | null;
  error_message?: string | null;
};

function normalizePageParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseOptionalPositiveId(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

// GET /api/ai/audit - 获取审计日志
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:ai_manage');
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const action = searchParams.get('action');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const page = normalizePageParam(searchParams.get('page'), 1, 100000);
    const pageSize = normalizePageParam(searchParams.get('page_size'), 20, 100);
    const normalizedUserId = parseOptionalPositiveId(userId);

    if (userId && !normalizedUserId) {
      return NextResponse.json({ success: false, error: '用户ID格式不正确' }, { status: 400 });
    }

    let query = supabase.from('ai_audit_logs').select('*', { count: 'exact' });

    if (normalizedUserId) query = query.eq('user_id', normalizedUserId);
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '获取审计日志失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/ai/audit/export - 导出审计日志
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:ai_manage');
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const body = await request.json();
    const { user_id, action, start_date, end_date } = body;
    const normalizedUserId = parseOptionalPositiveId(user_id);

    if (user_id && !normalizedUserId) {
      return NextResponse.json({ success: false, error: '用户ID格式不正确' }, { status: 400 });
    }

    let query = supabase.from('ai_audit_logs').select('*');

    if (normalizedUserId) query = query.eq('user_id', normalizedUserId);
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
    const rows = ((data || []) as AiAuditLogRow[]).map((r) => [
      r.created_at, r.user_id, r.username, r.action,
      r.input_summary || '',
      r.output_summary || '',
      r.page_context, r.model_id, r.token_usage, r.response_time_ms,
      r.is_success ? '是' : '否', r.error_message || '',
    ]);

    const csv = [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n');

    return NextResponse.json({
      success: true,
      data: csv,
      filename: `ai_audit_${new Date().toISOString().slice(0, 10)}.csv`,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '导出审计日志失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
