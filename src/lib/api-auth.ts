import { NextRequest, NextResponse } from 'next/server';
import { getRequestAuthUser, type RequestAuthUser } from '@/lib/auth';
import { apiForbidden, apiUnauthorized } from '@/lib/api-utils';
import { checkApiWritePermission } from '@/lib/route-permissions';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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

/**
 * 用户实时安全状态缓存（60 秒）：
 * JWT 内的权限/角色是登录时快照，禁用或撤销权限后最长 7 天仍会放行。
 * 这里按 60 秒缓存查库，让禁用与权限变更在 1 分钟内生效，同时避免每请求查库。
 */
type LiveUserState = {
  disabled: boolean;
  role: string;
  permissions: string[];
  loadedAt: number;
};

const liveUserStateCache = new Map<number, LiveUserState>();
const LIVE_USER_STATE_TTL_MS = 60_000;

export function invalidateLiveUserState(userId?: number) {
  if (userId) liveUserStateCache.delete(userId);
  else liveUserStateCache.clear();
}

async function getLiveUserState(userId: number): Promise<LiveUserState | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const cached = liveUserStateCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < LIVE_USER_STATE_TTL_MS) return cached;

  try {
    const client = getSupabaseClient();
    const { data: userRow } = await client
      .from('users')
      .select('id, role, is_disabled')
      .eq('id', userId)
      .maybeSingle();
    if (!userRow) return null;

    const { data: roleLinks } = await client
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId);
    const roleIds = (roleLinks || [])
      .map((link: { role_id?: unknown }) => Number(link.role_id))
      .filter(Boolean);

    let permissions: string[] = [];
    if (roleIds.length > 0) {
      const { data: permissionLinks } = await client
        .from('role_permissions')
        .select('permissions(code)')
        .in('role_id', roleIds);
      permissions = Array.from(new Set(
        (permissionLinks || []).flatMap((link: { permissions?: Array<{ code?: string | null }> | { code?: string | null } | null }) => {
          const ref = link.permissions;
          const list = Array.isArray(ref) ? ref : ref ? [ref] : [];
          return list.map((item) => item.code).filter((code): code is string => Boolean(code));
        }),
      ));
    }

    const state: LiveUserState = {
      disabled: userRow.is_disabled === true,
      role: String(userRow.role || ''),
      permissions,
      loadedAt: Date.now(),
    };
    liveUserStateCache.set(userId, state);
    return state;
  } catch {
    // 查库失败时不阻塞业务：回退使用 token 快照
    return null;
  }
}

export async function requireAuth(request: NextRequest): Promise<ApiAuthResult> {
  const user = await getRequestAuthUser(request);
  if (!user) {
    return { ok: false, response: apiUnauthorized() };
  }

  // 禁用/权限变更即时生效：用实时状态覆盖 token 快照（60 秒缓存，查库失败回退快照）
  const live = await getLiveUserState(Number(user.id) || 0);
  if (live) {
    if (live.disabled) {
      return { ok: false, response: apiForbidden('账号已被禁用，请联系管理员') };
    }
    return {
      ok: true,
      user: {
        ...user,
        role: live.role || user.role,
        permissions: live.permissions,
      },
    };
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

export async function requireApiReadPermission(request: NextRequest): Promise<ApiAuthResult> {
  return requireAuth(request);
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

export async function requireSuperAdmin(request: NextRequest): Promise<ApiAuthResult> {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;

  if (!auth.user.is_super_admin) {
    return { ok: false, response: apiForbidden('当前账号没有执行此操作的权限') };
  }

  return auth;
}
