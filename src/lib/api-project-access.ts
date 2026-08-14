import type { RequestAuthUser } from '@/lib/auth';
import { isMissingProjectRolesTable } from '@/lib/user-project-roles';

type ProjectAccessClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        single: () => PromiseLike<{ data: { managed_projects?: unknown } | null; error?: { message?: string } | null }>;
      };
    };
  };
};

type ProjectRoleQuery = {
  eq: (column: string, value: unknown) => PromiseLike<{ data: Array<{ project_id?: unknown }> | null; error?: { message?: string; code?: string } | null }>;
};

export function parseProjectIds(value: unknown): number[] {
  try {
    const parsed = typeof value === 'string'
      ? JSON.parse(value)
      : value;

    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(projectId => Number(projectId))
      .filter(projectId => Number.isInteger(projectId));
  } catch {
    return [];
  }
}

export async function getAssignedProjectIds(
  client: unknown,
  userId: number
): Promise<number[]> {
  const db = client as ProjectAccessClient;
  const { data, error } = await db
    .from('users')
    .select('managed_projects')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn(`[project-access] failed to load assigned projects for user ${userId}: ${error.message || 'unknown error'}`);
    return [];
  }

  return parseProjectIds(data?.managed_projects);
}

export async function getAccessibleProjectIds(
  client: unknown,
  user: RequestAuthUser
): Promise<number[] | null> {
  if (user.is_super_admin) return null;

  const db = client as ProjectAccessClient;
  const { data, error } = await db
    .from('users')
    .select('managed_projects')
    .eq('id', user.id)
    .single();

  if (error) {
    console.warn(`[project-access] failed to load accessible projects for user ${user.id}: ${error.message || 'unknown error'}`);
    return [];
  }

  const directIds = data?.managed_projects ? parseProjectIds(data.managed_projects) : [];

  // A4 修复：合并 user_project_roles 项目角色授权（预算员/项目经理/财务/现场人员）。
  // 表不存在（老库未迁移）时静默忽略，不阻断主流程。
  let roleProjectIds: number[] = [];
  try {
    const roleTable = (db.from('user_project_roles') as unknown) as {
      select: (columns: string) => ProjectRoleQuery;
    };
    const { data: roleRows, error: roleError } = await roleTable
      .select('project_id')
      .eq('user_id', user.id);

    if (!roleError && Array.isArray(roleRows)) {
      roleProjectIds = roleRows
        .map((row) => Number(row.project_id))
        .filter((projectId) => Number.isInteger(projectId));
    } else if (roleError && !isMissingProjectRolesTable(roleError)) {
      console.warn(`[project-access] user_project_roles query failed for user ${user.id}: ${roleError.message || 'unknown error'}`);
    }
  } catch (err) {
    console.warn(`[project-access] user_project_roles query failed for user ${user.id}:`, err);
  }

  return Array.from(new Set([...directIds, ...roleProjectIds]));
}

export async function getTodoProjectIds(
  client: unknown,
  user: RequestAuthUser
): Promise<number[] | null> {
  if (user.is_super_admin) {
    return getAssignedProjectIds(client, user.id);
  }

  return getAccessibleProjectIds(client, user);
}
