/**
 * 权限目录（单一事实源）
 *
 * 所有权限码在此定义；以下位置均从此派生，避免多份清单漂移：
 * - 系统权限页（勾选权限）
 * - 权限初始化（写入 permissions 表）
 * - 认证中心 / API 菜单结构
 *
 * 新增权限码只改这里：code 使用冒号格式 {resource}:{action}，与数据库 permissions.code 一致。
 */

export type PermissionModule = {
  key?: string;
  code: string;
  name: string;
  icon: string;
  children: Array<{ name: string; code: string }>;
};

export type PermissionDefinition = {
  code: string;
  name: string;
  module: string;
  resource: string;
  action: string;
  sortOrder: number;
};

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    code: 'workspace',
    name: '工作台',
    icon: '🏠',
    children: [
      { name: '月度经营月报-查看', code: 'reports:monthly_view' },
      { name: '月度经营月报-导出', code: 'reports:monthly_export' },
      { name: '月度经营月报-预算员填写', code: 'monthly_report:fill' },
      { name: '月度经营月报-项目经理补充', code: 'monthly_report:supplement' },
      { name: '月度经营月报-老板审批', code: 'monthly_report:approve' },
      { name: 'AI劳务助手-对话', code: 'ai:chat' },
      { name: 'AI劳务助手-上传文件', code: 'ai:upload' },
      { name: 'AI劳务助手-知识库', code: 'ai:knowledge' },
    ],
  },
  {
    code: 'projects',
    name: '项目经营',
    icon: '🏗️',
    children: [
      { name: '项目管理-查看', code: 'projects:view' },
      { name: '项目管理-编辑', code: 'projects:edit' },
      { name: '项目管理-删除', code: 'projects:delete' },
      { name: '报量管理-查看', code: 'work_items:view' },
      { name: '报量管理-编辑', code: 'work_items:edit' },
      { name: '报量管理-删除', code: 'work_items:delete' },
      { name: '签证管理-查看', code: 'visas:view' },
      { name: '签证管理-编辑', code: 'visas:edit' },
      { name: '签证管理-删除', code: 'visas:delete' },
      { name: '签证管理-附件', code: 'visas:attachments' },
      { name: '结算证据链-查看', code: 'evidence_chain:view' },
      { name: '结算证据链-新增', code: 'evidence_chain:create' },
      { name: '结算证据链-编辑', code: 'evidence_chain:edit' },
      { name: '结算证据链-删除', code: 'evidence_chain:delete' },
      { name: '结算证据链-导出', code: 'evidence_chain:export' },
      { name: '甲方报量-查看', code: 'client_reports:view' },
      { name: '甲方报量-编辑', code: 'client_reports:edit' },
      { name: '甲方报量-删除', code: 'client_reports:delete' },
      { name: '甲方回款-查看', code: 'client_payments:view' },
      { name: '甲方回款-编辑', code: 'client_payments:edit' },
      { name: '甲方回款-删除', code: 'client_payments:delete' },
    ],
  },
  {
    code: 'hr_salary',
    name: '人力工资',
    icon: '👷',
    children: [
      { name: '花名册-查看', code: 'workers:view' },
      { name: '花名册-编辑', code: 'workers:edit' },
      { name: '花名册-删除', code: 'workers:delete' },
      { name: '花名册-导入', code: 'workers:import' },
      { name: '花名册-导出', code: 'workers:export' },
      { name: '证件管理-查看', code: 'certificates:view' },
      { name: '证件管理-编辑', code: 'certificates:edit' },
      { name: '证件管理-删除', code: 'certificates:delete' },
      { name: '证件管理-附件上传', code: 'certificates:upload' },
      { name: '月度工资-查看', code: 'salaries:view' },
      { name: '月度工资-编辑', code: 'salaries:edit' },
      { name: '月度工资-删除', code: 'salaries:delete' },
      { name: '月度工资-导入', code: 'salaries:import' },
      { name: '月度工资-导出', code: 'salaries:export' },
      { name: '工资查询', code: 'salaries:query' },
      { name: '工资发放', code: 'salaries:pay_edit' },
    ],
  },
  {
    code: 'supplier_expense',
    name: '供应商与费用',
    icon: '🤝',
    children: [
      { name: '供应商库-查看', code: 'suppliers:view' },
      { name: '供应商库-编辑', code: 'suppliers:edit' },
      { name: '供应商库-删除', code: 'suppliers:delete' },
      { name: '结算管理-查看', code: 'settlements:view' },
      { name: '结算管理-编辑', code: 'settlements:edit' },
      { name: '结算管理-删除', code: 'settlements:delete' },
      { name: '供应商付款-查看', code: 'supplier_payments:view' },
      { name: '供应商付款-新增', code: 'supplier_payments:create' },
      { name: '供应商付款-编辑', code: 'supplier_payments:edit' },
      { name: '供应商付款-删除', code: 'supplier_payments:delete' },
      { name: '零星材料-查看', code: 'miscellaneous_materials:view' },
      { name: '零星材料-编辑', code: 'miscellaneous_materials:edit' },
      { name: '综合费用-查看', code: 'comprehensive_expenses:view' },
      { name: '综合费用-编辑', code: 'comprehensive_expenses:edit' },
    ],
  },
  {
    code: 'team_settlement',
    name: '班组管理',
    icon: '📄',
    children: [
      { name: '班组档案-查看', code: 'team_groups:view' },
      { name: '班组档案-新增', code: 'team_groups:create' },
      { name: '班组档案-编辑', code: 'team_groups:edit' },
      { name: '班组档案-删除', code: 'team_groups:delete' },
      { name: '班组结算-查看', code: 'team_settlements:view' },
      { name: '班组结算-新增', code: 'team_settlements:create' },
      { name: '班组结算-编辑', code: 'team_settlements:edit' },
      { name: '班组结算-删除', code: 'team_settlements:delete' },
      { name: '班组结算-提交审批', code: 'team_settlements:submit' },
      { name: '班组结算-审批（老板）', code: 'team_settlements:approve' },
    ],
  },
  {
    code: 'analysis',
    name: '经营分析',
    icon: '📊',
    children: [
      { name: '成本利润中心', code: 'cost_center:view' },
      { name: '供应商成本看板', code: 'data_board:supplier_cost_view' },
      { name: '工人成本看板', code: 'data_board:worker_cost_view' },
      { name: '资金管理看板', code: 'data_board:fund_management_view' },
    ],
  },
  {
    code: 'system',
    name: '系统管理',
    icon: '⚙️',
    children: [
      { name: '消息通知-查看', code: 'notifications:view' },
      { name: '通知设置', code: 'notifications:settings' },
      { name: '钉钉集成管理', code: 'system:dingtalk_manage' },
      { name: 'AI助手配置', code: 'system:ai_manage' },
      { name: '操作日志', code: 'audit:view' },
      { name: '操作日志-接口', code: 'system:audit_logs' },
      { name: '系统管理', code: 'system:manage' },
      { name: '权限管理', code: 'system:permission_manage' },
      { name: '用户管理', code: 'users:edit' },
      { name: '角色管理', code: 'roles:edit' },
    ],
  },
  {
    code: 'construction_logs',
    name: '施工管理',
    icon: '📋',
    children: [
      { name: '施工日志-查看', code: 'construction_logs:view' },
      { name: '施工日志-写日志', code: 'construction_logs:edit' },
      { name: '进度计划-查看', code: 'work_items:progress' },
      { name: '人员考勤-查看', code: 'construction_attendance:view' },
    ],
  },
  {
    code: 'cost_estimation',
    name: '成本测算',
    icon: '📊',
    children: [
      { name: '成本测算-查看', code: 'cost_estimation:view' },
      { name: '成本测算-投标', code: 'cost_estimation:bid' },
    ],
  },
  {
    code: 'knowledge',
    name: '知识库',
    icon: '📚',
    children: [
      { name: '知识库-查看', code: 'knowledge:view' },
      { name: '写知识', code: 'knowledge:write' },
      { name: '月度分析', code: 'knowledge:monthly_analysis' },
      { name: '审批流程', code: 'knowledge:approval' },
    ],
  },
];

/** 全部权限定义（按模块声明顺序展开） */
export const PERMISSION_CATALOG: PermissionDefinition[] = PERMISSION_MODULES.flatMap((module, moduleIndex) =>
  module.children.map((child, childIndex) => {
    const [resource, action = 'view'] = child.code.split(':');
    return {
      code: child.code,
      name: child.name,
      module: module.name,
      resource,
      action,
      sortOrder: (moduleIndex + 1) * 1000 + childIndex,
    };
  }),
);

/** 全部权限码（冒号格式） */
export const PERMISSION_CODES: string[] = PERMISSION_CATALOG.map((item) => item.code);

const PERMISSION_CODE_SET = new Set(PERMISSION_CODES);

export function isValidPermissionCode(code: string): boolean {
  return PERMISSION_CODE_SET.has(code);
}

export function getPermission(code: string): PermissionDefinition | undefined {
  return PERMISSION_CATALOG.find((item) => item.code === code);
}
