import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestAuthUser } from '@/lib/auth';
import { parseProjectIds } from '@/lib/api-project-access';
import { isSuperAdminUser } from '@/lib/route-permissions';
import { isMissingProjectRolesTable } from '@/lib/user-project-roles';
import { PUBLIC_LOG_PROJECT_NAME } from '@/lib/public-log-project';
import { isPublicLogExemptRole, isPublicLogRestrictedRole } from '@/lib/construction-log-role-rules';

type RoleRow = {
  id?: number | string | null;
  code?: string | null;
  name?: string | null;
  is_super_admin?: boolean | null;
};

type UserRoleRow = {
  user_id?: number | string | null;
  role_id?: number | string | null;
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

type SubmitterRow = {
  user_id?: number | string | null;
};

type ProjectRoleRow = {
  user_id?: number | string | null;
  role_code?: string | null;
};

function normalizeText(value: unknown) {
  return String(value || '').toLowerCase();
}

function looksLikeBudgetRole(role?: Pick<RoleRow, 'code' | 'name'> | string | null) {
  if (!role) return false;
  if (typeof role === 'string') {
    const value = normalizeText(role);
    return value === 'admin' || value === 'budget' || value.includes('budget') || value.includes('cost');
  }

  const code = normalizeText(role.code);
  const name = String(role.name || '');
  return (
    code === 'admin' ||
    code === 'budget' ||
    code.includes('budget') ||
    code.includes('cost') ||
    code.includes('estimate') ||
    name.includes('预算') ||
    name.includes('造价') ||
    name.includes('经营')
  );
}

export function isBudgetLikeUser(user: Pick<RequestAuthUser, 'role' | 'roleId' | 'is_super_admin'> | null | undefined) {
  if (!user) return false;
  return Boolean(user.is_super_admin) || isSuperAdminUser(user.role, user.roleId) || looksLikeBudgetRole(user.role);
}

export async function hasBudgetRoleInDatabase(client: SupabaseClient, user: RequestAuthUser) {
  if (isBudgetLikeUser(user)) return true;

  const [{ data: userRoles }, { data: roles }] = await Promise.all([
    client.from('user_roles').select('user_id,role_id').eq('user_id', user.id),
    client.from('roles').select('id,code,name,is_super_admin'),
  ]);

  const roleRows = (Array.isArray(roles) ? roles : []) as RoleRow[];
  const roleIds = new Set(
    ((Array.isArray(userRoles) ? userRoles : []) as UserRoleRow[])
      .map((row) => Number(row.role_id))
      .filter((roleId) => Number.isInteger(roleId)),
  );

  return roleRows.some((role) => roleIds.has(Number(role.id)) && (Boolean(role.is_super_admin) || looksLikeBudgetRole(role)));
}

function isMissingSubmitterTable(error: unknown) {
  const err = error as { code?: string; message?: string } | null | undefined;
  const message = String(err?.message || '').toLowerCase();
  return err?.code === '42P01' || message.includes('construction_log_submitters') || message.includes('schema cache');
}

export async function getConstructionLogSubmitterIds(client: SupabaseClient, projectId: number) {
  const { data, error } = await client
    .from('construction_log_submitters')
    .select('user_id')
    .eq('project_id', projectId);

  if (error) {
    if (isMissingSubmitterTable(error)) return { configured: false, userIds: [] as number[] };
    throw new Error(error.message);
  }

  const userIds = ((Array.isArray(data) ? data : []) as SubmitterRow[])
    .map((row) => Number(row.user_id))
    .filter((userId) => Number.isInteger(userId));

  return { configured: userIds.length > 0, userIds: Array.from(new Set(userIds)) };
}

export async function isUserRestrictedFromPublicConstructionLog(client: SupabaseClient, userId: number, fallbackRole?: string | null) {
  if (isPublicLogExemptRole(fallbackRole)) return false;
  if (isPublicLogRestrictedRole(fallbackRole)) return true;

  const [{ data: userRow }, { data: projectRoles, error: projectRoleError }, { data: userRoles }, { data: roles }] = await Promise.all([
    client
      .from('users')
      .select('id,role')
      .eq('id', userId)
      .maybeSingle(),
    client
      .from('user_project_roles')
      .select('user_id,role_code')
      .eq('user_id', userId),
    client
      .from('user_roles')
      .select('user_id,role_id')
      .eq('user_id', userId),
    client
      .from('roles')
      .select('id,code,name,is_super_admin'),
  ]);

  if (isPublicLogExemptRole(userRow as { role?: string | null } | null)) return false;
  if (isPublicLogRestrictedRole(userRow as { role?: string | null } | null)) return true;

  const projectRoleRows = projectRoleError && isMissingProjectRolesTable(projectRoleError)
    ? []
    : ((Array.isArray(projectRoles) ? projectRoles : []) as ProjectRoleRow[]);
  if (projectRoleRows.some((row) => isPublicLogRestrictedRole(row.role_code))) return true;

  const roleIds = new Set(
    ((Array.isArray(userRoles) ? userRoles : []) as UserRoleRow[])
      .map((row) => Number(row.role_id))
      .filter((roleId) => Number.isInteger(roleId)),
  );
  const matchedRoles = ((Array.isArray(roles) ? roles : []) as RoleRow[]).filter((role) => roleIds.has(Number(role.id)));
  if (matchedRoles.some((role) => isPublicLogExemptRole(role))) return false;
  return matchedRoles.some((role) => isPublicLogRestrictedRole(role));
}

export async function canUserSubmitConstructionLog(client: SupabaseClient, projectId: number, userId: number) {
  const { data: projectRow } = await client
    .from('projects')
    .select('id,name')
    .eq('id', projectId)
    .maybeSingle();

  if ((projectRow as { name?: string } | null)?.name === PUBLIC_LOG_PROJECT_NAME) {
    return !(await isUserRestrictedFromPublicConstructionLog(client, userId));
  }

  const scope = await getConstructionLogSubmitterIds(client, projectId);
  return !scope.configured || scope.userIds.includes(userId);
}

export async function getProjectSubmitterCandidates(client: SupabaseClient, projectId: number) {
  const [{ data: users, error: userError }, { data: projectRoles, error: roleError }, { data: projectRow }] = await Promise.all([
    client
      .from('users')
      .select('id,username,name,dingtalk_name,role,managed_projects,is_disabled')
      .order('id', { ascending: true }),
    client
      .from('user_project_roles')
      .select('user_id,project_id,role_code')
      .eq('project_id', projectId),
    client
      .from('projects')
      .select('id,name')
      .eq('id', projectId)
      .maybeSingle(),
  ]);

  if (userError) throw new Error(userError.message);
  const roleRows = roleError && isMissingProjectRolesTable(roleError) ? [] : (projectRoles || []);
  const isPublicLogProject = (projectRow as { name?: string } | null)?.name === PUBLIC_LOG_PROJECT_NAME;

  const projectRoleUserIds = new Set(
    (Array.isArray(roleRows) ? roleRows : [])
      .map((row: { user_id?: unknown }) => Number(row.user_id))
      .filter((userId) => Number.isInteger(userId)),
  );

  return ((Array.isArray(users) ? users : []) as UserRow[])
    .filter((user) => !user.is_disabled && user.role !== 'pending')
    .filter((user) => {
      if (isPublicLogProject) return !isPublicLogRestrictedRole(user.role);
      if (projectRoleUserIds.has(Number(user.id))) return true;
      return parseProjectIds(user.managed_projects).includes(projectId);
    })
    .map((user) => ({
      id: Number(user.id),
      username: user.username || '',
      name: user.dingtalk_name || user.name || user.username || `用户${user.id}`,
      role: user.role || '',
    }));
}
