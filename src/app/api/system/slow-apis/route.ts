import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth, requirePermission } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

/**
 * 慢接口监控
 * POST /api/system/slow-apis  浏览器上报（sendBeacon，需登录）
 * GET  /api/system/slow-apis?days=7  超管查看慢接口 Top 榜
 */

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    // 上报接口：未登录（如退出后/登录页）静默忽略，返回 204，避免控制台刷 401 错误
    if (!auth.ok) return new NextResponse(null, { status: 204 });

    const body = await request.json().catch(() => ({}));
    const path = String(body?.path || '').slice(0, 300);
    const duration = Number(body?.duration) || 0;
    if (!path.startsWith('/api/') || duration < 500) return apiSuccess({ recorded: false });

    const client = getSupabaseClient();
    // 写失败不影响业务（表未创建/权限不足都静默）
    await client.from('api_timing_logs').insert({
      path,
      duration_ms: Math.round(duration),
      ok: body?.ok !== false,
      page: String(body?.page || '').slice(0, 300) || null,
      user_id: Number(auth.user.id) || null,
    });

    return apiSuccess({ recorded: true });
  } catch {
    return apiSuccess({ recorded: false });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:manage');
    if (!auth.ok) return auth.response;

    const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get('days')) || 7, 1), 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('api_timing_logs')
      .select('path, duration_ms, ok, page, created_at')
      .gte('created_at', since)
      .order('duration_ms', { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const groups = new Map<string, { path: string; count: number; maxMs: number; totalMs: number; failCount: number }>();
    (data || []).forEach((row: { path?: string; duration_ms?: number; ok?: boolean }) => {
      const path = String(row.path || '');
      const item = groups.get(path) || { path, count: 0, maxMs: 0, totalMs: 0, failCount: 0 };
      item.count += 1;
      item.maxMs = Math.max(item.maxMs, Number(row.duration_ms) || 0);
      item.totalMs += Number(row.duration_ms) || 0;
      if (row.ok === false) item.failCount += 1;
      groups.set(path, item);
    });

    const rows = Array.from(groups.values())
      .map((item) => ({ ...item, avgMs: Math.round(item.totalMs / item.count) }))
      .sort((a, b) => b.maxMs - a.maxMs)
      .slice(0, 20);

    return apiSuccess({ days, totalSamples: (data || []).length, rows });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '查询慢接口失败'));
  }
}
