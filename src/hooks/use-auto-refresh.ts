'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Hook to auto-refresh data when the window regains focus or when triggered manually.
 * Useful for keeping data in sync across different pages/modules.
 */
export function useAutoRefresh(
  fetchFn: () => Promise<void>,
  options?: {
    intervalMs?: number; // Auto-refresh interval in ms (0 = disabled)
    enableOnFocus?: boolean; // Refresh on window focus (default: true)
    enabled?: boolean; // Master switch: when false, no auto-refresh triggers (default: true)
  }
) {
  const { intervalMs = 0, enableOnFocus = true, enabled = true } = options || {};
  const fetchRef = useRef(fetchFn);
  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);

  // Keep refs updated
  useEffect(() => {
    fetchRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const refresh = useCallback(async () => {
    if (mountedRef.current && enabledRef.current) {
      try {
        await fetchRef.current();
      } catch (e) {
        console.error('Auto-refresh failed:', e);
      }
    }
  }, []);

  // Refresh on window focus
  useEffect(() => {
    if (!enableOnFocus) return;

    const handleFocus = () => {
      if (enabledRef.current) {
        refresh();
      }
    };

    window.addEventListener('focus', handleFocus);
    // Also listen for visibilitychange (tab switch)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && enabledRef.current) {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enableOnFocus, refresh]);

  // Auto-refresh interval
  useEffect(() => {
    if (intervalMs <= 0) return;

    const timer = setInterval(() => {
      if (enabledRef.current) {
        refresh();
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs, refresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { refresh };
}
