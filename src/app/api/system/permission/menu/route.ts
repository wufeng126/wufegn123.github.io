import { NextResponse } from 'next/server';
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getCurrentUser } from '@/lib/auth';

// 定义完整的权限菜单结构（与前端 PERMISSION_MENU 保持一致，按6大模块分组）
const PERMISSION_MENU_STRUCTURE = [
  {
    name: '工作台',
    code: 'workspace',
    icon: 'home',
    children: [
      { name: '业务工作台', code: 'dashboard:view', icon: 'list' },
      { name: '月度经营月报-查看', code: 'report:monthly_view', icon: 'chart' },
      { name: '月度经营月报-导出PDF', code: 'report:export_pdf', icon: 'download' },
      { name: '月度经营月报-导出Excel', code: 'report:export_excel', icon: 'download' },
      { name: 'AI劳务助手-对话', code: 'ai:chat', icon: 'chat' },
      { name: 'AI劳务助手-上传文件', code: 'ai:upload', icon: 'upload' },
      { name: 'AI劳务助手-知识库管理', code: 'ai:knowledge_manage', icon: 'book' },
    ]
  },
  {
    name: '项目经营',
    code: 'projects',
    icon: 'building',
    children: [
      { name: '项目管理-列表', code: 'projects:list', icon: 'list' },
      { name: '项目管理-查看', code: 'projects:view', icon: 'eye' },
      { name: '项目管理-新增', code: 'projects:create', icon: 'plus' },
      { name: '项目管理-编辑', code: 'projects:edit', icon: 'edit' },
      { name: '项目管理-删除', code: 'projects:delete', icon: 'trash' },
      { name: '报量管理-列表', code: 'work_items:list', icon: 'list' },
      { name: '报量管理-查看', code: 'work_items:view', icon: 'eye' },
      { name: '报量管理-新增', code: 'work_items:create', icon: 'plus' },
      { name: '报量管理-编辑', code: 'work_items:edit', icon: 'edit' },
      { name: '报量管理-删除', code: 'work_items:delete', icon: 'trash' },
      { name: '报量管理-进度', code: 'work_items:progress', icon: 'chart' },
      { name: '限价管理-列表', code: 'limit_prices:list', icon: 'list' },
      { name: '限价管理-新增', code: 'limit_prices:create', icon: 'plus' },
      { name: '限价管理-编辑', code: 'limit_prices:edit', icon: 'edit' },
      { name: '限价管理-删除', code: 'limit_prices:delete', icon: 'trash' },
      { name: '签证管理-列表', code: 'visas:list', icon: 'list' },
      { name: '签证管理-新增', code: 'visas:create', icon: 'plus' },
      { name: '签证管理-编辑', code: 'visas:edit', icon: 'edit' },
      { name: '签证管理-删除', code: 'visas:delete', icon: 'trash' },
      { name: '签证管理-附件', code: 'visas:attachments', icon: 'paperclip' },
      { name: '产值结算(甲方报量)-列表', code: 'client_reports:list', icon: 'list' },
      { name: '产值结算(甲方报量)-查看', code: 'client_reports:view', icon: 'eye' },
      { name: '产值结算(甲方报量)-新增', code: 'client_reports:create', icon: 'plus' },
      { name: '产值结算(甲方报量)-编辑', code: 'client_reports:edit', icon: 'edit' },
      { name: '产值结算(甲方报量)-删除', code: 'client_reports:delete', icon: 'trash' },
      { name: '甲方回款-列表', code: 'client_payments:list', icon: 'list' },
      { name: '甲方回款-查看', code: 'client_payments:view', icon: 'eye' },
      { name: '甲方回款-新增', code: 'client_payments:create', icon: 'plus' },
      { name: '甲方回款-编辑', code: 'client_payments:edit', icon: 'edit' },
      { name: '甲方回款-删除', code: 'client_payments:delete', icon: 'trash' },
    ]
  },
  {
    name: '人力工资',
    code: 'hr_salary',
    icon: 'users',
    children: [
      { name: '花名册-列表', code: 'workers:list', icon: 'list' },
      { name: '花名册-查看', code: 'workers:view', icon: 'eye' },
      { name: '花名册-新增', code: 'workers:create', icon: 'plus' },
      { name: '花名册-编辑', code: 'workers:edit', icon: 'edit' },
      { name: '花名册-删除', code: 'workers:delete', icon: 'trash' },
      { name: '花名册-导入', code: 'workers:import', icon: 'upload' },
      { name: '花名册-导出', code: 'workers:export', icon: 'download' },
      { name: '证件管理-列表', code: 'certificates:list', icon: 'list' },
      { name: '证件管理-查看', code: 'certificates:view', icon: 'eye' },
      { name: '证件管理-新增', code: 'certificates:create', icon: 'plus' },
      { name: '证件管理-编辑', code: 'certificates:edit', icon: 'edit' },
      { name: '证件管理-删除', code: 'certificates:delete', icon: 'trash' },
      { name: '证件管理-附件上传', code: 'certificates:upload', icon: 'upload' },
      { name: '月度工资-列表', code: 'salaries:list', icon: 'list' },
      { name: '月度工资-查看', code: 'salaries:view', icon: 'eye' },
      { name: '月度工资-新增', code: 'salaries:create', icon: 'plus' },
      { name: '月度工资-编辑', code: 'salaries:edit', icon: 'edit' },
      { name: '月度工资-删除', code: 'salaries:delete', icon: 'trash' },
      { name: '月度工资-导入', code: 'salaries:import', icon: 'upload' },
      { name: '月度工资-导出', code: 'salaries:export', icon: 'download' },
      { name: '工资查询', code: 'salaries:query', icon: 'search' },
      { name: '工资发放-列表', code: 'salaries:pay', icon: 'wallet' },
      { name: '工资发放-新增', code: 'salaries:pay_create', icon: 'plus' },
      { name: '工资发放-删除', code: 'salaries:pay_delete', icon: 'trash' },
    ]
  },
  {
    name: '供应商与费用',
    code: 'supplier_expense',
    icon: 'truck',
    children: [
      { name: '供应商库-列表', code: 'suppliers:list', icon: 'list' },
      { name: '供应商库-查看', code: 'suppliers:view', icon: 'eye' },
      { name: '供应商库-新增', code: 'suppliers:create', icon: 'plus' },
      { name: '供应商库-编辑', code: 'suppliers:edit', icon: 'edit' },
      { name: '供应商库-删除', code: 'suppliers:delete', icon: 'trash' },
      { name: '结算管理-列表', code: 'settlements:list', icon: 'list' },
      { name: '结算管理-查看', code: 'settlements:view', icon: 'eye' },
      { name: '结算管理-新增', code: 'settlements:create', icon: 'plus' },
      { name: '结算管理-编辑', code: 'settlements:edit', icon: 'edit' },
      { name: '结算管理-删除', code: 'settlements:delete', icon: 'trash' },
      { name: '付款记录-列表', code: 'payments:list', icon: 'list' },
      { name: '付款记录-查看', code: 'payments:view', icon: 'eye' },
      { name: '付款记录-新增', code: 'payments:create', icon: 'plus' },
      { name: '付款记录-编辑', code: 'payments:edit', icon: 'edit' },
      { name: '付款记录-删除', code: 'payments:delete', icon: 'trash' },
      { name: '零星材料-列表', code: 'materials:list', icon: 'list' },
      { name: '零星材料-查看', code: 'materials:view', icon: 'eye' },
      { name: '零星材料-新增', code: 'materials:create', icon: 'plus' },
      { name: '零星材料-编辑', code: 'materials:edit', icon: 'edit' },
      { name: '零星材料-删除', code: 'materials:delete', icon: 'trash' },
      { name: '综合费用-列表', code: 'expenses:list', icon: 'list' },
      { name: '综合费用-查看', code: 'expenses:view', icon: 'eye' },
      { name: '综合费用-新增', code: 'expenses:create', icon: 'plus' },
      { name: '综合费用-编辑', code: 'expenses:edit', icon: 'edit' },
      { name: '综合费用-删除', code: 'expenses:delete', icon: 'trash' },
    ]
  },
  {
    name: '经营分析',
    code: 'analysis',
    icon: 'chart',
    children: [
      { name: '成本利润中心-查看', code: 'cost_center:view', icon: 'eye' },
      { name: '成本利润中心-导出', code: 'cost_center:export', icon: 'download' },
      { name: '供应商成本看板', code: 'data_board:supplier_cost', icon: 'chart' },
      { name: '工人成本看板', code: 'data_board:worker_cost', icon: 'chart' },
      { name: '资金管理看板', code: 'data_board:fund_management', icon: 'dollar' },
    ]
  },
  {
    name: '施工日志',
    code: 'construction_logs',
    icon: 'clipboard',
    children: [
      { name: '施工日志-查看', code: 'construction_logs:view', icon: 'list' },
      { name: '施工日志-写日志', code: 'construction_logs:edit', icon: 'edit' },
    ]
  },
  {
    name: '成本测算',
    code: 'cost_estimation',
    icon: 'calculator',
    children: [
      { name: '成本测算-查看', code: 'cost_estimation:view', icon: 'list' },
      { name: '投标测算', code: 'cost_estimation:bid', icon: 'target' },
    ]
  },
  {
    name: '知识库',
    code: 'knowledge',
    icon: 'book',
    children: [
      { name: '知识库-查看', code: 'knowledge:view', icon: 'list' },
      { name: '写知识', code: 'knowledge:write', icon: 'edit' },
      { name: '月度分析', code: 'knowledge:monthly_analysis', icon: 'chart' },
      { name: '审批流程参与', code: 'knowledge:approval', icon: 'check-circle' },
    ]
  },
  {
    name: '系统管理',
    code: 'system',
    icon: 'settings',
    children: [
      { name: '消息通知-列表', code: 'notifications:list', icon: 'list' },
      { name: '消息通知-查看', code: 'notifications:view', icon: 'eye' },
      { name: '通知设置', code: 'notifications:settings', icon: 'settings' },
      { name: '钉钉通讯录绑定', code: 'dingtalk:binding', icon: 'link' },
      { name: '钉钉通讯录同步', code: 'dingtalk:sync', icon: 'refresh' },
      { name: '钉钉配置管理', code: 'dingtalk:config', icon: 'settings' },
      { name: 'AI助手配置', code: 'ai:config', icon: 'robot' },
      { name: 'AI知识库管理', code: 'ai:knowledge', icon: 'book' },
      { name: 'AI审计日志', code: 'ai:audit', icon: 'file' },
      { name: '操作日志', code: 'system:audit_logs', icon: 'file' },
      { name: '数据备份', code: 'system:backup', icon: 'database' },
      { name: '后台管理', code: 'admin:view', icon: 'admin' },
      { name: '后台管理-管理', code: 'admin:manage', icon: 'shield' },
      { name: '权限管理-角色', code: 'system:roles', icon: 'shield' },
      { name: '权限管理-用户', code: 'system:users', icon: 'users' },
      { name: '权限管理-菜单配置', code: 'system:permission', icon: 'menu' },
    ]
  },
];

// GET: 获取所有权限菜单结构（自动同步缺失的权限到数据库）
export async function GET() {
  try {
    console.log('[Permission Menu] Fetching permission menu structure...');
    const supabase = getSupabaseClient();

    // 1. 收集 PERMISSION_MENU_STRUCTURE 中所有权限码
    const allCodes: string[] = [];
    const flatPerms: { name: string; code: string; resource: string; action: string; category: string; description: string }[] = [];
    for (const module of PERMISSION_MENU_STRUCTURE) {
      for (const child of module.children) {
        allCodes.push(child.code);
        const parts = child.code.split(':');
        const resource = parts[0] || module.code;
        const action = parts.slice(1).join(':') || 'view';
        flatPerms.push({
          name: child.name,
          code: child.code,
          resource,
          action,
          category: module.name,
          description: child.name,
        });
      }
    }

    // 2. 查询数据库中已存在的权限码
    const { data: existingPerms } = await supabase
      .from('permissions')
      .select('code')
      .in('code', allCodes);

    const existingCodes = new Set((existingPerms || []).map((p: any) => p.code));

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
  } catch (error: any) {
    console.error('[Permission Menu] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取权限菜单失败' },
      { status: 500 }
    );
  }
}

// POST: 同步权限数据（增量插入缺失的权限，不删除已有数据）
export async function POST() {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // 只有超级管理员可以同步权限
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    console.log('[Permission Sync] Syncing permission data...');
    
    const supabase = getSupabaseClient();
    
    // 1. 获取现有权限codes
    const { data: existing } = await supabase.from('permissions').select('code');
    const existingCodes = new Set((existing || []).map((p: any) => p.code));
    
    // 2. 构建所有权限记录
    const permissionRecords: any[] = [];
    for (const module of PERMISSION_MENU_STRUCTURE) {
      for (const child of module.children) {
        if (!existingCodes.has(child.code)) {
          permissionRecords.push({
            name: child.name,
            code: child.code,
            resource: module.code,
            action: child.code.split(':')[1] || 'view',
            category: module.name,
            description: `${module.name} - ${child.name}`,
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
      
      const existingPermIds = new Set((existingRolePerms || []).map((rp: any) => rp.permission_id));
      const newRolePerms = (allPerms || [])
        .filter((p: any) => !existingPermIds.has(p.id))
        .map((p: any) => ({ role_id: existingRole.id, permission_id: p.id }));
      
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
  } catch (error: any) {
    console.error('[Permission Sync] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 获取模块名称
function getModuleName(code: string): string {
  const names: Record<string, string> = {
    projects: '项目中心',
    work_items: '报量管理',
    visas: '签证管理',
    workers: '人力与证件',
    salaries: '工资管理',
    supply: '供应与成本管理',
    funds: '资金管理',
    data: '数据与决策',
    system: '系统配置',
    permission: '权限管理中心',
  };
  return names[code] || code;
}
