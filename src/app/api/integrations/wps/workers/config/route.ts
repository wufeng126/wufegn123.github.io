import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { apiBadRequest, apiForbidden, apiServerError } from '@/lib/api-utils';
import { runMigrations } from '@/lib/db-migration';
import { extractWpsFileId, getWpsDbsheetSchema, type WpsFieldMapping, type WpsIntegrationConfig } from '@/lib/wps-openapi';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type ConfigRow = {
  id: number;
  app_id?: string | null;
  app_secret?: string | null;
  document_url?: string | null;
  file_id?: string | null;
  field_mapping?: WpsFieldMapping | null;
  auto_sync_enabled?: boolean | null;
  last_test_at?: string | null;
  last_test_status?: string | null;
  last_test_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function getReadableErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const source = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [source.message, source.details, source.hint, source.code]
      .map((part) => (part === null || part === undefined ? '' : String(part).trim()))
      .filter(Boolean);
    if (parts.length > 0) return parts.join('；');
  }
  return fallback;
}

function isWpsConfigSchemaError(error: unknown) {
  const message = getReadableErrorMessage(error, '').toLowerCase();
  const code = error && typeof error === 'object' ? String((error as { code?: unknown }).code || '') : '';
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('wps_worker_integration_config') ||
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

async function runWpsConfigMigration() {
  const result = await runMigrations();
  if (!result.ok) {
    throw new Error(`数据库迁移未执行成功：${result.error || result.message}`);
  }
}

function normalizeUrl(value: unknown): string | null {
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

function normalizeFieldMapping(value: unknown): WpsFieldMapping {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const keys: Array<keyof WpsFieldMapping> = ['name', 'gender', 'idCard', 'phone', 'bankCard', 'entryDate', 'workType', 'teamName'];
  return Object.fromEntries(
    keys
      .map((key) => [key, cleanText(source[key])] as const)
      .filter(([, fieldName]) => Boolean(fieldName))
  ) as WpsFieldMapping;
}

async function requireSuperAdmin(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  if (!auth.user.is_super_admin) {
    return { ok: false as const, response: apiForbidden('只有超级管理员可以维护 WPS 同步配置') };
  }
  return auth;
}

async function getConfigRow(client: ReturnType<typeof getSupabaseClient>): Promise<ConfigRow | null> {
  const { data, error } = await client
    .from('wps_worker_integration_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data as ConfigRow | null;
}

async function getConfigRowWithMigration(client: ReturnType<typeof getSupabaseClient>): Promise<ConfigRow | null> {
  try {
    return await getConfigRow(client);
  } catch (error) {
    if (!isWpsConfigSchemaError(error)) throw error;
    await runWpsConfigMigration();
    return getConfigRow(client);
  }
}

function toRuntimeConfig(row: ConfigRow | null): WpsIntegrationConfig {
  return {
    appId: row?.app_id || process.env.WPS_APP_ID || null,
    appSecret: row?.app_secret || process.env.WPS_APP_SECRET || null,
    documentUrl: row?.document_url || process.env.WPS_DOCUMENT_URL || null,
    fileId: row?.file_id || extractWpsFileId(row?.document_url || process.env.WPS_DOCUMENT_URL || ''),
    fieldMapping: row?.field_mapping || {},
  };
}

function toSafeConfig(row: ConfigRow | null) {
  return {
    appId: row?.app_id || process.env.WPS_APP_ID || '',
    appSecretConfigured: Boolean(row?.app_secret || process.env.WPS_APP_SECRET),
    documentUrl: row?.document_url || process.env.WPS_DOCUMENT_URL || '',
    fileId: row?.file_id || extractWpsFileId(row?.document_url || process.env.WPS_DOCUMENT_URL || ''),
    fieldMapping: row?.field_mapping || {},
    autoSyncEnabled: row?.auto_sync_enabled !== false,
    lastTestAt: row?.last_test_at || null,
    lastTestStatus: row?.last_test_status || null,
    lastTestMessage: row?.last_test_message || null,
  };
}

async function saveTestResult(
  client: ReturnType<typeof getSupabaseClient>,
  status: 'success' | 'warning' | 'error',
  message: string
) {
  await client
    .from('wps_worker_integration_config')
    .upsert({
      id: 1,
      last_test_at: new Date().toISOString(),
      last_test_status: status,
      last_test_message: message,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
}

async function saveTestResultWithMigration(
  client: ReturnType<typeof getSupabaseClient>,
  status: 'success' | 'warning' | 'error',
  message: string
) {
  try {
    await saveTestResult(client, status, message);
  } catch (error) {
    if (!isWpsConfigSchemaError(error)) throw error;
    await runWpsConfigMigration();
    await saveTestResult(client, status, message);
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const client = getSupabaseClient();
    const row = await getConfigRowWithMigration(client);
    return NextResponse.json({ success: true, config: toSafeConfig(row) });
  } catch (error) {
    return apiServerError(getReadableErrorMessage(error, '查询 WPS 应用配置失败'));
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const client = getSupabaseClient();
    const existing = await getConfigRowWithMigration(client);
    const documentUrl = normalizeUrl(body.documentUrl ?? body.document_url);
    const fileId = cleanText(body.fileId ?? body.file_id) || extractWpsFileId(documentUrl);
    const appSecret = cleanText(body.appSecret ?? body.app_secret);
    const payload: ConfigRow = {
      id: 1,
      app_id: cleanText(body.appId ?? body.app_id),
      app_secret: appSecret || existing?.app_secret || null,
      document_url: documentUrl,
      file_id: fileId,
      field_mapping: normalizeFieldMapping(body.fieldMapping ?? body.field_mapping),
      auto_sync_enabled: body.autoSyncEnabled ?? body.auto_sync_enabled ?? true,
      updated_at: new Date().toISOString(),
      created_at: existing?.created_at || new Date().toISOString(),
    };

    const upsertConfig = async () => {
      const { data, error } = await client
        .from('wps_worker_integration_config')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .single();
      if (error) throw error;
      return data as ConfigRow;
    };

    let data: ConfigRow;
    try {
      data = await upsertConfig();
    } catch (error) {
      if (!isWpsConfigSchemaError(error)) throw error;
      await runWpsConfigMigration();
      data = await upsertConfig();
    }

    return NextResponse.json({ success: true, config: toSafeConfig(data) });
  } catch (error) {
    return apiServerError(getReadableErrorMessage(error, '保存 WPS 应用配置失败'));
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const action = cleanText(body.action) || 'test';
    if (action !== 'test') return apiBadRequest('不支持的 WPS 配置操作');

    const client = getSupabaseClient();
    const row = await getConfigRowWithMigration(client);
    const runtimeConfig = toRuntimeConfig(row);
    const sheets = await getWpsDbsheetSchema(runtimeConfig);
    const message = sheets.length > 0
      ? `连接成功，读取到 ${sheets.length} 个工作表`
      : '连接成功，但未读取到工作表，请检查多维表格权限';
    await saveTestResultWithMigration(client, sheets.length > 0 ? 'success' : 'warning', message);

    return NextResponse.json({
      success: sheets.length > 0,
      message,
      sheets,
      config: toSafeConfig(await getConfigRowWithMigration(client)),
    });
  } catch (error) {
    const message = getReadableErrorMessage(error, 'WPS 连接测试失败');
    try {
      await saveTestResultWithMigration(getSupabaseClient(), 'error', message);
    } catch {
      // Ignore test status write failures; return the real WPS error to the page.
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
