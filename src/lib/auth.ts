import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { isSuperAdminUser } from './route-permissions';

// JWT 密钥 - 生产环境应使用环境变量
const SECRET_KEY = process.env.JWT_SECRET || 'construction-labor-management-secret-key-2024';

// Token 有效期：7天
const TOKEN_EXPIRY = '7d';

// 用户角色类型
export type UserRole = 'super_admin' | 'admin';

// 用户信息接口
export interface UserPayload {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  role_id?: number;
  permissions?: string[]; // 权限码列表
}

export interface RequestAuthUser {
  id: number;
  username: string;
  name?: string;
  role: string;
  roleId: number;
  permissions?: string[];
  project_ids?: number[];
  is_super_admin: boolean;
}

type LegacyTokenPayload = UserPayload & {
  userId?: number;
  roleId?: number;
  project_ids?: number[];
  is_super_admin?: boolean;
};

// 获取密钥
function getSecretKey() {
  return new TextEncoder().encode(SECRET_KEY);
}

// 生成 JWT Token
export async function generateToken(payload: UserPayload): Promise<string> {
  const secretKey = getSecretKey();
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(secretKey);
  return token;
}

// 验证 JWT Token（Edge Runtime 安全）
export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as UserPayload;
  } catch {
    return null;
  }
}

export function normalizeAuthUser(payload: UserPayload | null): RequestAuthUser | null {
  if (!payload) return null;

  const legacyPayload = payload as LegacyTokenPayload;
  const id = legacyPayload.id ?? legacyPayload.userId;
  if (!id) return null;

  const role = legacyPayload.role || 'user';
  const roleId = legacyPayload.role_id ?? legacyPayload.roleId ?? 0;

  return {
    id,
    username: legacyPayload.username,
    name: legacyPayload.name,
    role,
    roleId,
    permissions: legacyPayload.permissions,
    project_ids: legacyPayload.project_ids,
    is_super_admin: legacyPayload.is_super_admin ?? isSuperAdminUser(role, roleId),
  };
}

// 设置认证 Cookie
// 钉钉 H5 微应用运行在 iframe 中，浏览器视为第三方上下文
// 必须 SameSite=None + Secure=true 才能让 cookie 在 iframe 中被存储和发送
export async function setAuthCookie(token: string, response?: NextResponse) {
  const cookieOptions = {
    httpOnly: true,
    secure: false,          // 兼容钉钉 webview 和 HTTP 代理场景
    sameSite: 'lax' as const, // 同站请求携带 cookie，兼容钉钉全屏 webview
    maxAge: 7 * 24 * 60 * 60, // 7天
    path: '/',
  };

  if (response) {
    response.cookies.set('auth_token', token, cookieOptions);
  } else {
    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, cookieOptions);
  }
}

// 清除认证 Cookie
export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_token');
}

// 获取当前用户（仅验证 token，不查数据库）
// 兼容钉钉 webview：优先 Cookie → Authorization header
export async function getCurrentUser(): Promise<UserPayload | null> {
  // 1. 优先从 Cookie 读取
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('auth_token')?.value;
  if (cookieToken) {
    return verifyToken(cookieToken);
  }

  // 2. 从 Authorization header 读取（钉钉 webview 兜底）
  try {
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const headerToken = authHeader.substring(7);
      return verifyToken(headerToken);
    }
  } catch {
    // headers() 可能在某些上下文中不可用
  }

  return null;
}

// 中间件：验证请求中的 Token
// 优先从 Cookie 读取，其次从 URL 查询参数 ?token= 读取（兼容 iframe 场景）
export async function verifyRequest(request: NextRequest): Promise<UserPayload | null> {
  // 1. 优先从 Cookie 读取
  const cookieToken = request.cookies.get('auth_token')?.value;
  if (cookieToken) {
    return verifyToken(cookieToken);
  }

  // 2. 从 URL 查询参数读取（iframe 环境兜底）
  const urlToken = request.nextUrl.searchParams.get('token');
  if (urlToken) {
    return verifyToken(urlToken);
  }

  // 3. 从 Authorization header 读取
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return verifyToken(authHeader.slice(7));
  }

  return null;
}

export async function getRequestAuthUser(request: NextRequest): Promise<RequestAuthUser | null> {
  return normalizeAuthUser(await verifyRequest(request));
}

// 登录页面路径
export const LOGIN_PATH = '/login';

// 后台管理页面路径
export const ADMIN_PATH = '/admin';

// 公开路径（不需要认证）
export const PUBLIC_PATHS = [LOGIN_PATH];

// 仅超级管理员可访问的路径
export const SUPER_ADMIN_PATHS = [ADMIN_PATH];

// 检查是否为公开路径
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(path + '/'));
}

// 检查是否为超级管理员专属路径
export function isSuperAdminPath(pathname: string): boolean {
  return SUPER_ADMIN_PATHS.some(path => pathname === path || pathname.startsWith(path + '/'));
}
