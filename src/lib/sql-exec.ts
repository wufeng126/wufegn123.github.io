import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

/**
 * 在「没有数据库连接串」时，尝试通过平台提供的 SQL RPC 函数执行 DDL/DML。
 *
 * 支持的函数名与参数各不相同（不同托管平台不一样），这里按顺序探测：
 *   exec_sql(query) / exec_sql(sql) / execute_sql(sql_text|query|sql) / run_sql(sql) / sql(query)
 *
 * 探测方式：先用 `select 1` 试，能跑通再执行真实 SQL。
 */

const RPC_CANDIDATES: Array<{ name: string; args: (sql: string) => Record<string, unknown> }> = [
  { name: 'exec_sql', args: (sql) => ({ query: sql }) },
  { name: 'exec_sql', args: (sql) => ({ sql }) },
  { name: 'execute_sql', args: (sql) => ({ sql_text: sql }) },
  { name: 'execute_sql', args: (sql) => ({ query: sql }) },
  { name: 'execute_sql', args: (sql) => ({ sql }) },
  { name: 'run_sql', args: (sql) => ({ sql }) },
  { name: 'sql', args: (sql) => ({ query: sql }) },
];

function getAdminClient() {
  const url = process.env.COZE_SUPABASE_URL || '';
  const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export type SqlCapability =
  | { mode: 'postgres'; detail: string }
  | { mode: 'rpc'; functionName: string; variant: number; detail: string }
  | { mode: 'none'; detail: string };

/** 探测当前环境可用的 SQL 执行方式 */
export async function detectSqlCapability(): Promise<SqlCapability> {
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL) {
    return { mode: 'postgres', detail: '已配置 DATABASE_URL，可用 PostgreSQL 直连执行' };
  }

  const admin = getAdminClient();
  if (!admin) {
    return { mode: 'none', detail: '缺少 COZE_SUPABASE_URL / SERVICE_ROLE_KEY' };
  }

  for (let index = 0; index < RPC_CANDIDATES.length; index += 1) {
    const candidate = RPC_CANDIDATES[index];
    try {
      const { error } = await admin.rpc(candidate.name, candidate.args('select 1 as ok'));
      if (!error) {
        return {
          mode: 'rpc',
          functionName: candidate.name,
          variant: index,
          detail: `平台提供 SQL 执行函数：${candidate.name}`,
        };
      }
    } catch {
      // 继续尝试下一个
    }
  }

  return { mode: 'none', detail: '平台未提供 SQL 执行函数，也没有数据库连接串' };
}

/** 执行一段 SQL；返回执行方式与影响 */
function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((part) => part.trim())
    .map((part) => part.replace(/^\s*(--[^\n]*\n)+/g, '').trim()) // 去掉语句前的整行注释
    .filter((part) => part.length > 0);
}

export async function executeSql(sql: string): Promise<{ ok: boolean; mode: string; detail: string }> {
  const capability = await detectSqlCapability();

  if (capability.mode === 'postgres') {
    const { Client } = await import('pg');
    const connectionString =
      process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || '';
    const client = new Client({
      connectionString,
      ssl: connectionString.includes('supabase.co') || connectionString.includes('volces.com')
        ? { rejectUnauthorized: false }
        : undefined,
    });
    try {
      await client.connect();
      await client.query(sql);
      return { ok: true, mode: 'postgres', detail: '已通过 PostgreSQL 直连执行' };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  if (capability.mode === 'rpc') {
    const admin = getAdminClient();
    if (!admin) return { ok: false, mode: 'rpc', detail: '缺少 service role key' };
    const candidate = RPC_CANDIDATES[capability.variant] || RPC_CANDIDATES.find((item) => item.name === capability.functionName);
    if (!candidate) return { ok: false, mode: 'rpc', detail: '未知的 RPC 函数' };

    // 平台 RPC 通常只能执行单条语句：逐条执行，收集失败项（不因一条失败中断全部）
    const statements = splitStatements(sql);
    const failures: string[] = [];
    let executed = 0;
    for (const statement of statements) {
      let lastError = '';
      let done = false;
      for (const variant of RPC_CANDIDATES) {
        const { error } = await admin.rpc(variant.name, variant.args(statement));
        if (!error) { done = true; break; }
        lastError = error.message || String(error);
        // 只有"函数不存在/参数不匹配"才继续换形态，其余错误直接记录
        if (!/could not find the function|does not exist|schema cache/i.test(lastError)) break;
      }
      if (done) executed += 1;
      else failures.push(`${statement.slice(0, 80)}… → ${lastError}`);
    }
    if (failures.length > 0) {
      return {
        ok: false,
        mode: 'rpc',
        detail: `成功 ${executed} 条，失败 ${failures.length} 条；首个错误：${failures[0]}`,
      };
    }
    return { ok: true, mode: 'rpc', detail: `已通过 ${capability.functionName} 执行 ${executed} 条语句` };
  }

  return { ok: false, mode: 'none', detail: capability.detail };
}

/** 读取 migrations 目录下的白名单脚本 */
export function readMigrationFile(fileName: string): string {
  const allowed = [
    'enable_rls_core_tables.sql',
    'add_data_backups.sql',
    'add_dingtalk_todo_tasks.sql',
    'add_project_role_boss.sql',
    'add_api_timing_logs.sql',
    'client_reports_auto_review.sql',
  ];
  if (!allowed.includes(fileName)) throw new Error('该脚本不在允许执行的列表内');
  const full = path.join(process.cwd(), 'migrations', fileName);
  return readFileSync(full, 'utf8');
}
