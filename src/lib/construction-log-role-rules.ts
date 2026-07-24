type RoleLike = {
  role?: string | null;
  code?: string | null;
  name?: string | null;
  is_super_admin?: boolean | null;
  isSuperAdmin?: boolean | null;
};

const PROJECT_MANAGER_LABEL = '\u9879\u76ee\u7ecf\u7406';
const SITE_STAFF_LABEL = '\u73b0\u573a';
const CONSTRUCTION_STAFF_LABEL = '\u65bd\u5de5\u5458';
const BOSS_LABEL = '\u8001\u677f';

function normalizeRoleText(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isPublicLogRestrictedRole(role?: RoleLike | string | null) {
  if (!role) return false;

  if (typeof role === 'string') {
    const value = normalizeRoleText(role);
    return (
      value === 'project_manager' ||
      value === 'site_staff' ||
      value === 'site_worker' ||
      value === 'field_staff' ||
      value.includes('project_manager') ||
      value.includes('site_staff') ||
      value.includes('site_worker') ||
      value.includes('field_staff') ||
      value.includes(PROJECT_MANAGER_LABEL) ||
      value.includes(SITE_STAFF_LABEL) ||
      value.includes(CONSTRUCTION_STAFF_LABEL)
    );
  }

  return isPublicLogRestrictedRole([role.role, role.code, role.name].filter(Boolean).join(' '));
}

export function isPublicLogExemptRole(role?: RoleLike | string | null) {
  if (!role) return false;
  if (typeof role !== 'string' && (role.is_super_admin || role.isSuperAdmin)) return true;

  const value = typeof role === 'string'
    ? normalizeRoleText(role)
    : normalizeRoleText([role.role, role.code, role.name].filter(Boolean).join(' '));

  return (
    value === 'super_admin' ||
    value === 'boss' ||
    value.includes('super_admin') ||
    value.includes(BOSS_LABEL)
  );
}

export function isPublicLogRestrictedUser(user?: RoleLike | null) {
  if (!user) return false;
  if (isPublicLogExemptRole(user)) return false;
  return isPublicLogRestrictedRole(user);
}
