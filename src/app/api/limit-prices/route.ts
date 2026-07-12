import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { insertWithSequenceFix } from '@/lib/audit-log';
import { getRequestAuthUser, type RequestAuthUser } from '@/lib/auth';

type UserPayload = RequestAuthUser;

async function getAuthUser(request: NextRequest): Promise<UserPayload | null> {
  return getRequestAuthUser(request);
}

function logAction(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  limitPriceId: number,
  action: string,
  operatorId: number | null,
  operatorName: string | null,
  detail: Record<string, unknown>
) {
  return supabase.from('project_limit_price_logs').insert({
    limit_price_id: limitPriceId,
    action,
    operator_id: operatorId,
    operator_name: operatorName,
    detail
  });
}

// GET /api/limit-prices - 获取限价列表
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('project_id');
  const status = searchParams.get('status');
  const workType = searchParams.get('work_type');
  const search = searchParams.get('search');
  
  let query = supabase
    .from('project_limit_prices')
    .select(`
      *,
      project:projects(id, name)
    `)
    .order('created_at', { ascending: false });
  
  // 项目权限隔离
  if (!user.is_super_admin && user.role !== '公司管理员') {
    // 获取用户的项目列表
    const { data: userData } = await supabase
      .from('users')
      .select('managed_projects')
      .eq('id', user.id)
      .single();
    
    const userProjects = userData?.managed_projects || [];
    if (userProjects.length > 0) {
      query = query.in('project_id', userProjects);
    } else {
      return NextResponse.json({ data: [], stats: { total: 0, draft: 0, active: 0, invalidated: 0, totalLimitAmount: 0, totalActualAmount: 0, totalExcess: 0 } });
    }
  }
  
  if (projectId && projectId !== 'all') {
    query = query.eq('project_id', parseInt(projectId));
  }
  
  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  
  if (workType && workType !== 'all') {
    query = query.eq('work_type', workType);
  }
  
  if (search) {
    query = query.or(`subitem_name.ilike.%${search}%,work_type.ilike.%${search}%,team_name.ilike.%${search}%`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 计算统计数据
  const stats = {
    total: data?.length || 0,
    draft: data?.filter((d: any) => d.status === '草稿').length || 0,
    active: data?.filter((d: any) => d.status === '审核生效').length || 0,
    invalidated: data?.filter((d: any) => d.status === '作废').length || 0,
    totalLimitAmount: data?.reduce((sum: number, d: any) => sum + parseFloat(d.limit_total_price || 0), 0) || 0,
    totalActualAmount: data?.reduce((sum: number, d: any) => sum + parseFloat(d.actual_total_price || 0), 0) || 0,
    totalExcess: data?.reduce((sum: number, d: any) => sum + parseFloat(d.excess_amount || 0), 0) || 0
  };
  
  return NextResponse.json({ data: data || [], stats });
}

// POST /api/limit-prices - 新增限价
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  
  const body = await request.json();
  const {
    project_id, subitem_name, work_type, team_name, unit,
    limit_unit_price, plan_quantity, remark
  } = body;
  
  if (!project_id || !subitem_name || !unit || !limit_unit_price) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
  }
  
  // 权限检查：所有登录用户都可创建
  // if (!user.is_super_admin && user.role !== '公司管理员' && user.role !== '商务' && user.role !== 'admin') {
  //   return NextResponse.json({ error: '无权限创建限价' }, { status: 403 });
  // }
  
  const { data: lpData, error: lpError } = await insertWithSequenceFix('project_limit_prices', {
      project_id,
      subitem_name,
      work_type,
      team_name,
      unit,
      limit_unit_price,
      plan_quantity: plan_quantity || 0,
      remark,
      status: '草稿',
      created_by: user.id,
      created_by_name: user.username
    }, supabase);
  if (lpError) throw lpError;
  const data = Array.isArray(lpData) ? lpData[0] : lpData;
  
  // 记录操作日志
  await logAction(supabase, data?.id, '创建', user.id, user.username, body);
  
  return NextResponse.json({ data });
}
