'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { markNotificationRead } from '@/lib/notification-client';

function getNotificationId(params: { get(name: string): string | null }) {
  return params.get('notification_id') || params.get('notificationId') || params.get('notice_id') || '';
}

export default function NotificationReadMarker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notificationId = getNotificationId(searchParams);
  const lastMarkedRef = useRef('');

  useEffect(() => {
    if (!notificationId || lastMarkedRef.current === notificationId) return;

    lastMarkedRef.current = notificationId;
    void markNotificationRead(notificationId);
  }, [notificationId, pathname]);

  return null;
}
