import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { apiError } from '@/lib/api-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isSuperAdminUser } from '@/lib/route-permissions';

// 获取用户权限码列表
async function fetchUserPermissions(userId: number, userRole: string): Promise<string[]> {
  try {
    const client = getSupabaseClient();
    if (isSuperAdminUser(userRole)) {
      const { data } = await client.from('permissions').select('code');
      return data?.map((p: { code: string }) => p.code) || [];
    }
    const { data: roleRow } = await client
      .from('roles')
      .select('id')
      .eq('code', userRole)
      .single();
    if (!roleRow) {
      const { data: userPerms } = await client
        .from('user_permissions')
        .select('permission_id')
        .eq('user_id', userId);
      if (userPerms && userPerms.length > 0) {
        const permIds = userPerms.map((up: { permission_id: number }) => up.permission_id);
        const { data: perms } = await client
          .from('permissions')
          .select('code')
          .in('id', permIds);
        return perms?.map((p: { code: string }) => p.code) || [];
      }
      const { data: allPerms } = await client.from('permissions').select('code');
      return allPerms?.map((p: { code: string }) => p.code) || [];
    }
    const { data } = await client
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', roleRow.id);
    if (!data || data.length === 0) {
      const { data: allPerms } = await client.from('permissions').select('code');
      return allPerms?.map((p: { code: string }) => p.code) || [];
    }
    const permIds = data.map((rp: { permission_id: number }) => rp.permission_id);
    const { data: perms } = await client
      .from('permissions')
      .select('code')
      .in('id', permIds);
    return perms?.map((p: { code: string }) => p.code) || [];
  } catch (err) {
    console.error('[Auth Me] fetchUserPermissions error:', err);
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    // ═══════════════ 开发预览模式 ═══════════════
    // 返回模拟超级管理员信息（后续上线务必恢复）
    if (process.env.COZE_PROJECT_ENV !== 'PROD') {
      const mockUser = {
        id: 1,
        username: 'admin',
        role: 'super_admin',
        name: '管理员',
        roleId: 1,
        permissions: [],
      };
      return NextResponse.json({
        success: true,
        authenticated: true,
        data: mockUser,
        user: { ...mockUser, role_id: 1 },
      });
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    // Also check cookie
    const cookieToken = request.headers.get('cookie')
      ?.split('; ')
      .find(c => c.startsWith('auth_token='))
      ?.split('=')[1];

    // 兜底：URL 临时 token（兼容钉钉 iframe 第三方 Cookie 被拦截场景）
    const urlToken = url.searchParams.get('token');

    const finalToken = token || cookieToken || urlToken;

    if (!finalToken) {
      return apiError('未登录', 401, 'UNAUTHORIZED');
    }

    const user = await verifyToken(finalToken);

    if (!user) {
      return apiError('登录已过期', 401, 'TOKEN_EXPIRED');
    }

    // Check if user is disabled
    const client = getSupabaseClient();
    const { data: userRecord } = await client
      .from('users')
      .select('is_disabled')
      .eq('id', user.id)
      .single();

    if (userRecord?.is_disabled) {
      return apiError('账号已被禁用，请联系管理员', 403, 'ACCOUNT_DISABLED');
    }

    // 获取用户权限码（优先从token获取，否则实时查询数据库）
    let permissions: string[] = [];
    if (user.permissions && user.permissions.length > 0) {
      permissions = user.permissions;
    } else {
      permissions = await fetchUserPermissions(user.id, user.role);
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        roleId: user.role_id || (isSuperAdminUser(user.role) ? 1 : 0),
        permissions,
      },
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        role_id: user.role_id || (isSuperAdminUser(user.role) ? 1 : 0),
        permissions,
      },
    });
  } catch (error: any) {
    console.error('[Auth Me] Error:', error.message);
    return apiError(error.message || '认证失败', 500, 'AUTH_ERROR');
  }
}
