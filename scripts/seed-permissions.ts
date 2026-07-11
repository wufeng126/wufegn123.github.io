import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedPermissions() {
  console.log('Starting permission seed...');

  // 权限定义数据
  const permissions = [
    // 项目中心
    { module: 'project', code: 'project.view', name: '查看项目', description: '查看项目列表和详情', sort_order: 1 },
    { module: 'project', code: 'project.create', name: '新建项目', description: '创建新项目', sort_order: 2 },
    { module: 'project', code: 'project.edit', name: '编辑项目', description: '编辑项目信息', sort_order: 3 },
    { module: 'project', code: 'project.delete', name: '删除项目', description: '删除项目', sort_order: 4 },
    { module: 'project', code: 'work_items.view', name: '工程量统计', description: '工程量统计模块', sort_order: 10 },
    { module: 'project', code: 'visas.view', name: '签证管理', description: '签证管理模块', sort_order: 20 },
    
    // 人力与证件
    { module: 'worker', code: 'worker.roster.view', name: '花名册', description: '花名册模块', sort_order: 30 },
    { module: 'worker', code: 'worker.roster.import', name: '花名册导入', description: '导入工人数据', sort_order: 31 },
    { module: 'worker', code: 'worker.roster.export', name: '花名册导出', description: '导出工人数据', sort_order: 32 },
    { module: 'worker', code: 'worker.salary.view', name: '月度工资', description: '月度工资模块', sort_order: 40 },
    { module: 'worker', code: 'worker.salary.input', name: '工资录入', description: '录入工资数据', sort_order: 41 },
    { module: 'worker', code: 'worker.query.view', name: '工资查询', description: '工资查询模块', sort_order: 50 },
    { module: 'worker', code: 'worker.payment.view', name: '工资发放', description: '工资发放模块', sort_order: 60 },
    { module: 'worker', code: 'certificate.view', name: '证件管理', description: '证件管理模块', sort_order: 70 },
    
    // 供应与成本管理
    { module: 'supplier', code: 'supplier.view', name: '供应商库', description: '供应商库模块', sort_order: 80 },
    { module: 'supplier', code: 'supplier.manage', name: '供应商管理', description: '管理供应商', sort_order: 81 },
    { module: 'supplier', code: 'settlement.view', name: '结算管理', description: '结算管理模块', sort_order: 90 },
    { module: 'supplier', code: 'settlement.input', name: '结算录入', description: '录入结算数据', sort_order: 91 },
    { module: 'supplier', code: 'payment.record.view', name: '付款记录', description: '付款记录模块', sort_order: 100 },
    { module: 'supplier', code: 'payment.record.manage', name: '付款管理', description: '管理付款记录', sort_order: 101 },
    { module: 'supplier', code: 'expense.view', name: '综合费用管理', description: '综合费用管理模块', sort_order: 110 },
    { module: 'supplier', code: 'misc_material.view', name: '零星材料统计', description: '零星材料统计模块', sort_order: 120 },
    
    // 资金管理
    { module: 'finance', code: 'client_report.view', name: '产值结算', description: '产值结算模块', sort_order: 130 },
    { module: 'finance', code: 'client_report.input', name: '产值录入', description: '录入产值数据', sort_order: 131 },
    { module: 'finance', code: 'client_payment.view', name: '甲方回款', description: '甲方回款模块', sort_order: 140 },
    { module: 'finance', code: 'client_payment.input', name: '回款录入', description: '录入回款数据', sort_order: 141 },
    
    // 数据与决策
    { module: 'data', code: 'cost_center.view', name: '成本利润中心', description: '成本利润中心模块', sort_order: 150 },
    
    // 系统配置
    { module: 'system', code: 'notification.view', name: '消息通知中心', description: '消息通知中心模块', sort_order: 160 },
    { module: 'system', code: 'admin.view', name: '后台管理', description: '后台管理模块', sort_order: 170 },
    { module: 'system', code: 'permission.view', name: '权限中心', description: '权限中心模块', sort_order: 180 },
  ];

  // 插入权限定义
  for (const perm of permissions) {
    const { error } = await supabase
      .from('permission_definitions')
      .upsert(perm, { onConflict: 'code' });
    
    if (error) {
      console.error(`Error inserting ${perm.code}:`, error);
    } else {
      console.log(`Inserted/Updated: ${perm.code}`);
    }
  }

  // 创建超级管理员角色
  const { data: existingRole } = await supabase
    .from('roles')
    .select('id')
    .eq('name', '超级管理员')
    .single();

  if (!existingRole) {
    const allPermissionCodes = permissions.map(p => p.code);
    
    const { error } = await supabase
      .from('roles')
      .insert({
        name: '超级管理员',
        code: 'super_admin',
        description: '拥有系统所有模块的最高权限，无任何数据/操作限制',
        level: 1,
        is_super_admin: true,
        permissions: allPermissionCodes
      });
    
    if (error) {
      console.error('Error creating super_admin role:', error);
    } else {
      console.log('Created super_admin role');
    }
  } else {
    console.log('Super_admin role already exists');
  }

  console.log('Permission seed completed!');
}

seedPermissions().catch(console.error);
