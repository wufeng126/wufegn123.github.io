// API 统一响应格式工具函数

import { NextResponse } from 'next/server';

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string | null;
  code?: string;
}

/** 成功响应 */
export function apiSuccess(data: any, code = 'OK') {
  return NextResponse.json({ success: true, data, error: null, code });
}

/** 客户端错误响应 (4xx) */
export function apiError(message: string, status: number, code: string) {
  return NextResponse.json(
    { success: false, data: null, error: message, code },
    { status }
  );
}

/** 未登录 401 */
export function apiUnauthorized(message = '未登录，请先登录') {
  return apiError(message, 401, 'UNAUTHORIZED');
}

/** 无权限 403 */
export function apiForbidden(message = '无权限访问') {
  return apiError(message, 403, 'FORBIDDEN');
}

/** 参数错误 400 */
export function apiBadRequest(message = '请求参数错误') {
  return apiError(message, 400, 'BAD_REQUEST');
}

/** 资源不存在 404 */
export function apiNotFound(message = '资源不存在') {
  return apiError(message, 404, 'NOT_FOUND');
}

/** 服务端错误 500 */
export function apiServerError(message = '服务器内部错误') {
  return apiError(message, 500, 'INTERNAL_ERROR');
}

/** 验证 session token，返回 userId 或 null */
export async function verifySession(request: Request): Promise<string | null> {
  const sessionToken = request.headers.get('x-session');
  if (!sessionToken) return null;

  try {
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(sessionToken);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
