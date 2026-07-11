import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const userId = searchParams.get('userId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    let query = supabase.from('construction_logs').select('*', { count: 'exact' }).order('log_date', { ascending: false }).order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', parseInt(projectId));
    if (userId) query = query.eq('user_id', parseInt(userId));
    if (dateFrom) query = query.gte('log_date', dateFrom);
    if (dateTo) query = query.lte('log_date', dateTo);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: data || [], pagination: { page, pageSize, total: count || 0 } });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const { project_id, log_date, location, content, headcount, issues } = body;

    if (!project_id || !log_date || !content) {
      return NextResponse.json({ success: false, error: '项目、日期和施工内容不能为空' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('construction_logs').insert({
      project_id: parseInt(project_id),
      user_id: user?.id || 0,
      user_name: user?.name || user?.username || '未知',
      log_date,
      location: location || null,
      content,
      headcount: headcount ? parseInt(headcount) : null,
      issues: issues || null,
    }).select().single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : '提交失败' }, { status: 500 });
  }
}
