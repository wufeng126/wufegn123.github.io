'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { isSuperAdminUser } from '@/lib/route-permissions';
import { authFetch } from '@/lib/auth-client';

// 权限定义 - 每个菜单项对应的权限代码
export const PERMISSION_MAP: Record<string, string[]> = {
  // === 新导航容器页 ===
  '/workspace': ['dashboard:view'],
  '/project-center': ['projects:view'],
  '/hr-salary': ['workers:view'],
  '/supplier-expense': ['suppliers:view'],
  '/team-settlement': ['team_settlements:view'],
  '/business-analysis': ['business_overview:view', 'cost_center:view', 'data_board:worker_cost_view', 'data_board:supplier_cost_view', 'data_board:fund_management_view'],
  '/construction-attendance': ['construction_attendance:view'],
  '/system-management': ['system:manage'],

  // === 项目经营模块 ===
  '/projects': ['projects:view'],
  '/quantity-reporting': ['work_items:view'],
  '/work-items': ['work_items:view'],
  '/limit-prices': ['work_items:view'],
  '/visas': ['visas:view'],
  '/client-reports': ['client_reports:view'],
  '/client-payments': ['client_payments:view'],

  // === 人力工资模块 ===
  '/workers/roster': ['workers:view'],
  '/workers/salaries': ['salaries:view'],
  '/workers/query': ['salaries:query'],
  '/workers/payments': ['salaries:pay'],
  '/certificates': ['certificates:view'],

  // === 供应商与费用模块 ===
  '/suppliers': ['suppliers:view'],
  '/supplier-contracts': ['settlements:view'],
  '/settlement': ['settlements:view'],
  '/settlements': ['settlements:view'],
  '/payments': ['supplier_payments:view'],
  '/comprehensive-expenses': ['comprehensive_expenses:view'],
  '/miscellaneous-materials': ['miscellaneous_materials:view'],

  // === 经营分析模块 ===
  '/business-analysis/overview': ['business_overview:view'],
  '/cost-center': ['cost_center:view'],
  '/data-board': ['data_board:supplier_cost_view'],
  '/data-board/supplier-cost': ['data_board:supplier_cost_view'],
  '/data-board/worker-cost': ['data_board:worker_cost_view'],
  '/data-board/fund-management': ['data_board:fund_management_view'],

  // === 报表模块 ===
  '/reports': ['reports:monthly_view'],
  '/reports/monthly': ['reports:monthly_view'],

  // === AI助手模块 ===
  '/ai-assistant': ['ai:chat'],

  // === 系统管理模块 ===
  '/notifications': ['notifications:view'],
  '/system/permission': ['system:permission_manage'],
  '/system/ai-config': ['system:ai_manage'],
  '/system/dingtalk-binding': ['system:dingtalk_manage'],
  '/system/wps-config': ['system:manage'],
  '/system/audit-logs': ['audit:view'],
  '/admin': ['system:manage'],
  '/settings': ['system:manage'],
  '/settings/backup': ['system:manage'],
};

// ─── 路由权限映射（按路径长度降序排序，确保子路径优先匹配） ───

/**
 * 按路径长度降序排列的权限映射键，确保 /system/permission 优先于 /system 匹配。
 */
const SORTED_PERMISSION_KEYS = Object.keys(PERMISSION_MAP).sort((a, b) => b.length - a.length);

/**
 * 未映射路径的默认行为
 * true = 已登录即放行（与后端 hasRoutePermission 保持一致）
 */
const DEFAULT_ACCESS_FOR_UNMAPPED = true;

export interface UserPermission {
  id: number;
  username: string;
  name: string;
  role: string;
  roleId: number;
  roleIds: number[];
  permissions: string[];
  managedProjects: number[];
  isSuperAdmin: boolean;
}

interface PermissionContextType {
  user: UserPermission | null;
  permissions: string[];
  managedProjects: number[];
  isSuperAdmin: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (perms: string[]) => boolean;
  hasAllPermissions: (perms: string[]) => boolean;
  canAccessPath: (path: string) => boolean;
  canAccessProject: (projectId: number) => boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

// 安全的 JSON 解析
async function safeJson(res: Response) {
  try {
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeProjectIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((projectId) => Number(projectId))
      .filter((projectId) => Number.isInteger(projectId))
  ));
}

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPermission | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [managedProjects, setManagedProjects] = useState<number[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // 加载用户权限
  const loadUserPermissions = useCallback(async () => {
    try {
      // iframe/webview 环境兜底：authFetch 自动从 localStorage 读取 token 添加到 Authorization header
      const meRes = await authFetch('/api/auth/me');
      const meData = await safeJson(meRes);
      
      // 明确检查是否已认证
      const isAuth = meData?.authenticated === true && meData?.user;
      
      if (!isAuth) {
        // 未登录或认证失败，设置为空状态继续运行
        setUser(null);
        setPermissions([]);
        setManagedProjects([]);
        setIsSuperAdmin(false);
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(true);

      // 获取权限列表
      let userPermissions: string[] = [];
      let userManagedProjects: number[] = [];
      const userRole = meData.user.role || 'user';
      const userRoleId = meData.user.role_id || meData.user.roleId || 0;
      const isAdmin = isSuperAdminUser(userRole, userRoleId);

      // 尝试获取权限（失败时不清空已有权限，仅在明确未授权时才清空）
      try {
        const permRes = await authFetch('/api/system/permission/my-permissions');
        if (permRes.ok) {
          const permData = await safeJson(permRes);
          if (permData?.permissions) {
            userPermissions = permData.permissions;
          }
        } else if (permRes.status === 401) {
          // 401 表示未授权，清空权限
          userPermissions = [];
        }
        // 其他状态码（500等）：保留已获取的权限（空数组），但不主动覆盖已设置的权限
      } catch {
        // 网络错误：不清空权限，使用空数组但不覆盖已有状态
        // 如果之前已有权限，不会被清空（userPermissions 保持初始空数组）
      }

      // 尝试获取可访问项目（失败时使用空数组）
      try {
        const projRes = await authFetch('/api/system/permission/my-projects');
        if (projRes.ok) {
          const projData = await safeJson(projRes);
          userManagedProjects = normalizeProjectIds(
            projData?.assigned_project_ids
              || projData?.project_ids
              || (projData?.projects as Array<{ id: number }> | undefined)?.map((p) => p.id)
          );
        }
      } catch {
        // 项目获取失败，使用空数组
        userManagedProjects = [];
      }
      
      const userData: UserPermission = {
        id: meData.user.id,
        username: meData.user.username,
        name: meData.user.name || meData.user.username,
        role: userRole,
        roleId: userRoleId,
        roleIds: meData.user.role_ids || meData.user.roleIds || [],
        permissions: userPermissions,
        managedProjects: userManagedProjects,
        isSuperAdmin: isAdmin,
      };
      
      setUser(userData);
      
      // 超级管理员拥有所有权限
      setPermissions(isAdmin ? ['*'] : userPermissions);
      setManagedProjects(userManagedProjects);
      setIsSuperAdmin(isAdmin);
    } catch {
      // 网络错误
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始化加载
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUserPermissions();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUserPermissions]);

  // 检查是否有某个权限
  const hasPermission = useCallback((permission: string): boolean => {
    if (isSuperAdmin) return true;
    return permissions.includes(permission) || permissions.includes('*');
  }, [permissions, isSuperAdmin]);

  // 检查是否有任意一个权限
  const hasAnyPermission = useCallback((perms: string[]): boolean => {
    if (isSuperAdmin) return true;
    return perms.some(p => permissions.includes(p) || permissions.includes('*'));
  }, [permissions, isSuperAdmin]);

  // 检查是否拥有所有权限
  const hasAllPermissions = useCallback((perms: string[]): boolean => {
    if (isSuperAdmin) return true;
    return perms.every(p => permissions.includes(p) || permissions.includes('*'));
  }, [permissions, isSuperAdmin]);

  // 检查是否能访问某个路径
  const canAccessPath = useCallback((path: string): boolean => {
    if (isSuperAdmin) return true;
    if (permissions.includes('*')) return true;

    // 精确匹配
    if (PERMISSION_MAP[path]) {
      return hasAnyPermission(PERMISSION_MAP[path]);
    }

    // 前缀匹配（按路径长度降序，确保子路径优先匹配）
    for (const key of SORTED_PERMISSION_KEYS) {
      if (path.startsWith(key + '/')) {
        return hasAnyPermission(PERMISSION_MAP[key]);
      }
    }

    // 未映射路径：按默认策略决定（与后端 hasRoutePermission 保持一致）
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[PermissionContext] 未映射路径 "${path}"，默认${DEFAULT_ACCESS_FOR_UNMAPPED ? '放行' : '拒绝'}`);
    }
    return DEFAULT_ACCESS_FOR_UNMAPPED;
  }, [permissions, isSuperAdmin, hasAnyPermission]);

  // 检查是否能访问某个项目
  const canAccessProject = useCallback((projectId: number): boolean => {
    if (isSuperAdmin) return true;
    return managedProjects.includes(projectId);
  }, [managedProjects, isSuperAdmin]);

  return (
    <PermissionContext.Provider
      value={{
        user,
        permissions,
        managedProjects,
        isSuperAdmin,
        isLoading,
        isAuthenticated,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        canAccessPath,
        canAccessProject,
        refreshPermissions: loadUserPermissions,
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission() {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error('usePermission must be used within a PermissionProvider');
  }
  return context;
}
