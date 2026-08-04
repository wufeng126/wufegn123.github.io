export const NOTIFICATIONS_UPDATED_EVENT = 'notifications:updated';

function toNotificationId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export function emitNotificationsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

export function withNotificationId(href: string, id: unknown) {
  const notificationId = toNotificationId(id);
  if (!notificationId || !href || !href.startsWith('/')) return href;

  const hashIndex = href.indexOf('#');
  const beforeHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  const path = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(query);

  params.set('notification_id', String(notificationId));
  const nextQuery = params.toString();
  return `${path}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
}

export async function markNotificationRead(id: unknown) {
  const notificationId = toNotificationId(id);
  if (!notificationId) return false;

  const res = await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: notificationId, isRead: true }),
  });

  if (!res.ok) return false;
  emitNotificationsUpdated();
  return true;
}
