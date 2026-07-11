import { getSupabaseClient } from "@/storage/database/supabase-client";
import { NextResponse } from "next/server";

// 获取所有权限定义
export async function GET() {
  console.log("[permissions] Starting to fetch permissions...");
  
  let supabase;
  try {
    supabase = getSupabaseClient();
    console.log("[permissions] Supabase client created successfully");
  } catch (err) {
    console.error("[permissions] Failed to create Supabase client:", err);
    return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 });
  }
  
  console.log("[permissions] Executing query on permissions table...");
  const { data: permissions, error } = await supabase
    .from("permissions")
    .select("*")
    .order("id", { ascending: true });
  
  console.log("[permissions] Query result:", { count: permissions?.length, error, dataSample: permissions?.slice(0, 3) });
  
  if (error) {
    console.error("[permissions] Query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 按模块分组 - 匹配数据库实际 resource 值
  const modules = [
    { key: "projects", name: "项目中心", actions: ["view", "create", "edit", "delete", "import", "export", "progress", "view_detail"] },
    { key: "work_items", name: "项目中心", actions: ["view", "create", "edit", "delete", "import", "export", "progress"] },
    { key: "visas", name: "项目中心", actions: ["view", "create", "edit", "delete", "import", "export"] },
    { key: "workers", name: "人力与证件", actions: ["view", "create", "edit", "delete", "import", "export", "view_detail", "manage"] },
    { key: "salaries", name: "人力与证件", actions: ["view", "create", "edit", "delete", "import", "export", "pay", "summary", "view_detail"] },
    { key: "certificates", name: "人力与证件", actions: ["view", "create", "edit", "delete"] },
    { key: "suppliers", name: "供应与成本管理", actions: ["view", "create", "edit", "delete", "import", "export"] },
    { key: "settlements", name: "供应与成本管理", actions: ["view", "create", "edit", "delete", "import", "export", "approve"] },
    { key: "supplier_payments", name: "供应与成本管理", actions: ["view", "create", "edit", "delete", "import", "export"] },
    { key: "payments", name: "供应与成本管理", actions: ["view", "create", "edit", "delete"] },
    { key: "comprehensive_expenses", name: "供应与成本管理", actions: ["view", "create", "edit", "delete", "import", "export"] },
    { key: "miscellaneous_materials", name: "供应与成本管理", actions: ["view", "create", "edit", "delete", "import", "export"] },
    { key: "client_reports", name: "资金管理", actions: ["view", "create", "edit", "delete", "import", "export"] },
    { key: "client_payments", name: "资金管理", actions: ["view", "create", "edit", "delete", "import", "export"] },
    { key: "cost_center", name: "数据与决策", actions: ["view", "export", "profit"] },
    { key: "notifications", name: "系统配置", actions: ["view", "delete", "settings"] },
    { key: "roles", name: "系统配置", actions: ["view", "create", "edit", "delete", "assign_permission"] },
    { key: "users", name: "系统配置", actions: ["view", "create", "edit", "delete", "assign_role", "assign_project", "reset_password"] },
    { key: "system", name: "系统配置", actions: ["view", "config", "export", "backup", "restore"] },
  ];
  
  // 去重并合并同一模块的权限
  const moduleMap = new Map<string, { key: string; name: string; permissions: typeof permissions }>();
  
  for (const mod of modules) {
    const filteredPerms = permissions?.filter((p) => 
      p.resource === mod.key && mod.actions.includes(p.action)
    ) || [];
    
    if (filteredPerms.length > 0) {
      if (moduleMap.has(mod.name)) {
        const existing = moduleMap.get(mod.name)!;
        existing.permissions = [...existing.permissions, ...filteredPerms];
      } else {
        moduleMap.set(mod.name, { key: mod.key, name: mod.name, permissions: filteredPerms });
      }
    }
  }
  
  const groupedPermissions = Array.from(moduleMap.values()).map((m) => ({
    key: m.key,
    name: m.name,
    permissions: m.permissions,
  }));
  
  return NextResponse.json({ 
    permissions,
    groupedPermissions,
    modules,
  });
}
