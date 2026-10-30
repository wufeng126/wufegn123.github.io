import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermission } from "@/lib/api-auth";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/api-utils";

// 获取所有权限定义
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "system:permission_manage");
  if (!auth.ok) return auth.response;

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
    return NextResponse.json({ error: getErrorMessage(error, '获取权限列表失败') }, { status: 500 });
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
  
  // 按 resource 动态分组（覆盖数据库全部权限，避免硬编码白名单漏掉班组/月报等模块）
  const resourceLabels: Record<string, string> = {
    projects: '项目中心', work_items: '项目中心', visas: '项目中心', evidence_chain: '项目中心',
    client_reports: '资金管理', client_payments: '资金管理',
    workers: '人力与证件', salaries: '人力与证件', certificates: '人力与证件',
    suppliers: '供应与成本管理', settlements: '供应与成本管理', supplier_payments: '供应与成本管理',
    comprehensive_expenses: '供应与成本管理', miscellaneous_materials: '供应与成本管理',
    team_groups: '班组管理', team_settlements: '班组管理',
    reports: '工作台', monthly_report: '工作台', ai: '工作台',
    cost_center: '经营分析', data_board: '经营分析',
    construction_logs: '施工管理', construction_attendance: '施工管理',
    cost_estimation: '成本测算', knowledge: '知识库', knowledge_base: '知识库',
    notifications: '系统配置', roles: '系统配置', users: '系统配置', system: '系统配置', audit: '系统配置',
  };
  const resourceGroups = new Map<string, { key: string; name: string; permissions: typeof permissions }>();
  for (const perm of permissions || []) {
    const resource = String(perm.resource || '');
    const groupKey = resourceLabels[resource] || resource || '其他';
    if (!resourceGroups.has(groupKey)) {
      resourceGroups.set(groupKey, { key: groupKey, name: groupKey, permissions: [] });
    }
    resourceGroups.get(groupKey)!.permissions.push(perm);
  }

  const groupedPermissions = Array.from(resourceGroups.values());
  
  return NextResponse.json({ 
    permissions,
    groupedPermissions,
    modules,
  });
}
