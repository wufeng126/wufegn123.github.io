import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getRequestAuthUser, type RequestAuthUser } from '@/lib/auth';
import { requireApiWritePermission } from '@/lib/api-auth';
import { getUserDisplayName } from '@/lib/user-display-name';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

type UserPayload = RequestAuthUser;

async function getAuthUser(request: NextRequest): Promise<UserPayload | null> {
  return getRequestAuthUser(request);
}

/**
 * 校验当前用户是否有权访问指定限价记录所在项目。
 * super_admin / 公司管理员 放行；其他角色必须命中可访问项目列表。
 * 返回 true=放行，false=已写入 403 响应（调用方直接 return response）。
 */
async function assertLimitPriceProjectAccess(
  supabase: ReturnType<typeof getSupabaseClient>,
  user: UserPayload,
  projectId: number | null | undefined,
): Promise<{ allowed: true } | { allowed: false; response: NextResponse }> {
  if (user.is_super_admin || user.role === '公司管理员') {
    return { allowed: true };
  }
  if (!projectId) {
    return { allowed: false, response: NextResponse.json({ error: '记录未关联项目，无权操作' }, { status: 403 }) };
  }
  const accessibleProjects = await getAccessibleProjectIds(supabase, user);
  // accessibleProjects === null 理论上不会出现（非 super_admin 已在上方拦截），做防御性处理
  if (accessibleProjects === null) return { allowed: true };
  if (!accessibleProjects.includes(Number(projectId))) {
    return { allowed: false, response: NextResponse.json({ error: '无权操作此项目的限价记录' }, { status: 403 }) };
  }
  return { allowed: true };
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

// GET /api/limit-prices/[id] - 获取单条限价详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseClient();
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  
  const { id } = await params;
  
  const { data, error } = await supabase
    .from('project_limit_prices')
    .select(`
      *,
      project:projects(id, name),
      logs:project_limit_price_logs(*)
    `)
    .eq('id', parseInt(id))
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  if (!data) {
    return NextResponse.json({ error: '记录不存在' }, { status: 404 });
  }
  
  // 检查权限（统一走 getAccessibleProjectIds，合并 managed_projects + user_project_roles）
  const access = await assertLimitPriceProjectAccess(supabase, user, data.project_id);
  if (!access.allowed) return access.response;

  return NextResponse.json({ data });
}

// PUT /api/limit-prices/[id] - 更新限价
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseClient();
  const auth = await requireApiWritePermission(request);
  if (!auth.ok) {
    return auth.response;
  }
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  
  const { id } = await params;
  const body = await request.json();
  
  // 权限检查（写权限：super_admin / 公司管理员 / 商务 / admin）
  if (!user.is_super_admin && user.role !== '公司管理员' && user.role !== '商务' && user.role !== 'admin') {
    return NextResponse.json({ error: '无权限修改' }, { status: 403 });
  }

  // 获取当前记录
  const { data: current, error: fetchError } = await supabase
    .from('project_limit_prices')
    .select('*')
    .eq('id', parseInt(id))
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: '记录不存在' }, { status: 404 });
  }

  // 项目级权限校验（IDOR 防护：商务/管理员只能操作自己被授权项目的记录）
  const access = await assertLimitPriceProjectAccess(supabase, user, current.project_id);
  if (!access.allowed) return access.response;

  // 审核生效后，只有管理员可修改
  if (current.status === '审核生效' && !user.is_super_admin && user.role !== '公司管理员') {
    return NextResponse.json({ error: '已审核的限价只有管理员可修改' }, { status: 403 });
  }
  
  const operatorName = getUserDisplayName(user);

  const updateData = {
    subitem_name: body.subitem_name,
    work_type: body.work_type,
    team_name: body.team_name,
    unit: body.unit,
    limit_unit_price: body.limit_unit_price,
    plan_quantity: body.plan_quantity,
    actual_quantity: body.actual_quantity,
    actual_unit_price: body.actual_unit_price,
    remark: body.remark
  };
  
  const { data, error } = await supabase
    .from('project_limit_prices')
    .update(updateData)
    .eq('id', parseInt(id))
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 记录操作日志
  await logAction(supabase, data.id, '修改', user.id, operatorName, {
    before: current,
    after: body
  });
  
  return NextResponse.json({ data });
}

// DELETE /api/limit-prices/[id] - 删除限价
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseClient();
  const auth = await requireApiWritePermission(request);
  if (!auth.ok) {
    return auth.response;
  }
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  
  const { id } = await params;
  
  // 权限检查（写权限：super_admin / 公司管理员 / 商务 / admin）
  if (!user.is_super_admin && user.role !== '公司管理员' && user.role !== '商务' && user.role !== 'admin') {
    return NextResponse.json({ error: '无权限删除' }, { status: 403 });
  }

  // 获取当前记录
  const { data: current } = await supabase
    .from('project_limit_prices')
    .select('*')
    .eq('id', parseInt(id))
    .single();

  if (!current) {
    return NextResponse.json({ error: '记录不存在' }, { status: 404 });
  }

  // 项目级权限校验（IDOR 防护：商务/管理员只能删除自己被授权项目的记录）
  const access = await assertLimitPriceProjectAccess(supabase, user, current.project_id);
  if (!access.allowed) return access.response;

  // 已审核的不能删除
  if (current.status === '审核生效') {
    return NextResponse.json({ error: '已审核的限价不能删除，请先作废' }, { status: 403 });
  }
  
  const operatorName = getUserDisplayName(user);

  const { error } = await supabase
    .from('project_limit_prices')
    .delete()
    .eq('id', parseInt(id));
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 记录操作日志
  await logAction(supabase, parseInt(id), '删除', user.id, operatorName, current);
  
  return NextResponse.json({ success: true });
}
