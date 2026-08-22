import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

type MigrationMode = 'postgres' | 'supabase-rpc' | 'manual';

export type MigrationResult = {
  ok: boolean;
  mode: MigrationMode;
  message: string;
  error?: string;
  sql: string;
  manualUrl?: string;
};

/**
 * 数据库迁移 SQL（单一真源 = migrations/ 目录）
 *
 * 方案 A 重构：不再维护内联巨型 SQL，而是运行时按文件名顺序读取 migrations/*.sql。
 * - 约定：每个迁移文件必须幂等（CREATE TABLE IF NOT EXISTS / ALTER TABLE IF EXISTS / ON CONFLICT）
 * - 排除 apply_all_pending.sql：它是"一键手动执行"的汇总脚本，内容与 create_ai_tables /
 *   create_supplier_module_tables 重复，自动执行会重复插入种子数据
 * - 00_legacy_inline_full.sql 为历史内联 SQL 的完整归档（保证不丢任何建表/索引/策略）
 */
const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

/** 排除的汇总脚本 */
const EXCLUDED_FILES = new Set(['apply_all_pending.sql']);

export function buildMigrationSql(): string {
  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !EXCLUDED_FILES.has(f))
      .sort();
  } catch {
    // 目录不存在（如某些构建环境未复制 migrations/）时回退到空，由调用方报错提示
    return '';
  }

  const parts = files.map((f) => {
    const content = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    return `-- ============ ${f} ============\n${content}`;
  });

  return parts.join('\n\n');
}

export const MIGRATION_SQL = buildMigrationSql();


function getSupabaseProjectRef() {
  const supabaseUrl = process.env.COZE_SUPABASE_URL || '';
  return supabaseUrl ? supabaseUrl.replace('https://', '').split('.')[0] : '';
}

export function getMigrationManualUrl() {
  const projectRef = getSupabaseProjectRef();
  return projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : undefined;
}

function getPostgresConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ''
  );
}

async function runWithPostgresClient(connectionString: string) {
  const { Client } = await import('pg');
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    await client.query(MIGRATION_SQL);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function runWithSupabaseRpc() {
  const supabaseUrl = process.env.COZE_SUPABASE_URL || '';
  const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    throw new Error('缺少 COZE_SUPABASE_URL 或 COZE_SUPABASE_SERVICE_ROLE_KEY');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const attempts = [
    { functionName: 'exec_sql', args: { query: MIGRATION_SQL } },
    { functionName: 'exec_sql', args: { sql: MIGRATION_SQL } },
    { functionName: 'execute_sql', args: { sql_text: MIGRATION_SQL } },
    { functionName: 'execute_sql', args: { query: MIGRATION_SQL } },
    { functionName: 'execute_sql', args: { sql: MIGRATION_SQL } },
  ];
  let lastError = '';

  for (const attempt of attempts) {
    const { error } = await admin.rpc(attempt.functionName, attempt.args);
    if (!error) return;
    lastError = error.message || JSON.stringify(error);
  }

  throw new Error(lastError || 'Supabase SQL RPC 执行失败');
}

export async function runMigrations(): Promise<MigrationResult> {
  const manualUrl = getMigrationManualUrl();
  const connectionString = getPostgresConnectionString();

  try {
    if (connectionString) {
      await runWithPostgresClient(connectionString);
      return {
        ok: true,
        mode: 'postgres',
        message: '数据库迁移已通过 PostgreSQL 连接自动执行。',
        sql: MIGRATION_SQL,
        manualUrl,
      };
    }

    await runWithSupabaseRpc();
    return {
      ok: true,
      mode: 'supabase-rpc',
      message: '数据库迁移已通过 Supabase SQL RPC 自动执行。',
      sql: MIGRATION_SQL,
      manualUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      mode: 'manual',
      message: '自动迁移未执行成功，请在 Supabase SQL 编辑器手动执行返回的 SQL。',
      error: message,
      sql: MIGRATION_SQL,
      manualUrl,
    };
  }
}
