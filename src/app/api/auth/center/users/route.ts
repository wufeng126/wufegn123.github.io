import { getSupabaseClient } from "@/storage/database/supabase-client";
import { NextRequest, NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/security-log";
import { hashPassword } from "@/lib/auth-db";
import { requirePermission } from "@/lib/api-auth";
import { getErrorMessage } from "@/lib/api-utils";

type RoleRow = {
  id: number;
  name: string;
  level: number | null;
  is_super_admin?: boolean | null;
};

function parsePositiveId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeRoleIds(value: unknown): number[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > 50) return null;

  const ids = value.map(parsePositiveId);
  if (ids.some((id) => id === null)) return null;
  return Array.from(new Set(ids as number[]));
}

async function validateAssignableRoles(
  supabase: ReturnType<typeof getSupabaseClient>,
  roleIds: number[],
  canAssignSuperAdmin: boolean
): Promise<{ ok: true; roles: RoleRow[] } | { ok: false; response: NextResponse }> {
  if (roleIds.length === 0) return { ok: true, roles: [] };

  const { data: roles, error } = await supabase
    .from("roles")
    .select("id, name, level, is_super_admin")
    .in("id", roleIds);

  if (error) {
    return { ok: false, response: NextResponse.json({ error: getErrorMessage(error, "操作失败") }, { status: 500 }) };
  }

  if ((roles || []).length !== roleIds.length) {
    return { ok: false, response: NextResponse.json({ error: "角色不存在或已被删除" }, { status: 400 }) };
  }

  const includesSuperAdmin = (roles || []).some((role) => role.is_super_admin || role.level === 1);
  if (includesSuperAdmin && !canAssignSuperAdmin) {
    return { ok: false, response: NextResponse.json({ error: "只有超级管理员可以分配超级管理员角色" }, { status: 403 }) };
  }

  return { ok: true, roles: roles || [] };
}

// 获取所有用户
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'system:permission_manage');
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseClient();
  
  // 获取所有用户
  const { data: users, error } = await supabase
    .from("users")
    .select("id, username, name, dingtalk_name, role, is_disabled, created_at, last_login")
    .order("id", { ascending: true });
  
  if (error) {
    return NextResponse.json({ error: getErrorMessage(error, "操作失败") }, { status: 500 });
  }
  
  // 获取所有用户角色关联
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("user_id, role_id");
  
  // 获取所有角色
  const { data: roles } = await supabase
    .from("roles")
    .select("*");
  
  // 格式化用户数据
  const formattedUsers = (users || []).map((user) => {
    const relatedRoleIds = (userRoles || [])
      .filter((ur) => ur.user_id === user.id)
      .map((ur) => ur.role_id);
    
    const relatedRoles = (roles || [])
      .filter((r) => relatedRoleIds.includes(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        level: r.level,
        is_super_admin: r.level === 1,
      }));
    
    return {
      ...user,
      roles: relatedRoles,
      role_ids: relatedRoleIds,
    };
  });
  
  return NextResponse.json({ users: formattedUsers });
}

// 创建用户或分配角色
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'system:permission_manage');
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseClient();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  try {
    const body = await request.json();
    const { action, user_id, role_ids, username, password, name } = body;
    const normalizedRoleIds = normalizeRoleIds(role_ids);
    if (normalizedRoleIds === null) {
      return NextResponse.json({ error: "角色ID格式不正确" }, { status: 400 });
    }

    const roleCheck = await validateAssignableRoles(supabase, normalizedRoleIds, auth.user.is_super_admin);
    if (!roleCheck.ok) return roleCheck.response;

    const operatorId = auth.user.id;
    
    // 创建新用户（兼容前端不传 action 的情况：无 user_id 且带用户名/密码即视为创建）
    if (action === "create" || (!user_id && username && password)) {
      const normalizedUsername = typeof username === "string" ? username.trim() : "";
      const normalizedName = typeof name === "string" ? name.trim() : "";
      const normalizedPassword = typeof password === "string" ? password : "";

      if (!normalizedUsername || !normalizedPassword) {
        return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
      }

      if (normalizedUsername.length > 50 || normalizedPassword.length < 6 || normalizedPassword.length > 128) {
        return NextResponse.json({ error: "用户名或密码长度不符合要求" }, { status: 400 });
      }
      
      // 检查用户名是否已存在
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("username", normalizedUsername)
        .single();
      
      if (existingUser) {
        return NextResponse.json({ error: "用户名已存在" }, { status: 400 });
      }
      
      const passwordHash = hashPassword(normalizedPassword);
      
      // 创建用户
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          username: normalizedUsername,
          password_hash: passwordHash,
          name: normalizedName || null,
        })
        .select("id, username, name, dingtalk_name, role, is_disabled, created_at, last_login")
        .single();
      
      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }
      
      // 分配角色
      if (normalizedRoleIds.length > 0) {
        const userRoleLinks = normalizedRoleIds.map((role_id: number) => ({
          user_id: newUser.id,
          role_id,
        }));
        
        await supabase.from("user_roles").insert(userRoleLinks);
      }
      
      // 记录安全日志
      await logSecurityEvent({
        event_type: 'user_created',
        user_id: operatorId,
        ip_address: ip,
        user_agent: userAgent,
        result: 'success',
        metadata: { target_user_id: newUser.id },
        details: { username: normalizedUsername, name: normalizedName || null },
      });
      
      return NextResponse.json({ success: true, user: newUser });
    }
    
    // 分配角色（原有逻辑）
    const targetUserId = parsePositiveId(user_id);
    if (!targetUserId) {
      return NextResponse.json({ error: "用户ID不能为空" }, { status: 400 });
    }
    
    // 删除旧的角色关联
    await supabase.from("user_roles").delete().eq("user_id", targetUserId);
    
    // 添加新的角色关联
    if (normalizedRoleIds.length > 0) {
      const userRoleLinks = normalizedRoleIds.map((role_id: number) => ({
        user_id: targetUserId,
        role_id,
      }));
      
      const { error } = await supabase.from("user_roles").insert(userRoleLinks);
      
      if (error) {
        return NextResponse.json({ error: getErrorMessage(error, "操作失败") }, { status: 500 });
      }
    }
    
    // 记录安全日志
    await logSecurityEvent({
      event_type: 'user_role_changed',
      user_id: operatorId,
      ip_address: ip,
      user_agent: userAgent,
      result: 'success',
      metadata: { target_user_id: targetUserId },
      details: { role_ids: normalizedRoleIds },
    });
    
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}

// 删除用户（超管保护 + 安全日志）
export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'system:permission_manage');
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseClient();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    const { searchParams } = new URL(request.url);
    const targetUserId = parsePositiveId(searchParams.get('id'));
    if (!targetUserId) {
      return NextResponse.json({ error: '用户ID不能为空' }, { status: 400 });
    }
    if (targetUserId === Number(auth.user.id)) {
      return NextResponse.json({ error: '不能删除自己的账号' }, { status: 400 });
    }

    const { data: targetUser } = await supabase
      .from('users')
      .select('id, username, role')
      .eq('id', targetUserId)
      .maybeSingle();
    if (!targetUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    if (String(targetUser.role || '') === 'super_admin' && !auth.user.is_super_admin) {
      return NextResponse.json({ error: '只有超级管理员可以删除超级管理员账号' }, { status: 403 });
    }

    await supabase.from('user_roles').delete().eq('user_id', targetUserId);
    const { error } = await supabase.from('users').delete().eq('id', targetUserId);
    if (error) {
      return NextResponse.json({ error: getErrorMessage(error, '删除用户失败') }, { status: 500 });
    }

    await logSecurityEvent({
      event_type: 'user_deleted',
      user_id: auth.user.id,
      ip_address: ip,
      user_agent: userAgent,
      result: 'success',
      metadata: { target_user_id: targetUserId },
      details: { username: targetUser.username },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }
}