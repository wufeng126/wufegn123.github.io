import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const month = searchParams.get('month'); // YYYY-MM

    let query = supabase.from('construction_logs').select('user_id, user_name, log_date');
    if (projectId) query = query.eq('project_id', parseInt(projectId));
    if (dateFrom) query = query.gte('log_date', dateFrom);
    if (dateTo) query = query.lte('log_date', dateTo);
    if (month) {
      query = query.gte('log_date', `${month}-01`).lte('log_date', `${month}-31`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // 按人员统计
    const stats: Record<string, { name: string; count: number; lastDate: string }> = {};
    (data || []).forEach((row: any) => {
      const key = String(row.user_id);
      if (!stats[key]) stats[key] = { name: row.user_name || `用户${row.user_id}`, count: 0, lastDate: '' };
      stats[key].count++;
      if (row.log_date > stats[key].lastDate) stats[key].lastDate = row.log_date;
    });

    const list = Object.entries(stats).map(([userId, val]) => ({
      user_id: parseInt(userId),
      user_name: val.name,
      count: val.count,
      last_date: val.lastDate,
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({ success: true, data: list, total: list.length });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
