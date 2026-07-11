/**
 * 统一路由权限配置
 * middleware.ts 和 route-guard.tsx 共用
 * 基于 permission_code 而非 role 名称进行权限控制
 * 权限编码统一格式：{resource}:{action}（如 system:users, report:monthly_view）
 */

// ─── 超级管理员判定（集中管理，避免散落硬编码） ───

/** 超级管理员角色标识（可通过环境变量覆盖） */
const SUPER_ADMIN_ROLE = process.env.SUPER_ADMIN_ROLE || 'super_admin';
/** 超级管理员角色ID（可通过环境变量覆盖） */
const SUPER_ADMIN_ROLE_ID = Number(process.env.SUPER_ADMIN_ROLE_ID || 1);

/**
 * 统一超级管理员判定函数
 * 使用方式：isSuperAdminUser(payload.role, payload.roleId)
 */
export function isSuperAdminUser(role?: string, roleId?: number): boolean {
  return role === SUPER_ADMIN_ROLE || roleId === SUPER_ADMIN_ROLE_ID;
}

// ─── 未映射路由默认行为（默认拒绝） ───

/**
 * 未在 ROUTE_PERMISSIONS 中声明的路由的默认行为
 * 生产环境一律拒绝（false），开发环境可配置为放行以便调试
 * 通过环境变量 UNMAPPED_ROUTE_ACCESS=allow 可临时放行（仅开发用）
 */
const DEFAULT_ACCESS_FOR_UNMAPPED =
  process.env.COZE_PROJECT_ENV === 'PROD'
    ? false
    : process.env.UNMAPPED_ROUTE_ACCESS === 'allow';

// ─── 路由权限映射 ───

export interface RoutePermissionConfig {
  /** 路由所需的权限码（与 permissions 表中的 code 对应） */
  permission?: string;
  /** 是否仅超级管理员可访问 */
  superAdminOnly?: boolean;
  /** 兼容旧逻辑：角色名列表（仅作为 fallback，优先使用 permission） */
  roles?: string[];
}

/**
 * 业务路由权限映射
 * permission 字段对应 permissions 表中的 code
 * 未在此映射中的路由：生产环境默认拒绝，开发环境可配置放行
 *
 * 权限编码统一格式：{resource}:{action}
 */
export const ROUTE_PERMISSIONS: Record<string, RoutePermissionConfig> = {
  // === 根路由 ===
  '/': { permission: 'projects:view' },

  // === 新导航容器页 ===
  '/workspace': { permission: 'projects:view' },
  '/project-center': { permission: 'projects:view' },
  '/hr-salary': { permission: 'workers:view' },
  '/supplier-expense': { permission: 'suppliers:view' },
  '/business-analysis': { permission: 'cost_center:view' },
  '/construction-logs': {},
  '/cost-estimation': {},
  '/knowledge': {},
  '/system-management': { permission: 'system:manage' },

  // === 项目经营模块 ===
  '/projects': { permission: 'projects:view' },
  '/work-items': { permission: 'work_items:view' },
  '/limit-prices': { permission: 'work_items:view' },
  '/visas': { permission: 'visas:view' },
  '/client-reports': { permission: 'client_reports:view' },
  '/client-payments': { permission: 'client_payments:view' },

  // === 人力工资模块 ===
  '/workers': { permission: 'workers:view' },
  '/certificates': { permission: 'certificates:view' },

  // === 供应商与费用模块 ===
  '/suppliers': { permission: 'suppliers:view' },
  '/supplier-contracts': { permission: 'settlements:view' },
  '/settlement': { permission: 'settlements:view' },
  '/settlements': { permission: 'settlements:view' },
  '/payments': { permission: 'supplier_payments:view' },
  '/comprehensive-expenses': { permission: 'comprehensive_expenses:view' },
  '/miscellaneous-materials': { permission: 'miscellaneous_materials:view' },

  // === 经营分析模块 ===
  '/cost-center': { permission: 'cost_center:view' },
  '/data-board': { permission: 'data_board:supplier_cost_view' },
  '/data-board/supplier-cost': { permission: 'data_board:supplier_cost_view' },
  '/data-board/worker-cost': { permission: 'data_board:worker_cost_view' },
  '/data-board/fund-management': { permission: 'data_board:fund_management_view' },

  // === 报表模块 ===
  '/reports': { permission: 'reports:monthly_view' },
  '/reports/monthly': { permission: 'reports:monthly_view' },

  // === 审计日志 ===
  '/system/audit-logs': { permission: 'audit:view' },
  '/system/approval-config': { permission: 'system:manage' },

  // === 工资模块子路由 ===
  '/workers/roster': { permission: 'workers:view' },
  '/workers/salaries': { permission: 'salaries:view' },
  '/workers/payments': { permission: 'salaries:pay' },
  '/workers/query': { permission: 'salaries:query' },
  '/workers/import-history': { permission: 'workers:import' },

  // === 供应商子路由 ===
  '/supplier-contracts/account': { permission: 'settlements:view' },
  '/supplier-contracts/settlement': { permission: 'settlements:view' },
  '/supplier-settlements': { permission: 'settlements:view' },
  '/supplier-contracts/account-dashboard': { permission: 'settlements:view' },

  // === AI助手模块 ===
  '/ai-assistant': { permission: 'system:ai_manage' },

  // === 系统管理模块 ===
  '/notifications': { permission: 'notifications:view' },
  '/system': { permission: 'system:manage' },
  '/system/permission': { permission: 'system:permission_manage', superAdminOnly: true },
  '/system/ai-config': { permission: 'system:ai_manage' },
  '/system/dingtalk-binding': { permission: 'system:dingtalk_manage' },
  '/admin': { permission: 'system:manage', superAdminOnly: true },
  '/settings': { permission: 'system:manage' },
  '/settings/backup': { permission: 'system:manage' },

  // === 认证中心 ===
  '/auth/center': { permission: 'system:permission_manage', superAdminOnly: true },

  // === 权限日志 ===
  '/permissions/logs': { permission: 'system:permission_manage', superAdminOnly: true },
};

/**
 * 公开页面（无需登录）
 */
export const PUBLIC_PAGES = [
  '/login',
  '/dingtalk',
  '/api/auth/login',
  '/api/auth/init',
  '/api/auth/me',
  '/api/auth/dingtalk',
];

// ─── API 路由权限映射（写操作） ───

/**
 * API 写操作（POST/PUT/DELETE）权限映射
 * key: API 路径前缀, value: 所需权限码
 * GET 请求仅需登录即可（读权限由页面级路由控制）
 * 超级管理员自动通过
 */
export const API_WRITE_PERMISSIONS: Record<string, string> = {
  // 项目经营
  '/api/projects': 'projects:edit',
  '/api/work-items': 'work_items:edit',
  '/api/work-item-progress': 'work_items:edit',
  '/api/work-item-subitems': 'work_items:edit',
  '/api/limit-prices': 'work_items:edit',
  '/api/visas': 'visas:edit',
  '/api/client-reports': 'client_reports:edit',
  '/api/client-payments': 'client_payments:edit',

  // 人力工资
  '/api/workers/batch': 'workers:import',
  '/api/workers/check-duplicates': 'workers:import',
  '/api/workers': 'workers:edit',
  '/api/worker-assignments': 'workers:edit',
  '/api/worker-salaries/batch': 'salaries:import',
  '/api/worker-salaries/batch-update': 'salaries:edit',
  '/api/worker-salaries/batch-delete': 'salaries:edit',
  '/api/worker-salaries': 'salaries:edit',
  '/api/salary-payments': 'salaries:pay',
  '/api/worker-payments': 'salaries:pay',
  '/api/worker-payments/batch': 'salaries:pay',

  // 证件管理
  '/api/certificates': 'certificates:edit',
  '/api/certificates/upload': 'certificates:edit',
  '/api/certificates/attachment-url': 'certificates:edit',
  '/api/certificates/attachment': 'certificates:edit',

  // 供应商与费用
  '/api/suppliers': 'suppliers:edit',
  '/api/supplier-contracts': 'settlements:edit',
  '/api/supplier-settlements': 'settlements:edit',
  '/api/supplier-payments': 'supplier_payments:edit',
  '/api/settlements': 'settlements:edit',
  '/api/payments': 'supplier_payments:edit',
  '/api/comprehensive-expenses': 'comprehensive_expenses:edit',
  '/api/miscellaneous-materials': 'miscellaneous_materials:edit',

  // 审核操作
  '/api/review': 'system:manage',

  // 通知
  '/api/notifications': 'notifications:settings',

  // AI 管理
  '/api/ai/config': 'system:ai_manage',
  '/api/ai/knowledge': 'system:ai_manage',

  // 报表导出
  '/api/reports/monthly/export-pdf': 'reports:monthly_export',
  '/api/reports/monthly/export-excel': 'reports:monthly_export',
  '/api/reports/monthly/archives': 'reports:monthly_export',

  // 系统管理
  '/api/auth/center/users': 'users:edit',
  '/api/auth/center/roles': 'roles:edit',
  '/api/auth/center/permissions': 'system:permission_manage',
  '/api/auth/center/role-permissions': 'system:permission_manage',
  '/api/init/permissions': 'system:permission_manage',
  '/api/system/permission': 'system:permission_manage',

  // 钉钉管理
  '/api/dingtalk/contacts': 'system:dingtalk_manage',
  '/api/dingtalk/bindings': 'system:dingtalk_manage',
};

/**
 * 按路径长度降序排列的 API 写操作路由键
 */
const SORTED_API_WRITE_KEYS = Object.keys(API_WRITE_PERMISSIONS).sort((a, b) => b.length - a.length);

/**
 * 检查 API 写操作权限
 * @param pathname API 路径
 * @param method HTTP 方法
 * @param userPermissions 用户权限码列表
 * @param isSuperAdmin 是否为超级管理员
 * @returns true=允许, false=拒绝
 */
export function checkApiWritePermission(
  pathname: string,
  method: string,
  userPermissions: string[],
  isSuperAdmin: boolean,
  userRole?: string
): boolean {
  // GET 请求仅需登录（读权限由页面级路由控制）
  if (method === 'GET') return true;
  // 超级管理员自动通过
  if (isSuperAdmin) return true;

  if (pathname === '/api/ai/knowledge/monthly/workflow') {
    return ['admin', 'project_manager', 'boss'].includes(userRole || '');
  }

  // 查找匹配的 API 路由（按长度降序精确匹配）
  for (const route of SORTED_API_WRITE_KEYS) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      const requiredPermission = API_WRITE_PERMISSIONS[route];
      return userPermissions.includes(requiredPermission);
    }
  }

  // 未映射的 API 写操作：生产环境默认拒绝
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[API Permission] 未映射的写操作路由 "${pathname}" (${method})，默认拒绝`);
  }
  return false;
}

// ─── 路径匹配（按长度降序，最精确匹配优先） ───

/**
 * 按路径长度降序排列的路由键，确保最精确的路由先匹配。
 * 例如 `/system/permission` 优先于 `/system` 被匹配。
 */
const SORTED_ROUTE_KEYS = Object.keys(ROUTE_PERMISSIONS).sort((a, b) => b.length - a.length);

/**
 * 查找路径匹配的路由配置
 * 使用按长度降序的键列表，确保子路径（如 /system/permission）
 * 优先于父路径（如 /system）被匹配。
 *
 * @param pathname 请求路径
 * @returns 匹配的路由键，或 null
 */
export function findMatchingRoute(pathname: string): string | null {
  for (const route of SORTED_ROUTE_KEYS) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      return route;
    }
  }
  return null;
}

/**
 * 判断用户是否有权访问某路由
 * @param pathname 请求路径
 * @param userPermissions 用户拥有的权限码列表（从 JWT token 中获取）
 * @param isSuperAdmin 是否为超级管理员（由 isSuperAdminUser 判定）
 */
export function hasRoutePermission(
  pathname: string,
  userPermissions: string[],
  isSuperAdmin: boolean
): boolean {
  // 超级管理员可访问所有路由
  if (isSuperAdmin) return true;

  // 查找匹配的路由配置（使用按长度降序的精确匹配）
  const matchedRoute = findMatchingRoute(pathname);

  if (!matchedRoute) {
    // 未声明权限的路由：按 DEFAULT_ACCESS_FOR_UNMAPPED 决定
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[RoutePermission] 未映射路由 "${pathname}"，默认${DEFAULT_ACCESS_FOR_UNMAPPED ? '放行' : '拒绝'}`);
    }
    return DEFAULT_ACCESS_FOR_UNMAPPED;
  }

  const config = ROUTE_PERMISSIONS[matchedRoute];
  if (config.superAdminOnly && !isSuperAdmin) return false;

  // 如果有 permission 字段，检查用户是否拥有该权限码
  if (config.permission) {
    return userPermissions.includes(config.permission);
  }

  // 没有 permission 字段的路由默认放行
  return true;
}
