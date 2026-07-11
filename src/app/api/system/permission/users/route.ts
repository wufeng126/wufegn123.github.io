import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getCurrentUser } from '@/lib/auth';

// 获取用户列表
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('[Users API] Fetching users');
    
    const supabase = getSupabaseClient();
    
    // 获取用户列表
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id,
        username,
        name,
        role,
        managed_projects,
        created_at,
        last_login,
        dingtalk_user_id,
        dingtalk_union_id,
        dingtalk_mobile,
        dingtalk_name,
        dingtalk_dept_id,
        dingtalk_avatar,
        dingtalk_active,
        last_dingtalk_sync_at
      `)
      .order('id', { ascending: true });
    
    if (error) {
      console.error('[Users API] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // 获取所有角色
    const { data: roles } = await supabase
      .from('roles')
      .select('id, name, code');
    
    // 获取用户角色关联
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('user_id, role_id');
    
    // 关联用户角色
    const usersWithRoles = (users || []).map((u: any) => {
      const uRoles = (userRoles || [])
        .filter((ur: any) => ur.user_id === u.id)
        .map((ur: any) => roles?.find((r: any) => r.id === ur.role_id))
        .filter(Boolean);
      
      return {
        ...u,
        role_ids: uRoles.map((r: any) => r.id),
        role_names: uRoles.map((r: any) => r.name).join(', ') || '未分配',
        roles: uRoles,
        allowed_projects: u.managed_projects || [],
        dingtalk_bound: !!u.dingtalk_user_id,
        dingtalk_info: u.dingtalk_user_id ? {
          user_id: u.dingtalk_user_id,
          name: u.dingtalk_name,
          mobile: u.dingtalk_mobile,
          dept_id: u.dingtalk_dept_id,
          active: u.dingtalk_active,
          last_sync: u.last_dingtalk_sync_at,
        } : null,
      };
    });
    
    console.log('[Users API] Found', usersWithRoles.length, 'users');
    
    return NextResponse.json({
      success: true,
      users: usersWithRoles,
      roles: roles || [],
    });
  } catch (error: any) {
    console.error('[Users API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 更新用户角色
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { id, role_ids, allowed_projects } = body;
    
    if (!id) {
      return NextResponse.json({ error: '用户ID不能为空' }, { status: 400 });
    }
    
    console.log('[Users API] Updating user:', id, 'role_ids:', role_ids);
    
    const supabase = getSupabaseClient();
    
    // 检查用户是否存在
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (!existingUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    
    // 更新用户角色关联
    // 先删除旧关联
    await supabase.from('user_roles').delete().eq('user_id', id);
    
    // 添加新关联
    if (role_ids && role_ids.length > 0) {
      const userRoles = role_ids.map((roleId: number) => ({
        user_id: id,
        role_id: roleId,
      }));
      
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert(userRoles);
      
      if (roleError) {
        console.error('[Users API] Update role error:', roleError);
        return NextResponse.json({ error: roleError.message }, { status: 500 });
      }
    }
    
    // 更新用户的managed_projects字段
    if (allowed_projects !== undefined) {
      const { error: projectError } = await supabase
        .from('users')
        .update({ managed_projects: allowed_projects })
        .eq('id', id);
      
      if (projectError) {
        console.error('[Users API] Update projects error:', projectError);
        return NextResponse.json({ error: projectError.message }, { status: 500 });
      }
    }
    
    console.log('[Users API] User updated successfully:', id);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Users API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
