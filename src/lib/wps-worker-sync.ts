import type { SupabaseClient } from '@supabase/supabase-js';
import { insertWithSequenceFix } from '@/lib/audit-log';

type SyncAction = 'created' | 'updated' | 'transferred' | 'skipped' | 'error';
type SyncStatus = 'success' | 'warning' | 'error';

export interface WpsWorkerInput {
  wpsFormId?: string | null;
  wpsSheetId?: string | null;
  wpsTableId?: string | null;
  wpsDocumentUrl?: string | null;
  projectName?: string | null;
  worksheetName?: string | null;
  name?: string | null;
  gender?: string | null;
  idCard?: string | null;
  phone?: string | null;
  bankCard?: string | null;
  entryDate?: string | null;
  workType?: string | null;
  teamName?: string | null;
}

export interface WpsWorkerSyncResult {
  success: boolean;
  action: SyncAction;
  status: SyncStatus;
  message: string;
  workerId?: number;
  workerName?: string;
  projectId?: number;
  projectName?: string;
}

const FIELD_ALIASES: Record<keyof WpsWorkerInput, string[]> = {
  wpsFormId: ['wpsFormId', 'wps_form_id', 'formId', 'form_id', 'formID', '表单ID', '表单id'],
  wpsSheetId: ['wpsSheetId', 'wps_sheet_id', 'sheetId', 'sheet_id', 'worksheetId', 'worksheet_id', '工作表ID', '工作表id'],
  wpsTableId: ['wpsTableId', 'wps_table_id', 'tableId', 'table_id', 'bitableId', 'bitable_id', '多维表格ID', '多维表格id'],
  wpsDocumentUrl: ['wpsDocumentUrl', 'wps_document_url', 'documentUrl', 'document_url', 'docUrl', 'doc_url', '文档链接', 'WPS文档链接'],
  projectName: ['projectName', 'project_name', 'project', '项目名称', '所属项目'],
  worksheetName: ['worksheetName', 'worksheet_name', 'sheetName', 'sheet_name', 'tableName', 'table_name', '工作表', '工作表名称'],
  name: ['name', 'workerName', 'worker_name', '姓名', '工人姓名'],
  gender: ['gender', 'sex', '性别'],
  idCard: ['idCard', 'id_card', 'idNumber', '身份证号', '身份证号码'],
  phone: ['phone', 'mobile', 'mobilePhone', '联系方式', '联系电话', '手机号', '手机号码', '电话'],
  bankCard: ['bankCard', 'bank_card', '银行卡号', '银行卡', '工资卡号'],
  entryDate: ['entryDate', 'entry_date', 'inDate', '入场日期', '进场日期', '入职日期'],
  workType: ['workType', 'work_type', '工种', '班组工种'],
  teamName: ['teamName', 'team_name', '班组', '队伍', '班组名称'],
};

const ATTACHMENT_KEYWORDS = ['照片', '图片', '附件', 'photo', 'image', 'file', 'attachment'];

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text || null;
  }
  if (Array.isArray(value)) {
    const text = value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join(',');
    return text || null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['text', 'value', 'name', 'displayValue', 'formattedValue']) {
      const text = normalizeText(obj[key]);
      if (text) return text;
    }
  }
  return null;
}

function pickField(source: Record<string, unknown>, aliases: string[]): string | null {
  for (const alias of aliases) {
    if (alias in source) return normalizeText(source[alias]);
  }

  const normalizedAliases = aliases.map((alias) => alias.toLowerCase().replace(/\s+/g, ''));
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
    if (normalizedAliases.includes(normalizedKey)) return normalizeText(value);
  }

  return null;
}

function flattenRecord(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== 'object') return {};
  const obj = record as Record<string, unknown>;
  const fields = (obj.fields || obj.values || obj.record || obj.data) as Record<string, unknown> | undefined;
  return {
    ...obj,
    ...(fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {}),
  };
}

export function extractWpsWorkerRecords(payload: unknown): WpsWorkerInput[] {
  const body = flattenRecord(payload);
  const candidateRecords =
    Array.isArray(payload) ? payload :
    Array.isArray(body.records) ? body.records :
    Array.isArray(body.items) ? body.items :
    Array.isArray((body.data as Record<string, unknown> | undefined)?.records) ? (body.data as Record<string, unknown>).records as unknown[] :
    Array.isArray((body.event as Record<string, unknown> | undefined)?.records) ? (body.event as Record<string, unknown>).records as unknown[] :
    [payload];

  return candidateRecords.map((record) => {
    const flat = flattenRecord(record);
    const globalProjectName =
      pickField(body, FIELD_ALIASES.projectName) ||
      pickField(body, FIELD_ALIASES.worksheetName);
    const recordProjectName =
      pickField(flat, FIELD_ALIASES.projectName) ||
      pickField(flat, FIELD_ALIASES.worksheetName) ||
      globalProjectName;

    return {
      wpsFormId: pickField(flat, FIELD_ALIASES.wpsFormId) || pickField(body, FIELD_ALIASES.wpsFormId),
      wpsSheetId: pickField(flat, FIELD_ALIASES.wpsSheetId) || pickField(body, FIELD_ALIASES.wpsSheetId),
      wpsTableId: pickField(flat, FIELD_ALIASES.wpsTableId) || pickField(body, FIELD_ALIASES.wpsTableId),
      wpsDocumentUrl: pickField(flat, FIELD_ALIASES.wpsDocumentUrl) || pickField(body, FIELD_ALIASES.wpsDocumentUrl),
      projectName: recordProjectName,
      worksheetName: pickField(flat, FIELD_ALIASES.worksheetName) || pickField(body, FIELD_ALIASES.worksheetName),
      name: pickField(flat, FIELD_ALIASES.name),
      gender: pickField(flat, FIELD_ALIASES.gender),
      idCard: pickField(flat, FIELD_ALIASES.idCard),
      phone: pickField(flat, FIELD_ALIASES.phone),
      bankCard: pickField(flat, FIELD_ALIASES.bankCard),
      entryDate: pickField(flat, FIELD_ALIASES.entryDate),
      workType: pickField(flat, FIELD_ALIASES.workType),
      teamName: pickField(flat, FIELD_ALIASES.teamName),
    };
  });
}

function sanitizeIdCard(idCard?: string | null): string | null {
  const value = idCard?.trim().toUpperCase().replace(/\s+/g, '');
  return value || null;
}

function isValidChineseIdCard(idCard?: string | null): boolean {
  if (!idCard || !/^\d{17}[\dX]$/.test(idCard)) return false;
  const birth = idCard.slice(6, 14);
  const year = Number(birth.slice(0, 4));
  const month = Number(birth.slice(4, 6));
  const day = Number(birth.slice(6, 8));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = idCard
    .slice(0, 17)
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
  return checks[sum % 11] === idCard[17];
}

function calculateAge(idCard?: string | null): number | null {
  if (!isValidChineseIdCard(idCard)) return null;
  const birth = idCard!.slice(6, 14);
  const birthDate = new Date(Number(birth.slice(0, 4)), Number(birth.slice(4, 6)) - 1, Number(birth.slice(6, 8)));
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age >= 0 && age <= 120 ? age : null;
}

function normalizeDate(value?: string | null): string | null {
  if (!value) return null;
  const text = value.trim();
  const direct = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (direct) {
    const [, y, m, d] = direct;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const timestamp = Number(text);
  if (Number.isFinite(timestamp) && timestamp > 30000 && timestamp < 90000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + timestamp);
    return excelEpoch.toISOString().slice(0, 10);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function stripNullish<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as T;
}

function buildWorkerData(input: WpsWorkerInput, projectId: number, existingEntryDate?: string | null) {
  const idCard = sanitizeIdCard(input.idCard);
  const age = calculateAge(idCard);
  const entryDate = normalizeDate(input.entryDate);

  return stripNullish({
    name: input.name?.trim(),
    work_type: input.workType?.trim() || null,
    gender: input.gender?.trim() || null,
    age,
    id_card: idCard,
    phone: input.phone?.trim() || null,
    bank_card: input.bankCard?.trim() || null,
    project_id: projectId,
    entry_date: existingEntryDate || entryDate || null,
    team_name: input.teamName?.trim() || null,
    status: 'in_service',
  });
}

function sanitizeLogFields(input: WpsWorkerInput): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (ATTACHMENT_KEYWORDS.some((word) => key.toLowerCase().includes(word))) continue;
    safe[key] = value || null;
  }
  return safe;
}

async function writeSyncLog(
  client: SupabaseClient,
  input: WpsWorkerInput,
  result: WpsWorkerSyncResult
) {
  try {
    await client.from('wps_worker_sync_logs').insert({
      source: 'wps',
      project_id: result.projectId || null,
      project_name: result.projectName || input.projectName || null,
      worksheet_name: input.worksheetName || null,
      worker_id: result.workerId || null,
      worker_name: result.workerName || input.name || null,
      id_card: sanitizeIdCard(input.idCard),
      phone: input.phone?.trim() || null,
      action: result.action,
      status: result.status,
      message: result.message,
      sanitized_fields: sanitizeLogFields(input),
    });
  } catch (error) {
    console.warn('[WPS Worker Sync] Failed to write sync log:', error);
  }
}

async function updateBindingSyncStatus(
  client: SupabaseClient,
  bindingId: number | null | undefined,
  result: WpsWorkerSyncResult
) {
  if (!bindingId) return;
  try {
    await client
      .from('wps_project_bindings')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: result.status,
        last_sync_message: result.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bindingId);
  } catch (error) {
    console.warn('[WPS Worker Sync] Failed to update binding status:', error);
  }
}

async function findProject(client: SupabaseClient, projectName?: string | null) {
  const name = projectName?.trim();
  if (!name) return null;
  const { data } = await client.from('projects').select('id, name').eq('name', name).maybeSingle();
  if (data) return data;

  const { data: projects } = await client.from('projects').select('id, name');
  const normalizedName = name.replace(/\s+/g, '').toLowerCase();
  return (projects || []).find((p: { id: number; name: string }) => p.name?.replace(/\s+/g, '').toLowerCase() === normalizedName) || null;
}

type WpsProjectBindingRow = {
  id: number;
  project_id: number;
  wps_project_name: string | null;
  worksheet_name: string | null;
  wps_form_id: string | null;
  wps_sheet_id: string | null;
  wps_table_id: string | null;
  wps_document_url?: string | null;
  projects?: { id: number; name: string } | { id: number; name: string }[] | null;
};

function getBindingProject(binding: WpsProjectBindingRow | null) {
  if (!binding?.projects) return null;
  return Array.isArray(binding.projects) ? binding.projects[0] : binding.projects;
}

async function findProjectByBinding(client: SupabaseClient, input: WpsWorkerInput): Promise<WpsProjectBindingRow | null> {
  const clean = (value?: string | null) => value?.trim() || null;
  const selectFields = 'id, project_id, wps_project_name, worksheet_name, wps_document_url, wps_form_id, wps_sheet_id, wps_table_id, projects(id, name)';

  for (const [column, value] of [
    ['wps_form_id', clean(input.wpsFormId)],
    ['wps_sheet_id', clean(input.wpsSheetId)],
    ['wps_table_id', clean(input.wpsTableId)],
    ['wps_document_url', clean(input.wpsDocumentUrl)],
  ] as const) {
    if (!value) continue;
    const { data } = await client
      .from('wps_project_bindings')
      .select(selectFields)
      .eq('is_active', true)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    if (getBindingProject(data as WpsProjectBindingRow | null)) return data as WpsProjectBindingRow;
  }

  const names = [clean(input.projectName), clean(input.worksheetName)].filter(Boolean) as string[];
  if (names.length === 0) return null;

  const { data: bindings } = await client
    .from('wps_project_bindings')
    .select(selectFields)
    .eq('is_active', true);

  for (const name of names) {
    const normalizedName = name.replace(/\s+/g, '').toLowerCase();
    const matched = ((bindings || []) as WpsProjectBindingRow[]).find((binding) => {
      const wpsName = binding.wps_project_name?.replace(/\s+/g, '').toLowerCase();
      const sheetName = binding.worksheet_name?.replace(/\s+/g, '').toLowerCase();
      return wpsName === normalizedName || sheetName === normalizedName;
    });
    if (getBindingProject(matched || null)) return matched || null;
  }

  return null;
}

async function findExistingWorker(client: SupabaseClient, input: WpsWorkerInput) {
  const idCard = sanitizeIdCard(input.idCard);
  if (isValidChineseIdCard(idCard)) {
    const { data } = await client
      .from('workers')
      .select('id, name, id_card, phone, project_id, entry_date')
      .eq('id_card', idCard)
      .maybeSingle();
    if (data) return data;
  }

  const name = input.name?.trim();
  const phone = input.phone?.trim();
  if (name && phone) {
    const { data } = await client
      .from('workers')
      .select('id, name, id_card, phone, project_id, entry_date')
      .eq('name', name)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

async function upsertActiveAssignment(client: SupabaseClient, workerId: number, projectId: number, startDate: string | null) {
  const { data: existing } = await client
    .from('worker_assignments')
    .select('id, start_date')
    .eq('worker_id', workerId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (existing?.id) {
    await client
      .from('worker_assignments')
      .update({ status: 'active', start_date: existing.start_date || startDate, end_date: null })
      .eq('id', existing.id);
    return;
  }

  await insertWithSequenceFix('worker_assignments', {
    worker_id: workerId,
    project_id: projectId,
    start_date: startDate,
    status: 'active',
  }, client);
}

async function transferWorker(
  client: SupabaseClient,
  workerId: number,
  oldProjectId: number | null,
  newProjectId: number,
  startDate: string | null
) {
  const transferStart = startDate || todayString();

  if (oldProjectId) {
    await client
      .from('worker_assignments')
      .update({ status: 'transferred', end_date: transferStart })
      .eq('worker_id', workerId)
      .eq('project_id', oldProjectId)
      .eq('status', 'active');
  }

  await upsertActiveAssignment(client, workerId, newProjectId, transferStart);
}

export async function syncWpsWorkerRecord(
  client: SupabaseClient,
  input: WpsWorkerInput
): Promise<WpsWorkerSyncResult> {
  let result: WpsWorkerSyncResult | null = null;
  let bindingId: number | null = null;

  try {
    if (!input.name?.trim()) {
      result = { success: false, action: 'skipped', status: 'warning', message: '缺少姓名，已跳过' };
      return result;
    }

    const binding = await findProjectByBinding(client, input);
    bindingId = binding?.id || null;
    const project = getBindingProject(binding) || await findProject(client, input.projectName || input.worksheetName);
    if (!project) {
      result = {
        success: false,
        action: 'error',
        status: 'error',
        message: `未找到项目：${input.projectName || input.worksheetName || '未提供项目名称'}`,
        workerName: input.name.trim(),
      };
      return result;
    }

    const existing = await findExistingWorker(client, input);
    const entryDate = normalizeDate(input.entryDate);

    if (!existing) {
      const insertData = buildWorkerData(input, project.id);
      const { data, error } = await insertWithSequenceFix('workers', insertData, client);
      if (error) throw error;
      const worker = Array.isArray(data) ? data[0] : data;
      await upsertActiveAssignment(client, worker.id, project.id, entryDate);

      result = {
        success: true,
        action: 'created',
        status: 'success',
        message: '已新增工人档案',
        workerId: worker.id,
        workerName: worker.name,
        projectId: project.id,
        projectName: project.name,
      };
      return result;
    }

    const updateData = buildWorkerData(input, project.id, existing.entry_date);
    const isTransfer = existing.project_id && existing.project_id !== project.id;

    if (isTransfer) {
      await transferWorker(client, existing.id, existing.project_id, project.id, entryDate);
    } else {
      await upsertActiveAssignment(client, existing.id, project.id, entryDate || existing.entry_date || null);
    }

    const { error: updateError } = await client
      .from('workers')
      .update(updateData)
      .eq('id', existing.id);
    if (updateError) throw updateError;

    result = {
      success: true,
      action: isTransfer ? 'transferred' : 'updated',
      status: 'success',
      message: isTransfer ? '已更新档案并调入当前项目' : '已更新同项目工人档案',
      workerId: existing.id,
      workerName: input.name.trim(),
      projectId: project.id,
      projectName: project.name,
    };
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步失败';
    result = {
      success: false,
      action: 'error',
      status: 'error',
      message,
      workerName: input.name || undefined,
    };
    return result;
  } finally {
    if (result) {
      await writeSyncLog(client, input, result);
      await updateBindingSyncStatus(client, bindingId, result);
    }
  }
}
