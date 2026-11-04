import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth, requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { uploadFileAtKey } from '@/lib/oss-storage';
import { auditLog } from '@/lib/audit-log';
import { fetchAllRows } from '@/lib/fetch-all-rows';

/**
 * 月度凭证（结算单 / 考勤表）
 * GET  /api/vouchers?project_id=&month=&type=   列表（按项目范围过滤）
 * POST /api/vouchers                            上传（multipart：files + project_id + year_month + doc_type）
 *
 * 说明：只存原件与状态，不存人员明细（工资表才是主数据）。
 */

const DOC_TYPES = new Set(['settlement', 'attendance']);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function normalizeMonth(value: unknown) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = Number(searchParams.get('project_id')) || 0;
    const month = normalizeMonth(searchParams.get('month'));
    const docType = String(searchParams.get('type') || '');
    const scope = await getAccessibleProjectIds(client, auth.user);

    let query = client
      .from('monthly_vouchers')
      .select('id, project_id, year_month, doc_type, page_count, amount_total, remark, status, uploaded_by_name, confirmed_by_name, confirmed_at, approved_by_name, approved_at, void_reason, created_at')
      .neq('status', 'voided')
      .order('year_month', { ascending: false })
      .order('id', { ascending: false });

    if (projectId > 0) query = query.eq('project_id', projectId);
    else if (scope !== null) {
      if (scope.length === 0) return apiSuccess({ vouchers: [] });
      query = query.in('project_id', scope);
    }
    if (month) query = query.eq('year_month', month);
    if (DOC_TYPES.has(docType)) query = query.eq('doc_type', docType);

    const { data, error } = await query.limit(500);
    if (error) throw new Error(error.message);

    const rows = data || [];
    const projectIds = Array.from(new Set(rows.map((row: { project_id?: unknown }) => Number(row.project_id))));
    const projectMap = new Map<number, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await client.from('projects').select('id, name').in('id', projectIds);
      (projects || []).forEach((project: { id?: unknown; name?: unknown }) => {
        projectMap.set(Number(project.id), String(project.name || ''));
      });
    }

    // 附带每份凭证的首页文件 id（用于列表缩略图）
    const voucherIds = rows.map((row: Record<string, unknown>) => Number(row.id)).filter(Boolean);
    const firstFileMap = new Map<number, number>();
    if (voucherIds.length > 0) {
      const { data: files } = await client
        .from('monthly_voucher_files')
        .select('id, voucher_id, page_index')
        .in('voucher_id', voucherIds)
        .order('page_index', { ascending: true });
      (files || []).forEach((file: { id?: unknown; voucher_id?: unknown }) => {
        const voucherId = Number(file.voucher_id);
        if (!firstFileMap.has(voucherId)) firstFileMap.set(voucherId, Number(file.id));
      });
    }

    return apiSuccess({
      vouchers: rows.map((row: Record<string, unknown>) => ({
        ...row,
        project_name: projectMap.get(Number(row.project_id)) || `项目#${row.project_id}`,
        first_file_id: firstFileMap.get(Number(row.id)) || null,
      })),
    });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '查询凭证失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const form = await request.formData();
    const projectId = Number(form.get('project_id'));
    const yearMonth = normalizeMonth(form.get('year_month'));
    const docType = String(form.get('doc_type') || '');
    const amountTotalRaw = String(form.get('amount_total') || '').trim();
    const remark = String(form.get('remark') || '').trim();
    const replace = String(form.get('replace') || '') === '1';
    const files = form.getAll('files').filter((item): item is File => item instanceof File);

    if (!Number.isInteger(projectId) || projectId <= 0) return apiBadRequest('请选择项目');
    if (!yearMonth) return apiBadRequest('请选择月份（YYYY-MM）');
    if (!DOC_TYPES.has(docType)) return apiBadRequest('类型只能是结算单或考勤表');
    if (files.length === 0) return apiBadRequest('请上传至少一页文件');
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) return apiBadRequest(`文件过大（>20MB）：${file.name}`);
    }

    const client = getSupabaseClient();

    // 项目范围校验
    const scope = await getAccessibleProjectIds(client, auth.user);
    if (scope !== null && !scope.includes(projectId)) return apiForbidden('无权上传该项目的凭证');

    // 同一项目+月份+类型 只允许一份（未作废）
    const { data: existing } = await client
      .from('monthly_vouchers')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('year_month', yearMonth)
      .eq('doc_type', docType)
      .neq('status', 'voided')
      .maybeSingle();

    if (existing && !replace) {
      return apiBadRequest('该项目本月已有同类凭证，如需替换请勾选"替换原凭证"');
    }
    if (existing && replace) {
      await client.from('monthly_vouchers').update({
        status: 'voided',
        voided_by: Number(auth.user.id),
        voided_by_name: String(auth.user.name || auth.user.username || ''),
        voided_at: new Date().toISOString(),
        void_reason: '替换重传',
        updated_at: new Date().toISOString(),
      }).eq('id', Number(existing.id));
      await client.from('monthly_voucher_files').delete().eq('voucher_id', Number(existing.id));
    }

    const amountTotal = amountTotalRaw === '' ? null : Number(amountTotalRaw);
    if (amountTotal !== null && !Number.isFinite(amountTotal)) return apiBadRequest('分账合计格式不正确');

    const { data: voucher, error: insertError } = await client
      .from('monthly_vouchers')
      .insert({
        project_id: projectId,
        year_month: yearMonth,
        doc_type: docType,
        page_count: files.length,
        amount_total: amountTotal,
        remark: remark || null,
        status: 'uploaded',
        uploaded_by: Number(auth.user.id),
        uploaded_by_name: String(auth.user.name || auth.user.username || ''),
      })
      .select('id')
      .single();

    if (insertError) throw new Error(insertError.message);
    const voucherId = Number(voucher.id);

    const fileRows: Array<Record<string, unknown>> = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = (file.name.split('.').pop() || (file.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
      const key = `vouchers/${projectId}/${yearMonth}/${docType}/${voucherId}-${String(index + 1).padStart(2, '0')}-${Date.now()}.${ext}`;
      await uploadFileAtKey({ key, buffer, contentType: file.type || 'application/octet-stream' });
      fileRows.push({
        voucher_id: voucherId,
        file_key: key,
        file_name: file.name,
        content_type: file.type || null,
        page_index: index + 1,
        size_bytes: buffer.length,
      });
    }

    const { error: fileError } = await client.from('monthly_voucher_files').insert(fileRows);
    if (fileError) throw new Error(fileError.message);

    await auditLog({
      operationType: 'create',
      resourceType: 'monthly_voucher',
      resourceId: voucherId,
      details: { projectId, yearMonth, docType, pages: files.length, replaced: Boolean(existing) },
      request,
    });

    return NextResponse.json({ success: true, data: { id: voucherId, pages: files.length } });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '上传凭证失败'));
  }
}
