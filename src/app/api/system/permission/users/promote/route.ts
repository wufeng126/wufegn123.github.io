import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requirePermission } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { auditLog } from '@/lib/audit-log';

/**
 * POST /api/system/permission/users/promote
 * body: { user_id: number, enabled: boolean }
 *
 * 直接把账号设为 / 取消超级管理员（users.role = 'super_admin'）。
 * 不依赖 roles 表里是否存在“超级管理员”这一行（内置角色可能不在 roles 表）。
 *
 * 权限：当前是超管；或数据库里还没有任何超管时允许首次引导。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'system:permission_manage');
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const targetId = Number(body?.user_id);
    const enabled = body?.enabled !== false;
    if (!Number.isInteger(targetId) || targetId <= 0) return apiBadRequest('用户ID不正确');

    const supabase = getSupabaseClient();

    let allow = Boolean(auth.user.is_super_admin);
    if (!allow) {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'super_admin');
      allow = (count || 0) === 0; // 首次引导
    }
    if (!allow) return apiForbidden('只有超级管理员可以设置超级管理员');

    const { data: target } = await supabase
      .from('users')
      .select('id, username, name, role')
      .eq('id', targetId)
      .maybeSingle();
    if (!target) return apiNotFound('用户不存在');

    // 取消超管时，不能把最后一个超管降级（避免无人可管理）
    if (!enabled) {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'super_admin');
      if ((count || 0) <= 1) return apiBadRequest('不能取消最后一个超级管理员');
    }

    const { error } = await supabase
      .from('users')
      .update({
        role: enabled ? 'super_admin' : 'admin',
        is_disabled: false,
      })
      .eq('id', targetId);
    if (error) throw new Error(error.message);

    await auditLog({
      operationType: 'assign',
      resourceType: 'user',
      resourceId: targetId,
      details: { action: enabled ? 'promote_super_admin' : 'demote_super_admin', target: target.username },
      request,
    });

    return apiSuccess({
      user_id: targetId,
      role: enabled ? 'super_admin' : 'admin',
      message: enabled ? '已设为超级管理员（60 秒内生效）' : '已取消超级管理员',
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '设置超级管理员失败'));
  }
}
