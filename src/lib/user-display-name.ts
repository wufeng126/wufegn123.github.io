export type UserDisplayNameSource = {
  id?: number | string | null;
  dingtalk_name?: string | null;
  dingtalkName?: string | null;
  name?: string | null;
  username?: string | null;
};

export function getUserDisplayName(user?: UserDisplayNameSource | null, fallback = '') {
  const value = user?.dingtalk_name || user?.dingtalkName || user?.name || user?.username;
  if (value) return String(value);
  if (user?.id !== undefined && user.id !== null && String(user.id) !== '') return `用户${user.id}`;
  return fallback;
}

