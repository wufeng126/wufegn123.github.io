import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

const FOLLOW_STATUS_OPTIONS = ['未处理', '待补资料', '跟进中', '已形成签证', '已进入结算', '已关闭'];
const SETTLEMENT_METHOD_OPTIONS = ['按签证结算', '计入下期进度结算', '单独协议结算', '现金支付', '抵账扣款'];

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toNumberOrNull(value: unknown) {
  if (value === '' || value === undefined || value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('settlement_evidence_follow_ups') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

async function assertProjectAccess(
  supabase: ReturnType<typeof getSupabaseClient>,
  user: Parameters<typeof getAccessibleProjectIds>[1],
  projectId: number,
) {
  const accessibleProjectIds = await getAccessibleProjectIds(supabase, user);
  if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(projectId)) {
    return false;
  }
  return true;
}

// GET /api/evidence-chain/follow-ups?evidenceId=xx
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const evidenceId = parseId(request.nextUrl.searchParams.get('evidenceId'));
    if (!evidenceId) return apiBadRequest('缺少证据记录ID');

    const supabase = getSupabaseClient();

    const { data: evidence, error: evidenceError } = await supabase
      .from('settlement_evidence_records')
      .select('id, project_id')
      .eq('id', evidenceId)
      .maybeSingle();
    if (evidenceError) {
      if (isMissingTableError(evidenceError)) return apiSuccess({ follow_ups: [] });
      throw new Error(evidenceError.message);
    }
    if (!evidence) return apiSuccess({ follow_ups: [] });

    const hasAccess = await assertProjectAccess(supabase, auth.user, Number(evidence.project_id));
    if (!hasAccess) return apiForbidden('无权查看该证据跟进记录');

    const { data, error } = await supabase
      .from('settlement_evidence_follow_ups')
      .select('*')
      .eq('evidence_id', evidenceId)
      .order('follow_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingTableError(error)) return apiSuccess({ follow_ups: [] });
      throw new Error(error.message);
    }

    return apiSuccess({ follow_ups: data || [] });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '跟进记录加载失败'));
  }
}

// POST /api/evidence-chain/follow-ups
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const evidenceId = parseId(body?.evidence_id);
    if (!evidenceId) return apiBadRequest('缺少证据记录ID');

    const followDate = String(body?.follow_date || '').trim() || new Date().toISOString().slice(0, 10);
    const content = String(body?.content || '').trim();
    const followStatus = String(body?.follow_status || '').trim() || '跟进中';
    if (!FOLLOW_STATUS_OPTIONS.includes(followStatus)) {
      return apiBadRequest(`无效的跟进状态：${followStatus}`);
    }
    const settlementMethodRaw = String(body?.settlement_method || '').trim();
    const settlementMethod = settlementMethodRaw
      ? SETTLEMENT_METHOD_OPTIONS.includes(settlementMethodRaw)
        ? settlementMethodRaw
        : (() => {
            throw new Error(`无效的结算方式：${settlementMethodRaw}`);
          })()
      : null;

    const confirmedQuantity = toNumberOrNull(body?.confirmed_quantity);
    const quantityUnit = String(body?.quantity_unit || '').trim() || null;
    const confirmedAmount = toNumberOrNull(body?.confirmed_amount);

    const supabase = getSupabaseClient();

    const { data: evidence, error: evidenceError } = await supabase
      .from('settlement_evidence_records')
      .select('id, project_id')
      .eq('id', evidenceId)
      .maybeSingle();
    if (evidenceError) throw new Error(evidenceError.message);
    if (!evidence) return apiBadRequest('证据记录不存在');

    const projectId = Number(evidence.project_id);
    const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
    if (!hasAccess) return apiForbidden('无权维护该证据跟进记录');

    const { data: inserted, error: insertError } = await supabase
      .from('settlement_evidence_follow_ups')
      .insert({
        evidence_id: evidenceId,
        project_id: projectId,
        follow_date: followDate,
        content,
        follow_status: followStatus,
        confirmed_quantity: confirmedQuantity,
        quantity_unit: quantityUnit,
        confirmed_amount: confirmedAmount,
        settlement_method: settlementMethod,
        created_by: auth.user.id,
        created_by_name: auth.user.name || auth.user.username,
      })
      .select('*')
      .maybeSingle();
    if (insertError) throw new Error(insertError.message);

    // 跟进后同步证据主状态
    const { error: updateError } = await supabase
      .from('settlement_evidence_records')
      .update({ follow_status: followStatus, updated_at: new Date().toISOString() })
      .eq('id', evidenceId);
    if (updateError) throw new Error(updateError.message);

    await auditLog({
      operationType: 'create',
      resourceType: 'settlement_evidence_follow_up',
      resourceId: Number(inserted?.id || 0),
      details: {
        evidence_id: evidenceId,
        project_id: projectId,
        follow_status: followStatus,
        confirmed_amount: confirmedAmount,
      },
      request,
    });

    return apiSuccess({ follow_up: inserted });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '跟进记录保存失败'));
  }
}

// DELETE /api/evidence-chain/follow-ups?id=xx
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const id = parseId(request.nextUrl.searchParams.get('id'));
    if (!id) return apiBadRequest('缺少跟进记录ID');

    const supabase = getSupabaseClient();

    const { data: existing, error: findError } = await supabase
      .from('settlement_evidence_follow_ups')
      .select('id, evidence_id, project_id')
      .eq('id', id)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!existing) return apiBadRequest('跟进记录不存在');

    const hasAccess = await assertProjectAccess(supabase, auth.user, Number(existing.project_id));
    if (!hasAccess) return apiForbidden('无权删除该跟进记录');

    const { error: deleteError } = await supabase
      .from('settlement_evidence_follow_ups')
      .delete()
      .eq('id', id);
    if (deleteError) throw new Error(deleteError.message);

    // 主状态回退到剩余跟进的最新状态；无跟进则回到"未处理"
    const { data: latest } = await supabase
      .from('settlement_evidence_follow_ups')
      .select('follow_status')
      .eq('evidence_id', existing.evidence_id)
      .order('follow_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase
      .from('settlement_evidence_records')
      .update({
        follow_status: latest?.follow_status || '未处理',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.evidence_id);

    await auditLog({
      operationType: 'delete',
      resourceType: 'settlement_evidence_follow_up',
      resourceId: id,
      details: { evidence_id: existing.evidence_id, project_id: existing.project_id },
      request,
    });

    return apiSuccess({ success: true });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '跟进记录删除失败'));
  }
}
