import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { auditLog } from '@/lib/audit-log';

/**
 * GET  /api/system/bootstrap-promote  查询当前库里是否还有超级管理员
 * POST /api/system/bootstrap-promote  仅在「一个超级管理员都没有」时，把当前登录账号设为超管（自救入口）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin');

    return apiSuccess({
      superAdminCount: count || 0,
      canBootstrap: (count || 0) === 0,
      me: { id: auth.user.id, role: auth.user.role, isSuperAdmin: Boolean(auth.user.is_super_admin) },
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '查询超管状态失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin');

    if ((count || 0) > 0) {
      return apiForbidden('系统里已有超级管理员，请由现有超管在「用户分配」里授权');
    }

    const userId = Number(auth.user.id);
    const { error } = await supabase
      .from('users')
      .update({ role: 'super_admin', is_disabled: false })
      .eq('id', userId);
    if (error) throw new Error(error.message);

    await auditLog({
      operationType: 'assign',
      resourceType: 'user',
      resourceId: userId,
      details: { action: 'bootstrap_super_admin', reason: '库里无超管时的自救提升' },
      request,
    });

    return apiSuccess({ userId, role: 'super_admin', message: '已将自己设为超级管理员（60 秒内生效）' });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '设置超级管理员失败'));
  }
}
