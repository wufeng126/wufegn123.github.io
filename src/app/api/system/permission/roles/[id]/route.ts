import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermission } from '@/lib/api-auth';
import { isSuperAdminUser } from '@/lib/route-permissions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type RolePermissionDetailRow = {
  permissions?: {
    code?: string | null;
  } | null;
};

type RoleUserIdRow = {
  user_id: number;
};

type RoleUserRow = {
  id: number;
  username: string;
  name?: string | null;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseRoleId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// 获取单个角色详情及其权限
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requirePermission(request, 'system:permission_manage');
    if (!auth.ok) return auth.response;
    
    const { id } = await params;
    const roleId = parseRoleId(id);
    
    if (!roleId) {
      return NextResponse.json({ error: '角色ID不能为空' }, { status: 400 });
    }
    
    console.log('[Role Detail API] Fetching role:', roleId);
    
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
      .eq('id', roleId)
      .single();
    
    if (error) {
      console.error('[Role Detail API] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    if (!role) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 });
    }
    
    // 提取权限代码列表
    const permissionCodes = ((role.role_permissions || []) as RolePermissionDetailRow[])
      .map((rp) => rp.permissions?.code)
      .filter((code): code is string => Boolean(code));
    
    // 获取角色关联的用户（通过user_roles表）
    const { data: roleUserIds } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_id', roleId);
    
    let roleUsers: RoleUserRow[] = [];
    if (roleUserIds && roleUserIds.length > 0) {
      const userIds = ((roleUserIds || []) as RoleUserIdRow[]).map((row) => row.user_id);
      const { data: users } = await supabase
        .from('users')
        .select('id, username, name')
        .in('id', userIds);
      roleUsers = (users || []) as RoleUserRow[];
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
  } catch (error: unknown) {
    console.error('[Role Detail API] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
