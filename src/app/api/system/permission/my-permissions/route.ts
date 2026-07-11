import { NextResponse } from 'next/server';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminUser } from '@/lib/route-permissions';

// 获取当前用户的权限
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('[My Permissions API] Fetching permissions for user:', user.username);
    
    const supabase = getSupabaseClient();
    
    // 获取用户的角色
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, managed_projects')
      .eq('id', user.id)
      .single();
    
    if (userError) {
      console.error('[My Permissions API] Error fetching user:', userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }
    
    console.log('[My Permissions API] User data:', userData);
    
    // 检查用户是否有超级管理员角色
    const isSuperAdmin = isSuperAdminUser(user.role) || isSuperAdminUser(userData?.role);
    
    // 如果是超级管理员，直接返回所有权限
    if (isSuperAdmin) {
      const { data: allPermissions } = await supabase
        .from('permissions')
        .select('code');
      
      const allPermissionCodes = (allPermissions || []).map((p: any) => p.code);
      
      console.log('[My Permissions API] Super admin, all permissions:', allPermissionCodes.length);
      
      return NextResponse.json({
        success: true,
        permissions: allPermissionCodes,
        allowed_projects: [],
        is_super_admin: true,
      });
    }
    
    // 通过 user_roles 关联表获取用户的角色
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user.id);
    
    const roleIds = (userRoles || []).map((ur: any) => ur.role_id);
    console.log('[My Permissions API] User role_ids from user_roles table:', roleIds);
    
    // 如果没有角色，返回空权限
    if (roleIds.length === 0) {
      // 返回用户管理的项目
      const managedProjects = userData?.managed_projects || [];
      return NextResponse.json({
        success: true,
        permissions: [],
        allowed_projects: managedProjects,
        is_super_admin: false,
      });
    }
    
    // 获取角色关联的权限
    const { data: rolePermissions } = await supabase
      .from('role_permissions')
      .select(`
        permissions (
          code
        )
      `)
      .in('role_id', roleIds);
    
    const permissionCodes = (rolePermissions || [])
      .map((rp: any) => rp.permissions?.code)
      .filter(Boolean);
    
    // 去重
    const uniquePermissions = [...new Set(permissionCodes)];
    
    // 获取用户管理的项目
    const managedProjects = userData?.managed_projects || [];
    
    console.log('[My Permissions API] User permissions:', uniquePermissions.length);
    console.log('[My Permissions API] Managed projects:', managedProjects);
    
    return NextResponse.json({
      success: true,
      permissions: uniquePermissions,
      allowed_projects: managedProjects,
      is_super_admin: false,
    });
  } catch (error: any) {
    console.error('[My Permissions API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
