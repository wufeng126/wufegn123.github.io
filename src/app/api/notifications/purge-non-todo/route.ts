import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getNotificationRouteRule } from '@/lib/notification-routing';
import { fetchAllRows } from '@/lib/fetch-all-rows';

/**
 * POST /api/notifications/purge-non-todo
 * 只保留「待办」类通知，其余（预警/风险/结果/抄送/未分类）全部删除。
 * 仅超级管理员可执行；返回删除数量。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;
    if (!auth.user.is_super_admin && String(auth.user.role || '') !== 'admin') {
      return apiForbidden('只有管理员可以清理通知');
    }

    const client = getSupabaseClient();
    const rows = await fetchAllRows<{ id: number; type?: string | null }>((from, to) =>
      client.from('notifications').select('id, type').order('id', { ascending: true }).range(from, to));

    const removableIds: number[] = [];
    rows.forEach((row) => {
      const type = String(row.type || '');
      const category = getNotificationRouteRule(type)?.category;
      if (category !== 'todo') removableIds.push(Number(row.id));
    });

    let deleted = 0;
    for (let i = 0; i < removableIds.length; i += 200) {
      const chunk = removableIds.slice(i, i + 200);
      const { error } = await client.from('notifications').delete().in('id', chunk);
      if (error) throw new Error(error.message);
      deleted += chunk.length;
    }

    return apiSuccess({ deleted, kept: rows.length - deleted, total: rows.length });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '清理通知失败'));
  }
}
