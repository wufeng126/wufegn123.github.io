import type { RequestAuthUser } from '@/lib/auth';

type ProjectAccessClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        single: () => PromiseLike<{ data: { managed_projects?: unknown } | null }>;
      };
    };
  };
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
  const { data } = await db
    .from('users')
    .select('managed_projects')
    .eq('id', userId)
    .single();

  return parseProjectIds(data?.managed_projects);
}

export async function getAccessibleProjectIds(
  client: unknown,
  user: RequestAuthUser
): Promise<number[] | null> {
  if (user.is_super_admin) return null;

  const db = client as ProjectAccessClient;
  const { data } = await db
    .from('users')
    .select('managed_projects')
    .eq('id', user.id)
    .single();

  if (!data?.managed_projects) return [];

  return parseProjectIds(data.managed_projects);
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
