import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { fetchAllRows } from '@/lib/fetch-all-rows';
import { deleteFile, listFiles, readFile, uploadFileAtKey } from '@/lib/oss-storage';

/**
 * 数据备份：把业务表导出成 JSONL.gz（可选 AES-256-GCM 加密），上传到对象存储（阿里云 OSS）。
 *
 * 设计要点：
 * - 走服务端 REST 分页读取，不依赖直连数据库/不需要数据库密码
 * - 每张表一个文件 + manifest（行数 + SHA256），可校验完整性
 * - 加密密钥取 BACKUP_ENCRYPTION_KEY（缺省则不加密，但会在页面上明确提示）
 * - 每日保留 30 天；每月 1 号的备份按月度归档保留 365 天
 */

export const BACKUP_ROOT = 'backup';
const MAGIC = 'DSHBAK1';

/** 业务表清单（缺失的表会自动跳过，不影响整体备份） */
export const BACKUP_TABLES: string[] = [
  'projects',
  'persons',
  'workers',
  'worker_assignments',
  'worker_salaries',
  'salary_payments',
  'team_groups',
  'team_settlements',
  'team_settlement_items',
  'team_settlement_splits',
  'team_settlement_payments',
  'team_settlement_attachments',
  'client_reports',
  'client_payments',
  'visas',
  'suppliers',
  'supplier_contracts',
  'supplier_settlements',
  'supplier_payments',
  'supplier_contract_logs',
  'comprehensive_expenses',
  'miscellaneous_materials',
  'work_items',
  'work_item_subitems',
  'work_item_progress',
  'subitem_monthly_reports',
  'subitem_monthly_progress',
  'project_internal_addons',
  'internal_addon_templates',
  'construction_logs',
  'construction_log_attendance',
  'construction_log_comments',
  'construction_daily_reports',
  'construction_daily_report_reads',
  'living_allowance_records',
  'living_allowance_receipts',
  'living_allowance_receipt_items',
  'monthly_report_workflows',
  'settlements',
  'payments',
  'settlement_evidence_records',
  'users',
  'roles',
  'user_permissions',
  'notifications',
  'notification_settings',
  'audit_logs',
  'certificates',
  'cost_estimation_projects',
  'limit_prices',
  'dingtalk_bindings',
  'dingtalk_todo_tasks',
  'ai_configs',
  'ai_knowledge_docs',
];

function getKey(): Buffer | null {
  const raw = String(process.env.BACKUP_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  // 支持 64 位 hex 或任意口令（用 scrypt 派生）
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.scryptSync(raw, 'dsh-backup-salt', 32);
}

function encrypt(buffer: Buffer): { data: Buffer; encrypted: boolean } {
  const key = getKey();
  if (!key) return { data: buffer, encrypted: false };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    data: Buffer.concat([Buffer.from(MAGIC, 'utf8'), iv, tag, encrypted]),
    encrypted: true,
  };
}

export function decryptBackup(buffer: Buffer): Buffer {
  if (buffer.subarray(0, MAGIC.length).toString('utf8') !== MAGIC) return buffer; // 未加密
  const key = getKey();
  if (!key) throw new Error('备份文件已加密，但服务端未配置 BACKUP_ENCRYPTION_KEY');
  const iv = buffer.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = buffer.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const payload = buffer.subarray(MAGIC.length + 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

export function todayKey(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export type BackupManifest = {
  date: string;
  createdAt: string;
  encrypted: boolean;
  tables: Array<{ table: string; rows: number; bytes: number; sha256: string; key: string }>;
  skipped: Array<{ table: string; reason: string }>;
  totalRows: number;
  totalBytes: number;
};

/** 执行一次全量备份，返回 manifest 和数据库记录 id */
export async function runBackup(options?: { date?: string; tables?: string[] }) {
  const client = getSupabaseClient();
  const date = options?.date || todayKey();
  const tables = options?.tables && options.tables.length > 0 ? options.tables : BACKUP_TABLES;

  const { data: job, error: jobError } = await client
    .from('data_backups')
    .insert({ backup_date: date, status: 'running', started_at: new Date().toISOString() })
    .select('id')
    .single();
  if (jobError) throw new Error(`创建备份任务失败：${jobError.message}`);
  const jobId = Number(job.id);

  const manifest: BackupManifest = {
    date,
    createdAt: new Date().toISOString(),
    encrypted: Boolean(getKey()),
    tables: [],
    skipped: [],
    totalRows: 0,
    totalBytes: 0,
  };

  try {
    for (const table of tables) {
      try {
        const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
          client.from(table).select('*').range(from, to));
        const jsonl = rows.map((row) => JSON.stringify(row)).join('\n');
        const plain = Buffer.from(jsonl, 'utf8');
        const gz = zlib.gzipSync(plain);
        const sha256 = crypto.createHash('sha256').update(plain).digest('hex');
        const { data, encrypted } = encrypt(gz);
        const key = `${BACKUP_ROOT}/${date}/${table}.jsonl.gz${encrypted ? '.enc' : ''}`;
        await uploadFileAtKey({ key, buffer: data, contentType: 'application/octet-stream' });
        manifest.tables.push({ table, rows: rows.length, bytes: data.length, sha256, key });
        manifest.totalRows += rows.length;
        manifest.totalBytes += data.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // 表不存在/无权限：记入 skipped，不中断整次备份
        manifest.skipped.push({ table, reason: message.slice(0, 200) });
      }
    }

    const manifestKey = `${BACKUP_ROOT}/${date}/manifest.json`;
    await uploadFileAtKey({
      key: manifestKey,
      buffer: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
      contentType: 'application/json',
    });

    await client.from('data_backups').update({
      status: 'success',
      table_count: manifest.tables.length,
      row_count: manifest.totalRows,
      size_bytes: manifest.totalBytes,
      manifest_key: manifestKey,
      encrypted: manifest.encrypted,
      finished_at: new Date().toISOString(),
      error: manifest.skipped.length > 0 ? `跳过 ${manifest.skipped.length} 张表` : null,
    }).eq('id', jobId);

    return { jobId, manifest };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.from('data_backups').update({
      status: 'failed',
      error: message.slice(0, 500),
      finished_at: new Date().toISOString(),
    }).eq('id', jobId);
    throw error;
  }
}

/** 清理过期备份：每日保留 30 天，每月 1 号保留 365 天 */
export async function cleanupOldBackups(days = 30, archiveDays = 365) {
  const today = new Date();
  const result = await listFiles({ prefix: `${BACKUP_ROOT}/`, maxKeys: 1000 });
  const files = result?.keys || [];
  let deleted = 0;
  for (const key of files) {
    const match = new RegExp(`^${BACKUP_ROOT}/(\\d{4}-\\d{2}-\\d{2})/`).exec(key);
    if (!match) continue;
    const day = match[1];
    const ageDays = Math.floor((today.getTime() - new Date(`${day}T00:00:00+08:00`).getTime()) / 86400000);
    const isMonthlyArchive = day.endsWith('-01');
    const limit = isMonthlyArchive ? archiveDays : days;
    if (ageDays > limit) {
      try {
        await deleteFile({ fileKey: key });
        deleted += 1;
      } catch {
        // 单个文件删除失败不影响整体
      }
    }
  }
  return { deleted };
}

/** 读取并解密某个备份文件 */
export async function readBackupFile(key: string): Promise<Buffer> {
  const buffer = await readFile({ fileKey: key });
  return decryptBackup(buffer);
}

/** 把某天的某张表恢复回去（按 id upsert，不删除现有数据） */
export async function restoreTable(params: { date: string; table: string }) {
  if (!BACKUP_TABLES.includes(params.table)) throw new Error('该表不在备份白名单内');
  const client = getSupabaseClient();
  const prefix = `${BACKUP_ROOT}/${params.date}/${params.table}.jsonl.gz`;
  let buffer: Buffer;
  try {
    buffer = await readBackupFile(`${prefix}.enc`);
  } catch {
    buffer = await readBackupFile(prefix);
  }
  const text = zlib.gunzipSync(buffer).toString('utf8');
  const rows = text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  let restored = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await client.from(params.table).upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`恢复 ${params.table} 失败：${error.message}`);
    restored += chunk.length;
  }
  return { restored };
}
