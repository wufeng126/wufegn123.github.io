export const PROJECT_ROLE_OPTIONS = [
  { code: 'budget', label: '预算员' },
  { code: 'project_manager', label: '项目经理' },
  { code: 'finance', label: '财务' },
  { code: 'site_staff', label: '现场人员' },
] as const;

export type ProjectRoleCode = (typeof PROJECT_ROLE_OPTIONS)[number]['code'];

export const PROJECT_ROLE_LABELS: Record<ProjectRoleCode, string> = PROJECT_ROLE_OPTIONS.reduce(
  (acc, option) => {
    acc[option.code] = option.label;
    return acc;
  },
  {} as Record<ProjectRoleCode, string>
);

const PROJECT_ROLE_CODE_SET = new Set<string>(PROJECT_ROLE_OPTIONS.map((option) => option.code));

type ProjectRoleSelectResult = {
  data: unknown[] | null;
  error?: { message?: string; code?: string } | null;
};

type ProjectRoleQuery = PromiseLike<ProjectRoleSelectResult> & {
  eq: (column: string, value: unknown) => ProjectRoleQuery;
};

export function normalizeProjectRoleCodes(value: unknown): ProjectRoleCode[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value))
    .map((code) => String(code))
    .filter((code): code is ProjectRoleCode => PROJECT_ROLE_CODE_SET.has(code));
}

export function isMissingProjectRolesTable(error: unknown) {
  const err = error as { code?: string; message?: string } | null | undefined;
  const message = String(err?.message || '').toLowerCase();
  return err?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
}

export async function getProjectRoleUserIds(
  client: { from: (table: string) => unknown },
  projectId: number,
  roleCode: ProjectRoleCode
) {
  const table = client.from('user_project_roles') as {
    select: (columns: string) => ProjectRoleQuery;
  };

  const { data, error } = await table
    .select('user_id')
    .eq('project_id', projectId)
    .eq('role_code', roleCode);

  if (error) {
    if (isMissingProjectRolesTable(error)) return [];
    throw new Error(error.message || '读取项目身份配置失败');
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => Number((row as { user_id?: unknown }).user_id))
    .filter((userId) => Number.isInteger(userId));
}
