/**
 * 算出「活代码真正需要的归档文件」传递闭包：
 * 从 import _legacy-ui 的活文件出发，沿归档区内的 import 展开。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = 'D:/MindLink/apps/app/src';
const LEGACY = `${SRC}/_legacy-ui`;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(full.replace(/\\/g, '/'));
  }
  return out;
}

const legacyFiles = new Set(walk(LEGACY));
const liveFiles = walk(SRC).filter((f) => !f.startsWith(LEGACY) && f.endsWith('.ts') || (!f.startsWith(LEGACY) && f.endsWith('.tsx')));

const importRe = /from\s+'([^']+)'|import\s+'([^']+)'|new URL\('([^']+)'/g;

function resolve(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.dirname(fromFile);
  // TS ESM 里 import 写的是 .js，源文件其实是 .ts/.tsx —— 两种都要试
  const stems = [spec, spec.replace(/\.js$/, '')];
  for (const stem of stems) {
    for (const ext of ['', '.ts', '.tsx', '.js', '.css', '/index.ts', '/index.tsx']) {
      const candidate = path.resolve(base, stem + ext).replace(/\\/g, '/');
      if (legacyFiles.has(candidate)) return candidate;
    }
  }
  return null;
}

const roots = new Map(); // legacyFile -> 引用它的活文件
for (const file of liveFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(importRe)) {
    const spec = m[1] ?? m[2] ?? m[3];
    const target = spec && resolve(file, spec);
    if (target && !roots.has(target)) roots.set(target, path.relative(SRC, file));
  }
}

// 传递展开
const need = new Set(roots.keys());
const queue = [...roots.keys()];
while (queue.length) {
  const f = queue.pop();
  if (!f.endsWith('.ts') && !f.endsWith('.tsx')) continue;
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(importRe)) {
    const spec = m[1] ?? m[2] ?? m[3];
    const target = spec && resolve(f, spec);
    if (target && !need.has(target)) { need.add(target); queue.push(target); }
  }
}

console.log('直接引用点:', roots.size);
console.log('传递闭包（需要毕业）:', need.size);
[...need].sort().forEach((f) => console.log('  ' + path.relative(SRC, f)));
console.log('\n归档区总文件:', legacyFiles.size, ' 留在归档:', legacyFiles.size - need.size);
[...legacyFiles].filter((f) => !need.has(f)).sort().forEach((f) => console.log('  留 ' + path.relative(SRC, f)));
