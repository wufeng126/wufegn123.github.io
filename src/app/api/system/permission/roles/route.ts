import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminUser } from '@/lib/route-permissions';

type PermissionRow = {
  id: number;
  code: string;
};

type RolePermissionRow = {
  permission_id: number;
};

type RoleRow = {
  id: number;
  code?: string | null;
  role_permissions?: RolePermissionRow[];
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizePermissionCodes(permissionCodes: unknown): string[] {
  if (!Array.isArray(permissionCodes)) return [];

  return Array.from(
    new Set(
      permissionCodes
        .filter((code): code is string => typeof code === 'string')
        .map((code) => code.trim())
        .filter(Boolean)
    )
  );
}

async function ensurePermissionIds(supabase: SupabaseClient, permissionCodes: string[]) {
  if (permissionCodes.length === 0) return [];

  const { data: existingPermissions, error: existingError } = await supabase
    .from('permissions')
    .select('id, code')
    .in('code', permissionCodes);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingCodes = new Set(((existingPermissions || []) as PermissionRow[]).map((permission) => permission.code));
  const missingCodes = permissionCodes.filter((code) => !existingCodes.has(code));

  if (missingCodes.length > 0) {
    const newPermissions = missingCodes.map((code) => {
      const [resource = 'other', action = 'view'] = code.split(':');
      return {
        code,
        name: code.replace(/_/g, ' ').replace(/:/g, ' '),
        description: `Auto-synced permission: ${code}`,
        resource,
        action,
      };
    });

    const { error: insertError } = await supabase
      .from('permissions')
      .upsert(newPermissions, { onConflict: 'code', ignoreDuplicates: true });

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const { data: allPermissions, error: allError } = await supabase
    .from('permissions')
    .select('id, code')
    .in('code', permissionCodes);

  if (allError) {
    throw new Error(allError.message);
  }

  const permissionMap = new Map(((allPermissions || []) as PermissionRow[]).map((permission) => [permission.code, permission.id]));
  const missingAfterSync = permissionCodes.filter((code) => !permissionMap.has(code));

  if (missingAfterSync.length > 0) {
    throw new Error(`权限码未写入权限表：${missingAfterSync.join(', ')}`);
  }

  return permissionCodes
    .map((code) => permissionMap.get(code))
    .filter((permissionId): permissionId is number => typeof permissionId === 'number');
}

async function replaceRolePermissions(
  supabase: SupabaseClient,
  roleId: number,
  permissionCodes: string[]
) {
  const permissionIds = await ensurePermissionIds(supabase, permissionCodes);

  const { data: existingRows, error: existingRowsError } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', roleId);

  if (existingRowsError) {
    throw new Error(existingRowsError.message);
  }

  const nextPermissionIds = new Set(permissionIds);
  const existingPermissionIds = new Set(((existingRows || []) as RolePermissionRow[]).map((row) => row.permission_id));

  const permissionIdsToRemove = [...existingPermissionIds].filter((permissionId) => !nextPermissionIds.has(permissionId));
  const permissionIdsToAdd = [...nextPermissionIds].filter((permissionId) => !existingPermissionIds.has(permissionId));

  if (permissionIdsToRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)
      .in('permission_id', permissionIdsToRemove);

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  if (permissionIdsToAdd.length > 0) {
    const rolePermissions = permissionIdsToAdd.map((permissionId) => ({
      role_id: roleId,
      permission_id: permissionId,
    }));

    const { error: insertError } = await supabase
      .from('role_permissions')
      .insert(rolePermissions);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return nextPermissionIds.size;
}

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
    const processedRoles = ((roles || []) as RoleRow[]).map((role) => ({
      ...role,
      permission_count: role.role_permissions?.length || 0,
      role_permissions: undefined, // 移除嵌套数据
      is_super_admin: isSuperAdminUser(role.code || undefined),
    }));
    
    console.log('[Roles API] Found', processedRoles.length, 'roles');
    
    return NextResponse.json({
      success: true,
      roles: processedRoles
    });
  } catch (error: unknown) {
    console.error('[Roles API] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
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
    const normalizedPermissionCodes = normalizePermissionCodes(permission_codes);
    
    console.log('[Roles API] Creating role:', name, 'permissions:', normalizedPermissionCodes.length);
    
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
    
    const permissionCount = await replaceRolePermissions(supabase, newRole.id, normalizedPermissionCodes);
    
    console.log('[Roles API] Role created successfully:', newRole.id);
    
    return NextResponse.json({
      success: true,
      role: {
        ...newRole,
        permission_count: permissionCount,
        is_super_admin: false,
      }
    });
  } catch (error: unknown) {
    console.error('[Roles API] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
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
    const normalizedPermissionCodes = normalizePermissionCodes(permission_codes);
    
    console.log('[Roles API] Updating role:', id, 'permissions:', normalizedPermissionCodes.length);
    
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
    const updateData: Record<string, unknown> = {};
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
    
    // 更新权限：按差异新增/移除，避免旧逻辑先删后写失败导致权限丢失。
    await replaceRolePermissions(supabase, Number(id), normalizedPermissionCodes);
    
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
  } catch (error: unknown) {
    console.error('[Roles API] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
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
  } catch (error: unknown) {
    console.error('[Roles API] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
