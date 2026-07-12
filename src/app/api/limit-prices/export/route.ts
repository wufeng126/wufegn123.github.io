import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getRequestAuthUser, type RequestAuthUser } from '@/lib/auth';

type UserPayload = RequestAuthUser;

async function getAuthUser(request: NextRequest): Promise<UserPayload | null> {
  return getRequestAuthUser(request);
}

// GET /api/limit-prices/export - 导出限价数据
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('project_id');
  const status = searchParams.get('status');
  
  let query = supabase
    .from('project_limit_prices')
    .select(`
      *,
      project:projects(name)
    `)
    .order('created_at', { ascending: false });
  
  // 项目权限隔离
  if (!user.is_super_admin && user.role !== '公司管理员') {
    const { data: userData } = await supabase
      .from('users')
      .select('managed_projects')
      .eq('id', user.id)
      .single();
    
    const userProjects = userData?.managed_projects || [];
    if (userProjects.length > 0) {
      query = query.in('project_id', userProjects);
    }
  }
  
  if (projectId && projectId !== 'all') {
    query = query.eq('project_id', parseInt(projectId));
  }
  
  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  
  const { data, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 生成 CSV
  const headers = [
    '项目名称',
    '劳务子项',
    '工种',
    '班组',
    '单位',
    '限价单价',
    '计划工程量',
    '限价合价',
    '实际单价',
    '实际工程量',
    '实际合价',
    '单价差',
    '超支差额',
    '状态',
    '创建时间'
  ];
  
  const rows = (data || []).map((item: any) => [
    item.project?.name || '',
    item.subitem_name,
    item.work_type || '',
    item.team_name || '',
    item.unit,
    item.limit_unit_price,
    item.plan_quantity,
    item.limit_total_price,
    item.actual_unit_price || '',
    item.actual_quantity || '',
    item.actual_total_price || '',
    item.price_difference || '',
    item.excess_amount || '',
    item.status,
    new Date(item.created_at).toLocaleString('zh-CN')
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map((row: (string | number)[]) => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
  ].join('\n');
  
  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="限价管理_${new Date().toISOString().split('T')[0]}.csv"`
    }
  });
}
