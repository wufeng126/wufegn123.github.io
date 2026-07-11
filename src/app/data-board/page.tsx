'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DataBoardIndex() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/data-board/supplier-cost');
  }, [router]);
  
  return null;
}
