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

/** L1 修复：数据库/SQL/鉴权内部错误模式（回显会泄露表结构、连接信息、密钥或堆栈），改为通用文案 */
const SENSITIVE_ERROR_PATTERNS: RegExp[] = [
  // 数据库 / SQL
  /relation\s+"?[a-z_]+"?\s+does not exist/i,
  /column\s+"?[a-z_.]+"?\s+does not exist/i,
  /duplicate key value violates/i,
  /syntax error at or near/i,
  /invalid input syntax/i,
  /could not (open|read|connect|resolve|translate|send|receive)/i,
  /sqlstate/i,
  /pq:\s/i,
  /postgrest/i,
  /connection refused/i,
  /connection timed out/i,
  /database .* does not exist/i,
  /schema .* does not exist/i,
  /constraint .* failed/i,
  /foreign key .* violates/i,
  /violates (not-null|foreign key|unique|check) constraint/i,
  /permission denied for (table|relation|sequence|schema)/i,
  /deadlock detected/i,
  /too many connections/i,
  // 认证 / 密钥
  /invalid (jwt|token|signature|algorithm)/i,
  /jwt (malformed|expired|signature)/i,
  /malformed token/i,
  /secretOrPublicKey/i,
  /private (key|secret)/i,
  /api[_-]?key/i,
  /password (authentication|for user)/i,
  // 存储 / 网络
  /AccessKeyId/i,
  /SignatureDoesNotMatch/i,
  /InvalidAccessKeyId/i,
  /NoSuchBucket/i,
  /RequestTimeTooSkewed/i,
  /EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i,
  // 语言运行时（避免泄露堆栈/路径）
  /^\s*at\s+[\w.<>]+\s*\(/m,
  /TypeError:.*\n/m,
  /ReferenceError:.*\n/m,
  /SyntaxError:.*\n/m,
  /Cannot read propert(?:y|ies) of (?:undefined|null)/i,
  /Cannot set propert(?:y|ies) of (?:undefined|null)/i,
  /(?:is|are) not a function/i,
  /\.(?:js|ts|tsx|mjs|cjs):\d+/i,
];

/** 判断一条错误消息是否包含内部细节，调用方应将其替换为通用文案。 */
export function isSensitiveErrorMessage(message: string): boolean {
  return SENSITIVE_ERROR_PATTERNS.some((re) => re.test(message));
}

export function getErrorMessage(error: unknown, fallback = '服务器内部错误'): string {
  let message: string;
  if (error instanceof Error && error.message) message = error.message;
  else if (typeof error === 'string' && error) message = error;
  else return fallback;

  // 内部错误不直接回显（业务错误如"合同不存在"仍正常返回）
  if (isSensitiveErrorMessage(message)) {
    if (process.env.NODE_ENV !== 'production') {
      // 开发环境仍然通过 console 暴露细节，便于排查
      console.warn('[api-utils] sensitive error masked:', message);
    }
    return fallback;
  }
  return message;
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
