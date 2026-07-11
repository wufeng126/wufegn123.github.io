import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { jwtVerify } from 'jose';
import { isSuperAdminUser } from '@/lib/route-permissions';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

interface UserPayload {
  id: number;
  username: string;
  role: string;
  roleId?: number;
  is_super_admin: boolean;
}

async function getAuthUser(request: NextRequest): Promise<UserPayload | null> {
  try {
    // 从 cookie 获取 token
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      // 尝试从 header 获取
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const tokenFromHeader = authHeader.substring(7);
        const { payload } = await jwtVerify(tokenFromHeader, JWT_SECRET);
        return {
          id: payload.userId as number,
          username: payload.username as string,
          role: payload.role as string,
          roleId: payload.roleId as number,
          is_super_admin: isSuperAdminUser(payload.role as string, payload.roleId as number)
        };
      }
      return null;
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: payload.userId as number,
      username: payload.username as string,
      role: payload.role as string,
      roleId: payload.roleId as number,
      is_super_admin: isSuperAdminUser(payload.role as string, payload.roleId as number)
    };
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
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

// POST /api/limit-prices/[id]/invalidate - 作废限价
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseClient();
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  
  const { id } = await params;
  const body = await request.json();
  
  // 权限检查：只有管理员可作废
  if (!user.is_super_admin && user.role !== '公司管理员') {
    return NextResponse.json({ error: '无权限作废' }, { status: 403 });
  }
  
  if (!body.reason) {
    return NextResponse.json({ error: '请填写作废原因' }, { status: 400 });
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
  
  // 更新为作废
  const { data, error } = await supabase
    .from('project_limit_prices')
    .update({
      status: '作废',
      invalidated_by: user.id,
      invalidated_by_name: user.username,
      invalidated_at: new Date().toISOString(),
      invalidate_reason: body.reason
    })
    .eq('id', parseInt(id))
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 记录操作日志
  await logAction(supabase, data.id, '作废', user.id, user.username, {
    before: current,
    after: data,
    reason: body.reason
  });
  
  return NextResponse.json({ data });
}
