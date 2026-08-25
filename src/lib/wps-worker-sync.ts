import type { SupabaseClient } from '@supabase/supabase-js';
import { insertWithSequenceFix } from '@/lib/audit-log';

type SyncAction = 'created' | 'updated' | 'transferred' | 'skipped' | 'error';
type SyncStatus = 'success' | 'warning' | 'error';
type FieldSyncDetailType = 'filled' | 'conflict' | 'kept';

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
  status?: string | null;
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
  filledFields?: string[];
  conflictFields?: string[];
  duplicateSkipped?: boolean;
  details?: WpsWorkerFieldSyncDetail[];
}

export interface WpsWorkerFieldSyncDetail {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
  type: FieldSyncDetailType;
}

const FIELD_ALIASES: Record<keyof WpsWorkerInput, string[]> = {
  wpsFormId: ['wpsFormId', 'wps_form_id', 'formId', 'form_id', 'formID', '表单ID', '表单id'],
  wpsSheetId: ['wpsSheetId', 'wps_sheet_id', 'sheetId', 'sheet_id', 'worksheetId', 'worksheet_id', '工作表ID', '工作表id'],
  wpsTableId: ['wpsTableId', 'wps_table_id', 'tableId', 'table_id', 'bitableId', 'bitable_id', '多维表格ID', '多维表格id'],
  wpsDocumentUrl: ['wpsDocumentUrl', 'wps_document_url', 'documentUrl', 'document_url', 'docUrl', 'doc_url', '文档链接', 'WPS文档链接'],
  projectName: ['projectName', 'project_name', 'project', '项目名称', '所属项目', '项目', '工程名称', '所属工程'],
  worksheetName: ['worksheetName', 'worksheet_name', 'sheetName', 'sheet_name', 'tableName', 'table_name', '工作表', '工作表名称'],
  name: ['name', 'workerName', 'worker_name', '姓名', '工人姓名', '人员姓名', '员工姓名'],
  gender: ['gender', 'sex', '性别'],
  idCard: ['idCard', 'id_card', 'idNumber', 'id_number', '身份证号', '身份证号码', '身份证', '证件号码'],
  phone: ['phone', 'mobile', 'mobilePhone', 'mobile_phone', '联系方式', '联系电话', '手机号', '手机号码', '电话', '电话号码'],
  bankCard: ['bankCard', 'bank_card', '银行卡号', '银行卡', '工资卡号', '银行卡号码', '开户卡号'],
  entryDate: ['entryDate', 'entry_date', 'inDate', '入场日期', '进场日期', '入职日期', '入场时间', '进场时间'],
  workType: ['workType', 'work_type', '工种', '班组工种'],
  teamName: ['teamName', 'team_name', '班组', '队伍', '班组名称', '施工班组'],
  status: ['status', 'workerStatus', 'worker_status', '人员状态', '状态', '在场状态', '工人状态', '是否在场'],
};

const ATTACHMENT_KEYWORDS = ['照片', '图片', '附件', '影像', '扫描件', 'photo', 'image', 'file', 'attachment', 'upload'];

const WORKER_FIELD_LABELS: Record<string, string> = {
  name: '姓名',
  work_type: '工种',
  gender: '性别',
  age: '年龄',
  id_card: '身份证号',
  phone: '联系方式',
  bank_card: '银行卡号',
  entry_date: '入场日期',
  team_name: '班组',
  status: '人员状态',
};

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
  const fields = (obj.fields || obj.values || obj.record || obj.data || obj.formData || obj.form_data) as Record<string, unknown> | undefined;
  return {
    ...obj,
    ...(fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {}),
  };
}

function asRecordArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function getNestedRecordArray(source: Record<string, unknown>, paths: string[][]): unknown[] | null {
  for (const path of paths) {
    let current: unknown = source;
    for (const key of path) {
      if (!current || typeof current !== 'object' || !(key in (current as Record<string, unknown>))) {
        current = null;
        break;
      }
      current = (current as Record<string, unknown>)[key];
    }
    const records = asRecordArray(current);
    if (records) return records;
  }
  return null;
}

function hasMeaningfulWorkerSignal(input: WpsWorkerInput): boolean {
  return Boolean(
    input.name ||
    input.idCard ||
    input.phone ||
    input.bankCard ||
    input.entryDate ||
    input.workType ||
    input.teamName
  );
}

export function extractWpsWorkerRecords(payload: unknown): WpsWorkerInput[] {
  const body = flattenRecord(payload);
  const nestedRecords = getNestedRecordArray(body, [
    ['records'],
    ['items'],
    ['rows'],
    ['list'],
    ['data', 'records'],
    ['data', 'items'],
    ['data', 'rows'],
    ['data', 'list'],
    ['event', 'records'],
    ['event', 'items'],
    ['event', 'data', 'records'],
    ['payload', 'records'],
    ['payload', 'items'],
    ['payload', 'rows'],
  ]);
  const candidateRecords = Array.isArray(payload) ? payload : nestedRecords || [payload];

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
      status: pickField(flat, FIELD_ALIASES.status),
    };
  }).filter(hasMeaningfulWorkerSignal);
}

function compactText(value?: string | null): string | null {
  const text = value?.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  return text || null;
}

function sanitizeIdCard(idCard?: string | null): string | null {
  const text = compactText(idCard)?.toUpperCase();
  if (!text) return null;

  const compact = text.replace(/\s+/g, '');
  const validCandidate = compact.match(/\d{17}[\dX]/);
  if (validCandidate) return validCandidate[0];

  const loose = compact.replace(/[^0-9X]/g, '');
  if (/^\d{15}$/.test(loose) || /^\d{17}[\dX]$/.test(loose)) return loose;

  return compact.length <= 18 ? compact : null;
}

function sanitizePhone(phone?: string | null): string | null {
  const text = compactText(phone);
  if (!text) return null;

  const mobile = text.match(/(?:\+?86[-\s]?)?(1[3-9]\d{9})/);
  if (mobile?.[1]) return mobile[1];

  const digits = text.replace(/[^\d]/g, '');
  if (digits.length >= 7 && digits.length <= 20) return digits;

  const compact = text.replace(/\s+/g, '');
  return compact.length <= 20 ? compact : null;
}

function sanitizeBankCard(bankCard?: string | null): string | null {
  const text = compactText(bankCard);
  if (!text) return null;

  const digits = text.replace(/[^\d]/g, '');
  if (digits.length >= 8 && digits.length <= 30) return digits;

  const compact = text.replace(/\s+/g, '').replace(/-/g, '');
  return compact.length <= 30 ? compact : null;
}

function sanitizeLimitedText(value: string | null | undefined, maxLength: number): string | null {
  const text = compactText(value);
  if (!text) return null;
  return text.length <= maxLength ? text : text.slice(0, maxLength);
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

function normalizeWorkerStatus(value?: string | null, fallback?: string | null) {
  const text = value?.trim().toLowerCase().replace(/\s+/g, '');
  if (!text) return fallback || 'in_service';

  const leftValues = ['left', 'inactive', '退场', '离场', '离职', '已退场', '已离场', '已离职', '不在场'];
  const archivedValues = ['archived', 'archive', '归档', '已归档'];
  const activeValues = ['in_service', 'active', '在场', '在岗', '在职', '正常', '已入场', '入场'];

  if (leftValues.includes(text)) return 'left';
  if (archivedValues.includes(text)) return 'archived';
  if (activeValues.includes(text)) return 'in_service';
  return fallback || 'in_service';
}

function stripNullish<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as T;
}

function isBlankValue(value: unknown) {
  return value === null || value === undefined || String(value).trim() === '';
}

function normalizeComparableValue(field: string, value: unknown) {
  if (isBlankValue(value)) return '';
  const text = String(value).trim();
  if (field === 'id_card') return sanitizeIdCard(text) || '';
  if (field === 'phone') return sanitizePhone(text) || '';
  if (field === 'bank_card') return sanitizeBankCard(text) || '';
  if (field === 'entry_date') return normalizeDate(text) || text;
  if (field === 'status') return normalizeWorkerStatus(text);
  return text.replace(/\s+/g, '');
}

function maskDetailValue(field: string, value: unknown): string | null {
  if (isBlankValue(value)) return null;
  const text = String(value).trim();
  if (field === 'id_card') {
    if (text.length < 8) return text.replace(/.(?=.{2})/g, '*');
    return `${text.slice(0, 3)}***********${text.slice(-4)}`;
  }
  if (field === 'phone') {
    if (text.length < 7) return text;
    return `${text.slice(0, 3)}****${text.slice(-4)}`;
  }
  if (field === 'bank_card') {
    if (text.length < 8) return text.replace(/.(?=.{4})/g, '*');
    return `${text.slice(0, 4)} **** **** ${text.slice(-4)}`;
  }
  return text;
}

function buildFieldDetail(
  field: string,
  before: unknown,
  after: unknown,
  type: FieldSyncDetailType
): WpsWorkerFieldSyncDetail {
  return {
    field,
    label: WORKER_FIELD_LABELS[field] || field,
    before: maskDetailValue(field, before),
    after: maskDetailValue(field, after),
    type,
  };
}

function buildWorkerData(input: WpsWorkerInput, projectId: number, existingEntryDate?: string | null) {
  const idCard = sanitizeIdCard(input.idCard);
  const phone = sanitizePhone(input.phone);
  const bankCard = sanitizeBankCard(input.bankCard);
  const age = calculateAge(idCard);
  const entryDate = normalizeDate(input.entryDate);

  return stripNullish({
    name: sanitizeLimitedText(input.name, 100),
    work_type: sanitizeLimitedText(input.workType, 50),
    gender: sanitizeLimitedText(input.gender, 10),
    age,
    id_card: idCard,
    phone,
    bank_card: bankCard,
    project_id: projectId,
    entry_date: existingEntryDate || entryDate || null,
    team_name: sanitizeLimitedText(input.teamName, 100),
    status: normalizeWorkerStatus(input.status),
  });
}

type ExistingWorkerRow = {
  id: number;
  name?: string | null;
  work_type?: string | null;
  gender?: string | null;
  age?: number | null;
  id_card?: string | null;
  phone?: string | null;
  bank_card?: string | null;
  project_id?: number | null;
  entry_date?: string | null;
  team_name?: string | null;
  status?: string | null;
};

function buildWorkerUpdateData(input: WpsWorkerInput, projectId: number, existing: ExistingWorkerRow) {
  const idCard = sanitizeIdCard(input.idCard);
  const phone = sanitizePhone(input.phone);
  const bankCard = sanitizeBankCard(input.bankCard);
  const age = calculateAge(idCard);
  const entryDate = normalizeDate(input.entryDate);
  const details: WpsWorkerFieldSyncDetail[] = [];

  const choose = (field: string, inputValue: string | number | null | undefined, existingValue: string | number | null | undefined) => {
    const value = isBlankValue(existingValue)
      ? (isBlankValue(inputValue) ? null : inputValue)
      : existingValue;
    if (isBlankValue(existingValue) && !isBlankValue(inputValue)) {
      details.push(buildFieldDetail(field, existingValue, inputValue, 'filled'));
    } else if (!isBlankValue(existingValue) && !isBlankValue(inputValue)) {
      const before = normalizeComparableValue(field, existingValue);
      const after = normalizeComparableValue(field, inputValue);
      if (before && after && before !== after) {
        details.push(buildFieldDetail(field, existingValue, inputValue, 'conflict'));
      }
    }
    return value;
  };

  const normalizedStatus = input.status ? normalizeWorkerStatus(input.status, 'in_service') : null;
  const data = stripNullish({
    // 信息补全策略：本地缺失才用花名册补全，本地已有则保留（避免花名册缺/错值覆盖）
    name: choose('name', sanitizeLimitedText(input.name, 100), existing.name),
    work_type: choose('work_type', sanitizeLimitedText(input.workType, 50), existing.work_type),
    gender: choose('gender', sanitizeLimitedText(input.gender, 10), existing.gender),
    age: choose('age', age, existing.age),
    id_card: choose('id_card', idCard, existing.id_card),
    phone: choose('phone', phone, existing.phone),
    bank_card: choose('bank_card', bankCard, existing.bank_card),
    project_id: projectId,
    entry_date: choose('entry_date', entryDate, existing.entry_date),
    team_name: choose('team_name', sanitizeLimitedText(input.teamName, 100), existing.team_name),
    // 状态补全原则：本地已有状态则保留（花名册状态可能过期/错误），本地缺失时才用花名册
    status: choose('status', normalizedStatus, existing.status || null) || 'in_service',
  });

  return {
    data,
    details,
    filledFields: details.filter((item) => item.type === 'filled').map((item) => item.label),
    conflictFields: details.filter((item) => item.type === 'conflict').map((item) => item.label),
  };
}

function sanitizeLogFields(input: WpsWorkerInput): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (ATTACHMENT_KEYWORDS.some((word) => key.toLowerCase().includes(word))) continue;
    if (key === 'idCard') {
      safe[key] = sanitizeIdCard(value as string | null) || null;
    } else if (key === 'phone') {
      safe[key] = sanitizePhone(value as string | null) || null;
    } else if (key === 'bankCard') {
      safe[key] = sanitizeBankCard(value as string | null) || null;
    } else {
      safe[key] = value || null;
    }
  }
  return safe;
}

function friendlySyncError(error: unknown): string {
  const fallback = '同步失败';
  if (!error || typeof error !== 'object') return error instanceof Error ? error.message : fallback;

  const err = error as { message?: string; details?: string; hint?: string; code?: string };
  const raw = [err.message, err.details, err.hint, err.code].filter(Boolean).join(' ');

  if (/character varying\(18\)|varchar\(18\)/i.test(raw)) {
    return '身份证号字段超过 18 位或映射到了错误字段，请检查 WPS 字段映射中的“身份证号”';
  }
  if (/character varying\(20\)|varchar\(20\)/i.test(raw)) {
    return '手机号、入场日期或人员状态字段长度异常，请检查 WPS 字段映射是否选到了备注/附件/图片等字段';
  }
  if (/character varying\(30\)|varchar\(30\)/i.test(raw)) {
    return '银行卡号或联系方式字段长度异常，请检查 WPS 字段映射是否选到了附件/图片等字段';
  }
  if (/workers_project_id_card_unique_idx/i.test(raw)) {
    return '项目内已存在相同身份证号的工人，系统未自动新增；请核对是否重复或先修正花名册档案';
  }
  if (/workers_project_id_name_unique_idx/i.test(raw)) {
    return '项目内已存在同名工人，系统未自动新增；请核对姓名是否重复或补全身份证号后再同步';
  }
  if (/worker_assignments_worker_project_key/i.test(raw)) {
    return '该工人的项目调入记录已存在，系统未重复写入；请刷新后查看工人项目归属';
  }

  return err.message || fallback;
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
      phone: sanitizePhone(input.phone),
      action: result.action,
      status: result.status,
      message: result.message,
      sanitized_fields: {
        ...sanitizeLogFields(input),
        syncDetails: result.details && result.details.length > 0
          ? {
              filledFields: result.filledFields || [],
              conflictFields: result.conflictFields || [],
              details: result.details,
            }
          : null,
        duplicateSkipped: result.duplicateSkipped || false,
      },
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

async function resolveBindingProject(client: SupabaseClient, binding: WpsProjectBindingRow | null) {
  const relatedProject = getBindingProject(binding);
  if (relatedProject?.id && relatedProject.name) return relatedProject;
  if (!binding?.project_id) return null;

  const { data } = await client
    .from('projects')
    .select('id, name')
    .eq('id', binding.project_id)
    .maybeSingle();
  return data || null;
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
    if (data) return data as WpsProjectBindingRow;
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
    if (matched) return matched;
  }

  return null;
}

/**
 * 查找已存在的工人记录。
 *
 * 匹配策略（按优先级）：
 * 1. 项目内 + 身份证号       —— 同项目同名同证，直接命中（更新，不重复创建）
 * 2. 项目内 + 姓名 + 电话     —— 同项目同人
 * 3. 项目内 + 姓名 + 银行卡   —— 电话缺失时继续用稳定字段识别
 * 4. 项目内 + 纯姓名          —— 系统花名册只有姓名时，命中后由 buildWorkerUpdateData 自动补齐身份证/电话
 * 5. 跨项目 + 身份证号       —— 调岗场景（同一人换项目）
 * 6. 跨项目 + 姓名 + 电话     —— 调岗场景
 * 7. 跨项目 + 姓名 + 银行卡   —— 调岗场景
 *
 * 注意：不做"跨项目纯姓名匹配"，避免同名不同人被错误合并。
 */
async function findExistingWorker(client: SupabaseClient, input: WpsWorkerInput, projectId?: number | null) {
  const idCard = sanitizeIdCard(input.idCard);
  const name = input.name?.trim();
  const phone = sanitizePhone(input.phone);
  const bankCard = sanitizeBankCard(input.bankCard);
  const selectFields = 'id, name, work_type, gender, age, id_card, phone, bank_card, project_id, entry_date, team_name, status';

  // 1. 项目内 + 身份证号
  if (idCard && projectId) {
    const { data } = await client
      .from('workers')
      .select(selectFields)
      .eq('project_id', projectId)
      .eq('id_card', idCard)
      .limit(1)
      .maybeSingle();
    if (data) return data as ExistingWorkerRow;
  }

  // 2. 项目内 + 姓名 + 电话
  if (name && phone && projectId) {
    const { data } = await client
      .from('workers')
      .select(selectFields)
      .eq('project_id', projectId)
      .eq('name', name)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (data) return data as ExistingWorkerRow;
  }

  // 3. 项目内 + 姓名 + 银行卡
  if (name && bankCard && projectId) {
    const { data } = await client
      .from('workers')
      .select(selectFields)
      .eq('project_id', projectId)
      .eq('name', name)
      .eq('bank_card', bankCard)
      .limit(1)
      .maybeSingle();
    if (data) return data as ExistingWorkerRow;
  }

  // 4. 项目内 + 纯姓名（系统花名册只有姓名时，命中后补齐身份证/电话）
  if (name && projectId) {
    const { data } = await client
      .from('workers')
      .select(selectFields)
      .eq('project_id', projectId)
      .eq('name', name)
      .limit(1)
      .maybeSingle();
    if (data) return data as ExistingWorkerRow;
  }

  // 5. 跨项目 + 身份证号（调岗）
  if (isValidChineseIdCard(idCard)) {
    const { data } = await client
      .from('workers')
      .select(selectFields)
      .eq('id_card', idCard)
      .limit(1)
      .maybeSingle();
    if (data) return data as ExistingWorkerRow;
  }

  // 6. 跨项目 + 姓名 + 电话（调岗）
  if (name && phone) {
    const { data } = await client
      .from('workers')
      .select(selectFields)
      .eq('name', name)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (data) return data as ExistingWorkerRow;
  }

  // 7. 跨项目 + 姓名 + 银行卡（调岗）
  if (name && bankCard) {
    const { data } = await client
      .from('workers')
      .select(selectFields)
      .eq('name', name)
      .eq('bank_card', bankCard)
      .limit(1)
      .maybeSingle();
    if (data) return data as ExistingWorkerRow;
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
    const project = await resolveBindingProject(client, binding) || await findProject(client, input.projectName || input.worksheetName);
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

    const existing = await findExistingWorker(client, input, project.id);
    const entryDate = normalizeDate(input.entryDate);

    // 去重保护：项目内已存在同名但身份证不同的人员 → 跳过并提示（防止同名不同人被误合并/改错身份证）
    if (existing && existing.id_card) {
      const inputIdCard = sanitizeIdCard(input.idCard);
      if (isValidChineseIdCard(inputIdCard) && String(existing.id_card).toUpperCase() !== inputIdCard) {
        result = {
          success: false,
          action: 'skipped',
          status: 'warning',
          message: `项目内已存在同名工人「${existing.name}」但身份证不一致（系统${existing.id_card} vs 花名册${inputIdCard}）。为避免误改已跳过；如确为同一人，请先在花名册中修正身份证后再同步`,
          workerName: input.name.trim(),
        };
        return result;
      }
    }

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

    const updatePayload = buildWorkerUpdateData(input, project.id, existing as ExistingWorkerRow);
    const isTransfer = existing.project_id && existing.project_id !== project.id;

    if (isTransfer) {
      await transferWorker(client, existing.id, existing.project_id ?? null, project.id, entryDate);
    } else {
      await upsertActiveAssignment(client, existing.id, project.id, entryDate || existing.entry_date || null);
    }

    const { error: updateError } = await client
      .from('workers')
      .update(updatePayload.data)
      .eq('id', existing.id);
    if (updateError) throw updateError;

    const filledText = updatePayload.filledFields.length > 0
      ? `，自动补齐：${updatePayload.filledFields.join('、')}`
      : '';
    const conflictText = updatePayload.conflictFields.length > 0
      ? `；发现字段差异：${updatePayload.conflictFields.join('、')}，已保留系统原值`
      : '';

    result = {
      success: true,
      action: isTransfer ? 'transferred' : 'updated',
      status: 'success',
      message: `${isTransfer ? '已更新档案并调入当前项目' : '已更新同项目工人档案'}${filledText}${conflictText}`,
      workerId: existing.id,
      workerName: input.name.trim(),
      projectId: project.id,
      projectName: project.name,
      filledFields: updatePayload.filledFields,
      conflictFields: updatePayload.conflictFields,
      details: updatePayload.details,
    };
    return result;
  } catch (error) {
    const message = friendlySyncError(error);
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
