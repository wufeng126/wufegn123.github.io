import type { RequestAuthUser } from '@/lib/auth';

export async function getAccessibleProjectIds(
  client: any,
  user: RequestAuthUser
): Promise<number[] | null> {
  if (user.is_super_admin) return null;

  const { data } = await client
    .from('users')
    .select('managed_projects')
    .eq('id', user.id)
    .single();

  if (!data?.managed_projects) return [];

  try {
    const parsed = typeof data.managed_projects === 'string'
      ? JSON.parse(data.managed_projects)
      : data.managed_projects;

    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(projectId => Number(projectId))
      .filter(projectId => Number.isInteger(projectId));
  } catch {
    return [];
  }
}
