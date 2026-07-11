'use client';

import { useEffect, useState, ReactNode, useRef, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { hasRoutePermission, PUBLIC_PAGES, isSuperAdminUser } from '@/lib/route-permissions';
import { getStoredToken, isDingTalkClient, getRedirectCount, incrementRedirectCount, resetRedirectCount } from '@/lib/auth-client';

interface UserInfo {
  id: number;
  username: string;
  role: string;
  roleId: number;
  permissions?: string[];
}

interface RouteGuardProps {
  children: ReactNode;
}

// 会话缓存：一次登录周期内只验证一次
let cachedUser: UserInfo | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 同步检查缓存是否有效
function isCacheValid(): boolean {
  return cachedUser !== null && Date.now() < cacheExpiry;
}

// 同步获取缓存的用户权限结果
function checkCachedPermission(pathname: string): { allowed: boolean; user: UserInfo | null } {
  if (!isCacheValid()) return { allowed: false, user: null };
  const user = cachedUser!;
  const isSuperAdmin = isSuperAdminUser(user.role, user.roleId);
  return { allowed: hasRoutePermission(pathname, user.permissions || [], isSuperAdmin), user };
}

export function RouteGuard({ children }: RouteGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isCheckingRef = useRef(false);

  // 同步初始化：如果缓存有效，直接放行，无需等待任何异步操作
  const isPublicPage = PUBLIC_PAGES.includes(pathname) || pathname === '/login';
  const initialCheck = useMemo(() => {
    if (isPublicPage) return { checking: false, permitted: true, error: '' };
    const cached = checkCachedPermission(pathname);
    if (cached.allowed) return { checking: false, permitted: true, error: '' };
    if (cached.user && !cached.allowed) return { checking: false, permitted: false, error: '您没有权限访问此页面' };
    // 无缓存，需要异步验证
    return { checking: true, permitted: false, error: '' };
  }, [pathname, isPublicPage]);

  const [isChecking, setIsChecking] = useState(initialCheck.checking);
  const [hasPermission, setHasPermission] = useState(initialCheck.permitted);
  const [errorMessage, setErrorMessage] = useState(initialCheck.error);

  useEffect(() => {
    // 如果同步初始化已经确定结果，跳过异步检查
    if (!initialCheck.checking) return;

    checkAccess();
  }, [pathname]);

  async function checkAccess() {
    // 防止并发检查
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    // 再次检查缓存（可能在同步初始化和effect之间缓存已更新）
    if (isCacheValid()) {
      const cached = checkCachedPermission(pathname);
      if (cached.allowed) {
        setHasPermission(true);
        setIsChecking(false);
        isCheckingRef.current = false;
        return;
      } else if (cached.user) {
        setHasPermission(false);
        setErrorMessage('您没有权限访问此页面');
        setIsChecking(false);
        isCheckingRef.current = false;
        return;
      }
    }

    // 缓存过期或首次访问，需要重新验证
    try {
      // 始终从 localStorage 读取 token 附加到请求头（兜底 Cookie 不存储的情况）
      let authUrl = '/api/auth/me';
      const storedToken = getStoredToken();
      const fetchOptions: RequestInit = { credentials: 'include' };
      if (storedToken) {
        // 优先通过 URL 参数传递（middleware 可读取）
        authUrl += `?token=${encodeURIComponent(storedToken)}`;
        // 同时通过 Authorization header 传递（API 层可读取）
        fetchOptions.headers = { 'Authorization': `Bearer ${storedToken}` };
      }

      const res = await fetch(authUrl, fetchOptions);
      if (!res.ok) {
        cachedUser = null;
        cacheExpiry = 0;

        // 重定向次数限制：超过3次自动停止，弹出友好提示
        const redirectCount = incrementRedirectCount();
        if (redirectCount >= 3) {
          setHasPermission(false);
          setErrorMessage('登录状态异常，请清除浏览器缓存后重新打开');
          setIsChecking(false);
          return;
        }

        // 防循环：当前已在登录页时不再跳转
        if (pathname === '/login' || pathname === '/dingtalk') {
          setIsChecking(false);
          return;
        }

        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      const data = await res.json();
      if (!data.success || !data.data) {
        cachedUser = null;
        cacheExpiry = 0;
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      const user: UserInfo = data.data;
      const isSuperAdmin = isSuperAdminUser(user.role, user.roleId);

      // 认证成功，重置跳转计数
      resetRedirectCount();

      // 更新缓存
      cachedUser = user;
      cacheExpiry = Date.now() + CACHE_TTL;

      // 检查路由权限（基于权限码）
      const userPermissions = user.permissions || [];
      if (!hasRoutePermission(pathname, userPermissions, isSuperAdmin)) {
        setHasPermission(false);
        setErrorMessage('您没有权限访问此页面');
        setIsChecking(false);
        return;
      }

      setHasPermission(true);
      setIsChecking(false);
    } catch {
      setHasPermission(false);
      setErrorMessage('网络异常，请检查网络连接后重试');
      setIsChecking(false);
    } finally {
      isCheckingRef.current = false;
    }
  }

  // 首次加载且无缓存时，显示最小化加载指示器
  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 无权限状态
  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">访问受限</h3>
          <p className="text-sm text-gray-500">{errorMessage || '您没有权限访问此页面，请联系管理员'}</p>
          <button
            onClick={() => router.replace('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// 登出时清除缓存
export function clearRouteGuardCache() {
  cachedUser = null;
  cacheExpiry = 0;
}
