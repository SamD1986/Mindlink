import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

/**
 * UI-15 机核：界面文案必须走语言包。
 *
 * 三条守则：
 *   1. 活代码（src/**，排除归档区与 languages/）里不许出现硬编码中文残留 ——
 *      唯一例外是品牌串所在文件 `shared/brand.ts`（换语言时品牌名不变）
 *   2. 语言包是「消息即键」：value 必须与 key 逐字相同（zh 抽取是行为不变的重构）
 *   3. 代码用到的键与包里的键**完全相等**：漏键是多语种缺页，多键是没人用的死条目
 *
 * 用 AST 而不是 grep：文本在注释里、字符串里的中文含义完全不同，
 * 正则会同时误报与漏报（上一版就是栽在这个口径上）。
 */

const SRC = new URL('../src/', import.meta.url);
const PACK = JSON.parse(readFileSync(new URL('languages/zh-CN.json', SRC), 'utf8'));
const HAN = /[\u4e00-\u9fff]/;
const SKIP_DIRS = new Set(['_legacy-ui', 'languages']);
const BRAND_FILE = 'shared/brand.ts';

/** 递归列出活代码文件（相对 src/ 的 POSIX 路径）。 */
function liveFiles(dir = SRC, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) out.push(...liveFiles(url, rel));
    else if (/\.tsx?$/.test(entry.name)) out.push({ rel, file: fileURLToPath(url) });
  }
  return out;
}

/** 扫描一遍：硬编码中文、t() 用到的键、用了 t 却没引入的文件。 */
function scan() {
  const offenders = [];
  const usedKeys = new Set();
  const missingImport = [];
  for (const { rel, file } of liveFiles()) {
    const text = readFileSync(file, 'utf8');
    const usesT = /\bt\(/.test(text);
    const importsT = /from '[^']*languages\/index\.js'/.test(text);
    if (usesT && !importsT) missingImport.push(rel);
    if (rel.endsWith(BRAND_FILE)) continue; // 品牌串豁免

    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const isTKey = (node) => {
      const p = node.parent;
      return p && ts.isCallExpression(p) && p.arguments[0] === node && p.expression.getText() === 't';
    };

    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (HAN.test(node.text)) {
          if (isTKey(node)) usedKeys.add(node.text);
          else offenders.push(`${rel}:${lineOf(node)} 字符串 ${JSON.stringify(node.text)}`);
        }
      } else if (ts.isTemplateExpression(node)) {
        const pieces = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
        if (pieces.some((p) => HAN.test(p))) offenders.push(`${rel}:${lineOf(node)} 模板串 ${JSON.stringify(pieces.join('…'))}`);
      } else if (ts.isJsxText(node)) {
        const trimmed = node.text.trim();
        if (trimmed && HAN.test(trimmed)) offenders.push(`${rel}:${lineOf(node)} JSX 文本 ${JSON.stringify(trimmed)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { offenders, usedKeys, missingImport };
}

test('live sources carry no hardcoded Chinese outside the language pack', () => {
  const { offenders } = scan();
  assert.deepEqual(offenders, [], `界面文案没走 t()：\n${offenders.join('\n')}`);
});

test('every file that calls t() imports it from the language package', () => {
  const { missingImport } = scan();
  assert.deepEqual(missingImport, [], `用了 t() 却没引入：${missingImport.join(', ')}`);
});

test('the language pack is message-as-key: values are byte-identical to their keys', () => {
  const wrong = Object.entries(PACK).filter(([key, value]) => value !== key);
  assert.deepEqual(wrong, [], `键值不一致（zh 下会导致界面变字）：${JSON.stringify(wrong.slice(0, 5))}`);
  const noneHan = Object.keys(PACK).filter((key) => !HAN.test(key));
  assert.deepEqual(noneHan, [], `语言包里混进了非文字为：${JSON.stringify(noneHan)}`);
});

test('the pack and the t() call sites agree: no missing key, no dead entry', () => {
  const { usedKeys } = scan();
  const packed = new Set(Object.keys(PACK));
  const missing = [...usedKeys].filter((key) => !packed.has(key));
  const dead = [...packed].filter((key) => !usedKeys.has(key));
  assert.deepEqual(missing, [], `代码用到但包里没有的键：${JSON.stringify(missing)}`);
  assert.deepEqual(dead, [], `包里没有人用的死条目：${JSON.stringify(dead)}`);
});
