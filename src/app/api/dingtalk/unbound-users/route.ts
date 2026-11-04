import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';

/**
 * GET /api/dingtalk/unbound-users
 * 列出未绑定钉钉（dingtalk_user_id 为空）或已停用钉钉的账号，用于排查“系统有提示但钉钉没推送”。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('users')
      .select('id, name, username, role, dingtalk_user_id, dingtalk_active, is_disabled')
      .or('dingtalk_user_id.is.null,dingtalk_user_id.eq.,dingtalk_active.eq.false')
      .order('id', { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);

    return apiSuccess({
      users: (data || []).map((user: Record<string, unknown>) => ({
        id: Number(user.id),
        name: String(user.name || user.username || ''),
        username: String(user.username || ''),
        role: String(user.role || ''),
        disabled: Boolean(user.is_disabled),
      })),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '查询未绑定钉钉账号失败'));
  }
}
