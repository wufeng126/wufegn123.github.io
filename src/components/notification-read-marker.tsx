'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { markNotificationRead } from '@/lib/notification-client';

function getNotificationIdFromLocation() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('notification_id') || params.get('notificationId') || params.get('notice_id') || '';
}

export default function NotificationReadMarker() {
  const pathname = usePathname();
  const lastMarkedRef = useRef('');

  useEffect(() => {
    const notificationId = getNotificationIdFromLocation();
    if (!notificationId || lastMarkedRef.current === notificationId) return;

    lastMarkedRef.current = notificationId;
    void markNotificationRead(notificationId);
  }, [pathname]);

  return null;
}
