import { NextRequest } from 'next/server';
import { OSSStorage } from '@/lib/oss-storage';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { auditLog, insertWithSequenceFix } from '@/lib/audit-log';
import { requireApiWritePermission, requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';

type EvidenceInput = {
  id?: number | string;
  project_id?: number | string;
  event_date?: string;
  title?: string;
  evidence_type?: string;
  source?: string;
  importance?: string;
  follow_status?: string;
  handling_result?: string;
  linked_visa_id?: number | string | null;
  linked_visa_number?: string;
  handling_note?: string;
  amount_direction?: string;
  estimated_amount?: number | string | null;
  summary?: string;
  attachments?: unknown;
  related?: unknown;
  tags?: unknown;
  owner_user_id?: number | string | null;
  owner_name?: string;
};

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toNumberOrNull(value: unknown) {
  if (value === '' || value === undefined || value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeJsonList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value)
    .split(/\r?\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAttachments(value: unknown) {
  if (!value) return [];
  const rawList = Array.isArray(value) ? value : normalizeJsonList(value);
  return rawList
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') return item.trim();
      if (typeof item !== 'object') return null;
      const attachment = item as Record<string, unknown>;
      const name = String(attachment.name || '').trim();
      const storageKey = String(attachment.storageKey || attachment.key || '').trim();
      if (!name && !storageKey) return null;
      return {
        name: name || storageKey,
        size: toNumberOrNull(attachment.size),
        type: String(attachment.type || '').trim() || 'application/octet-stream',
        storageKey,
        uploadedAt: String(attachment.uploadedAt || '').trim() || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function createStorage() {
  return new OSSStorage();
}

async function attachSignedUrls(attachments: unknown) {
  if (!Array.isArray(attachments)) return [];
  const hasStoredFile = attachments.some((item) => (
    item
    && typeof item === 'object'
    && String((item as Record<string, unknown>).storageKey || (item as Record<string, unknown>).key || '').trim()
  ));
  if (!hasStoredFile) return attachments;

  const storage = createStorage();
  return Promise.all(attachments.map(async (item) => {
    if (!item || typeof item !== 'object') return item;
    const attachment = item as Record<string, unknown>;
    const key = String(attachment.storageKey || attachment.key || '').trim();
    if (!key) return item;
    try {
      const url = await storage.generatePresignedUrl({ key, expireTime: 3600 });
      return { ...attachment, storageKey: key, url };
    } catch (error) {
      console.warn('[evidence-chain] attachment url sign failed', error);
      return { ...attachment, storageKey: key };
    }
  }));
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('settlement_evidence_records') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

async function assertProjectAccess(
  supabase: ReturnType<typeof getSupabaseClient>,
  user: Parameters<typeof getAccessibleProjectIds>[1],
  projectId: number
) {
  const accessibleProjectIds = await getAccessibleProjectIds(supabase, user);
  if (Array.isArray(accessibleProjectIds) && !accessibleProjectIds.includes(projectId)) {
    return false;
  }
  return true;
}

async function assertLinkedVisa(
  supabase: ReturnType<typeof getSupabaseClient>,
  linkedVisaId: number | null,
  projectId: number
) {
  if (!linkedVisaId) return { ok: true as const, visaNumber: null };

  const { data, error } = await supabase
    .from('visas')
    .select('id, project_id, visa_number')
    .eq('id', linkedVisaId)
    .single();

  if (error || !data) return { ok: false as const, error: '关联的签证单不存在' };
  if (Number(data.project_id) !== projectId) return { ok: false as const, error: '关联签证单必须属于同一个项目' };
  return { ok: true as const, visaNumber: String(data.visa_number || '') || null };
}

function normalizePayload(body: EvidenceInput, user: { id: number; name?: string; username?: string }) {
  const projectId = parseId(body.project_id);
  const title = String(body.title || '').trim();
  const eventDate = String(body.event_date || '').trim();
  const handlingResult = String(body.handling_result || '待判断').trim() || '待判断';
  const linkedVisaId = handlingResult === '走签证' ? parseId(body.linked_visa_id) : null;

  if (!projectId) return { error: '请选择所属项目' as const };
  if (!eventDate) return { error: '请选择事件日期' as const };
  if (!title) return { error: '请填写证据标题' as const };

  return {
    data: {
      project_id: projectId,
      event_date: eventDate,
      title,
      evidence_type: String(body.evidence_type || '甲方回复').trim(),
      source: String(body.source || '').trim() || null,
      importance: String(body.importance || '重点关注').trim(),
      follow_status: String(body.follow_status || '未处理').trim(),
      handling_result: handlingResult,
      linked_visa_id: linkedVisaId,
      linked_visa_number: linkedVisaId ? String(body.linked_visa_number || '').trim() || null : null,
      handling_note: String(body.handling_note || '').trim() || null,
      amount_direction: String(body.amount_direction || '仅留痕/暂不确定').trim(),
      estimated_amount: toNumberOrNull(body.estimated_amount),
      summary: String(body.summary || '').trim() || null,
      attachments: normalizeAttachments(body.attachments),
      related: normalizeJsonList(body.related),
      tags: normalizeJsonList(body.tags),
      owner_user_id: parseId(body.owner_user_id),
      owner_name: String(body.owner_name || '').trim() || user.name || user.username || null,
      updated_at: new Date().toISOString(),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseClient();
    const projectId = parseId(request.nextUrl.searchParams.get('projectId'));
    const keyword = String(request.nextUrl.searchParams.get('keyword') || '').trim();
    const evidenceType = String(request.nextUrl.searchParams.get('type') || '').trim();
    const followStatus = String(request.nextUrl.searchParams.get('status') || '').trim();

    if (projectId) {
      const hasAccess = await assertProjectAccess(supabase, auth.user, projectId);
      if (!hasAccess) return apiForbidden('无权查看该项目结算证据链');
    }

    const accessibleProjectIds = await getAccessibleProjectIds(supabase, auth.user);
    if (!projectId && Array.isArray(accessibleProjectIds) && accessibleProjectIds.length === 0) {
      return apiSuccess({ records: [], summary: { count: 0, risk_count: 0, required_count: 0, estimated_amount: 0 } });
    }

    let query = supabase
      .from('settlement_evidence_records')
      .select('*, projects(name)')
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    else if (Array.isArray(accessibleProjectIds)) query = query.in('project_id', accessibleProjectIds);
    if (evidenceType && evidenceType !== 'all') query = query.eq('evidence_type', evidenceType);
    if (followStatus && followStatus !== 'all') query = query.eq('follow_status', followStatus);
    if (keyword) {
      query = query.or(`title.ilike.%${keyword}%,summary.ilike.%${keyword}%,source.ilike.%${keyword}%,owner_name.ilike.%${keyword}%`);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) {
        return apiSuccess({
          records: [],
          summary: { count: 0, risk_count: 0, required_count: 0, estimated_amount: 0 },
          needs_migration: true,
        });
      }
      throw new Error(error.message);
    }

    const records = await Promise.all((data || []).map(async (record: any) => ({
      ...record,
      project_name: record.projects?.name || '',
      attachments: await attachSignedUrls(record.attachments),
      related: Array.isArray(record.related) ? record.related : [],
      tags: Array.isArray(record.tags) ? record.tags : [],
    })));

    return apiSuccess({
      records,
      summary: {
        count: records.length,
        risk_count: records.filter((record) => record.importance === '争议风险').length,
        required_count: records.filter((record) => record.importance === '必须结算').length,
        estimated_amount: records.reduce((sum, record) => sum + (Number(record.estimated_amount) || 0), 0),
      },
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '结算证据链加载失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const normalized = normalizePayload(body, auth.user);
    if ('error' in normalized) return apiBadRequest(normalized.error);

    const supabase = getSupabaseClient();
    const hasAccess = await assertProjectAccess(supabase, auth.user, normalized.data.project_id);
    if (!hasAccess) return apiForbidden('无权维护该项目结算证据链');
    const linkedVisa = await assertLinkedVisa(supabase, normalized.data.linked_visa_id, normalized.data.project_id);
    if (!linkedVisa.ok) return apiBadRequest(linkedVisa.error);
    if (linkedVisa.visaNumber) normalized.data.linked_visa_number = linkedVisa.visaNumber;

    const { data, error } = await insertWithSequenceFix('settlement_evidence_records', {
      ...normalized.data,
      created_by: auth.user.id,
      created_by_name: auth.user.name || auth.user.username,
    }, supabase);
    if (error) throw new Error(error.message);

    const record = Array.isArray(data) ? data[0] : data;
    await auditLog({
      operationType: 'create',
      resourceType: 'settlement_evidence',
      resourceId: Number(record?.id || 0),
      details: { project_id: normalized.data.project_id, title: normalized.data.title },
      request,
    });

    return apiSuccess({ record });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '结算证据保存失败'));
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const id = parseId(body?.id);
    if (!id) return apiBadRequest('缺少证据记录ID');

    const normalized = normalizePayload(body, auth.user);
    if ('error' in normalized) return apiBadRequest(normalized.error);

    const supabase = getSupabaseClient();
    const hasAccess = await assertProjectAccess(supabase, auth.user, normalized.data.project_id);
    if (!hasAccess) return apiForbidden('无权维护该项目结算证据链');
    const linkedVisa = await assertLinkedVisa(supabase, normalized.data.linked_visa_id, normalized.data.project_id);
    if (!linkedVisa.ok) return apiBadRequest(linkedVisa.error);
    if (linkedVisa.visaNumber) normalized.data.linked_visa_number = linkedVisa.visaNumber;

    const { data, error } = await supabase
      .from('settlement_evidence_records')
      .update(normalized.data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await auditLog({
      operationType: 'update',
      resourceType: 'settlement_evidence',
      resourceId: id,
      details: { project_id: normalized.data.project_id, title: normalized.data.title },
      request,
    });

    return apiSuccess({ record: data });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '结算证据更新失败'));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const id = parseId(request.nextUrl.searchParams.get('id'));
    if (!id) return apiBadRequest('缺少证据记录ID');

    const supabase = getSupabaseClient();
    const { data: record, error: recordError } = await supabase
      .from('settlement_evidence_records')
      .select('id,project_id,title')
      .eq('id', id)
      .single();
    if (recordError) throw new Error(recordError.message);

    const hasAccess = await assertProjectAccess(supabase, auth.user, Number(record.project_id));
    if (!hasAccess) return apiForbidden('无权删除该项目结算证据');

    const { error } = await supabase
      .from('settlement_evidence_records')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);

    await auditLog({
      operationType: 'delete',
      resourceType: 'settlement_evidence',
      resourceId: id,
      details: { project_id: record.project_id, title: record.title },
      request,
    });

    return apiSuccess({ id });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '结算证据删除失败'));
  }
}
