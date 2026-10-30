import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 20)));
    const status = searchParams.get('status');
    const projectId = searchParams.get('projectId');

    const client = getSupabaseClient();
    let query = client
      .from('wps_worker_sync_logs')
      .select('*', { count: 'exact' });

    // 项目范围：非超管只能查看自己有权限项目的同步日志
    const accessibleProjectIds = await getAccessibleProjectIds(client, auth.user);
    if (Array.isArray(accessibleProjectIds)) {
      if (accessibleProjectIds.length === 0) {
        return NextResponse.json({
          success: true,
          logs: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
        });
      }
      query = query.in('project_id', accessibleProjectIds);
    }

    if (status && status !== 'all') query = query.eq('status', status);
    if (projectId && projectId !== 'all') query = query.eq('project_id', Number(projectId));

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      logs: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '查询WPS同步日志失败' },
      { status: 500 }
    );
  }
}
