/**
 * 统计活代码里的中文字面量（AST 级，排除注释）。
 * 只读，不改文件。
 */
import ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SRC = 'D:/MindLink/apps/app/src';
const SKIP_DIRS = new Set(['_legacy-ui', 'languages', 'node_modules']);
const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const rows = [];
const files = walk(SRC);
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits = [];
  const visit = (node) => {
    // 字符串字面量 / 模板片段
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (CJK.test(node.text)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        hits.push({ line, kind: 'str', text: node.text, start: node.getStart(sf), end: node.getEnd() });
      }
    } else if (node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle || node.kind === ts.SyntaxKind.TemplateTail) {
      if (CJK.test(node.text)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        hits.push({ line, kind: 'tmpl', text: node.text, start: node.getStart(sf), end: node.getEnd() });
      }
    } else if (ts.isJsxText(node)) {
      const trimmed = node.text.trim();
      if (trimmed && CJK.test(trimmed)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        hits.push({ line, kind: 'jsx', text: trimmed, start: node.getStart(sf), end: node.getEnd() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (hits.length) rows.push({ file: path.relative('D:/MindLink', file).replace(/\\/g, '/'), hits });
}

const total = rows.reduce((n, r) => n + r.hits.length, 0);
const uniq = new Set(rows.flatMap((r) => r.hits.map((h) => h.text)));
console.log(`文件数: ${rows.length}  命中数: ${total}  不重复串: ${uniq.size}`);
for (const r of rows.sort((a, b) => b.hits.length - a.hits.length)) {
  console.log(`  ${r.hits.length.toString().padStart(3)}  ${r.file}`);
}
writeFileSync('C:/Users/Blues/AppData/Local/Temp/l10n-survey.json', JSON.stringify(rows, null, 2), 'utf8');
console.log('明细已写入 l10n-survey.json');
