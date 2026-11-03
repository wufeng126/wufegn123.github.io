import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { generatePresignedUrl } from '@/lib/oss-storage';
import { auditLog } from '@/lib/audit-log';

/**
 * /api/vouchers/[id]
 * GET   查看凭证（返回每页签名链接，1 小时有效）
 * PATCH 状态流转：confirm（项目经理核对）| approve（老板审批）| void（作废）
 */

async function loadVoucher(id: number) {
  const client = getSupabaseClient();
  const { data: voucher } = await client
    .from('monthly_vouchers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return { client, voucher };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const voucherId = Number(id);
    if (!Number.isInteger(voucherId) || voucherId <= 0) return apiBadRequest('参数不正确');

    const { client, voucher } = await loadVoucher(voucherId);
    if (!voucher) return apiNotFound('凭证不存在');

    const scope = await getAccessibleProjectIds(client, auth.user);
    if (scope !== null && !scope.includes(Number(voucher.project_id))) return apiForbidden('无权查看该凭证');

    const { data: files } = await client
      .from('monthly_voucher_files')
      .select('id, file_key, file_name, content_type, page_index')
      .eq('voucher_id', voucherId)
      .order('page_index', { ascending: true });

    const pages = [];
    for (const file of files || []) {
      let url = '';
      try {
        url = await generatePresignedUrl({ key: String(file.file_key), expireTime: 3600 });
      } catch {
        url = '';
      }
      pages.push({ ...file, url });
    }

    return apiSuccess({ voucher, pages });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '查看凭证失败'));
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const voucherId = Number(id);
    if (!Number.isInteger(voucherId) || voucherId <= 0) return apiBadRequest('参数不正确');

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '');

    const { client, voucher } = await loadVoucher(voucherId);
    if (!voucher) return apiNotFound('凭证不存在');
    if (String(voucher.status) === 'voided') return apiBadRequest('凭证已作废');

    const scope = await getAccessibleProjectIds(client, auth.user);
    if (scope !== null && !scope.includes(Number(voucher.project_id))) return apiForbidden('无权操作该凭证');

    const userId = Number(auth.user.id);
    const userName = String(auth.user.name || auth.user.username || '');
    const isBoss = Boolean(auth.user.is_super_admin) || String(auth.user.role || '') === 'boss';
    const isAdmin = Boolean(auth.user.is_super_admin) || String(auth.user.role || '') === 'admin';

    const { data: project } = await client
      .from('projects')
      .select('id, name, manager_user_id')
      .eq('id', Number(voucher.project_id))
      .maybeSingle();
    const isProjectManager = Number(project?.manager_user_id || 0) === userId;

    const now = new Date().toISOString();

    if (action === 'confirm') {
      if (!(isAdmin || isBoss || isProjectManager)) return apiForbidden('只有项目经理或管理层可以核对');
      if (String(voucher.status) !== 'uploaded') return apiBadRequest('当前状态不能核对');
      await client.from('monthly_vouchers').update({
        status: 'confirmed', confirmed_by: userId, confirmed_by_name: userName,
        confirmed_at: now, updated_at: now,
      }).eq('id', voucherId);
    } else if (action === 'approve') {
      if (!isBoss) return apiForbidden('只有老板/超管可以审批');
      if (String(voucher.status) !== 'confirmed') return apiBadRequest('需项目经理先核对');
      await client.from('monthly_vouchers').update({
        status: 'approved', approved_by: userId, approved_by_name: userName,
        approved_at: now, updated_at: now,
      }).eq('id', voucherId);
    } else if (action === 'void') {
      if (!(isAdmin || isBoss || Number(voucher.uploaded_by) === userId)) return apiForbidden('无权作废');
      await client.from('monthly_vouchers').update({
        status: 'voided', voided_by: userId, voided_by_name: userName, voided_at: now,
        void_reason: String(body?.reason || '').trim() || null, updated_at: now,
      }).eq('id', voucherId);
    } else {
      return apiBadRequest('不支持的操作');
    }

    await auditLog({
      operationType: 'update',
      resourceType: 'monthly_voucher',
      resourceId: voucherId,
      details: { action, projectId: voucher.project_id, yearMonth: voucher.year_month, docType: voucher.doc_type },
      request,
    });

    return apiSuccess({ id: voucherId, action });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '操作凭证失败'));
  }
}
