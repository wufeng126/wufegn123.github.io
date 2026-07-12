import { NextResponse } from 'next/server';

export type ApiMeta = Record<string, unknown>;

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  error: null;
  code: string;
}

export interface ApiErrorResponse {
  success: false;
  data: null;
  error: string;
  code: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

interface ApiSuccessOptions {
  code?: string;
  status?: number;
  meta?: ApiMeta;
}

interface ApiResultOptions {
  code?: string;
  status?: number;
  error?: string | null;
  meta?: ApiMeta;
}

/** 成功响应。meta 会保留旧接口常用的顶层字段，例如 pagination、total、roles。 */
export function apiSuccess<T = unknown>(
  data: T,
  codeOrOptions: string | ApiSuccessOptions = 'OK'
) {
  const options = typeof codeOrOptions === 'string' ? { code: codeOrOptions } : codeOrOptions;
  const body: ApiSuccessResponse<T> & ApiMeta = {
    success: true,
    data,
    error: null,
    code: options.code || 'OK',
    ...(options.meta || {}),
  };

  return NextResponse.json(body, { status: options.status || 200 });
}

/** 自定义 success 状态的响应，适合批量同步、部分成功等场景。 */
export function apiResult<T = unknown>(
  success: boolean,
  data: T,
  options: ApiResultOptions = {}
) {
  return NextResponse.json({
    success,
    data,
    error: success ? null : options.error || '操作未完全成功',
    code: options.code || (success ? 'OK' : 'OPERATION_FAILED'),
    ...(options.meta || {}),
  }, { status: options.status || 200 });
}

/** 失败响应 */
export function apiError(
  message: string,
  status = 500,
  code = 'INTERNAL_ERROR',
  details?: unknown
) {
  const body: ApiErrorResponse = {
    success: false,
    data: null,
    error: message,
    code,
    ...(details === undefined ? {} : { details }),
  };

  return NextResponse.json(body, { status });
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

export function getErrorMessage(error: unknown, fallback = '服务器内部错误'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

export async function withApiErrorHandling<T>(
  handler: () => Promise<NextResponse<ApiResponse<T>> | NextResponse>,
  fallback = '服务器内部错误'
) {
  try {
    return await handler();
  } catch (error) {
    return apiServerError(getErrorMessage(error, fallback));
  }
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
