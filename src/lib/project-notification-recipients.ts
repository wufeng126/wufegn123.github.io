import { getUserDisplayName } from '@/lib/user-display-name';

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => PromiseLike<{ data: unknown[] | null; error?: { message?: string } | null }>;
  };
};

export type NotificationRecipient = {
  id: number;
  username?: string | null;
  name?: string | null;
  role?: string | null;
  dingtalk_user_id?: string | null;
  dingtalk_name?: string | null;
};

type UserRow = NotificationRecipient & {
  managed_projects?: unknown;
  is_disabled?: boolean | null;
};

type RoleRow = {
  id?: number | string | null;
  name?: string | null;
  code?: string | null;
  level?: number | string | null;
};

type UserRoleRow = {
  user_id?: number | string | null;
  role_id?: number | string | null;
};

function parseManagedProjects(value: unknown): number[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((projectId) => Number(projectId))
      .filter((projectId) => Number.isInteger(projectId));
  } catch {
    return [];
  }
}

function normalize(value: unknown) {
  return String(value || '').toLowerCase();
}

function hasBudgetRole(user: UserRow, roles: RoleRow[]) {
  const directRole = normalize(user.role);
  if (directRole === 'admin' || directRole === 'super_admin') return true;

  return roles.some((role) => {
    const code = normalize(role?.code);
    const name = String(role?.name || '');
    return (
      code === 'admin' ||
      code === 'super_admin' ||
      code.includes('budget') ||
      code.includes('cost') ||
      code.includes('estimate') ||
      name.includes('预算') ||
      name.includes('造价') ||
      name.includes('经营')
    );
  });
}

function isSuperAdminRole(user: UserRow, roles: RoleRow[]) {
  if (normalize(user.role) === 'super_admin') return true;
  return roles.some((role) => normalize(role?.code) === 'super_admin' || Number(role?.level) === 1);
}

function uniqRecipients(users: NotificationRecipient[]) {
  const seen = new Set<number>();
  return users.filter((user) => {
    if (seen.has(user.id)) return false;
    seen.add(user.id);
    return true;
  });
}

function isRoleRow(role: RoleRow | undefined): role is RoleRow {
  return Boolean(role);
}

export async function getProjectBudgetRecipients(
  client: SupabaseLike,
  projectId: number
): Promise<NotificationRecipient[]> {
  const [{ data: users, error: userError }, { data: userRoles }, { data: roles }] = await Promise.all([
    client
      .from('users')
      .select('id,username,name,role,managed_projects,is_disabled,dingtalk_user_id,dingtalk_name'),
    client.from('user_roles').select('user_id,role_id'),
    client.from('roles').select('id,name,code,level'),
  ]);

  if (userError) throw new Error(userError.message);

  const roleRows = (Array.isArray(roles) ? roles : []) as RoleRow[];
  const userRoleRows = (Array.isArray(userRoles) ? userRoles : []) as UserRoleRow[];
  const activeUsers = ((Array.isArray(users) ? users : []) as UserRow[])
    .filter((user) => !user.is_disabled && user.role !== 'pending');

  const usersWithRoles = activeUsers.map((user) => {
    const relatedRoles = userRoleRows
      .filter((userRole) => Number(userRole.user_id) === Number(user.id))
      .map((userRole) => roleRows.find((role) => Number(role.id) === Number(userRole.role_id)))
      .filter(isRoleRow);

    return {
      user,
      roles: relatedRoles,
      managedProjectIds: parseManagedProjects(user.managed_projects),
    };
  });

  const projectBudgetUsers = usersWithRoles
    .filter(({ user, roles, managedProjectIds }) =>
      managedProjectIds.includes(projectId) && hasBudgetRole(user, roles)
    )
    .map(({ user }) => user as NotificationRecipient);

  if (projectBudgetUsers.length > 0) return uniqRecipients(projectBudgetUsers);

  const fallbackAdmins = usersWithRoles
    .filter(({ user, roles }) => hasBudgetRole(user, roles) || isSuperAdminRole(user, roles))
    .map(({ user }) => user as NotificationRecipient);

  return uniqRecipients(fallbackAdmins);
}

export function formatRecipientNames(recipients: NotificationRecipient[]) {
  return recipients
    .map((recipient) => getUserDisplayName(recipient))
    .filter(Boolean);
}
