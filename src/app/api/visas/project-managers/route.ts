import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { parseProjectIds } from '@/lib/visa-workflow';
import { getUserDisplayName } from '@/lib/user-display-name';

type RoleRow = {
  id?: number;
  name?: string | null;
  code?: string | null;
};

type UserRoleRow = {
  user_id?: number;
  role_id?: number;
};

type UserRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  dingtalk_name?: string | null;
  role?: string | null;
  managed_projects?: unknown;
  is_disabled?: boolean | null;
};

function normalize(value: unknown) {
  return String(value || '').toLowerCase();
}

function isProjectManager(user: UserRow, roles: RoleRow[]) {
  if (normalize(user.role) === 'project_manager') return true;
  return roles.some((role) => {
    const code = normalize(role.code);
    const name = String(role.name || '');
    return code === 'project_manager' || code.includes('manager') || name.includes('项目经理');
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const projectId = Number(request.nextUrl.searchParams.get('projectId') || 0);
    const client = getSupabaseClient();

    const [{ data: users, error: usersError }, { data: userRoles }, { data: roles }] = await Promise.all([
      client.from('users').select('id,username,name,dingtalk_name,role,managed_projects,is_disabled').order('id', { ascending: true }),
      client.from('user_roles').select('user_id,role_id'),
      client.from('roles').select('id,name,code'),
    ]);

    if (usersError) throw new Error(usersError.message);

    const roleRows = (roles || []) as RoleRow[];
    const userRoleRows = (userRoles || []) as UserRoleRow[];
    const managers = ((users || []) as UserRow[])
      .filter((user) => !user.is_disabled && user.role !== 'pending')
      .map((user) => {
        const relatedRoles = userRoleRows
          .filter((userRole) => Number(userRole.user_id) === Number(user.id))
          .map((userRole) => roleRows.find((role) => Number(role.id) === Number(userRole.role_id)))
          .filter((role): role is RoleRow => Boolean(role));

        return {
          ...user,
          managed_project_ids: parseProjectIds(user.managed_projects),
          roles: relatedRoles,
        };
      })
      .filter((user) => isProjectManager(user, user.roles))
      .filter((user) => !projectId || user.managed_project_ids.length === 0 || user.managed_project_ids.includes(projectId))
      .map((user) => ({
        id: user.id,
        username: user.username,
        name: getUserDisplayName(user),
        managed_project_ids: user.managed_project_ids,
      }));
    return NextResponse.json({ managers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message ? error.message : '获取项目经理失败' },
      { status: 500 }
    );
  }
}
