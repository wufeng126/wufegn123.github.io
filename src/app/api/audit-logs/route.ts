import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/audit-logs - 查询审计日志（分页、筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const operationType = searchParams.get('operation_type') || '';
    const resourceType = searchParams.get('resource_type') || '';
    const username = searchParams.get('username') || '';
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';

    const supabase = getSupabaseClient();

    // 构建查询
    let query = supabase
      .from('operation_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // 筛选条件
    if (operationType) {
      query = query.eq('operation_type', operationType);
    }
    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }
    if (username) {
      query = query.ilike('username', `%${username}%`);
    }
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate + ' 23:59:59');
    }

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      logs: data || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[AuditLogs] GET error:', err);
    return NextResponse.json({ error: '获取审计日志失败' }, { status: 500 });
  }
}

// DELETE /api/audit-logs - 清理审计日志（按日期范围）
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const beforeDate = searchParams.get('before_date');

    if (!beforeDate) {
      return NextResponse.json({ error: '请指定清理截止日期' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error, count } = await supabase
      .from('operation_logs')
      .delete()
      .lt('created_at', beforeDate + ' 00:00:00');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deletedCount: count || 0,
      message: `已清理 ${beforeDate} 之前的 ${count || 0} 条日志`,
    });
  } catch (err) {
    console.error('[AuditLogs] DELETE error:', err);
    return NextResponse.json({ error: '清理审计日志失败' }, { status: 500 });
  }
}
