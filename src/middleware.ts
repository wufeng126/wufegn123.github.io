import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ROUTE_PERMISSIONS, PUBLIC_PAGES, isSuperAdminUser, findMatchingRoute, checkApiWritePermission } from '@/lib/route-permissions';

// 钉钉可信域名（用于 CORS）
const DINGTALK_ORIGINS = [
  'https://dingtalk.com',
  'https://www.dingtalk.com',
  'https://h5.dingtalk.com',
  'https://n.dingtalk.com',
  'https://open.dingtalk.com',
  'https://sxshhy.top',
  'https://www.sxshhy.top',
  'https://d6e3bb20-c45b-47c4-94ab-82634f5db024.dev.coze.site',
];

// 为响应添加 CORS 头（兼容钉钉 iframe/webview）
function addCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get('origin') || '';
  const isAllowed = DINGTALK_ORIGINS.some(o => origin === o) || origin.endsWith('.dingtalk.com') || origin.endsWith('.coze.site') || origin.endsWith('.sxshhy.top');
  if (isAllowed || !origin) {
    response.headers.set('Access-Control-Allow-Origin', origin || '*');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session');
  }
  return response;
}

// 内部API路由 - 已登录即可访问（读权限）；写权限由 checkApiWritePermission 控制
const INTERNAL_APIS = [
  '/api/auth/me',
  '/api/dashboard',
  '/api/projects',
  '/api/workers',
  '/api/worker-salaries',
  '/api/work-items',
  '/api/work-item-subitems',
  '/api/work-item-progress',
  '/api/client-reports',
  '/api/client-payments',
  '/api/certificates',
  '/api/notifications',
  '/api/suppliers',
  '/api/supplier-contracts',
  '/api/supplier-settlements',
  '/api/supplier-payments',
  '/api/settlements',
  '/api/limit-prices',
  '/api/comprehensive-expenses',
  '/api/miscellaneous-materials',
  '/api/visas',
  '/api/system',
  '/api/upload',
  '/api/review',
  '/api/salary-payments',
  '/api/worker-payments',
  '/api/audit-logs',
  '/api/cost-center',
  '/api/ai',
  '/api/reports',
  '/api/dingtalk',
  '/api/auth/center',
  '/api/init',
  '/api/worker-assignments',
  '/api/workers/check-duplicates',
];

// 返回JSON错误响应
function jsonError(message: string, status: number) {
  return new NextResponse(
    JSON.stringify({ success: false, data: null, error: message, code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'ERROR' }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

// 判断是否为API请求
function isApiRequest(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 静态资源、_next 路径直接放行
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') // 静态文件（图片、CSS、JS等）
  ) {
    return NextResponse.next();
  }

  // ═══════════════ 开发预览模式 ═══════════════
  // 跳过所有登录认证，模拟超级管理员（后续上线务必恢复）
  if (process.env.COZE_PROJECT_ENV !== 'PROD') {
    const nextResp = NextResponse.next();
    nextResp.headers.set('x-user-id', '1');
    nextResp.headers.set('x-user-role', 'super_admin');
    nextResp.headers.set('x-is-super-admin', 'true');
    console.log(`[Middleware] 预览模式放行: ${pathname}`);
    return addCorsHeaders(nextResp, request);
  }

  // 2. 登录页面和钉钉入口直接放行
  if (pathname === '/login' || pathname === '/dingtalk') {
    console.log(`[Middleware] 放行公开页面: ${pathname}`);
    return NextResponse.next();
  }

  // 3. /api/auth/login POST 放行
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    return NextResponse.next();
  }

  // 4. /api/auth/init 和 /api/init/permissions 放行（路由内部做安全校验：INIT_SECRET+已初始化检测+生产环境禁用）
  if (pathname === '/api/auth/init' || pathname === '/api/init/permissions') {
    return NextResponse.next();
  }

  // 5. /api/auth/dingtalk POST 放行（钉钉免登）
  if (pathname === '/api/auth/dingtalk' && request.method === 'POST') {
    return NextResponse.next();
  }

  // 5.1 /api/auth/dingtalk/login POST 放行（钉钉免登登录）
  if (pathname === '/api/auth/dingtalk/login' && request.method === 'POST') {
    return NextResponse.next();
  }

  // 5.2 /api/dingtalk/public-config GET 放行（前端获取 corpId）
  if (pathname === '/api/dingtalk/public-config' && request.method === 'GET') {
    return NextResponse.next();
  }

  // 6. 公开页面直接放行
  if (PUBLIC_PAGES.includes(pathname)) {
    return NextResponse.next();
  }

  // 7. 获取 token（优先 Cookie，兜底 URL 临时 token / Authorization header —— 兼容钉钉 webview/iframe Cookie 被拦截场景）
  let token = request.cookies.get('auth_token')?.value;
  let tokenFromUrl = false;
  let tokenSource = 'cookie';
  const urlTokenParam = request.nextUrl.searchParams.get('token');
  console.log(`[Middleware] 请求: ${pathname}, cookie: ${!!token}, url_token: ${!!urlTokenParam}`);
  if (!token) {
    token = urlTokenParam || '';
    if (token) {
      tokenFromUrl = true;
      tokenSource = 'url';
    }
  }
  if (!token) {
    // Authorization: Bearer <token> 兜底（前端 fetch 可主动携带）
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
      tokenSource = 'header';
    }
  }
  if (token) {
    console.log(`[Middleware] token来源: ${tokenSource}, 路径: ${pathname}`);
  }

  // 8. 未登录处理
  if (!token) {
    if (isApiRequest(pathname)) {
      console.log(`[Middleware] API未认证: ${pathname}`);
      const errResp = jsonError('未登录，请先登录', 401);
      return addCorsHeaders(errResp, request);
    }
    // ★ 页面请求：不再服务端重定向，改为放行让前端处理跳转
    // 这彻底切断了 钉钉免登→跳转首页→middleware重定向/login→检测钉钉→/dingtalk 的死循环
    console.log(`[Middleware] 页面未登录, 放行由前端处理: ${pathname}`);
    return NextResponse.next();
  }

  // 9. 解析 token
  let payload: { id: number; role: string; roleId: number; permissions?: string[] };
  try {
    payload = JSON.parse(atob(token.split('.')[1]));
  } catch {
    // Token无效 — 不再服务端重定向，清除无效 cookie 后放行，由前端处理
    console.log(`[Middleware] token解析失败, 放行由前端处理: ${pathname}`);
    const nextResp = NextResponse.next();
    nextResp.cookies.delete('auth_token');
    return nextResp;
  }

  const userId = payload.id;
  const userRole = payload.role || 'user';
  const roleId = payload.roleId || 0;
  const isSuperAdmin = isSuperAdminUser(userRole, roleId);
  const userPermissions = payload.permissions || [];

  // 辅助函数：为响应设置用户头 + 如果 token 来自 URL 则补设 Cookie
  function finalizeResponse(response: NextResponse): NextResponse {
    response.headers.set('x-user-id', String(userId));
    response.headers.set('x-user-role', userRole);
    response.headers.set('x-is-super-admin', isSuperAdmin ? 'true' : 'false');
    // URL token 兜底成功后，补设 Cookie 以便后续请求无需 URL 传参
    // 同时设置两个版本：Lax（同站 webview）和 None（跨站 iframe），确保至少一个被浏览器存储
    if (tokenFromUrl) {
      const cookieOptions = {
        httpOnly: true,
        sameSite: 'lax' as const,
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      };
      response.cookies.set('auth_token', token!, cookieOptions);
    }
    return addCorsHeaders(response, request);
  }

  // 10. 内部API路由 - 已登录即可访问（GET），写操作需检查权限
  if (INTERNAL_APIS.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    // 写操作（POST/PUT/DELETE/PATCH）检查 API 级别权限
    if (!checkApiWritePermission(pathname, request.method, userPermissions, isSuperAdmin)) {
      return addCorsHeaders(jsonError('无权执行此操作', 403), request);
    }
    return finalizeResponse(NextResponse.next());
  }

  // 11. 业务路由权限检查（使用按长度降序的精确匹配）
  const matchedRoute = findMatchingRoute(pathname);

  if (matchedRoute) {
    const routeConfig = ROUTE_PERMISSIONS[matchedRoute];

    // 超级管理员专属路由
    if (routeConfig.superAdminOnly && !isSuperAdmin) {
      if (isApiRequest(pathname)) {
        return addCorsHeaders(jsonError('无权访问', 403), request);
      }
      return NextResponse.redirect(new URL('/workspace', request.url));
    }

    // 权限检查：超级管理员直接通过；否则检查用户权限码
    if (!isSuperAdmin) {
      const requiredPermission = routeConfig.permission;
      if (requiredPermission && !userPermissions.includes(requiredPermission)) {
        if (isApiRequest(pathname)) {
          return addCorsHeaders(jsonError('无权访问此功能', 403), request);
        }
        return NextResponse.redirect(new URL('/workspace', request.url));
      }
    }

    // 通过权限检查
    return finalizeResponse(NextResponse.next());
  }

  // 12. 未声明权限的路由 — 生产环境默认拒绝
  if (isApiRequest(pathname)) {
    // 未声明的API路由：生产环境拒绝，开发环境放行
    if (process.env.COZE_PROJECT_ENV === 'PROD') {
      return addCorsHeaders(jsonError('无权访问此接口', 403), request);
    }
    return finalizeResponse(NextResponse.next());
  }

  // 未声明的页面路由：生产环境重定向工作台，开发环境放行
  if (process.env.COZE_PROJECT_ENV === 'PROD') {
    return NextResponse.redirect(new URL('/workspace', request.url));
  }

  return finalizeResponse(NextResponse.next());
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
