import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminUser } from '@/lib/route-permissions';

// 获取角色列表
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Roles API] Fetching roles for user:', user.username);
    
    const supabase = getSupabaseClient();
    
    // 获取角色列表及其权限数量
    const { data: roles, error } = await supabase
      .from('roles')
      .select(`
        id,
        name,
        code,
        description,
        level,
        allowed_projects,
        created_at,
        role_permissions (permission_id)
      `)
      .order('level', { ascending: true })
      .order('id', { ascending: true });
    
    if (error) {
      console.error('[Roles API] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // 处理角色数据，计算权限数量
    const processedRoles = (roles || []).map((role: any) => ({
      ...role,
      permission_count: role.role_permissions?.length || 0,
      role_permissions: undefined, // 移除嵌套数据
      is_super_admin: isSuperAdminUser(role.code),
    }));
    
    console.log('[Roles API] Found', processedRoles.length, 'roles');
    
    return NextResponse.json({
      success: true,
      roles: processedRoles
    });
  } catch (error: any) {
    console.error('[Roles API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 创建角色
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { name, code, description, level, permission_codes = [], allowed_projects = [] } = body;
    
    console.log('[Roles API] Creating role:', name, 'permissions:', permission_codes.length);
    
    if (!name || name.trim() === '') {
      return NextResponse.json({ error: '角色名称不能为空' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    // 检查角色名称是否重复
    const { data: existingRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', name.trim())
      .single();
    
    if (existingRole) {
      return NextResponse.json({ error: '角色名称已存在' }, { status: 400 });
    }
    
    // 生成 code
    const roleCode = code || `role_${Date.now()}`;
    
    // 创建角色
    const { data: newRole, error } = await supabase
      .from('roles')
      .insert({
        name: name.trim(),
        code: roleCode,
        description: description || '',
        level: level || 10,
        allowed_projects: allowed_projects,
      })
      .select()
      .single();
    
    if (error) {
      console.error('[Roles API] Create error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // 如果有权限，分配权限
    if (permission_codes.length > 0) {
      // 先确保所有权限码都存在于permissions表中
      const { data: dbPerms } = await supabase
        .from('permissions')
        .select('id, code')
        .in('code', permission_codes);
      
      // 找到缺失的权限码并插入
      const dbCodes = new Set((dbPerms || []).map((p: any) => p.code));
      const missingCodes = permission_codes.filter((c: string) => !dbCodes.has(c));
      
      if (missingCodes.length > 0) {
        const newPerms = missingCodes.map((code: string) => {
          const parts = code.split(':');
          return {
            code,
            name: code.replace(/_/g, ' ').replace(/:/g, ' '),
            description: `Auto-synced permission: ${code}`,
            resource: parts[0] || 'other',
            action: parts[1] || 'view',
          };
        });

        const { error: insertPermError } = await supabase.from('permissions').insert(newPerms);
        if (insertPermError) {
          console.error('[Roles API] POST - Auto-insert permissions error:', insertPermError);
        } else {
          console.log('[Roles API] POST - Auto-inserted', missingCodes.length, 'new permissions');
        }
      }

      // 重新查询所有权限码对应的ID（包含刚插入的）
      const { data: allPerms } = await supabase
        .from('permissions')
        .select('id, code')
        .in('code', permission_codes);
      
      const existingPerms = allPerms || [];
      console.log('[Roles API] POST - Found permissions:', existingPerms.length, 'of', permission_codes.length);
      
      if (existingPerms.length > 0) {
        const rolePermissions = existingPerms.map((p: any) => ({
          role_id: newRole.id,
          permission_id: p.id
        }));
        
        const { error: permError } = await supabase
          .from('role_permissions')
          .insert(rolePermissions);
        
        if (permError) {
          console.error('[Roles API] POST - Assign permissions error:', permError);
        } else {
          console.log('[Roles API] POST - Inserted', rolePermissions.length, 'role_permissions');
        }
      }
    }
    
    console.log('[Roles API] Role created successfully:', newRole.id);
    
    return NextResponse.json({
      success: true,
      role: {
        ...newRole,
        permission_count: permission_codes.length,
        is_super_admin: false,
      }
    });
  } catch (error: any) {
    console.error('[Roles API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 更新角色
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { id, name, description, level, permission_codes = [], allowed_projects } = body;
    
    console.log('[Roles API] Updating role:', id, 'permissions:', permission_codes.length);
    
    if (!id) {
      return NextResponse.json({ error: '角色ID不能为空' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    // 检查角色是否存在
    const { data: existingRole } = await supabase
      .from('roles')
      .select('*')
      .eq('id', id)
      .single();
    
    if (!existingRole) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 });
    }
    
    // 检查角色名称是否重复（排除自己）
    if (name && name.trim() !== existingRole.name) {
      const { data: duplicateRole } = await supabase
        .from('roles')
        .select('id')
        .eq('name', name.trim())
        .neq('id', id)
        .single();
      
      if (duplicateRole) {
        return NextResponse.json({ error: '角色名称已存在' }, { status: 400 });
      }
    }
    
    // 更新角色基本信息
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (level !== undefined) updateData.level = level;
    if (allowed_projects !== undefined) updateData.allowed_projects = allowed_projects;
    
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('roles')
        .update(updateData)
        .eq('id', id);
      
      if (updateError) {
        console.error('[Roles API] Update error:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }
    
    // 更新权限
    // 先删除旧权限
    await supabase.from('role_permissions').delete().eq('role_id', id);
    
    // 添加新权限
    if (permission_codes.length > 0) {
      // 先确保所有权限码都存在于permissions表中
      const { data: dbPerms } = await supabase
        .from('permissions')
        .select('id, code')
        .in('code', permission_codes);
      
      // 找到缺失的权限码并插入
      const dbCodes = new Set((dbPerms || []).map((p: any) => p.code));
      const missingCodes = permission_codes.filter((c: string) => !dbCodes.has(c));
      
      if (missingCodes.length > 0) {
        const newPerms = missingCodes.map((code: string) => {
          const parts = code.split(':');
          return {
            code,
            name: code.replace(/_/g, ' ').replace(/:/g, ' '),
            description: `Auto-synced permission: ${code}`,
            resource: parts[0] || 'other',
            action: parts[1] || 'view',
          };
        });

        const { error: insertPermError } = await supabase.from('permissions').insert(newPerms);
        if (insertPermError) {
          console.error('[Roles API] PUT - Auto-insert permissions error:', insertPermError);
        } else {
          console.log('[Roles API] PUT - Auto-inserted', missingCodes.length, 'new permissions');
        }
      }

      // 重新查询所有权限码对应的ID（包含刚插入的）
      const { data: allPerms } = await supabase
        .from('permissions')
        .select('id, code')
        .in('code', permission_codes);
      
      const existingPerms = allPerms || [];
      console.log('[Roles API] PUT - Found permissions:', existingPerms.length, 'of', permission_codes.length);
      
      if (existingPerms.length > 0) {
        const rolePermissions = existingPerms.map((p: any) => ({
          role_id: id,
          permission_id: p.id
        }));
        
        const { error: permError } = await supabase.from('role_permissions').insert(rolePermissions);
        if (permError) {
          console.error('[Roles API] PUT - Assign permissions error:', permError);
        } else {
          console.log('[Roles API] PUT - Inserted', rolePermissions.length, 'role_permissions');
        }
      } else {
        console.error('[Roles API] PUT - No permissions found for codes:', permission_codes);
      }
    }
    
    // 获取更新后的角色
    const { data: updatedRole } = await supabase
      .from('roles')
      .select(`*, role_permissions (permission_id)`)
      .eq('id', id)
      .single();
    
    console.log('[Roles API] Role updated successfully:', id);
    
    return NextResponse.json({
      success: true,
      role: {
        ...updatedRole,
        permission_count: updatedRole?.role_permissions?.length || 0,
        is_super_admin: updatedRole?.code === 'super_admin',
      }
    });
  } catch (error: any) {
    console.error('[Roles API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 删除角色
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: '角色ID不能为空' }, { status: 400 });
    }
    
    console.log('[Roles API] Deleting role:', id);
    
    const supabase = getSupabaseClient();
    
    // 检查角色是否存在
    const { data: existingRole } = await supabase
      .from('roles')
      .select('*')
      .eq('id', parseInt(id))
      .single();
    
    if (!existingRole) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 });
    }
    
    // 超级管理员角色不允许删除
    if (existingRole.code === 'super_admin') {
      return NextResponse.json({ error: '超级管理员角色不能删除' }, { status: 403 });
    }
    
    // 删除关联的权限
    await supabase.from('role_permissions').delete().eq('role_id', parseInt(id));
    
    // 删除角色
    const { error: deleteError } = await supabase
      .from('roles')
      .delete()
      .eq('id', parseInt(id));
    
    if (deleteError) {
      console.error('[Roles API] Delete error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    
    console.log('[Roles API] Role deleted successfully:', id);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Roles API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
