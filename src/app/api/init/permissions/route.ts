import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { logSecurityEvent } from '@/lib/security-log';

// 初始化密钥 - 必须通过环境变量配置，不再使用默认值
function getInitSecretKey(): string | null {
  getEnv();
  return process.env.INIT_SECRET_KEY || null;
}

// 获取环境变量
function getEnv() {
  try {
    const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;
    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore
  }
}

// 检查是否为生产环境
function isProduction(): boolean {
  return process.env.COZE_PROJECT_ENV === 'PROD';
}

// 检查数据库是否已有用户（首次部署检测）
async function hasExistingUsers(supabaseUrl: string, serviceKey: string): Promise<boolean> {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    };
    const response = await fetch(
      `${supabaseUrl}/rest/v1/users?select=id&limit=1`,
      { headers }
    );
    const data = await response.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

// 初始化权限数据
async function initPermissions(supabaseUrl: string, serviceKey: string) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  };

  // 扩展后的权限列表
  const permissionsList = [
    // 项目中心
    { module: 'project', code: 'project.view', name: '查看项目', sort_order: 1 },
    { module: 'project', code: 'project.create', name: '新建项目', sort_order: 2 },
    { module: 'project', code: 'project.edit', name: '编辑项目', sort_order: 3 },
    { module: 'project', code: 'project.delete', name: '删除项目', sort_order: 4 },
    { module: 'work_items', code: 'work_items.view', name: '报量管理', sort_order: 10 },
    { module: 'visas', code: 'visas.view', name: '签证管理', sort_order: 20 },
    // 人力与证件
    { module: 'worker', code: 'worker.roster.view', name: '花名册', sort_order: 30 },
    { module: 'worker', code: 'worker.salary.view', name: '月度工资', sort_order: 40 },
    { module: 'certificate', code: 'certificate.view', name: '证件管理', sort_order: 70 },
    // 供应与成本管理
    { module: 'supplier', code: 'supplier.view', name: '供应商库', sort_order: 80 },
    { module: 'supplier', code: 'settlement.view', name: '结算管理', sort_order: 90 },
    { module: 'supplier', code: 'payment.record.view', name: '付款记录', sort_order: 100 },
    { module: 'expense', code: 'expense.view', name: '综合费用管理', sort_order: 110 },
    { module: 'misc_material', code: 'misc_material.view', name: '零星材料统计', sort_order: 120 },
    // 资金管理
    { module: 'finance', code: 'client_report.view', name: '产值结算', sort_order: 130 },
    { module: 'finance', code: 'client_payment.view', name: '甲方回款', sort_order: 140 },
    // 数据与决策
    { module: 'data', code: 'cost_center.view', name: '成本利润中心', sort_order: 150 },
    // 系统配置
    { module: 'system', code: 'notification.view', name: '消息通知中心', sort_order: 160 },
    { module: 'system', code: 'system.manage', name: '后台管理', sort_order: 170 },
    { module: 'system', code: 'system.permission.manage', name: '权限中心', sort_order: 180 },
    { module: 'system', code: 'system.dingtalk.manage', name: '钉钉通讯录绑定', sort_order: 190 },
    { module: 'system', code: 'system.ai.manage', name: 'AI配置管理', sort_order: 200 },
    { module: 'report', code: 'report.monthly.view', name: '月度经营月报', sort_order: 210 },
    { module: 'report', code: 'report.monthly.export', name: '月报导出', sort_order: 220 },
    { module: 'data', code: 'data.supplier_cost.view', name: '供应商成本看板', sort_order: 230 },
    { module: 'data', code: 'data.worker_cost.view', name: '工人成本看板', sort_order: 240 },
    { module: 'data', code: 'data.fund_management.view', name: '资金综合管理看板', sort_order: 250 },
  { module: 'construction_log', code: 'construction_log.view', name: '施工日志', sort_order: 155 },
  { module: 'construction_log', code: 'construction_log.edit', name: '写施工日志', sort_order: 156 },
  { module: 'construction_attendance', code: 'construction_attendance.view', name: '人员考勤', sort_order: 157 },
  { module: 'team_settlement', code: 'team_groups.view', name: '班组档案', sort_order: 162 },
  { module: 'team_settlement', code: 'team_groups.create', name: '新增班组档案', sort_order: 163 },
  { module: 'team_settlement', code: 'team_groups.edit', name: '编辑班组档案', sort_order: 164 },
  { module: 'team_settlement', code: 'team_groups.delete', name: '删除班组档案', sort_order: 165 },
  { module: 'team_settlement', code: 'team_settlements.view', name: '班组结算', sort_order: 166 },
  { module: 'team_settlement', code: 'team_settlements.create', name: '新增班组结算', sort_order: 167 },
  { module: 'team_settlement', code: 'team_settlements.edit', name: '编辑班组结算', sort_order: 168 },
  { module: 'team_settlement', code: 'team_settlements.delete', name: '删除班组结算', sort_order: 169 },
  { module: 'knowledge', code: 'knowledge.view', name: '知识库', sort_order: 170 },
  { module: 'knowledge', code: 'knowledge.monthly_analysis', name: '月度分析', sort_order: 171 },
  { module: 'knowledge', code: 'knowledge.approval_manage', name: '审批流程参与', sort_order: 172 },
  { module: 'cost', code: 'cost.view', name: '成本测算', sort_order: 173 },
  { module: 'cost', code: 'cost.bid', name: '投标测算', sort_order: 174 },

  ];

  let definitionsInserted = 0;
  let definitionsUpdated = 0;

  // 初始化 permission_definitions 表
  for (const perm of permissionsList) {
    const response = await fetch(`${supabaseUrl}/rest/v1/permission_definitions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(perm),
    });

    if (response.status === 201) {
      definitionsInserted++;
    } else if (response.status === 409) {
      await fetch(`${supabaseUrl}/rest/v1/permission_definitions?code=eq.${perm.code}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(perm),
      });
      definitionsUpdated++;
    }
  }

  // permissions 表数据 - 完整列表
  const permissionsTableData = [
    // 项目中心
    { resource: 'projects', action: 'view', name: '查看项目', category: '项目中心' },
    { resource: 'projects', action: 'create', name: '新建项目', category: '项目中心' },
    { resource: 'projects', action: 'edit', name: '编辑项目', category: '项目中心' },
    { resource: 'projects', action: 'delete', name: '删除项目', category: '项目中心' },
    { resource: 'projects', action: 'import', name: '导入项目', category: '项目中心' },
    { resource: 'projects', action: 'export', name: '导出项目', category: '项目中心' },
    { resource: 'projects', action: 'progress', name: '项目进度', category: '项目中心' },
    { resource: 'work_items', action: 'view', name: '报量管理', category: '项目中心' },
    { resource: 'work_items', action: 'create', name: '新建分项', category: '项目中心' },
    { resource: 'work_items', action: 'edit', name: '编辑分项', category: '项目中心' },
    { resource: 'work_items', action: 'delete', name: '删除分项', category: '项目中心' },
    { resource: 'work_items', action: 'import', name: '导入报量基础数据', category: '项目中心' },
    { resource: 'work_items', action: 'export', name: '导出报量基础数据', category: '项目中心' },
    { resource: 'work_items', action: 'progress', name: '进度管理', category: '项目中心' },
    { resource: 'visas', action: 'view', name: '签证管理', category: '项目中心' },
    { resource: 'visas', action: 'create', name: '新建签证', category: '项目中心' },
    { resource: 'visas', action: 'edit', name: '编辑签证', category: '项目中心' },
    { resource: 'visas', action: 'delete', name: '删除签证', category: '项目中心' },
    // 人力与证件
    { resource: 'workers', action: 'view', name: '花名册', category: '人力与证件' },
    { resource: 'workers', action: 'create', name: '新增工人', category: '人力与证件' },
    { resource: 'workers', action: 'edit', name: '编辑工人', category: '人力与证件' },
    { resource: 'workers', action: 'delete', name: '删除工人', category: '人力与证件' },
    { resource: 'workers', action: 'import', name: '导入工人', category: '人力与证件' },
    { resource: 'workers', action: 'export', name: '导出工人', category: '人力与证件' },
    { resource: 'salaries', action: 'view', name: '月度工资', category: '人力与证件' },
    { resource: 'salaries', action: 'create', name: '录入工资', category: '人力与证件' },
    { resource: 'salaries', action: 'edit', name: '编辑工资', category: '人力与证件' },
    { resource: 'salaries', action: 'delete', name: '删除工资', category: '人力与证件' },
    { resource: 'salaries', action: 'import', name: '导入工资', category: '人力与证件' },
    { resource: 'salaries', action: 'export', name: '导出工资', category: '人力与证件' },
    { resource: 'certificates', action: 'view', name: '证件管理', category: '人力与证件' },
    { resource: 'certificates', action: 'create', name: '新增证件', category: '人力与证件' },
    { resource: 'certificates', action: 'edit', name: '编辑证件', category: '人力与证件' },
    { resource: 'certificates', action: 'delete', name: '删除证件', category: '人力与证件' },
    // 供应与成本管理
    { resource: 'suppliers', action: 'view', name: '供应商库', category: '供应与成本管理' },
    { resource: 'suppliers', action: 'create', name: '新增供应商', category: '供应与成本管理' },
    { resource: 'suppliers', action: 'edit', name: '编辑供应商', category: '供应与成本管理' },
    { resource: 'suppliers', action: 'delete', name: '删除供应商', category: '供应与成本管理' },
    { resource: 'settlements', action: 'view', name: '结算管理', category: '供应与成本管理' },
    { resource: 'settlements', action: 'create', name: '新建结算', category: '供应与成本管理' },
    { resource: 'settlements', action: 'edit', name: '编辑结算', category: '供应与成本管理' },
    { resource: 'settlements', action: 'delete', name: '删除结算', category: '供应与成本管理' },
    { resource: 'supplier_payments', action: 'view', name: '付款记录', category: '供应与成本管理' },
    { resource: 'supplier_payments', action: 'create', name: '新增付款', category: '供应与成本管理' },
    { resource: 'supplier_payments', action: 'edit', name: '编辑付款', category: '供应与成本管理' },
    { resource: 'supplier_payments', action: 'delete', name: '删除付款', category: '供应与成本管理' },
    { resource: 'comprehensive_expenses', action: 'view', name: '综合费用', category: '供应与成本管理' },
    { resource: 'comprehensive_expenses', action: 'create', name: '新增费用', category: '供应与成本管理' },
    { resource: 'comprehensive_expenses', action: 'edit', name: '编辑费用', category: '供应与成本管理' },
    { resource: 'comprehensive_expenses', action: 'delete', name: '删除费用', category: '供应与成本管理' },
    { resource: 'miscellaneous_materials', action: 'view', name: '零星材料', category: '供应与成本管理' },
    { resource: 'miscellaneous_materials', action: 'create', name: '新增材料', category: '供应与成本管理' },
    { resource: 'miscellaneous_materials', action: 'edit', name: '编辑材料', category: '供应与成本管理' },
    { resource: 'miscellaneous_materials', action: 'delete', name: '删除材料', category: '供应与成本管理' },
    // 资金管理
    { resource: 'client_reports', action: 'view', name: '甲方报量', category: '资金管理' },
    { resource: 'client_reports', action: 'create', name: '新增报量', category: '资金管理' },
    { resource: 'client_reports', action: 'edit', name: '编辑报量', category: '资金管理' },
    { resource: 'client_reports', action: 'delete', name: '删除报量', category: '资金管理' },
    { resource: 'client_reports', action: 'import', name: '导入报量', category: '资金管理' },
    { resource: 'client_reports', action: 'export', name: '导出报量', category: '资金管理' },
    { resource: 'client_payments', action: 'view', name: '甲方付款', category: '资金管理' },
    { resource: 'client_payments', action: 'create', name: '新增付款', category: '资金管理' },
    { resource: 'client_payments', action: 'edit', name: '编辑付款', category: '资金管理' },
    { resource: 'client_payments', action: 'delete', name: '删除付款', category: '资金管理' },
    { resource: 'client_payments', action: 'import', name: '导入付款', category: '资金管理' },
    { resource: 'client_payments', action: 'export', name: '导出付款', category: '资金管理' },
    // 数据与决策
    { resource: 'cost_center', action: 'view', name: '成本利润中心', category: '数据与决策' },
    { resource: 'cost_center', action: 'export', name: '导出分析', category: '数据与决策' },
    { resource: 'cost_center', action: 'profit', name: '利润分析', category: '数据与决策' },
    // 数据看板
    { resource: 'data_board', action: 'supplier_cost_view', name: '供应商成本看板', category: '数据看板' },
    { resource: 'construction_logs', action: 'view', name: '查看施工日志', category: '现场管理' },
    { resource: 'construction_logs', action: 'edit', name: '写施工日志', category: '现场管理' },
    { resource: 'construction_attendance', action: 'view', name: '人员考勤', category: '现场管理' },
    { resource: 'team_groups', action: 'list', name: '班组档案列表', category: '班组结算' },
    { resource: 'team_groups', action: 'view', name: '查看班组档案', category: '班组结算' },
    { resource: 'team_groups', action: 'create', name: '新增班组档案', category: '班组结算' },
    { resource: 'team_groups', action: 'edit', name: '编辑班组档案', category: '班组结算' },
    { resource: 'team_groups', action: 'delete', name: '删除班组档案', category: '班组结算' },
    { resource: 'team_settlements', action: 'list', name: '班组结算列表', category: '班组结算' },
    { resource: 'team_settlements', action: 'view', name: '查看班组结算', category: '班组结算' },
    { resource: 'team_settlements', action: 'create', name: '新增班组结算', category: '班组结算' },
    { resource: 'team_settlements', action: 'edit', name: '编辑班组结算', category: '班组结算' },
    { resource: 'team_settlements', action: 'delete', name: '删除班组结算', category: '班组结算' },
  { resource: 'knowledge_base', action: 'view', name: '知识库', category: '知识管理' },
  { resource: 'knowledge_base', action: 'monthly_analysis', name: '月度分析', category: '知识管理' },
  { resource: 'knowledge_base', action: 'approval', name: '审批流程', category: '知识管理' },
  { resource: 'cost_estimation', action: 'view', name: '成本测算', category: '成本管控' },
  { resource: 'cost_estimation', action: 'bid', name: '投标测算', category: '成本管控' },
  { resource: 'data_board', action: 'worker_cost_view', name: '工人成本看板', category: '数据看板' },
    { resource: 'data_board', action: 'fund_management_view', name: '资金综合管理看板', category: '数据看板' },
    // 月度经营月报
    { resource: 'reports', action: 'monthly_view', name: '月度经营月报', category: '报表中心' },
    { resource: 'reports', action: 'monthly_export', name: '月报导出', category: '报表中心' },
    // 系统配置
    { resource: 'notifications', action: 'view', name: '消息通知', category: '系统配置' },
    { resource: 'notifications', action: 'delete', name: '删除通知', category: '系统配置' },
    { resource: 'notifications', action: 'settings', name: '通知设置', category: '系统配置' },
    { resource: 'system', action: 'manage', name: '后台管理', category: '系统配置' },
    { resource: 'system', action: 'permission_manage', name: '权限中心', category: '系统配置' },
    { resource: 'system', action: 'dingtalk_manage', name: '钉钉通讯录绑定', category: '系统配置' },
    { resource: 'system', action: 'ai_manage', name: 'AI配置管理', category: '系统配置' },
    { resource: 'roles', action: 'view', name: '角色管理', category: '系统配置' },
    { resource: 'roles', action: 'create', name: '新建角色', category: '系统配置' },
    { resource: 'roles', action: 'edit', name: '编辑角色', category: '系统配置' },
    { resource: 'roles', action: 'delete', name: '删除角色', category: '系统配置' },
    { resource: 'roles', action: 'assign_permission', name: '分配权限', category: '系统配置' },
    { resource: 'users', action: 'view', name: '用户管理', category: '系统配置' },
    { resource: 'users', action: 'create', name: '新建用户', category: '系统配置' },
    { resource: 'users', action: 'edit', name: '编辑用户', category: '系统配置' },
    { resource: 'users', action: 'delete', name: '删除用户', category: '系统配置' },
    { resource: 'users', action: 'assign_role', name: '分配角色', category: '系统配置' },
    { resource: 'users', action: 'assign_project', name: '分配项目', category: '系统配置' },
    { resource: 'users', action: 'reset_password', name: '重置密码', category: '系统配置' },
  ];

  let permissionsInserted = 0;
  let permissionsUpdated = 0;

  // 初始化 permissions 表
  for (const perm of permissionsTableData) {
    const code = `${perm.resource}:${perm.action}`;
    const response = await fetch(`${supabaseUrl}/rest/v1/permissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...perm, code }),
    });

    if (response.status === 201) {
      permissionsInserted++;
    } else if (response.status === 409) {
      await fetch(`${supabaseUrl}/rest/v1/permissions?code=eq.${code}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(perm),
      });
      permissionsUpdated++;
    }
  }

  // 查询所有 permissions 的 id 和 code
  const permResponse = await fetch(
    `${supabaseUrl}/rest/v1/permissions?select=id,code`,
    { headers }
  );
  const allPermissions = await permResponse.json();
  const permIdMap = new Map(allPermissions.map((p: { id: number; code: string }) => [p.code, p.id]));

  // 获取或创建超级管理员角色
  let superAdminRoleId: number | null = null;
  const roleResponse = await fetch(
    `${supabaseUrl}/rest/v1/roles?name=eq.超级管理员&select=id`,
    { headers }
  );
  const existingRoles = await roleResponse.json();

  if (existingRoles.length > 0) {
    superAdminRoleId = existingRoles[0].id;
  } else {
    const createRoleResponse = await fetch(`${supabaseUrl}/rest/v1/roles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: '超级管理员',
        code: 'super_admin',
        description: '拥有系统所有模块的最高权限，无任何数据/操作限制',
        level: 1,
        is_super_admin: true,
      }),
    });
    const newRole = await createRoleResponse.json();
    superAdminRoleId = newRole[0]?.id || newRole?.id;
  }

  // 清除超级管理员的现有权限
  if (superAdminRoleId) {
    await fetch(
      `${supabaseUrl}/rest/v1/role_permissions?role_id=eq.${superAdminRoleId}`,
      {
        method: 'DELETE',
        headers: {
          ...headers,
          'Prefer': 'return=minimal',
        },
      }
    );

    // 为超级管理员添加所有权限
    for (const perm of permissionsTableData) {
      const code = `${perm.resource}:${perm.action}`;
      const permId = permIdMap.get(code);
      if (permId && superAdminRoleId) {
        await fetch(`${supabaseUrl}/rest/v1/role_permissions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            role_id: superAdminRoleId,
            permission_id: permId,
          }),
        });
      }
    }
  }

  return {
    success: true,
    message: '权限数据初始化完成',
    stats: {
      definitionsInserted,
      definitionsUpdated,
      permissionsInserted,
      permissionsUpdated,
      totalDefinitions: permissionsList.length,
      totalPermissions: permissionsTableData.length,
      superAdminPermissions: permissionsTableData.length,
    },
  };
}

// GET: 检查状态 或 带key参数初始化
export async function GET(request: Request) {
  try {
    // 生产环境完全禁用此接口
    if (isProduction()) {
      return NextResponse.json(
        { error: '此接口在生产环境中已禁用' },
        { status: 403 }
      );
    }

    getEnv();

    const secretKey = getInitSecretKey();
    if (!secretKey) {
      return NextResponse.json(
        { error: '未配置 INIT_SECRET_KEY 环境变量，初始化接口不可用' },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.COZE_SUPABASE_URL;
    const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Missing database configuration' },
        { status: 500 }
      );
    }

    // 检查是否已有用户（已初始化则永久禁用）
    const initialized = await hasExistingUsers(supabaseUrl, serviceKey);
    if (initialized) {
      return NextResponse.json(
        { error: '系统已初始化，此接口已永久禁用' },
        { status: 403 }
      );
    }

    // 检查是否有初始化参数
    const url = new URL(request.url);
    const initKey = url.searchParams.get('key');

    // 如果提供了正确的key，直接执行初始化
    if (initKey === secretKey) {
      await logSecurityEvent({
        event_type: 'init_permissions_called',
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
        result: 'success',
        details: { method: 'GET', source: 'init_key' },
      });
      return NextResponse.json(await initPermissions(supabaseUrl, serviceKey));
    }

    // 否则返回状态信息
    const headers = {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    };

    const [permDefResponse, permResponse, roleResponse, rolePermResponse] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/permission_definitions?select=code`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/permissions?select=code`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/roles?select=id,name`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/role_permissions?select=role_id`, { headers }),
    ]);

    const permDefs = await permDefResponse.json();
    const perms = await permResponse.json();
    const roles = await roleResponse.json();
    const rolePerms = await rolePermResponse.json();

    return NextResponse.json({
      status: 'ok',
      data: {
        permissionDefinitions: permDefs.length,
        permissions: perms.length,
        roles: roles.length,
        rolePermissions: rolePerms.length,
      },
      message: 'Use ?key=<INIT_SECRET_KEY> to initialize permissions',
    });
  } catch (error) {
    console.error('[init-permissions] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: 执行初始化
export async function POST(request: Request) {
  try {
    // 生产环境完全禁用
    if (isProduction()) {
      return NextResponse.json(
        { error: '此接口在生产环境中已禁用' },
        { status: 403 }
      );
    }

    getEnv();

    const secretKey = getInitSecretKey();
    if (!secretKey) {
      return NextResponse.json(
        { error: '未配置 INIT_SECRET_KEY 环境变量，初始化接口不可用' },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.COZE_SUPABASE_URL;
    const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Missing database configuration' },
        { status: 500 }
      );
    }

    // 检查是否已初始化
    const initialized = await hasExistingUsers(supabaseUrl, serviceKey);
    if (initialized) {
      await logSecurityEvent({
        event_type: 'init_permissions_blocked',
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
        result: 'blocked',
        details: { reason: 'already_initialized' },
      });
      return NextResponse.json(
        { error: '系统已初始化，此接口已永久禁用' },
        { status: 403 }
      );
    }

    // 检查授权
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${secretKey}`) {
      await logSecurityEvent({
        event_type: 'init_permissions_unauthorized',
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
        result: 'failed',
        details: { reason: 'invalid_secret_key' },
      });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await logSecurityEvent({
      event_type: 'init_permissions_called',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
      result: 'success',
      details: { method: 'POST' },
    });

    return NextResponse.json(await initPermissions(supabaseUrl, serviceKey));
  } catch (error) {
    console.error('[init-permissions] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
