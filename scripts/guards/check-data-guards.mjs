#!/usr/bin/env node
/**
 * 数据口径护栏：防止再次写出「NULL 被排除」「统计被 1000 行截断」这类 bug。
 *
 * 用法：node scripts/guards/check-data-guards.mjs
 * 退出码：0 = 通过；1 = 命中必须修复的规则
 *
 * 规则：
 *   [错误] 裸 .neq('status', ...)          —— NULL 状态行会被 SQL 排除，导致统计少算
 *   [错误] .eq('status', 'reviewed')       —— 历史中文状态/NULL 会漏，改用 .or(REVIEWED_STATUS_OR_NULL)
 *   [警告] 统计文件里 select 后无分页/无 fetchAllRows —— 可能被 PostgREST 截断到 1000 行
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');

/** 允许出现 .neq('status') 的白名单（必须写明原因） */
const ALLOW_NEP_STATUS = new Set([
  // 已废弃文件：ai-knowledge-sync 仅保留编译，业务台账同步已下线（见 AGENTS.md）
  'src/lib/ai-knowledge-sync.ts',
]);

const errors = [];
const warnings = [];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);

for (const file of files) {
  const rel = path.relative(process.cwd(), file).replaceAll('\\', '/');
  const content = fs.readFileSync(file, 'utf8');

  // 规则 1：裸 neq status
  const neqMatches = content.match(/\.neq\(\s*['"]status['"]/g) || [];
  if (neqMatches.length > 0 && !ALLOW_NEP_STATUS.has(rel)) {
    errors.push(`${rel}: 使用 .neq('status', ...)（${neqMatches.length} 处）—— NULL 状态行会被排除，请改用 .or('status.is.null,status.neq.X') 或取回后在 JS 过滤`);
  }

  // 规则 2：eq status reviewed
  const eqReviewed = content.match(/\.eq\(\s*['"]status['"]\s*,\s*['"]reviewed['"]\s*\)/g) || [];
  if (eqReviewed.length > 0 && !ALLOW_NEP_STATUS.has(rel)) {
    errors.push(`${rel}: 使用 .eq('status','reviewed')（${eqReviewed.length} 处）—— 会漏掉历史中文状态与 NULL，请改用 REVIEWED_STATUS_OR_NULL`);
  }

  // 规则 3：统计型文件缺少分页（仅对 API/lib 的服务端统计文件告警）
  // 只对"可能超过 1000 行"的业务大表告警；项目/用户/配置类小表不会触发（避免噪声淹没真问题）
  const LARGE_TABLES = new Set([
    'worker_salaries', 'salary_payments', 'supplier_payments', 'supplier_settlements', 'payments', 'settlements',
    'client_reports', 'client_payments', 'construction_logs', 'construction_log_attendance', 'construction_daily_reports',
    'miscellaneous_materials', 'team_settlement_payments', 'team_settlements', 'team_settlement_items', 'team_settlement_splits',
    'work_items', 'work_item_subitems', 'work_item_progress', 'subitem_monthly_reports', 'subitem_monthly_progress',
    'project_limit_prices', 'unit_prices', 'living_allowance_records', 'living_allowance_receipt_items',
    'project_progress_task_quantities', 'monthly_report_snapshots', 'monthly_labor_items', 'monthly_voucher_files',
    'notifications', 'audit_logs', 'worker_assignments',
  ]);
  const queriedTables = Array.from(content.matchAll(/\.from\(\s*['"]([a-z_]+)['"]/g)).map((m) => m[1]);
  const touchesLargeTable = queriedTables.some((table) => LARGE_TABLES.has(table));
  const isServerStats = rel.includes('/api/') || rel.includes('/lib/');
  if (isServerStats && touchesLargeTable && content.includes('reduce(')) {
    const hasPaging = content.includes('fetchAllRows') || content.includes('fetchAllFromBuilder') || content.includes('.range(') || content.includes('head: true');
    if (!hasPaging) {
      warnings.push(`${rel}: 有 .from() + reduce() 但没有分页/fetchAllRows —— 超过 1000 行会静默少算`);
    }
  }
}

console.log(`\n数据口径护栏检查：扫描 ${files.length} 个文件`);
if (errors.length > 0) {
  console.log(`\n❌ 必须修复（${errors.length}）`);
  errors.forEach((item) => console.log('  - ' + item));
}
if (warnings.length > 0) {
  console.log(`\n⚠️ 需要人工确认（${warnings.length}）`);
  warnings.slice(0, 30).forEach((item) => console.log('  - ' + item));
  if (warnings.length > 30) console.log(`  ...还有 ${warnings.length - 30} 项`);
}
if (errors.length === 0 && warnings.length === 0) {
  console.log('\n✅ 全部通过');
}
process.exit(errors.length > 0 ? 1 : 0);
