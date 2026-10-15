/**
 * 生成待命名清单：活代码里需要新键的中文串（含模板串合成模式）。
 * 只读。输出 l10n-todo.json： [{ i, text, kind, files }]
 */
import ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const SRC = 'D:/MindLink/apps/app/src';
const SKIP_DIRS = new Set(['_legacy-ui', 'languages', 'node_modules']);
const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(full, out); }
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

// 已有语义包：值 -> 键
const pack = JSON.parse(execSync('git show ui/languages:apps/app/src/languages/zh-CN.json', { cwd: 'D:/MindLink', maxBuffer: 1 << 24 }).toString());
const byValue = new Map();
const walkPack = (obj, prefix = '') => {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') walkPack(v, prefix ? `${prefix}.${k}` : k);
    else if (!byValue.has(v)) byValue.set(v, prefix ? `${prefix}.${k}` : k);
  }
};
walkPack(pack);

const items = new Map(); // text -> { kind, files:Set }
const add = (text, kind, rel) => {
  if (byValue.has(text)) return; // 已有键，无需命名
  if (!items.has(text)) items.set(text, { kind, files: new Set() });
  items.get(text).files.add(rel);
};

for (const file of walk(SRC)) {
  const rel = path.relative('D:/MindLink', file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (CJK.test(node.text)) add(node.text, 'str', rel);
    } else if (ts.isTemplateExpression(node)) {
      const pieces = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (pieces.some((p) => CJK.test(p))) {
        let composed = pieces[0];
        node.templateSpans.forEach((s, i) => { composed += `{${i}}` + pieces[i + 1]; });
        add(composed, 'tmpl', rel);
      }
    } else if (ts.isJsxText(node)) {
      const trimmed = node.text.trim();
      if (trimmed && CJK.test(trimmed)) add(trimmed, 'jsx', rel);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const todo = [...items.entries()].map(([text, v], i) => ({ i: i + 1, text, kind: v.kind, files: [...v.files].map((f) => f.replace('apps/app/src/', '')) }));
todo.sort((a, b) => a.kind.localeCompare(b.kind) || a.text.localeCompare(b.text, 'zh'));
todo.forEach((t, i) => { t.i = i + 1; });

writeFileSync('C:/Users/Blues/AppData/Local/Temp/l10n-todo.json', JSON.stringify(todo, null, 2), 'utf8');
const hist = todo.reduce((m, t) => ((m[t.kind] = (m[t.kind] ?? 0) + 1), m), {});
console.log('待命名条数:', todo.length, JSON.stringify(hist));
todo.slice(0, 70).forEach((t) => console.log(`  ${String(t.i).padStart(3)} [${t.kind}] ${JSON.stringify(t.text)}  <- ${t.files.slice(0, 2).join(', ')}`));
