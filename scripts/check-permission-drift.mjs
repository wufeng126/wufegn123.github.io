/**
 * 权限码漂移检查
 *
 * 校验：代码中 requirePermission / hasPermission / permissions.includes 用到的权限码，
 * 必须都能在 src/lib/permission-catalog.ts 中找到（目录即单一事实源）。
 *
 * 用法：node scripts/check-permission-drift.mjs（package.json 里 `pnpm check:permissions`）
 * 有漂移时退出码为 1，可接入 CI。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CATALOG_FILE = path.join(ROOT, 'src/lib/permission-catalog.ts');

const catalogText = readFileSync(CATALOG_FILE, 'utf8');
const catalogCodes = new Set(
  [...catalogText.matchAll(/code: '([a-z][a-z0-9_]*:[a-z][a-z0-9_]*)'/g)].map((m) => m[1]),
);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const refs = new Map(); // code -> [files]

function record(code, file) {
  // 通配符（如 '*' 表示全部权限）不是真实权限码，跳过
  if (!code || code.includes('*')) return;
  if (!refs.has(code)) refs.set(code, new Set());
  refs.get(code).add(path.relative(ROOT, file));
}

const sourceFiles = walk(path.join(ROOT, 'src')).filter(
  (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('permission-catalog.ts'),
);

for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');

  for (const match of text.matchAll(/requirePermission\(\s*[^,]+,\s*'([^']+)'/g)) record(match[1], file);
  for (const match of text.matchAll(/hasPermission\(\s*[^,]+,\s*'([^']+)'/g)) record(match[1], file);
  for (const match of text.matchAll(/hasAnyPermission\(\s*[^,]+,\s*\[([^\]]+)\]/g)) {
    for (const code of match[1].matchAll(/'([^']+)'/g)) record(code[1], file);
  }
  for (const match of text.matchAll(/requireAnyPermission\(\s*[^,]+,\s*\[([^\]]+)\]/g)) {
    for (const code of match[1].matchAll(/'([^']+)'/g)) record(code[1], file);
  }
  for (const match of text.matchAll(/permissions\.includes\('([^']+)'\)/g)) record(match[1], file);
}

const missing = [...refs.keys()].filter((code) => !catalogCodes.has(code)).sort();
const neverReferenced = [...catalogCodes].filter((code) => !refs.has(code)).sort();

console.log(`权限目录: ${catalogCodes.size} 个；代码中直接校验: ${refs.size} 个`);

if (neverReferenced.length > 0) {
  console.log(`\n目录中未被直接校验（可能由页面菜单/中间件使用，仅提示）: ${neverReferenced.length} 个`);
  for (const code of neverReferenced) console.log(`  - ${code}`);
}

if (missing.length > 0) {
  console.error(`\n❌ 漂移：以下权限码被代码校验，但不在权限目录中：`);
  for (const code of missing) {
    console.error(`  - ${code}  (引用: ${[...refs.get(code)].join(', ')})`);
  }
  console.error('\n请把它们加入 src/lib/permission-catalog.ts 的对应模块。');
  process.exit(1);
}

console.log('\n✅ 权限码无漂移');
