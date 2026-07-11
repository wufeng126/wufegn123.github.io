import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminUser } from '@/lib/route-permissions';

// 获取当前用户可访问的项目ID列表
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('[User Projects API] Fetching accessible projects for user:', user.username);
    
    const supabase = getSupabaseClient();
    
    // 获取用户信息（使用正确的字段名 managed_projects）
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('managed_projects')
      .eq('id', user.id)
      .single();
    
    if (userError) {
      console.error('[User Projects API] User query error:', userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }
    
    // 如果是超级管理员，返回所有项目
    if (isSuperAdminUser(user.role)) {
      const { data: allProjects } = await supabase
        .from('projects')
        .select('id');
      
      const allProjectIds = (allProjects || []).map((p: any) => p.id);
      
      console.log('[User Projects API] Super admin, all projects:', allProjectIds.length);
      
      return NextResponse.json({
        success: true,
        project_ids: allProjectIds,
        all_projects: true,
      });
    }
    
    // 获取用户直接分配的项目
    const userAllowedProjects: number[] = userData?.managed_projects || [];
    
    // 获取用户通过角色分配的项目
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user.id);
    
    const roleProjectIds: number[] = [];
    
    if (userRoles && userRoles.length > 0) {
      const roleIds = userRoles.map((ur: any) => ur.role_id);
      const { data: roles } = await supabase
        .from('roles')
        .select('allowed_projects')
        .in('id', roleIds);
      
      if (roles) {
        for (const role of roles) {
          if (role.allowed_projects && Array.isArray(role.allowed_projects)) {
            roleProjectIds.push(...role.allowed_projects);
          }
        }
      }
    }
    
    // 合并：用户自己的项目 + 角色允许的项目
    const allAllowedProjects = [...new Set([...userAllowedProjects, ...roleProjectIds])];
    
    console.log('[User Projects API] Accessible projects:', allAllowedProjects.length);
    
    return NextResponse.json({
      success: true,
      project_ids: allAllowedProjects,
      all_projects: allAllowedProjects.length === 0,
    });
  } catch (error: any) {
    console.error('[User Projects API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
