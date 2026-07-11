"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { routePermissionMap, PermissionProvider } from "@/hooks/use-permission";

interface PermissionGateProps {
  children: React.ReactNode;
  userId?: number;
}

export function PermissionGate({ children, userId }: PermissionGateProps) {
  return (
    <PermissionProvider userId={userId}>
      <PermissionRouterGuard>{children}</PermissionRouterGuard>
    </PermissionProvider>
  );
}

function PermissionRouterGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [hasPermission, setHasPermission] = useState(true);

  useEffect(() => {
    // 跳过登录页
    if (pathname === "/login") {
      setIsChecking(false);
      return;
    }

    // 跳过公共页面（如首页）
    const publicPaths = ["/", "/api"];
    if (publicPaths.some((p) => pathname.startsWith(p))) {
      setIsChecking(false);
      return;
    }

    // 获取路由对应的权限代码
    const requiredPermission = getRequiredPermission(pathname);
    
    if (!requiredPermission) {
      setIsChecking(false);
      return;
    }

    // 检查权限
    checkRoutePermission(requiredPermission)
      .then((result) => {
        setHasPermission(result);
        setIsChecking(false);
      })
      .catch(() => {
        setHasPermission(false);
        setIsChecking(false);
      });
  }, [pathname]);

  // 权限检查失败时重定向
  useEffect(() => {
    if (!isChecking && !hasPermission) {
      router.push("/?error=no-permission");
    }
  }, [isChecking, hasPermission, router]);

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">正在检查权限...</p>
        </div>
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">无权访问</h2>
          <p className="text-gray-500 mb-4">
            您没有权限访问此页面，请联系管理员申请权限。
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// 获取路由需要的权限代码
function getRequiredPermission(pathname: string): string | undefined {
  // 精确匹配
  if (routePermissionMap[pathname]) {
    return routePermissionMap[pathname];
  }

  // 动态路由匹配
  // /projects/123 -> /projects
  const dynamicRoutes = [
    { pattern: /^\/projects\/[^/]+$/, base: "/projects" },
    { pattern: /^\/workers\/salaries\/\d+$/, base: "/workers/salaries" },
    { pattern: /^\/workers\/query\/\d+$/, base: "/workers/query" },
    { pattern: /^\/workers\/payments\/\d+$/, base: "/workers/payments" },
  ];

  for (const route of dynamicRoutes) {
    if (route.pattern.test(pathname)) {
      return routePermissionMap[route.base];
    }
  }

  return undefined;
}

// 检查用户权限
async function checkRoutePermission(permissionCode: string): Promise<boolean> {
  try {
    // 获取当前用户
    const userRes = await fetch("/api/auth/me");
    const userData = await userRes.json();
    
    if (!userData.authenticated || !userData.user?.id) {
      return false;
    }

    // 获取用户权限
    const permRes = await fetch(`/api/auth/center/check?user_id=${userData.user.id}`);
    const permData = await permRes.json();

    // 超级管理员拥有所有权限
    if (permData.isSuperAdmin) {
      return true;
    }

    // 检查是否有指定权限
    return permData.permissions?.includes(permissionCode) || false;
  } catch (error) {
    console.error("Permission check failed:", error);
    return false;
  }
}

// Hook: 检查当前用户是否有指定权限
export function useHasPermission(permissionCode: string): boolean {
  const [hasPermission, setHasPermission] = useState(true); // 默认允许

  useEffect(() => {
    checkRoutePermission(permissionCode).then(setHasPermission);
  }, [permissionCode]);

  return hasPermission;
}
