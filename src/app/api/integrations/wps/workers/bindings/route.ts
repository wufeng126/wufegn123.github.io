import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError } from '@/lib/api-utils';
import { insertWithSequenceFix } from '@/lib/audit-log';
import { getSupabaseClient } from '@/storage/database/supabase-client';

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeDocumentUrl(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return text;
  }
}

async function requireSuperAdmin(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  if (!auth.user.is_super_admin) {
    return { ok: false as const, response: apiForbidden('只有超级管理员可以维护 WPS 同步配置') };
  }
  return auth;
}

function normalizeBindingPayload(body: Record<string, unknown>) {
  const projectId = Number(body.projectId ?? body.project_id);
  return {
    project_id: Number.isFinite(projectId) && projectId > 0 ? projectId : null,
    wps_project_name: cleanText(body.wpsProjectName ?? body.wps_project_name),
    worksheet_name: cleanText(body.worksheetName ?? body.worksheet_name),
    wps_document_url: normalizeDocumentUrl(body.wpsDocumentUrl ?? body.wps_document_url ?? body.documentUrl ?? body.document_url),
    wps_form_id: cleanText(body.wpsFormId ?? body.wps_form_id),
    wps_sheet_id: cleanText(body.wpsSheetId ?? body.wps_sheet_id),
    wps_table_id: cleanText(body.wpsTableId ?? body.wps_table_id),
    is_active: body.isActive ?? body.is_active ?? true,
    remark: cleanText(body.remark),
    updated_at: new Date().toISOString(),
  };
}

function validateBinding(data: ReturnType<typeof normalizeBindingPayload>) {
  if (!data.project_id) return '请选择系统项目';
  if (!data.wps_project_name && !data.worksheet_name && !data.wps_document_url && !data.wps_form_id && !data.wps_sheet_id && !data.wps_table_id) {
    return '请至少填写一个 WPS 文档链接、项目名称、工作表名称或稳定 ID';
  }
  return null;
}

interface BindingListItem {
  project_id: number;
  is_active?: boolean | null;
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const client = getSupabaseClient();
    const [{ data: bindings, error: bindingsError }, { data: projects, error: projectsError }] = await Promise.all([
      client
        .from('wps_project_bindings')
        .select('*, projects(id, name, year, status)')
        .order('created_at', { ascending: false }),
      client
        .from('projects')
        .select('id, name, year, status')
        .order('year', { ascending: false })
        .order('name', { ascending: true }),
    ]);

    if (bindingsError) throw bindingsError;
    if (projectsError) throw projectsError;

    const bindingRows = (bindings || []) as BindingListItem[];
    const activeProjectIds = new Set(bindingRows
      .filter((item) => item.is_active)
      .map((item) => item.project_id));

    return NextResponse.json({
      success: true,
      bindings: bindings || [],
      projects: projects || [],
      integration: {
        webhookPath: '/api/integrations/wps/workers/webhook',
        tokenConfigured: Boolean(process.env.WPS_WORKER_SYNC_TOKEN || process.env.WPS_SYNC_TOKEN),
        pullCredentialConfigured: Boolean(process.env.WPS_ACCESS_TOKEN || process.env.WPS_APP_ID || process.env.WPS_APP_SECRET),
      },
      stats: {
        totalBindings: bindings?.length || 0,
        activeBindings: bindingRows.filter((item) => item.is_active).length,
        configuredProjects: activeProjectIds.size,
        unconfiguredProjects: Math.max(0, (projects?.length || 0) - activeProjectIds.size),
      },
    });
  } catch (error) {
    return apiServerError(error instanceof Error ? error.message : '查询 WPS 配置失败');
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const data = normalizeBindingPayload(body);
    const validationError = validateBinding(data);
    if (validationError) return apiBadRequest(validationError);

    const client = getSupabaseClient();
    const { data: inserted, error } = await insertWithSequenceFix('wps_project_bindings', {
      ...data,
      created_at: new Date().toISOString(),
    }, client);
    if (error) throw error;

    return NextResponse.json({ success: true, binding: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (error) {
    return apiServerError(error instanceof Error ? error.message : '新增 WPS 配置失败');
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) return apiBadRequest('缺少配置 ID');

    const data = normalizeBindingPayload(body);
    const validationError = validateBinding(data);
    if (validationError) return apiBadRequest(validationError);

    const client = getSupabaseClient();
    const { data: updated, error } = await client
      .from('wps_project_bindings')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, binding: updated });
  } catch (error) {
    return apiServerError(error instanceof Error ? error.message : '更新 WPS 配置失败');
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isFinite(id) || id <= 0) return apiBadRequest('缺少配置 ID');

    const client = getSupabaseClient();
    const { error } = await client
      .from('wps_project_bindings')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiServerError(error instanceof Error ? error.message : '删除 WPS 配置失败');
  }
}
