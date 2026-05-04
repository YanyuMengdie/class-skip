#!/usr/bin/env node
/**
 * 把仓库内所有相对路径 import / export from / 动态 import() 改写为 @/ 别名。
 *
 * 用法：node scripts/migrate-to-alias.mjs [--dry]
 *   --dry  仅打印将要改的内容，不写盘
 *
 * 规则：
 *   - 仅改写以 './' 或 '../' 开头的 specifier
 *   - 不改写 npm 包（react / firebase / lucide-react ...）
 *   - 不改写资源文件（.css / .scss / .png / .svg / .json ...）
 *   - 解析后若指向项目根之外，跳过
 *   - 保留原 quote 风格（单引号 / 双引号原样）
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), '..');

const EXCLUDE_DIRS = new Set([
  'node_modules', 'dist', '_archived', '.git', '.vercel', '.vscode',
  'scripts', 'docs',
]);
const SOURCE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const RESOURCE_EXT = new Set([
  '.css', '.scss', '.sass', '.less',
  '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.json', '.md', '.html', '.txt', '.wasm',
]);

const DRY = process.argv.includes('--dry');

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (SOURCE_EXT.has(extname(name).toLowerCase())) files.push(p);
  }
  return files;
}

function rewriteSpec(spec, fileDir) {
  if (!(spec.startsWith('./') || spec.startsWith('../'))) return null;
  const ext = extname(spec).toLowerCase();
  if (ext && RESOURCE_EXT.has(ext)) return null;
  const abs = resolve(fileDir, spec);
  let rel = relative(ROOT, abs);
  if (rel.startsWith('..')) return null;
  rel = rel.split(/[\\/]/).join('/');
  return '@/' + rel;
}

// 三种语法各一条正则。replacer 共用。
const RE_FROM     = /((?:^|[^.\w$])(?:import|export)\b[\s\S]*?\bfrom\s+)(['"])(\.{1,2}\/[^'"]+)\2/g;
const RE_SIDE     = /((?:^|[^.\w$])import\s+)(['"])(\.{1,2}\/[^'"]+)\2/g;
const RE_DYN      = /((?:^|[^.\w$])import\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g;

function migrate(content, filePath) {
  const fileDir = dirname(filePath);
  let count = 0;
  const replacer = (m, prefix, q, spec) => {
    const next = rewriteSpec(spec, fileDir);
    if (!next) return m;
    count++;
    return `${prefix}${q}${next}${q}`;
  };
  const out = content
    .replace(RE_FROM, replacer)
    .replace(RE_SIDE, replacer)
    .replace(RE_DYN, replacer);
  return { content: out, count };
}

const summary = { filesScanned: 0, filesChanged: 0, importsRewritten: 0, perFile: [] };
const files = walk(ROOT);

for (const f of files) {
  summary.filesScanned++;
  const orig = readFileSync(f, 'utf8');
  const { content, count } = migrate(orig, f);
  if (count > 0 && content !== orig) {
    summary.filesChanged++;
    summary.importsRewritten += count;
    summary.perFile.push({ file: relative(ROOT, f).split(/[\\/]/).join('/'), count });
    if (!DRY) writeFileSync(f, content, 'utf8');
  }
}

summary.perFile.sort((a, b) => b.count - a.count);

console.log(`\n[migrate-to-alias] ${DRY ? 'DRY RUN — no files written' : 'WRITE MODE'}`);
console.log(`  scanned: ${summary.filesScanned} files`);
console.log(`  changed: ${summary.filesChanged} files`);
console.log(`  rewritten imports: ${summary.importsRewritten}`);
console.log(`\nTop changed files:`);
for (const r of summary.perFile.slice(0, 20)) {
  console.log(`  ${String(r.count).padStart(4)}  ${r.file}`);
}

writeFileSync(
  join(ROOT, 'scripts', 'migrate-to-alias.last-run.json'),
  JSON.stringify(summary, null, 2),
  'utf8',
);
console.log(`\nFull summary: scripts/migrate-to-alias.last-run.json`);
