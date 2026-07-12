import { NextRequest, NextResponse } from 'next/server';
import { getRequestAuthUser, type RequestAuthUser } from '@/lib/auth';
import { apiForbidden, apiUnauthorized } from '@/lib/api-utils';
import { checkApiWritePermission } from '@/lib/route-permissions';

export type ApiAuthResult =
  | { ok: true; user: RequestAuthUser }
  | { ok: false; response: NextResponse };

export function hasPermission(user: RequestAuthUser, permission: string): boolean {
  if (user.is_super_admin) return true;
  return Boolean(user.permissions?.includes(permission));
}

export function hasAnyPermission(user: RequestAuthUser, permissions: string[]): boolean {
  if (user.is_super_admin) return true;
  return permissions.some(permission => user.permissions?.includes(permission));
}

export async function requireAuth(request: NextRequest): Promise<ApiAuthResult> {
  const user = await getRequestAuthUser(request);
  if (!user) {
    return { ok: false, response: apiUnauthorized() };
  }

  return { ok: true, user };
}

export async function requirePermission(
  request: NextRequest,
  permission: string
): Promise<ApiAuthResult> {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;

  if (!hasPermission(auth.user, permission)) {
    return { ok: false, response: apiForbidden('当前账号没有执行此操作的权限') };
  }

  return auth;
}

export async function requireAnyPermission(
  request: NextRequest,
  permissions: string[]
): Promise<ApiAuthResult> {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;

  if (!hasAnyPermission(auth.user, permissions)) {
    return { ok: false, response: apiForbidden('当前账号没有执行此操作的权限') };
  }

  return auth;
}

export async function requireApiWritePermission(request: NextRequest): Promise<ApiAuthResult> {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;

  const isAllowed = checkApiWritePermission(
    request.nextUrl.pathname,
    request.method,
    auth.user.permissions || [],
    auth.user.is_super_admin,
    auth.user.role
  );

  if (!isAllowed) {
    return { ok: false, response: apiForbidden('当前账号没有执行此操作的权限') };
  }

  return auth;
}
