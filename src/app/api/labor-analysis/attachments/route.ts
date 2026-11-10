import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth, requireApiWritePermission } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiNotFound, apiServerError, apiSuccess, getErrorMessage } from '@/lib/api-utils';
import { getAccessibleProjectIds } from '@/lib/api-project-access';
import { uploadFileAtKey } from '@/lib/oss-storage';
import { auditLog } from '@/lib/audit-log';
import { isMaterialWarehouseProjectId } from '@/lib/material-warehouse-project';

/**
 * 月度用工分析附件
 * GET    /api/labor-analysis/attachments?project_id=1&month=2026-11   列表
 * POST   /api/labor-analysis/attachments                            上传（multipart: project_id, month, files[]）
 * DELETE /api/labor-analysis/attachments?id=9                       删除
 */

const MAX_FILE_BYTES = 20 * 1024 * 1024;

async function getOrCreateAnalysisId(
  client: ReturnType<typeof getSupabaseClient>,
  projectId: number,
  month: string,
  userId: number,
  userName: string,
) {
  const { data: existing } = await client
    .from('monthly_labor_analyses')
    .select('id')
    .eq('project_id', projectId)
    .eq('year_month', month)
    .maybeSingle();
  if (existing) return Number(existing.id);

  const { data: created, error } = await client
    .from('monthly_labor_analyses')
    .insert({
      project_id: projectId,
      year_month: month,
      status: 'draft',
      total_hours: 0,
      total_amount: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return Number(created.id);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = Number(searchParams.get('project_id')) || 0;
    const month = String(searchParams.get('month') || '').trim();
    if (!projectId || !/^\d{4}-\d{2}$/.test(month)) return apiBadRequest('请提供项目与月份');

    const scope = await getAccessibleProjectIds(client, auth.user);
    if (scope !== null && !scope.includes(projectId)) return apiForbidden('无权查看该项目');

    const { data: analysis } = await client
      .from('monthly_labor_analyses')
      .select('id')
      .eq('project_id', projectId)
      .eq('year_month', month)
      .maybeSingle();
    if (!analysis) return apiSuccess({ attachments: [] });

    const { data: rows } = await client
      .from('monthly_labor_attachments')
      .select('id, file_name, content_type, size_bytes, uploaded_by_name, created_at')
      .eq('analysis_id', Number(analysis.id))
      .order('id', { ascending: true });

    return apiSuccess({ attachments: rows || [] });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '加载附件失败'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const form = await request.formData();
    const projectId = Number(form.get('project_id'));
    const month = String(form.get('month') || '').trim();
    const files = form.getAll('files').filter((item): item is File => item instanceof File);
    if (!projectId || !/^\d{4}-\d{2}$/.test(month)) return apiBadRequest('请提供项目与月份');
    if (files.length === 0) return apiBadRequest('请选择要上传的文件');
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) return apiBadRequest(`文件过大（>20MB）：${file.name}`);
    }

    const client = getSupabaseClient();
    const scope = await getAccessibleProjectIds(client, auth.user);
    if (scope !== null && !scope.includes(projectId)) return apiForbidden('无权上传该项目的附件');
    if (await isMaterialWarehouseProjectId(client, projectId)) return apiBadRequest('「库房」项目只允许在零星材料模块使用');

    const analysisId = await getOrCreateAnalysisId(
      client,
      projectId,
      month,
      Number(auth.user.id) || 0,
      String(auth.user.name || auth.user.username || ''),
    );

    const rows: Array<Record<string, unknown>> = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = (file.name.split('.').pop() || (file.type.includes('pdf') ? 'pdf' : 'jpg')).toLowerCase();
      const key = `labor-attachments/${projectId}/${month}/${analysisId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await uploadFileAtKey({ key, buffer, contentType: file.type || 'application/octet-stream' });
      rows.push({
        analysis_id: analysisId,
        file_key: key,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: buffer.length,
        uploaded_by: Number(auth.user.id) || null,
        uploaded_by_name: String(auth.user.name || auth.user.username || ''),
      });
    }

    const { error } = await client.from('monthly_labor_attachments').insert(rows);
    if (error) throw new Error(error.message);

    await auditLog({
      operationType: 'create',
      resourceType: 'monthly_labor_attachment',
      resourceId: analysisId,
      details: { projectId, month, count: rows.length },
      request,
    });

    return apiSuccess({ analysisId, count: rows.length });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '上传附件失败'));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiWritePermission(request);
    if (!auth.ok) return auth.response;

    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return apiBadRequest('参数不正确');

    const client = getSupabaseClient();
    const { data: row } = await client
      .from('monthly_labor_attachments')
      .select('id, analysis_id, monthly_labor_analyses(project_id)')
      .eq('id', id)
      .maybeSingle();
    if (!row) return apiNotFound('附件不存在');

    const relation = (row as { monthly_labor_analyses?: { project_id?: number } | Array<{ project_id?: number }> }).monthly_labor_analyses;
    const projectId = Number(Array.isArray(relation) ? relation[0]?.project_id : relation?.project_id) || 0;
    const scope = await getAccessibleProjectIds(client, auth.user);
    if (scope !== null && projectId && !scope.includes(projectId)) return apiForbidden('无权删除该附件');

    const { error } = await client.from('monthly_labor_attachments').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return apiSuccess({ id });
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '删除附件失败'));
  }
}
