/**
 * 替换点分型：普通串 / JSX 文本 / 模板串（带插值）。
 * 输出清单到 temp，供人工核对。
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
    if (statSync(full).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(full, out); }
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const stats = { str: 0, jsx: 0, tmplFrag: 0, tmplExpr: 0 };
const tmplSites = [];
const jsxSites = [];
const allStrings = new Map(); // text -> [files]

for (const file of walk(SRC)) {
  const rel = path.relative('D:/MindLink', file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (CJK.test(node.text)) {
        stats.str += 1;
        if (!allStrings.has(node.text)) allStrings.set(node.text, []);
        allStrings.get(node.text).push(`${rel}:${lineOf(node)}`);
      }
    } else if (ts.isTemplateExpression(node)) {
      const pieces = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      const composed = pieces.some((p) => CJK.test(p));
      const exprs = node.templateSpans.map((s) => s.expression.getText(sf));
      if (composed) {
        stats.tmplFrag += pieces.filter((p) => CJK.test(p)).length;
        stats.tmplExpr += 1;
        if (exprs.length) tmplSites.push({ rel, line: lineOf(node), pieces, exprs });
      }
    } else if (ts.isJsxText(node)) {
      const trimmed = node.text.trim();
      if (trimmed && CJK.test(trimmed)) {
        stats.jsx += 1;
        jsxSites.push({ rel, line: lineOf(node), text: trimmed });
        if (!allStrings.has(trimmed)) allStrings.set(trimmed, []);
        allStrings.get(trimmed).push(`${rel}:${lineOf(node)}`);
      }
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && CJK.test(node.initializer.text)) {
      // aria-label / title 等属性（已是 string literal，上面已计）
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

console.log('分型统计:', JSON.stringify(stats, null, 2));
console.log(`\n带插值的模板串位点: ${tmplSites.length}`);
tmplSites.forEach((s) => console.log(`  ${s.rel}:${s.line}  片段=${JSON.stringify(s.pieces)}  表达式=${JSON.stringify(s.exprs)}`));
writeFileSync('C:/Users/Blues/AppData/Local/Temp/l10n-tmpl.json', JSON.stringify(tmplSites, null, 2), 'utf8');
writeFileSync('C:/Users/Blues/AppData/Local/Temp/l10n-jsx.json', JSON.stringify(jsxSites, null, 2), 'utf8');

const uniq = [...allStrings.keys()];
writeFileSync('C:/Users/Blues/AppData/Local/Temp/l10n-unique.json', JSON.stringify([...allStrings.entries()].map(([k, v]) => ({ text: k, sites: v })), null, 2), 'utf8');
console.log(`\n不重复串: ${uniq.length}（含 JSX 文本）`);
