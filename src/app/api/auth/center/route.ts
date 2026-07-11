import { getSupabaseClient } from "@/storage/database/supabase-client";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = getSupabaseClient();
  
  // 获取角色数量
  const { count: roleCount } = await supabase
    .from("roles")
    .select("*", { count: "exact", head: true });
  
  // 获取用户数量
  const { count: userCount } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });
  
  // 获取权限数量
  const { count: permissionCount } = await supabase
    .from("permission_definitions")
    .select("*", { count: "exact", head: true });
  
  return NextResponse.json({
    stats: {
      roleCount: roleCount || 0,
      userCount: userCount || 0,
      permissionCount: permissionCount || 0,
    },
  });
}
