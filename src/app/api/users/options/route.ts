import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getUserDisplayName } from '@/lib/user-display-name';

/**
 * GET /api/users/options
 * 供「提交时选择下一级审批人」使用：返回启用中的用户（只含 id/姓名/角色）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('users')
      .select('id, username, name, role, is_disabled')
      .order('id', { ascending: true });
    if (error) throw new Error(error.message);

    const selfId = Number(auth.user.id);
    // 支持按角色过滤：?roles=project_manager 或 ?roles=boss,super_admin
    const roleParam = (new URL(request.url).searchParams.get('roles') || new URL(request.url).searchParams.get('role') || '').trim();
    const allowedRoles = roleParam ? roleParam.split(',').map((item) => item.trim()).filter(Boolean) : [];
    const options = (data || [])
      .filter((row: { is_disabled?: boolean | null; role?: string | null; id?: unknown }) =>
        row.is_disabled !== true
        && row.role !== 'pending'
        && Number(row.id) !== selfId
        && (allowedRoles.length === 0 || allowedRoles.includes(String(row.role || ''))),
      )
      .map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        name: getUserDisplayName({
          id: Number(row.id),
          name: (row.name as string | null) || '',
          username: (row.username as string | null) || '',
        }),
        role: String(row.role || ''),
      }))
      .filter((row) => Number.isInteger(row.id) && row.id > 0);

    return apiSuccess({ options });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '获取用户列表失败'));
  }
}
