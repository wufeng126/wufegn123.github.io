"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface PermissionContextType {
  permissions: string[];
  isSuperAdmin: boolean;
  isLoading: boolean;
  hasPermission: (code: string) => boolean;
  checkPermission: (code: string) => Promise<boolean>;
  refreshPermissions: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

// 路由与权限代码的映射
export const routePermissionMap: Record<string, string> = {
  "/": "project.view",
  "/projects": "project.view",
  "/workers/roster": "worker.roster.view",
  "/workers/salary": "worker.salary.view",
  "/workers/query": "worker.query.view",
  "/workers/payment": "worker.payment.view",
  "/suppliers": "supplier.view",
  "/suppliers/settlements": "settlement.view",
  "/suppliers/payment-records": "payment.record.view",
  "/suppliers/expenses": "expense.view",
  "/suppliers/misc-materials": "misc_material.view",
  "/finance/client-reports": "client_report.view",
  "/finance/client-payments": "client_payment.view",
  "/quantity-reporting": "work_items.view",
  "/work-items": "work_items.view",
  "/visas": "visas.view",
  "/cost-center": "cost_center.view",
  "/notifications": "notification.view",
  "/auth/center": "permission.view",
  "/certificates": "certificate.view",
};

export function PermissionProvider({ children, userId }: { children: ReactNode; userId?: number }) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshPermissions = useCallback(async () => {
    if (!userId) {
      setPermissions([]);
      setIsSuperAdmin(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/auth/center/check?user_id=${userId}`);
      const data = await res.json();

      setPermissions(data.permissions || []);
      setIsSuperAdmin(data.isSuperAdmin || false);
    } catch (error) {
      console.error("Failed to load permissions:", error);
      // 网络错误时不清空已有权限，避免因临时网络问题导致用户失去所有权限
      // 仅在明确未授权(401)时才清空
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  const hasPermission = useCallback(
    (code: string): boolean => {
      if (isSuperAdmin) return true;
      return permissions.includes(code);
    },
    [permissions, isSuperAdmin]
  );

  const checkPermission = useCallback(
    async (code: string): Promise<boolean> => {
      if (!userId) return false;
      
      try {
        const res = await fetch("/api/auth/center/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, permission_code: code }),
        });
        const data = await res.json();
        return data.hasPermission || false;
      } catch (error) {
        return false;
      }
    },
    [userId]
  );

  return (
    <PermissionContext.Provider
      value={{
        permissions,
        isSuperAdmin,
        isLoading,
        hasPermission,
        checkPermission,
        refreshPermissions,
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission() {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    // 如果没有 Provider，返回默认值
    return {
      permissions: [],
      isSuperAdmin: false,
      isLoading: false,
      hasPermission: () => true, // 默认允许访问
      checkPermission: async () => true,
      refreshPermissions: async () => {},
    };
  }
  return context;
}

// 获取路由对应的权限代码
export function getRoutePermission(pathname: string): string | undefined {
  // 精确匹配
  if (routePermissionMap[pathname]) {
    return routePermissionMap[pathname];
  }
  
  // 通配符匹配（处理动态路由如 /projects/123）
  for (const [route, permission] of Object.entries(routePermissionMap)) {
    if (route.endsWith("/")) continue;
    if (pathname.startsWith(route + "/")) {
      return permission;
    }
  }
  
  return undefined;
}
