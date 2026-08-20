import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { hasPermission, requireAuth } from '@/lib/api-auth';
import { apiForbidden } from '@/lib/api-utils';
import { extractWpsWorkerRecords, syncWpsWorkerRecord, type WpsWorkerInput, type WpsWorkerSyncResult } from '@/lib/wps-worker-sync';
import { applyWpsFieldMapping, extractWpsFileId, getWpsDbsheetSchema, listWpsDbsheetRecords, type WpsFieldMapping, type WpsIntegrationConfig, type WpsSheetSchema } from '@/lib/wps-openapi';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type BindingRow = {
  id: number;
  project_id: number;
  wps_project_name: string | null;
  worksheet_name: string | null;
  wps_document_url?: string | null;
  wps_form_id: string | null;
  wps_sheet_id: string | null;
  wps_table_id: string | null;
  projects?: { name?: string | null } | { name?: string | null }[] | null;
};

type WpsConfigRow = {
  app_id?: string | null;
  app_secret?: string | null;
  document_url?: string | null;
  file_id?: string | null;
  field_mapping?: WpsFieldMapping | null;
  auto_sync_enabled?: boolean | null;
};

function getProjectName(binding: BindingRow): string | null {
  const project = Array.isArray(binding.projects) ? binding.projects[0] : binding.projects;
  return project?.name || null;
}

async function requireWpsSyncPermission(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  if (!hasPermission(auth.user, 'workers:import')) {
    return { ok: false as const, response: apiForbidden('只有超级管理员或具备花名册导入权限的人员可以执行 WPS 同步') };
  }
  return auth;
}

function isHttpUrl(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function updateBindingStatus(
  client: ReturnType<typeof getSupabaseClient>,
  bindingId: number,
  status: 'success' | 'warning' | 'error',
  message: string
) {
  await client
    .from('wps_project_bindings')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bindingId);
}

function buildRecordsFromRows(binding: BindingRow, rows: Record<string, unknown>[], worksheetName?: string): WpsWorkerInput[] {
  return extractWpsWorkerRecords({
    wpsFormId: binding.wps_form_id,
    wpsSheetId: binding.wps_sheet_id,
    wpsTableId: binding.wps_table_id,
    wpsDocumentUrl: binding.wps_document_url,
    projectName: binding.wps_project_name || getProjectName(binding),
    worksheetName: worksheetName || binding.worksheet_name,
    records: rows,
  });
}

function normalizeWorkerSyncText(value?: string | null) {
  return value?.trim().replace(/\s+/g, '').toLowerCase() || '';
}

function normalizeWorkerIdentity(value?: string | null) {
  return value?.trim().replace(/\s+/g, '').toUpperCase() || '';
}

function normalizePhone(value?: string | null) {
  return value?.trim().replace(/[^\d]/g, '') || '';
}

function normalizeBankCard(value?: string | null) {
  return value?.trim().replace(/\s+/g, '') || '';
}

function buildBatchRecordKey(record: WpsWorkerInput) {
  const projectKey = [
    record.wpsSheetId,
    record.wpsTableId,
    record.worksheetName,
    record.projectName,
  ].map(normalizeWorkerSyncText).find(Boolean) || 'unknown-project';
  const idCard = normalizeWorkerIdentity(record.idCard);
  if (idCard) return `${projectKey}:id:${idCard}`;

  const name = normalizeWorkerSyncText(record.name);
  if (!name) return '';

  const phone = normalizePhone(record.phone);
  if (phone) return `${projectKey}:name-phone:${name}:${phone}`;

  const bankCard = normalizeBankCard(record.bankCard);
  if (bankCard) return `${projectKey}:name-bank:${name}:${bankCard}`;

  return `${projectKey}:name:${name}`;
}

function recordCompleteness(record: WpsWorkerInput) {
  return [
    record.name,
    record.gender,
    record.idCard,
    record.phone,
    record.bankCard,
    record.entryDate,
    record.workType,
    record.teamName,
    record.status,
  ].filter((value) => value && String(value).trim()).length;
}

function mergeWpsWorkerRecord(base: WpsWorkerInput, incoming: WpsWorkerInput): WpsWorkerInput {
  const merged = { ...base };
  (Object.keys(incoming) as Array<keyof WpsWorkerInput>).forEach((key) => {
    const current = merged[key];
    const next = incoming[key];
    if ((!current || !String(current).trim()) && next && String(next).trim()) {
      merged[key] = next;
    }
  });
  return merged;
}

function dedupeWpsWorkerRecords(records: WpsWorkerInput[]): { records: WpsWorkerInput[]; duplicateResults: WpsWorkerSyncResult[] } {
  const byKey = new Map<string, WpsWorkerInput>();
  const duplicateResults: WpsWorkerSyncResult[] = [];

  records.forEach((record) => {
    const key = buildBatchRecordKey(record);
    if (!key) {
      byKey.set(`row:${byKey.size}:${record.name || ''}`, record);
      return;
    }

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      return;
    }

    const primary = recordCompleteness(record) > recordCompleteness(existing) ? record : existing;
    const secondary = primary === record ? existing : record;
    byKey.set(key, mergeWpsWorkerRecord(primary, secondary));
    duplicateResults.push({
      success: false,
      action: 'skipped',
      status: 'warning',
      message: '本次 WPS 读取中与前面记录重复，已合并到同一名工人处理',
      workerName: record.name || existing.name || undefined,
      projectName: record.projectName || existing.projectName || record.worksheetName || existing.worksheetName || undefined,
      duplicateSkipped: true,
    });
  });

  return {
    records: Array.from(byKey.values()),
    duplicateResults,
  };
}

async function fetchDocumentRows(binding: BindingRow): Promise<{ rows: Record<string, unknown>[]; worksheetName?: string }> {
  const url = binding.wps_document_url;
  if (!isHttpUrl(url)) {
    throw new Error('未配置可访问的 WPS 文档链接');
  }

  const response = await fetch(url!, {
    method: 'GET',
    cache: 'no-store',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 WPS worker roster sync',
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`文档链接访问失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('该链接返回的是 WPS 网页，不是可直接下载的表格文件；请使用 WPS 推送 webhook 或配置可下载链接');
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const targetSheetName =
    binding.worksheet_name && workbook.SheetNames.includes(binding.worksheet_name)
      ? binding.worksheet_name
      : workbook.SheetNames[0];

  if (!targetSheetName) {
    throw new Error('文档中未识别到工作表');
  }

  const worksheet = workbook.Sheets[targetSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: false,
    defval: '',
  });

  return { rows, worksheetName: targetSheetName };
}

async function loadWpsIntegrationConfig(client: ReturnType<typeof getSupabaseClient>): Promise<WpsIntegrationConfig | null> {
  const { data } = await client
    .from('wps_worker_integration_config')
    .select('app_id, app_secret, document_url, file_id, field_mapping, auto_sync_enabled')
    .eq('id', 1)
    .maybeSingle();
  const row = data as WpsConfigRow | null;
  const documentUrl = row?.document_url || process.env.WPS_DOCUMENT_URL || null;
  const config: WpsIntegrationConfig = {
    appId: row?.app_id || process.env.WPS_APP_ID || null,
    appSecret: row?.app_secret || process.env.WPS_APP_SECRET || null,
    documentUrl,
    fileId: row?.file_id || extractWpsFileId(documentUrl),
    fieldMapping: row?.field_mapping || {},
  };

  if (row?.auto_sync_enabled === false) return null;
  if (!config.appId || !config.appSecret || (!config.fileId && !config.documentUrl)) return null;
  return config;
}

function normalizeName(value?: string | null) {
  return value?.trim().replace(/\s+/g, '').toLowerCase() || '';
}

function findSheetForBinding(binding: BindingRow, sheets: WpsSheetSchema[]) {
  if (binding.wps_sheet_id) {
    const exact = sheets.find((sheet) => sheet.id === binding.wps_sheet_id);
    if (exact) return exact;
  }

  const names = [
    binding.worksheet_name,
    binding.wps_project_name,
    getProjectName(binding),
  ].map(normalizeName).filter(Boolean);
  if (names.length === 0) return null;
  return sheets.find((sheet) => names.includes(normalizeName(sheet.name))) || null;
}

async function fetchOpenApiRows(
  binding: BindingRow,
  config: WpsIntegrationConfig
): Promise<{ rows: Record<string, unknown>[]; worksheetName?: string }> {
  const sheets = await getWpsDbsheetSchema(config);
  const sheet = findSheetForBinding(binding, sheets);
  if (!sheet) {
    throw new Error('未在 WPS 多维表格中找到匹配的工作表，请检查项目绑定里的工作表名称或工作表 ID');
  }
  const rows = await listWpsDbsheetRecords(config, sheet.id);
  return {
    rows: applyWpsFieldMapping(rows, config.fieldMapping),
    worksheetName: sheet.name,
  };
}

async function fetchBindingRows(
  binding: BindingRow,
  config: WpsIntegrationConfig | null
): Promise<{ rows: Record<string, unknown>[]; worksheetName?: string }> {
  if (config) {
    return fetchOpenApiRows(binding, config);
  }
  return fetchDocumentRows(binding);
}

function summarizeResults(results: WpsWorkerSyncResult[], readRows = results.length) {
  const created = results.filter((item) => item.action === 'created').length;
  const updated = results.filter((item) => item.action === 'updated').length;
  const transferred = results.filter((item) => item.action === 'transferred').length;
  const skipped = results.filter((item) => item.action === 'skipped').length;
  const failed = results.filter((item) => item.status === 'error').length;
  const warnings = results.filter((item) => item.status === 'warning').length;
  const duplicateSkipped = results.filter((item) => item.duplicateSkipped).length;
  const autoFilledFields = results.reduce((sum, item) => sum + (item.filledFields?.length || 0), 0);
  const conflictFields = results.reduce((sum, item) => sum + (item.conflictFields?.length || 0), 0);
  const changed = created + updated + transferred;
  return {
    total: results.length,
    readRows,
    created,
    updated,
    transferred,
    skipped,
    failed,
    warnings,
    duplicateSkipped,
    autoFilledFields,
    conflictFields,
    changed,
    succeeded: results.filter((item) => item.success).length,
  };
}

function buildSummaryMessage(summary: ReturnType<typeof summarizeResults>) {
  const extra = [
    summary.autoFilledFields > 0 ? `自动补齐 ${summary.autoFilledFields} 项` : null,
    summary.conflictFields > 0 ? `字段差异 ${summary.conflictFields} 项` : null,
    summary.duplicateSkipped > 0 ? `批次重复 ${summary.duplicateSkipped} 条` : null,
  ].filter(Boolean).join('，');
  return `读取 ${summary.readRows} 行，识别 ${summary.total} 条，新增 ${summary.created} 条，更新 ${summary.updated} 条，调入 ${summary.transferred} 条，跳过 ${summary.skipped} 条，失败 ${summary.failed} 条，有效变更 ${summary.changed} 条${extra ? `，${extra}` : ''}`;
}

function maskIdCard(value?: string | null) {
  if (!value) return null;
  const text = String(value).trim();
  if (text.length < 8) return text.replace(/.(?=.{2})/g, '*');
  return `${text.slice(0, 3)}***********${text.slice(-4)}`;
}

function maskBankCard(value?: string | null) {
  if (!value) return null;
  const text = String(value).trim();
  if (text.length < 8) return text.replace(/.(?=.{4})/g, '*');
  return `${text.slice(0, 4)} **** **** ${text.slice(-4)}`;
}

function maskPhone(value?: string | null) {
  if (!value) return null;
  const text = String(value).trim();
  if (text.length < 7) return text;
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function buildParsePreview(records: WpsWorkerInput[]) {
  return {
    parsed: records.length,
    withName: records.filter((item) => item.name?.trim()).length,
    withIdCard: records.filter((item) => item.idCard?.trim()).length,
    withPhone: records.filter((item) => item.phone?.trim()).length,
    withEntryDate: records.filter((item) => item.entryDate?.trim()).length,
    samples: records.slice(0, 3).map((record) => ({
      projectName: record.projectName || null,
      worksheetName: record.worksheetName || null,
      name: record.name || null,
      gender: record.gender || null,
      idCard: maskIdCard(record.idCard),
      phone: maskPhone(record.phone),
      bankCard: maskBankCard(record.bankCard),
      entryDate: record.entryDate || null,
      workType: record.workType || null,
      teamName: record.teamName || null,
      status: record.status || null,
    })),
  };
}

async function runParseTest(
  client: ReturnType<typeof getSupabaseClient>,
  bindings: BindingRow[],
  body: Record<string, unknown>,
  config: WpsIntegrationConfig | null
) {
  const bindingId = Number(body.bindingId ?? body.binding_id);
  const targetBindings = Number.isFinite(bindingId) && bindingId > 0
    ? bindings.filter((binding) => binding.id === bindingId)
    : bindings;

  if (targetBindings.length === 0) {
    return NextResponse.json({ success: false, error: '未找到要测试的 WPS 绑定配置' }, { status: 404 });
  }

  const bindingResults = [];
  for (const binding of targetBindings) {
    try {
      if (!config && !binding.wps_document_url) {
        bindingResults.push({
          bindingId: binding.id,
          projectName: getProjectName(binding),
          status: 'warning',
          message: '未配置 WPS 应用配置，也未配置可直接读取的文档链接',
        });
        continue;
      }

      const { rows, worksheetName } = await fetchBindingRows(binding, config);
      const records = buildRecordsFromRows(binding, rows, worksheetName);
      bindingResults.push({
        bindingId: binding.id,
        projectName: getProjectName(binding),
        worksheetName,
        status: records.length > 0 ? 'success' : 'warning',
        message: records.length > 0
          ? `测试读取成功：读取 ${rows.length} 行，识别 ${records.length} 条花名册记录，仅完成解析，未写入系统`
          : `文档可读取，但 ${rows.length} 行中未识别到有效花名册记录，本次未写入系统`,
        totalRows: rows.length,
        ...buildParsePreview(records),
      });
    } catch (error) {
      bindingResults.push({
        bindingId: binding.id,
        projectName: getProjectName(binding),
        status: 'error',
        message: error instanceof Error ? error.message : '测试读取失败',
      });
    }
  }

  return NextResponse.json({
    success: bindingResults.some((item) => item.status === 'success'),
    mode: 'test',
    message: 'WPS 绑定测试已完成，测试不会写入工人档案',
    bindingResults,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireWpsSyncPermission(request);
  if (!auth.ok) return auth.response;

  try {
    const client = getSupabaseClient();
    const body = await request.json().catch(() => ({}));
    const bindingId = Number((body as Record<string, unknown>).bindingId ?? (body as Record<string, unknown>).binding_id);

    const hasManualPayload = Array.isArray(body) || Array.isArray(body.records) || Boolean(body.payload);
    const manualRecords = hasManualPayload
      ? extractWpsWorkerRecords(body)
      : [];

    if ((body as Record<string, unknown>).testOnly && manualRecords.length > 0) {
      return NextResponse.json({
        success: true,
        mode: 'test-payload',
        message: '测试载荷解析完成，未写入工人档案',
        preview: buildParsePreview(manualRecords),
      });
    }

    if (manualRecords.length > 0) {
      const { records, duplicateResults } = dedupeWpsWorkerRecords(manualRecords);
      const results = [...duplicateResults];
      for (const record of records) {
        results.push(await syncWpsWorkerRecord(client, record));
      }
      return NextResponse.json({
        success: results.some((item) => item.success),
        mode: 'payload',
        message: '测试数据已处理',
        summary: summarizeResults(results, manualRecords.length),
        results,
      });
    }

    const { data: bindings, error } = await client
      .from('wps_project_bindings')
      .select('*, projects(name)')
      .eq('is_active', true);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!bindings || bindings.length === 0) {
      return NextResponse.json({ success: false, error: '没有启用的 WPS 绑定配置' }, { status: 400 });
    }

    const integrationConfig = await loadWpsIntegrationConfig(client);
    const targetBindings =
      Number.isFinite(bindingId) && bindingId > 0
        ? (bindings as BindingRow[]).filter((binding) => binding.id === bindingId)
        : (bindings as BindingRow[]);

    if (targetBindings.length === 0) {
      return NextResponse.json({ success: false, error: '未找到指定的 WPS 绑定配置' }, { status: 404 });
    }

    if ((body as Record<string, unknown>).testOnly) {
      return runParseTest(client, targetBindings, body as Record<string, unknown>, integrationConfig);
    }

    const allResults: WpsWorkerSyncResult[] = [];
    const bindingResults = [];
    let totalRowsRead = 0;

    for (const binding of targetBindings) {
      try {
        if (!integrationConfig && !binding.wps_document_url) {
          const message = '未配置 WPS 应用配置，也未配置文档直链；无法自动同步';
          await updateBindingStatus(client, binding.id, 'warning', message);
          bindingResults.push({
            bindingId: binding.id,
            projectName: getProjectName(binding),
            status: 'warning',
            message,
          });
          continue;
        }

        const { rows, worksheetName } = await fetchBindingRows(binding, integrationConfig);
        totalRowsRead += rows.length;
        if (rows.length === 0) {
          const message = '文档已读取，但没有可同步的数据行';
          await updateBindingStatus(client, binding.id, 'warning', message);
          bindingResults.push({
            bindingId: binding.id,
            projectName: getProjectName(binding),
            worksheetName,
            status: 'warning',
            message,
          });
          continue;
        }

        const rawRecords = buildRecordsFromRows(binding, rows, worksheetName);
        const { records, duplicateResults } = dedupeWpsWorkerRecords(rawRecords);
        const results = [...duplicateResults];
        for (const record of records) {
          results.push(await syncWpsWorkerRecord(client, record));
        }
        allResults.push(...results);

        const summary = summarizeResults(results, rows.length);
        const failed = summary.failed > 0;
        const message = buildSummaryMessage(summary);
        await updateBindingStatus(client, binding.id, failed ? 'warning' : 'success', message);
        bindingResults.push({
          bindingId: binding.id,
          projectName: getProjectName(binding),
          worksheetName,
          status: failed ? 'warning' : 'success',
          message,
          totalRows: rows.length,
          summary,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '同步失败';
        await updateBindingStatus(client, binding.id, 'error', message);
        bindingResults.push({
          bindingId: binding.id,
          projectName: getProjectName(binding),
          status: 'error',
          message,
        });
      }
    }

    const summary = {
      ...summarizeResults(allResults, totalRowsRead),
      bindings: bindingResults.length,
      successBindings: bindingResults.filter((item) => item.status === 'success').length,
      warningBindings: bindingResults.filter((item) => item.status === 'warning').length,
      errorBindings: bindingResults.filter((item) => item.status === 'error').length,
    };
    return NextResponse.json({
      success: bindingResults.some((item) => item.status === 'success'),
      mode: 'document',
      message: allResults.length > 0 ? 'WPS 同步已完成' : '同步检查已完成，请查看每条绑定的结果说明',
      summary,
      bindingResults,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : '同步失败',
    }, { status: 500 });
  }
}
