import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermission, requireSuperAdmin } from '@/lib/api-auth';
import { PERMISSION_MODULES } from '@/lib/permission-catalog';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '权限菜单处理失败';
}

type PermissionCodeRow = { code: string };
type PermissionRecord = {
  name: string;
  code: string;
  resource: string;
  action: string;
  category: string;
  description: string;
};
type PermissionIdRow = { id: number; code: string };
type RolePermissionRow = { permission_id: number };

// 定义完整的权限菜单结构（与前端 PERMISSION_MENU 保持一致，按6大模块分组）
const PERMISSION_MENU_STRUCTURE = PERMISSION_MODULES.map((module) => ({
  code: module.code,
  name: module.name,
  icon: module.icon,
  children: module.children,
}));

// GET: 获取所有权限菜单结构（自动同步缺失的权限到数据库）
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:permission_manage');
    if (!auth.ok) return auth.response;

    console.log('[Permission Menu] Fetching permission menu structure...');
    const supabase = getSupabaseClient();

    // 1. 收集 PERMISSION_MENU_STRUCTURE 中所有权限码
    const allCodes: string[] = [];
    const flatPerms: PermissionRecord[] = [];
    for (const menuModule of PERMISSION_MENU_STRUCTURE) {
      for (const child of menuModule.children) {
        allCodes.push(child.code);
        const parts = child.code.split(':');
        const resource = parts[0] || menuModule.code;
        const action = parts.slice(1).join(':') || 'view';
        flatPerms.push({
          name: child.name,
          code: child.code,
          resource,
          action,
          category: menuModule.name,
          description: child.name,
        });
      }
    }

    // 2. 查询数据库中已存在的权限码
    const { data: existingPerms } = await supabase
      .from('permissions')
      .select('code')
      .in('code', allCodes);

    const existingCodes = new Set(((existingPerms || []) as PermissionCodeRow[]).map(p => p.code));

    // 3. 插入缺失的权限（使用 upsert 避免唯一约束冲突）
    const missingPerms = flatPerms.filter(p => !existingCodes.has(p.code));
    if (missingPerms.length > 0) {
      console.log(`[Permission Menu] Inserting ${missingPerms.length} missing permissions...`);
      const { error: insertError } = await supabase
        .from('permissions')
        .upsert(missingPerms, { onConflict: 'code' });
      if (insertError) {
        console.error('[Permission Menu] Upsert missing permissions error:', insertError);
      }
    }

    // 4. 返回前端定义的完整菜单结构（保证一致性）
    return NextResponse.json({
      success: true,
      menu: PERMISSION_MENU_STRUCTURE,
      source: 'default',
      synced: missingPerms.length,
    });
  } catch (error: unknown) {
    console.error('[Permission Menu] Error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

// POST: 同步权限数据（增量插入缺失的权限，不删除已有数据）
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return auth.response;
    
    console.log('[Permission Sync] Syncing permission data...');
    
    const supabase = getSupabaseClient();
    
    // 1. 获取现有权限codes
    const { data: existing } = await supabase.from('permissions').select('code');
    const existingCodes = new Set(((existing || []) as PermissionCodeRow[]).map(p => p.code));
    
    // 2. 构建所有权限记录
    const permissionRecords: PermissionRecord[] = [];
    for (const menuModule of PERMISSION_MENU_STRUCTURE) {
      for (const child of menuModule.children) {
        if (!existingCodes.has(child.code)) {
          permissionRecords.push({
            name: child.name,
            code: child.code,
            resource: menuModule.code,
            action: child.code.split(':')[1] || 'view',
            category: menuModule.name,
            description: `${menuModule.name} - ${child.name}`,
          });
        }
      }
    }
    
    let insertedCount = 0;
    if (permissionRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('permissions')
        .upsert(permissionRecords, { onConflict: 'code' });
      
      if (insertError) {
        console.error('[Permission Sync] Upsert error:', insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      insertedCount = permissionRecords.length;
    }
    
    // 3. 确保超级管理员角色存在并拥有所有权限
    const { data: existingRole } = await supabase
      .from('roles')
      .select('id')
      .eq('code', 'super_admin')
      .single();
    
    if (existingRole) {
      // 给超级管理员补充新权限
      const { data: allPerms } = await supabase.from('permissions').select('id, code');
      const { data: existingRolePerms } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', existingRole.id);
      
      const existingPermIds = new Set(((existingRolePerms || []) as RolePermissionRow[]).map(rp => rp.permission_id));
      const newRolePerms = ((allPerms || []) as PermissionIdRow[])
        .filter(p => !existingPermIds.has(p.id))
        .map(p => ({ role_id: existingRole.id, permission_id: p.id }));
      
      if (newRolePerms.length > 0) {
        await supabase.from('role_permissions').insert(newRolePerms);
      }
    }
    
    console.log(`[Permission Sync] Done. Inserted ${insertedCount} new permissions.`);
    
    return NextResponse.json({
      success: true,
      message: `权限数据同步成功，新增 ${insertedCount} 个权限项`,
      count: insertedCount
    });
  } catch (error: unknown) {
    console.error('[Permission Sync] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
