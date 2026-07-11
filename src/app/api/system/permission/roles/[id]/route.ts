import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminUser } from '@/lib/route-permissions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 获取单个角色详情及其权限
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: '角色ID不能为空' }, { status: 400 });
    }
    
    console.log('[Role Detail API] Fetching role:', id);
    
    const supabase = getSupabaseClient();
    
    // 获取角色详情及权限
    const { data: role, error } = await supabase
      .from('roles')
      .select(`
        *,
        role_permissions (
          permission_id,
          permissions (
            code,
            name,
            resource,
            action
          )
        )
      `)
      .eq('id', parseInt(id))
      .single();
    
    if (error) {
      console.error('[Role Detail API] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    if (!role) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 });
    }
    
    // 提取权限代码列表
    const permissionCodes = (role.role_permissions || [])
      .map((rp: any) => rp.permissions?.code)
      .filter(Boolean);
    
    // 获取角色关联的用户（通过user_roles表）
    const { data: roleUserIds } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_id', parseInt(id));
    
    let roleUsers: any[] = [];
    if (roleUserIds && roleUserIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, username, name')
        .in('id', roleUserIds.map((r: any) => r.user_id));
      roleUsers = users || [];
    }
    
    console.log('[Role Detail API] Role found:', role.name, 'permissions:', permissionCodes.length, 'users:', roleUsers.length);
    
    return NextResponse.json({
      success: true,
      role: {
        id: role.id,
        name: role.name,
        code: role.code,
        description: role.description,
        level: role.level,
        allowed_projects: role.allowed_projects || [],
        is_super_admin: isSuperAdminUser(role.code),
        permission_count: permissionCodes.length,
        permissions: permissionCodes,
        users: roleUsers || [],
      }
    });
  } catch (error: any) {
    console.error('[Role Detail API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
