import { getSupabaseClient } from "@/storage/database/supabase-client";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { logSecurityEvent } from "@/lib/security-log";

// 获取所有用户
export async function GET() {
  const supabase = getSupabaseClient();
  
  // 获取所有用户
  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .order("id", { ascending: true });
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    };
  });
  
  return NextResponse.json({ users: formattedUsers });
}

// 创建用户或分配角色
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  try {
    const body = await request.json();
    const { action, user_id, role_ids, username, password, name, email } = body;
    
    // 从 cookie 获取操作者信息
    const authHeader = request.headers.get('x-user-id');
    const operatorId = authHeader ? parseInt(authHeader) : undefined;
    
    // 创建新用户
    if (action === "create") {
      if (!username || !password) {
        return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
      }
      
      // 检查用户名是否已存在
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .single();
      
      if (existingUser) {
        return NextResponse.json({ error: "用户名已存在" }, { status: 400 });
      }
      
      // 加密密码
      const passwordHash = createHash("sha256").update(password).digest("hex");
      
      // 创建用户
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          username,
          password_hash: passwordHash,
          name: name || null,
        })
        .select()
        .single();
      
      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }
      
      // 分配角色
      if (role_ids && Array.isArray(role_ids) && role_ids.length > 0) {
        const userRoleLinks = role_ids.map((role_id: number) => ({
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
        details: { username, name },
      });
      
      return NextResponse.json({ success: true, user: newUser });
    }
    
    // 分配角色（原有逻辑）
    if (!user_id) {
      return NextResponse.json({ error: "用户ID不能为空" }, { status: 400 });
    }
    
    // 删除旧的角色关联
    await supabase.from("user_roles").delete().eq("user_id", user_id);
    
    // 添加新的角色关联
    if (role_ids && Array.isArray(role_ids) && role_ids.length > 0) {
      const userRoleLinks = role_ids.map((role_id: number) => ({
        user_id,
        role_id,
      }));
      
      const { error } = await supabase.from("user_roles").insert(userRoleLinks);
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    
    // 记录安全日志
    await logSecurityEvent({
      event_type: 'user_role_changed',
      user_id: operatorId,
      ip_address: ip,
      user_agent: userAgent,
      result: 'success',
      metadata: { target_user_id: user_id },
      details: { role_ids },
    });
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}
