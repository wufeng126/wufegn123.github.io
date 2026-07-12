import { NextRequest } from 'next/server';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { logSecurityEvent } from '@/lib/security-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

// 获取单个角色详情（包含权限）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    
    const supabase = getSupabaseClient();
    
    // 如果有 ID，获取单个角色详情
    if (id) {
      console.log('[roles] GET single role, id:', id);
      
      const { data: role, error } = await supabase
        .from('roles')
        .select(`
          *,
          role_permissions (
            permission_id,
            permissions (
              code
            )
          )
        `)
        .eq('id', parseInt(id))
        .single();
      
      if (error) {
        console.error('[roles] Query single error:', error);
        return apiServerError(error.message);
      }
      
      // 提取权限 code
      const permissions = (role?.role_permissions || [])
        .map((rp: any) => rp.permissions?.code)
        .filter(Boolean);
      
      const responseRole = {
          ...role,
          permissions,
          permission_count: permissions.length
      };

      return apiSuccess({ role: responseRole }, {
        meta: { role: responseRole },
      });
    }
    
    // 否则获取角色列表
    console.log('[roles] GET - currentUser:', currentUser.username);
    
    // 查询角色列表
    const { data: roles, error } = await supabase
      .from('roles')
      .select(`
        *,
        role_permissions (
          permission_id
        )
      `)
      .order('level', { ascending: false });
    
    if (error) {
      console.error('[roles] Query error:', error);
      return apiServerError(error.message);
    }
    
    // 处理权限数量
    const rolesWithCount = (roles || []).map((role: any) => ({
      ...role,
      permission_count: role.role_permissions?.length || 0,
      role_permissions: undefined
    }));
    
    console.log('[roles] GET - returning', rolesWithCount.length, 'roles');
    
    return apiSuccess({ roles: rolesWithCount }, {
      meta: { roles: rolesWithCount },
    });
  } catch (err: unknown) {
    console.error('[roles] GET error:', err);
    return apiServerError(getErrorMessage(err, '角色查询失败'));
  }
}

// 创建/更新角色
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    
    const body = await request.json();
    const { action, id, name, description, level, code, permission_codes = [] } = body;
    
    console.log('[roles] POST - action:', action, 'currentUser:', currentUser.username);
    
    const supabase = getSupabaseClient();
    
    // 更新权限
    if (action === 'update_permissions' && id) {
      // 先删除旧权限
      await supabase.from('role_permissions').delete().eq('role_id', id);
      
      // 添加新权限
      if (permission_codes.length > 0) {
        // 获取权限 ID
        const { data: permissions } = await supabase
          .from('permissions')
          .select('id, code')
          .in('code', permission_codes);
        
        if (permissions && permissions.length > 0) {
          const rolePermissions = permissions.map((p: any) => ({
            role_id: id,
            permission_id: p.id
          }));
          
          await supabase.from('role_permissions').insert(rolePermissions);
        }
      }
      
      // 获取更新后的权限数量
      const { data: updatedRole } = await supabase
        .from('roles')
        .select(`*, role_permissions (permission_id)`)
        .eq('id', id)
        .single();
      
      // 记录安全日志
      await logSecurityEvent({
        event_type: 'role_permissions_updated',
        user_id: currentUser.id,
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
        result: 'success',
        metadata: { target_role_id: id, permission_count: permission_codes.length },
      });
      
      const responseRole = {
          ...updatedRole,
          permission_count: updatedRole?.role_permissions?.length || 0
      };

      return apiSuccess({ role: responseRole }, {
        meta: { role: responseRole },
      });
    }
    
    // 创建角色
    if (action === 'create') {
      // 生成 code
      const roleCode = code || `role_${Date.now()}`;
      
      const { data: newRole, error } = await supabase
        .from('roles')
        .insert({
          name,
          description: description || '',
          code: roleCode,
          level: level || 5
        })
        .select()
        .single();
      
      if (error) {
        console.error('[roles] Create error:', error);
        return apiServerError(error.message);
      }
      
      return apiSuccess({ role: newRole }, { meta: { role: newRole } });
    }
    
    // 更新角色
    if (action === 'update' && id) {
      const { data: updatedRole, error } = await supabase
        .from('roles')
        .update({ name, description, level })
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('[roles] Update error:', error);
        return apiServerError(error.message);
      }
      
      return apiSuccess({ role: updatedRole }, { meta: { role: updatedRole } });
    }
    
    // 删除角色
    if (action === 'delete' && id) {
      // 先删除关联的权限
      await supabase.from('role_permissions').delete().eq('role_id', id);
      
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('[roles] Delete error:', error);
        return apiServerError(error.message);
      }
      
      // 记录安全日志
      await logSecurityEvent({
        event_type: 'role_deleted',
        user_id: currentUser.id,
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
        result: 'success',
        metadata: { target_role_id: id },
      });
      
      return apiSuccess(null);
    }
    
    return apiBadRequest('Invalid action');
  } catch (err: unknown) {
    console.error('[roles] POST error:', err);
    return apiServerError(getErrorMessage(err, '角色操作失败'));
  }
}

// 批量操作（PUT）
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;
    
    // 从 URL 获取 ID
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const body = await request.json();
    const { name, description, level, permission_codes = [] } = body;
    
    console.log('[roles] PUT - id:', id, 'permission_codes:', permission_codes.length);
    
    const supabase = getSupabaseClient();
    
    // 如果有 ID，先更新角色信息
    if (id) {
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (level !== undefined) updateData.level = level;
      
      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('roles')
          .update(updateData)
          .eq('id', parseInt(id));
      }
      
      // 更新权限
      await supabase.from('role_permissions').delete().eq('role_id', parseInt(id));
      
      if (permission_codes.length > 0) {
        const { data: permissions } = await supabase
          .from('permissions')
          .select('id, code')
          .in('code', permission_codes);
        
        if (permissions && permissions.length > 0) {
          const rolePermissions = permissions.map((p: any) => ({
            role_id: parseInt(id),
            permission_id: p.id
          }));
          
          await supabase.from('role_permissions').insert(rolePermissions);
        }
      }
      
      // 获取更新后的角色
      const { data: updatedRole } = await supabase
        .from('roles')
        .select(`*, role_permissions (permission_id)`)
        .eq('id', parseInt(id))
        .single();
      
      const responseRole = {
          ...updatedRole,
          permission_count: updatedRole?.role_permissions?.length || 0
      };

      return apiSuccess({ role: responseRole }, {
        meta: { role: responseRole },
      });
    }
    
    return apiBadRequest('角色ID不能为空');
  } catch (err: unknown) {
    console.error('[roles] PUT error:', err);
    return apiServerError(getErrorMessage(err, '角色更新失败'));
  }
}

// 删除角色（DELETE）
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return apiBadRequest('角色ID不能为空');
    }
    
    console.log('[roles] DELETE - id:', id);
    
    const supabase = getSupabaseClient();
    
    // 先删除关联的权限
    await supabase.from('role_permissions').delete().eq('role_id', parseInt(id));
    
    // 删除角色
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', parseInt(id));
    
    if (error) {
      console.error('[roles] DELETE error:', error);
      return apiServerError(error.message);
    }
    
    // 记录安全日志
    await logSecurityEvent({
      event_type: 'role_deleted',
      user_id: currentUser.id,
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      metadata: { target_role_id: parseInt(id) },
    });
    
    return apiSuccess(null);
  } catch (err: unknown) {
    console.error('[roles] DELETE error:', err);
    return apiServerError(getErrorMessage(err, '角色删除失败'));
  }
}
