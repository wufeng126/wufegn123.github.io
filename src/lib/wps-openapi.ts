import crypto from 'crypto';

export type WpsFieldMapping = {
  name?: string;
  gender?: string;
  idCard?: string;
  phone?: string;
  bankCard?: string;
  entryDate?: string;
  workType?: string;
  teamName?: string;
  status?: string;
};

export type WpsIntegrationConfig = {
  appId?: string | null;
  appSecret?: string | null;
  documentUrl?: string | null;
  fileId?: string | null;
  fieldMapping?: WpsFieldMapping | null;
};

export type WpsSheetSchema = {
  id: string;
  name: string;
  recordsCount?: number;
  fields: Array<{ id?: string; name: string; type?: string }>;
};

type WpsTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  code?: number;
  msg?: string;
  message?: string;
  error?: string;
};

type WpsSchemaResponse = {
  code?: number;
  msg?: string;
  message?: string;
  data?: {
    sheets?: Array<{
      id?: number | string;
      sheet_id?: number | string;
      name?: string;
      sheet_name?: string;
      records_count?: number;
      recordsCount?: number;
      fields?: Array<{ id?: string; field_id?: string; name?: string; field_name?: string; type?: string }>;
    }>;
  };
};

type WpsRecordsResponse = {
  code?: number;
  msg?: string;
  message?: string;
  data?: {
    records?: unknown[];
    items?: unknown[];
    rows?: unknown[];
    total?: number;
    has_more?: boolean;
    page_token?: string;
    next_page_token?: string;
  };
  records?: unknown[];
  items?: unknown[];
  rows?: unknown[];
};

function required(value: string | null | undefined, label: string) {
  const text = value?.trim();
  if (!text) throw new Error(`缺少 ${label}`);
  return text;
}

export function extractWpsFileId(value?: string | null) {
  const text = value?.trim();
  if (!text) return '';

  try {
    const url = new URL(text);
    const fromQuery =
      url.searchParams.get('file_id') ||
      url.searchParams.get('fileId') ||
      url.searchParams.get('id') ||
      url.searchParams.get('docId');
    if (fromQuery) return fromQuery.trim();

    const parts = url.pathname.split('/').filter(Boolean);
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const part = decodeURIComponent(parts[index] || '').trim();
      if (/^[A-Za-z0-9_-]{8,}$/.test(part)) return part;
    }
  } catch {
    // The user may paste the file id directly.
  }

  return /^[A-Za-z0-9_-]{8,}$/.test(text) ? text : '';
}

function sha256Hex(body: string) {
  return body ? crypto.createHash('sha256').update(body, 'utf8').digest('hex') : '';
}

function buildKsoHeaders(params: {
  appId: string;
  appSecret: string;
  method: string;
  requestUri: string;
  body?: string;
  contentType?: string;
}) {
  const contentType = params.contentType || 'application/json';
  const ksoDate = new Date().toUTCString();
  const source = `KSO-1${params.method.toUpperCase()}${params.requestUri}${contentType}${ksoDate}${sha256Hex(params.body || '')}`;
  const signature = crypto.createHmac('sha256', params.appSecret).update(source, 'utf8').digest('hex');
  return {
    'Content-Type': contentType,
    'X-Kso-Date': ksoDate,
    'X-Kso-Authorization': `KSO-1 ${params.appId}:${signature}`,
  };
}

async function readWpsJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let json: T;
  try {
    json = text ? JSON.parse(text) as T : {} as T;
  } catch {
    throw new Error(`WPS 接口返回异常：${text.slice(0, 160) || response.statusText}`);
  }

  if (!response.ok) {
    const data = json as { msg?: string; message?: string; error?: string };
    throw new Error(data.msg || data.message || data.error || `WPS 接口请求失败：HTTP ${response.status}`);
  }
  return json;
}

function assertWpsSuccess(json: { code?: number; msg?: string; message?: string }, fallback: string) {
  if (json.code !== undefined && json.code !== 0) {
    throw new Error(json.msg || json.message || `${fallback}：${json.code}`);
  }
}

export async function getWpsAccessToken(config: WpsIntegrationConfig) {
  const appId = required(config.appId, 'WPS AppID');
  const appSecret = required(config.appSecret, 'WPS AppSecret');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: appId,
    client_secret: appSecret,
  });

  const response = await fetch('https://openapi.wps.cn/oauth2/token', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await readWpsJson<WpsTokenResponse>(response);
  assertWpsSuccess(json, 'WPS Token 获取失败');
  if (!json.access_token) {
    throw new Error(json.msg || json.message || json.error || 'WPS 未返回 access_token，请检查 AppID/AppSecret 和应用权限');
  }
  return json.access_token;
}

export async function getWpsDbsheetSchema(config: WpsIntegrationConfig) {
  const appId = required(config.appId, 'WPS AppID');
  const appSecret = required(config.appSecret, 'WPS AppSecret');
  const fileId = required(config.fileId || extractWpsFileId(config.documentUrl), 'WPS 多维表格文件 ID');
  const accessToken = await getWpsAccessToken(config);
  const requestUri = `/v7/coop/dbsheet/${encodeURIComponent(fileId)}/schema`;
  const response = await fetch(`https://openapi.wps.cn${requestUri}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      ...buildKsoHeaders({ appId, appSecret, method: 'GET', requestUri }),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = await readWpsJson<WpsSchemaResponse>(response);
  assertWpsSuccess(json, 'WPS Schema 读取失败');

  return (json.data?.sheets || []).map((sheet): WpsSheetSchema => ({
    id: String(sheet.sheet_id || sheet.id || ''),
    name: sheet.sheet_name || sheet.name || String(sheet.sheet_id || sheet.id || ''),
    recordsCount: Number(sheet.records_count || sheet.recordsCount || 0),
    fields: (sheet.fields || [])
      .map(field => ({
        id: field.field_id || field.id,
        name: field.field_name || field.name || '',
        type: field.type,
      }))
      .filter(field => field.name),
  })).filter(sheet => sheet.id || sheet.name);
}

function parseJsonObject(value: unknown) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function normalizeRecord(record: unknown) {
  const parsed = parseJsonObject(record);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const row = parsed as Record<string, unknown>;
  const fields = parseJsonObject(row.fields || row.values || row.record || row.data);
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    return { ...row, ...(fields as Record<string, unknown>) };
  }
  return row;
}

export async function listWpsDbsheetRecords(config: WpsIntegrationConfig, sheetId: string) {
  const appId = required(config.appId, 'WPS AppID');
  const appSecret = required(config.appSecret, 'WPS AppSecret');
  const fileId = required(config.fileId || extractWpsFileId(config.documentUrl), 'WPS 多维表格文件 ID');
  const accessToken = await getWpsAccessToken(config);
  const records: Record<string, unknown>[] = [];
  let pageNum = 1;

  while (pageNum <= 100) {
    const requestUri = `/v7/coop/dbsheet/${encodeURIComponent(fileId)}/sheets/${encodeURIComponent(sheetId)}/records/list_by_page`;
    const body = JSON.stringify({ fields: [], page_num: pageNum, page_size: 500, prefer_id: false });
    const response = await fetch(`https://openapi.wps.cn${requestUri}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...buildKsoHeaders({ appId, appSecret, method: 'POST', requestUri, body }),
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    });
    const json = await readWpsJson<WpsRecordsResponse>(response);
    assertWpsSuccess(json, 'WPS 记录读取失败');
    const pageRecords = json.data?.records || json.data?.items || json.data?.rows || json.records || json.items || json.rows || [];
    records.push(...pageRecords.map(normalizeRecord));
    if (pageRecords.length < 500 || json.data?.has_more === false) break;
    pageNum += 1;
  }

  return records;
}

const FIELD_MAPPING_ALIASES: Record<keyof WpsFieldMapping, string> = {
  name: 'name',
  gender: 'gender',
  idCard: 'idCard',
  phone: 'phone',
  bankCard: 'bankCard',
  entryDate: 'entryDate',
  workType: 'workType',
  teamName: 'teamName',
  status: 'status',
};

export function applyWpsFieldMapping(rows: Record<string, unknown>[], fieldMapping?: WpsFieldMapping | null) {
  if (!fieldMapping) return rows;
  return rows.map((row) => {
    const mapped = { ...row };
    for (const [key, sourceField] of Object.entries(fieldMapping) as Array<[keyof WpsFieldMapping, string | undefined]>) {
      const fieldName = sourceField?.trim();
      if (!fieldName) continue;
      mapped[FIELD_MAPPING_ALIASES[key]] = row[fieldName];
    }
    return mapped;
  });
}
