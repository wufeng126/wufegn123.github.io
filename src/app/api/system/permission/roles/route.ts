import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermission } from '@/lib/api-auth';
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

type RoleWriteBody = {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  description?: unknown;
  level?: unknown;
  permission_codes?: unknown;
  allowed_projects?: unknown;
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

function normalizePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeIntegerList(value: unknown): number[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const parsed = value.map((item) => Number(item));
  if (!parsed.every((item) => Number.isInteger(item) && item > 0)) return null;

  return Array.from(new Set(parsed));
}

function normalizeRoleLevel(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 10;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
      .upsert(newPermissions, { onConflict: 'code' });

    if (insertError) {
      console.error('[Permission Sync] Upsert error:', insertError);
      // 如果 upsert 失败，尝试逐个插入并忽略错误
      for (const perm of newPermissions) {
        try {
          await supabase
            .from('permissions')
            .insert(perm)
            .select()
            .single();
        } catch {
          // 忽略重复插入错误
        }
      }
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
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:permission_manage');
    if (!auth.ok) return auth.response;

    console.log('[Roles API] Fetching roles');
    
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
    const auth = await requirePermission(request, 'system:permission_manage');
    if (!auth.ok) return auth.response;
    
    const body = (await request.json()) as RoleWriteBody;
    const { name, code, description, level, permission_codes = [], allowed_projects = [] } = body;
    const roleName = typeof name === 'string' ? name.trim() : '';
    const roleCode = typeof code === 'string' && code.trim() ? code.trim() : `role_${Date.now()}`;
    const roleLevel = normalizeRoleLevel(level);
    const normalizedPermissionCodes = normalizePermissionCodes(permission_codes);
    const normalizedAllowedProjects = normalizeIntegerList(allowed_projects);
    
    console.log('[Roles API] Creating role:', roleName, 'permissions:', normalizedPermissionCodes.length);
    
    if (!roleName) {
      return NextResponse.json({ error: '角色名称不能为空' }, { status: 400 });
    }
    if (roleName.length > 50) {
      return NextResponse.json({ error: '角色名称不能超过50个字符' }, { status: 400 });
    }
    if (roleCode.length > 80) {
      return NextResponse.json({ error: '角色编码不能超过80个字符' }, { status: 400 });
    }
    if (roleLevel === null) {
      return NextResponse.json({ error: '角色层级参数不正确' }, { status: 400 });
    }
    if (normalizedAllowedProjects === null) {
      return NextResponse.json({ error: '项目范围参数不正确' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    // 检查角色名称是否重复
    const { data: existingRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .single();
    
    if (existingRole) {
      return NextResponse.json({ error: '角色名称已存在' }, { status: 400 });
    }
    
    // 创建角色
    const { data: newRole, error } = await supabase
      .from('roles')
      .insert({
        name: roleName,
        code: roleCode,
        description: typeof description === 'string' ? description.trim() : '',
        level: roleLevel,
        allowed_projects: normalizedAllowedProjects,
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
    const auth = await requirePermission(request, 'system:permission_manage');
    if (!auth.ok) return auth.response;
    
    const body = (await request.json()) as RoleWriteBody;
    const { id, name, description, level, permission_codes, allowed_projects } = body;
    const roleId = normalizePositiveInteger(id);
    const shouldUpdatePermissions = permission_codes !== undefined;
    const normalizedPermissionCodes = normalizePermissionCodes(permission_codes);
    const normalizedAllowedProjects = normalizeIntegerList(allowed_projects);
    const roleLevel = level === undefined ? undefined : normalizeRoleLevel(level);
    
    console.log('[Roles API] Updating role:', roleId, 'permissions:', normalizedPermissionCodes.length);
    
    if (!roleId) {
      return NextResponse.json({ error: '角色ID不能为空' }, { status: 400 });
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json({ error: '角色名称不能为空' }, { status: 400 });
    }
    if (typeof name === 'string' && name.trim().length > 50) {
      return NextResponse.json({ error: '角色名称不能超过50个字符' }, { status: 400 });
    }
    if (roleLevel === null) {
      return NextResponse.json({ error: '角色层级参数不正确' }, { status: 400 });
    }
    if (normalizedAllowedProjects === null) {
      return NextResponse.json({ error: '项目范围参数不正确' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    // 检查角色是否存在
    const { data: existingRole } = await supabase
      .from('roles')
      .select('*')
      .eq('id', roleId)
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
        .neq('id', roleId)
        .single();
      
      if (duplicateRole) {
        return NextResponse.json({ error: '角色名称已存在' }, { status: 400 });
      }
    }
    
    // 更新角色基本信息
    const updateData: Record<string, unknown> = {};
    if (typeof name === 'string') updateData.name = name.trim();
    if (description !== undefined) updateData.description = typeof description === 'string' ? description.trim() : '';
    if (roleLevel !== undefined) updateData.level = roleLevel;
    if (allowed_projects !== undefined) updateData.allowed_projects = normalizedAllowedProjects;
    
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('roles')
        .update(updateData)
        .eq('id', roleId);
      
      if (updateError) {
        console.error('[Roles API] Update error:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }
    
    // 更新权限：按差异新增/移除，避免旧逻辑先删后写失败导致权限丢失。
    if (shouldUpdatePermissions) {
      await replaceRolePermissions(supabase, roleId, normalizedPermissionCodes);
    }
    
    // 获取更新后的角色
    const { data: updatedRole } = await supabase
      .from('roles')
      .select(`*, role_permissions (permission_id)`)
      .eq('id', roleId)
      .single();
    
    console.log('[Roles API] Role updated successfully:', roleId);
    
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
    const auth = await requirePermission(request, 'system:permission_manage');
    if (!auth.ok) return auth.response;
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const roleId = normalizePositiveInteger(id);
    
    if (!roleId) {
      return NextResponse.json({ error: '角色ID不能为空' }, { status: 400 });
    }
    
    console.log('[Roles API] Deleting role:', roleId);
    
    const supabase = getSupabaseClient();
    
    // 检查角色是否存在
    const { data: existingRole } = await supabase
      .from('roles')
      .select('*')
      .eq('id', roleId)
      .single();
    
    if (!existingRole) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 });
    }
    
    // 超级管理员角色不允许删除
    if (existingRole.code === 'super_admin') {
      return NextResponse.json({ error: '超级管理员角色不能删除' }, { status: 403 });
    }
    
    // 删除关联的权限
    const { error: rolePermissionDeleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId);

    if (rolePermissionDeleteError) {
      console.error('[Roles API] Delete role permissions error:', rolePermissionDeleteError);
      return NextResponse.json({ error: rolePermissionDeleteError.message }, { status: 500 });
    }
    
    // 删除角色
    const { error: deleteError } = await supabase
      .from('roles')
      .delete()
      .eq('id', roleId);
    
    if (deleteError) {
      console.error('[Roles API] Delete error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    
    console.log('[Roles API] Role deleted successfully:', roleId);
    
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Roles API] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
