import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireAuth } from '@/lib/api-auth';
import { apiForbidden } from '@/lib/api-utils';
import { extractWpsWorkerRecords, syncWpsWorkerRecord, type WpsWorkerInput, type WpsWorkerSyncResult } from '@/lib/wps-worker-sync';
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

function getProjectName(binding: BindingRow): string | null {
  const project = Array.isArray(binding.projects) ? binding.projects[0] : binding.projects;
  return project?.name || null;
}

async function requireSuperAdmin(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  if (!auth.user.is_super_admin) {
    return { ok: false as const, response: apiForbidden('只有超级管理员可以执行 WPS 同步') };
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

function summarizeResults(results: WpsWorkerSyncResult[]) {
  return {
    total: results.length,
    created: results.filter((item) => item.action === 'created').length,
    updated: results.filter((item) => item.action === 'updated').length,
    transferred: results.filter((item) => item.action === 'transferred').length,
    skipped: results.filter((item) => item.action === 'skipped').length,
    failed: results.filter((item) => item.status === 'error').length,
  };
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
    })),
  };
}

async function runParseTest(
  client: ReturnType<typeof getSupabaseClient>,
  bindings: BindingRow[],
  body: Record<string, unknown>
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
      if (!binding.wps_document_url) {
        bindingResults.push({
          bindingId: binding.id,
          projectName: getProjectName(binding),
          status: 'warning',
          message: '未配置可直接读取的文档链接；如使用 WPS 实时推送，请通过 webhook 测试载荷验证',
        });
        continue;
      }

      const { rows, worksheetName } = await fetchDocumentRows(binding);
      const records = buildRecordsFromRows(binding, rows, worksheetName);
      bindingResults.push({
        bindingId: binding.id,
        projectName: getProjectName(binding),
        worksheetName,
        status: records.length > 0 ? 'success' : 'warning',
        message: records.length > 0
          ? `测试读取成功：读取 ${rows.length} 行，识别 ${records.length} 条花名册记录，未写入系统`
          : `文档可读取，但 ${rows.length} 行中未识别到有效花名册记录`,
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
  const auth = await requireSuperAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const client = getSupabaseClient();
    const body = await request.json().catch(() => ({}));

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
      const results = [];
      for (const record of manualRecords) {
        results.push(await syncWpsWorkerRecord(client, record));
      }
      return NextResponse.json({
        success: results.some((item) => item.success),
        mode: 'payload',
        message: '测试数据已处理',
        summary: summarizeResults(results),
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

    if ((body as Record<string, unknown>).testOnly) {
      return runParseTest(client, bindings as BindingRow[], body as Record<string, unknown>);
    }

    const allResults: WpsWorkerSyncResult[] = [];
    const bindingResults = [];

    for (const binding of bindings as BindingRow[]) {
      try {
        if (!binding.wps_document_url) {
          const message = '未配置文档链接；如使用 WPS 表单实时同步，请确认 webhook 已配置到 WPS 自动化流程';
          await updateBindingStatus(client, binding.id, 'warning', message);
          bindingResults.push({
            bindingId: binding.id,
            projectName: getProjectName(binding),
            status: 'warning',
            message,
          });
          continue;
        }

        const { rows, worksheetName } = await fetchDocumentRows(binding);
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

        const records = buildRecordsFromRows(binding, rows, worksheetName);
        const results = [];
        for (const record of records) {
          results.push(await syncWpsWorkerRecord(client, record));
        }
        allResults.push(...results);

        const summary = summarizeResults(results);
        const failed = summary.failed > 0;
        const message = `读取 ${rows.length} 行，新增 ${summary.created} 人，更新 ${summary.updated} 人，调入 ${summary.transferred} 人，失败 ${summary.failed} 条`;
        await updateBindingStatus(client, binding.id, failed ? 'warning' : 'success', message);
        bindingResults.push({
          bindingId: binding.id,
          projectName: getProjectName(binding),
          worksheetName,
          status: failed ? 'warning' : 'success',
          message,
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

    const summary = summarizeResults(allResults);
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
