#!/usr/bin/env node
/**
 * 死代码体检：列出「没有被任何前端代码引用」的 API 路由，
 * 以及「不在菜单/路由表里」的页面，供人工决定是否删除。
 *
 * 用法：node scripts/audit/dead-code.mjs
 * 输出：docs/engineering/dead-code-report.md
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const APP = path.join(SRC, 'app');

function walk(dir, filter, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const allSource = walk(SRC, (f) => /\.(ts|tsx)$/.test(f));
const sourceText = new Map(allSource.map((f) => [f, fs.readFileSync(f, 'utf8')]));

// 1) API 路由：检查路径是否出现在「非自身文件」的源码里（fetch 调用或内部引用）
const apiRoutes = walk(path.join(APP, 'api'), (f) => f.endsWith('route.ts')).map((file) => {
  const rel = file.slice(APP.length).replaceAll('\\', '/').replace(/\/route\.ts$/, '');
  // 动态段之前的静态前缀，例如 /api/workers/[id] -> /api/workers
  const staticPrefix = rel.split('/[')[0] || rel;
  return { file, url: rel, needle: staticPrefix.replace(/^\//, '') };
});

const deadApis = [];
for (const route of apiRoutes) {
  let referenced = false;
  for (const [file, text] of sourceText) {
    if (file === route.file) continue;
    // 匹配 "api/xxx" 即可覆盖 fetch('/api/xxx')、`/api/xxx?${}`、服务端内部调用
    if (route.needle && text.includes(route.needle)) {
      referenced = true;
      break;
    }
  }
  if (!referenced) deadApis.push(route.url);
}

// 2) 页面：是否出现在菜单/路由权限配置里
const layoutText = sourceText.get(path.join(SRC, 'components', 'sidebar-layout.tsx')) || '';
const permText = sourceText.get(path.join(SRC, 'lib', 'route-permissions.ts')) || '';
const pages = walk(APP, (f) => f.endsWith('page.tsx')).map((file) => {
  const rel = file.slice(APP.length).replaceAll('\\', '/').replace(/\/page\.tsx$/, '') || '/';
  return rel;
});
const orphanPages = pages.filter((page) => {
  if (page === '/') return false;
  const key = page;
  const inMenu = layoutText.includes(`'${key}'`) || layoutText.includes(`"${key}"`);
  const inPerm = permText.includes(`'${key}'`);
  const revalidated = /\/\d+$|\[|\]$/.test(key); // 动态路由由上级页面进入
  return !inMenu && !inPerm && !revalidated;
});

const lines = [];
lines.push('# 死代码体检报告');
lines.push('');
lines.push(`生成时间：${new Date().toISOString()}`);
lines.push('');
lines.push(`- API 路由总数：${apiRoutes.length}，疑似未被引用：**${deadApis.length}**`);
lines.push(`- 页面总数：${pages.length}，疑似不在菜单/权限表：**${orphanPages.length}**`);
lines.push('');
lines.push('> 说明：这是静态文本匹配的粗筛结果，可能包含误报（例如动态拼接的 URL、由服务端内部调用的接口）。删除前请逐个确认。');
lines.push('');
lines.push('## 疑似未被前端引用的 API');
lines.push('');
deadApis.sort().forEach((url) => lines.push(`- \`${url}\``));
lines.push('');
lines.push('## 疑似不在菜单/权限表的页面');
lines.push('');
orphanPages.sort().forEach((page) => lines.push(`- \`${page}\``));
lines.push('');

const outDir = path.join(ROOT, 'docs', 'engineering');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'dead-code-report.md');
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log(`报告已生成：${path.relative(ROOT, outFile)}`);
console.log(`API ${apiRoutes.length} 个，疑似未引用 ${deadApis.length} 个；页面 ${pages.length} 个，疑似孤立 ${orphanPages.length} 个`);
