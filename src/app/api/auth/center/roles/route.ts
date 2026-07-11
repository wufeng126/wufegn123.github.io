import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { decodeJwt } from 'jose';
import { logSecurityEvent } from '@/lib/security-log';

// JWT 密钥（Base64 编码）
const JWT_SECRET = "Y29uc3RydWN0aW9uLWxhYm9yLW1hbmFnZW1lbnQtc2VjcmV0LWtleS0yMDI0";

// 获取当前用户
async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  
  console.log('[roles] Token exists:', !!token);
  
  if (!token) {
    console.log('[roles] No token found');
    return null;
  }

  try {
    // 使用 decodeJwt 解码（不验证）
    const payload = decodeJwt(token);
    const userId = payload.userId as string;
    
    console.log('[roles] JWT decoded, userId:', userId);
    
    // 使用 Supabase 获取用户信息
    const supabase = getSupabaseClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error || !user) {
      console.log('[roles] User not found in database');
      return null;
    }
    
    console.log('[roles] User found:', user.username);
    return user;
  } catch (err: any) {
    console.log('[roles] Auth error:', err.message);
    return null;
  }
}

// 获取单个角色详情（包含权限）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
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
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      // 提取权限 code
      const permissions = (role?.role_permissions || [])
        .map((rp: any) => rp.permissions?.code)
        .filter(Boolean);
      
      return NextResponse.json({
        role: {
          ...role,
          permissions,
          permission_count: permissions.length
        }
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // 处理权限数量
    const rolesWithCount = (roles || []).map((role: any) => ({
      ...role,
      permission_count: role.role_permissions?.length || 0,
      role_permissions: undefined
    }));
    
    console.log('[roles] GET - returning', rolesWithCount.length, 'roles');
    
    return NextResponse.json({ roles: rolesWithCount });
  } catch (err: any) {
    console.error('[roles] GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 创建/更新角色
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
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
      
      return NextResponse.json({
        success: true,
        role: {
          ...updatedRole,
          permission_count: updatedRole?.role_permissions?.length || 0
        }
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
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json({ success: true, role: newRole });
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
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json({ success: true, role: updatedRole });
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
        return NextResponse.json({ error: error.message }, { status: 500 });
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
      
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('[roles] POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 批量操作（PUT）
export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
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
      
      return NextResponse.json({
        success: true,
        role: {
          ...updatedRole,
          permission_count: updatedRole?.role_permissions?.length || 0
        }
      });
    }
    
    return NextResponse.json({ error: '角色ID不能为空' }, { status: 400 });
  } catch (err: any) {
    console.error('[roles] PUT error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 删除角色（DELETE）
export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: '角色ID不能为空' }, { status: 400 });
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
      return NextResponse.json({ error: error.message }, { status: 500 });
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
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[roles] DELETE error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
