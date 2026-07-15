import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { extractWpsWorkerRecords, syncWpsWorkerRecord } from '@/lib/wps-worker-sync';

type WebhookProjectContext = {
  projectName?: string | null;
  worksheetName?: string | null;
  wpsFormId?: string | null;
  wpsSheetId?: string | null;
  wpsTableId?: string | null;
  wpsDocumentUrl?: string | null;
};

function getRequestToken(request: NextRequest): string {
  const queryToken = request.nextUrl.searchParams.get('token') || '';
  const headerToken = request.headers.get('x-wps-sync-token') || '';
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return queryToken || headerToken || bearerToken;
}

function validateToken(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const expectedToken = process.env.WPS_WORKER_SYNC_TOKEN || process.env.WPS_SYNC_TOKEN || '';
  const requestToken = getRequestToken(request);

  if (!expectedToken) {
    if (process.env.COZE_PROJECT_ENV === 'PROD') {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: 'WPS同步Token未配置，请先配置 WPS_WORKER_SYNC_TOKEN' },
          { status: 500 }
        ),
      };
    }
    return { ok: true };
  }

  if (!requestToken || requestToken !== expectedToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'WPS同步Token不正确' },
        { status: 401 }
      ),
    };
  }

  return { ok: true };
}

function parsePositiveInt(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getProjectName(project: unknown) {
  const item = Array.isArray(project) ? project[0] : project;
  return item && typeof item === 'object' && 'name' in item ? String((item as { name?: string | null }).name || '') : '';
}

async function getWebhookProjectContext(request: NextRequest, client: ReturnType<typeof getSupabaseClient>): Promise<WebhookProjectContext | null> {
  const bindingId = parsePositiveInt(request.nextUrl.searchParams.get('bindingId') || request.nextUrl.searchParams.get('binding_id'));
  if (bindingId) {
    const { data, error } = await client
      .from('wps_project_bindings')
      .select('project_id,wps_project_name,worksheet_name,wps_document_url,wps_form_id,wps_sheet_id,wps_table_id,projects(name)')
      .eq('id', bindingId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('未找到启用中的 WPS 项目绑定');
    return {
      projectName: getProjectName((data as { projects?: unknown }).projects) || (data as { wps_project_name?: string | null }).wps_project_name,
      worksheetName: (data as { worksheet_name?: string | null }).worksheet_name,
      wpsFormId: (data as { wps_form_id?: string | null }).wps_form_id,
      wpsSheetId: (data as { wps_sheet_id?: string | null }).wps_sheet_id,
      wpsTableId: (data as { wps_table_id?: string | null }).wps_table_id,
      wpsDocumentUrl: (data as { wps_document_url?: string | null }).wps_document_url,
    };
  }

  const projectId = parsePositiveInt(request.nextUrl.searchParams.get('projectId') || request.nextUrl.searchParams.get('project_id'));
  if (projectId) {
    const { data, error } = await client
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('未找到系统项目');
    return { projectName: (data as { name?: string | null }).name };
  }

  return null;
}

function applyProjectContext(payload: unknown, context: WebhookProjectContext | null) {
  if (!context) return payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ...context,
      records: Array.isArray(payload) ? payload : [payload],
    };
  }
  return {
    ...context,
    ...(payload as Record<string, unknown>),
    projectName: context.projectName || (payload as Record<string, unknown>).projectName || (payload as Record<string, unknown>)['项目名称'],
    worksheetName: context.worksheetName || (payload as Record<string, unknown>).worksheetName || (payload as Record<string, unknown>)['工作表名称'],
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-wps-sync-token',
    },
  });
}

export async function GET(request: NextRequest) {
  const tokenCheck = validateToken(request);
  if (!tokenCheck.ok) return tokenCheck.response;

  return NextResponse.json({
    success: true,
    message: 'WPS工人花名册同步接口可用',
    tokenConfigured: Boolean(process.env.WPS_WORKER_SYNC_TOKEN || process.env.WPS_SYNC_TOKEN),
  });
}

export async function POST(request: NextRequest) {
  const tokenCheck = validateToken(request);
  if (!tokenCheck.ok) return tokenCheck.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求体不是有效JSON' }, { status: 400 });
  }

  const client = getSupabaseClient();
  let context: WebhookProjectContext | null = null;
  try {
    context = await getWebhookProjectContext(request, client);
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '项目绑定识别失败' }, { status: 400 });
  }

  const records = extractWpsWorkerRecords(applyProjectContext(payload, context));
  if (records.length === 0) {
    return NextResponse.json({ success: false, error: '未识别到WPS表单记录' }, { status: 400 });
  }

  const results = [];
  for (const record of records) {
    results.push(await syncWpsWorkerRecord(client, record));
  }

  const successCount = results.filter((item) => item.success).length;
  const errorCount = results.filter((item) => item.status === 'error').length;
  const warningCount = results.filter((item) => item.status === 'warning').length;

  return NextResponse.json(
    {
      success: successCount > 0 && errorCount === 0,
      total: records.length,
      successCount,
      warningCount,
      errorCount,
      results,
    },
    { status: successCount > 0 ? 200 : 400 }
  );
}
