import { getSupabaseClient } from "@/storage/database/supabase-client";
import { cookies } from "next/headers";
import * as jose from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "construction-labor-management-secret-key-2024"
);

// 获取当前用户的权限
export async function GET() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get("auth_token")?.value;
  
  if (!authToken) {
    return NextResponse.json({ 
      authenticated: false,
      permissions: [] 
    }, { status: 401 });
  }
  
  try {
    // 解码 JWT
    const { payload } = await jose.jwtVerify(authToken, JWT_SECRET);
    const userId = payload.id as number;
    
    if (!userId) {
      return NextResponse.json({ 
        authenticated: false,
        permissions: [] 
      }, { status: 401 });
    }
    
    const supabase = getSupabaseClient();
    
    // 获取用户的所有角色
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role_id")
      .eq("user_id", userId);
    
    if (!userRoles || userRoles.length === 0) {
      return NextResponse.json({ 
        authenticated: true,
        is_super_admin: false,
        permissions: [] 
      });
    }
    
    const roleIds = userRoles.map((ur) => ur.role_id);
    
    // 获取这些角色的信息
    const { data: roles } = await supabase
      .from("roles")
      .select("level, name")
      .in("id", roleIds);
    
    // 检查是否为超级管理员（level === 1）
    const isSuperAdmin = (roles || []).some((r) => r.level === 1);
    
    if (isSuperAdmin) {
      // 超级管理员拥有所有权限
      const { data: allPerms } = await supabase
        .from("permission_definitions")
        .select("code");
      
      return NextResponse.json({ 
        authenticated: true,
        is_super_admin: true,
        permissions: (allPerms || []).map((p) => p.code),
        role_names: (roles || []).map((r) => r.name),
      });
    }
    
    // 获取这些角色的所有权限
    const { data: rolePermissions } = await supabase
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", roleIds);
    
    if (!rolePermissions || rolePermissions.length === 0) {
      return NextResponse.json({ 
        authenticated: true,
        is_super_admin: false,
        permissions: [],
        role_names: (roles || []).map((r) => r.name),
      });
    }
    
    const permIds = [...new Set(rolePermissions.map((rp) => rp.permission_id))];
    
    const { data: permissions } = await supabase
      .from("permission_definitions")
      .select("code")
      .in("id", permIds);
    
    return NextResponse.json({ 
      authenticated: true,
      is_super_admin: false,
      permissions: (permissions || []).map((p) => p.code),
      role_names: (roles || []).map((r) => r.name),
    });
  } catch (err) {
    return NextResponse.json({ 
      authenticated: false,
      permissions: [] 
    }, { status: 401 });
  }
}

// 检查用户是否拥有指定权限
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const authToken = cookieStore.get("auth_token")?.value;
  
  if (!authToken) {
    return NextResponse.json({ 
      authenticated: false,
      has_permission: false,
    }, { status: 401 });
  }
  
  try {
    // 解码 JWT
    const { payload } = await jose.jwtVerify(authToken, JWT_SECRET);
    const userId = payload.id as number;
    
    if (!userId) {
      return NextResponse.json({ 
        authenticated: false,
        has_permission: false,
      }, { status: 401 });
    }
    
    const supabase = getSupabaseClient();
    
    const body = await request.json();
    const { permission_codes } = body;
    
    // 如果传入了多个权限码，检查是否至少有一个权限
    const checkAny = body.check_any || false;
    
    // 获取用户的所有角色
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role_id")
      .eq("user_id", userId);
    
    if (!userRoles || userRoles.length === 0) {
      return NextResponse.json({ 
        authenticated: true,
        has_permission: false,
      });
    }
    
    const roleIds = userRoles.map((ur) => ur.role_id);
    
    // 获取这些角色的信息
    const { data: roles } = await supabase
      .from("roles")
      .select("level")
      .in("id", roleIds);
    
    // 检查是否为超级管理员
    const isSuperAdmin = (roles || []).some((r) => r.level === 1);
    
    if (isSuperAdmin) {
      return NextResponse.json({ 
        authenticated: true,
        has_permission: true,
        is_super_admin: true,
      });
    }
    
    // 获取这些角色的所有权限
    const { data: rolePermissions } = await supabase
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", roleIds);
    
    if (!rolePermissions || rolePermissions.length === 0) {
      return NextResponse.json({ 
        authenticated: true,
        has_permission: false,
      });
    }
    
    const permIds = [...new Set(rolePermissions.map((rp) => rp.permission_id))];
    
    // 获取权限定义
    const { data: permissions } = await supabase
      .from("permission_definitions")
      .select("id, code")
      .in("id", permIds);
    
    const userPermCodes = (permissions || []).map((p) => p.code);
    
    // 检查权限
    let hasPermission = false;
    if (checkAny) {
      // 检查是否有任何一个权限
      hasPermission = permission_codes?.some((code: string) => userPermCodes.includes(code)) || false;
    } else {
      // 检查是否拥有所有权限
      hasPermission = permission_codes?.every((code: string) => userPermCodes.includes(code)) || false;
    }
    
    return NextResponse.json({ 
      authenticated: true,
      has_permission: hasPermission,
      user_permissions: userPermCodes,
    });
  } catch (err) {
    return NextResponse.json({ 
      authenticated: false,
      has_permission: false,
    }, { status: 401 });
  }
}
