/**
 * UI-15 抽取器：把活代码里的中文源串换成 t() 调用。
 *
 * 采用「消息即键」（gettext 风格）：键就是中文原串，语言包 value 与 key 相同。
 *   - 行[PERSON_0826725efb12660c]：t('关闭') 在 zh 下必然返回 '关闭'，渲染结果与原串逐字节相同
 *   - 英文包以后再补：同一批键配 en 值即可，无需重命名键
 *
 * 算法：定点迭代（最内层优先）。JSX 属性位、模板串插值、JSX 文本各自按位形转换。
 * 复用面：文件内所有 t() 调用；产出：改写后的源码 + 键清单。
 */
import ts from 'typescript';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/MindLink';
const SRC = `${ROOT}/apps/app/src`;
const SKIP_DIRS = new Set(['_legacy-ui', 'languages', 'node_modules']);
/** 品牌串不进语言包：这个文件整体豁免（见 src/shared/brand.ts）。 */
const SKIP_FILES = new Set([`${SRC}/shared/brand.ts`]);
const HAN = /[\u4e00-\u9fff]/; // 只认汉字：纯标点片段（：、；）不参与抽取

const keys = new Set();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(full, out); }
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** 是否是 t() 调用的实参（已抽取过，勿重复包）。 */
function isTArg(node) {
  const p = node.parent;
  return p && ts.isCallExpression(p) && p.arguments.includes(node) && p.expression.getText() === 't';
}

/** 不该改写的位形：模块说明符、属性名、字面量类型。 */
function inSkipPosition(node) {
  const p = node.parent;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode(p)) return true;
  if (ts.isExternalModuleReference(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isEnumMember(p)) && p.name === node) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isJsxAttribute(p)) {
    // JSX 属性名位置不改（值是 StringLiteral 时由外层按属性位处理）
    if (p.name === node) return true;
  }
  return false;
}

function collect(sf, file) {
  const found = [];
  const visit = (node) => {
    const isStr = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
    const isTmpl = ts.isTemplateExpression(node);
    const isJsx = ts.isJsxText(node);

    if (isStr && HAN.test(node.text) && !inSkipPosition(node) && !isTArg(node)) {
      found.push({ kind: 'str', node, text: node.text });
    } else if (isTmpl) {
      const pieces = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (pieces.some((p) => HAN.test(p))) found.push({ kind: 'tmpl', node, pieces });
    } else if (isJsx) {
      const trimmed = node.text.trim();
      if (trimmed && HAN.test(trimmed) && !inSkipPosition(node)) found.push({ kind: 'jsx', node, text: trimmed });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** 丢掉「内部还含着候选项」的外层节点（最内层优先，避免嵌套改写互相覆盖）。 */
function innermost(cands) {
  return cands.filter((c) => !cands.some((o) => o !== c && o.node.pos <= c.node.pos && o.node.end >= c.node.end && o.node !== c.node));
}

function esc(s) { return JSON.stringify(s); }

function transform(file) {
  let changed = 0;
  for (let round = 0; round < 12; round += 1) {
    const text = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const cands = innermost(collect(sf, file));
    if (cands.length === 0) break;

    const edits = [];
    for (const c of cands) {
      const node = c.node;
      if (c.kind === 'str') {
        keys.add(c.text);
        const isJsxAttrValue = node.parent && ts.isJsxAttribute(node.parent) && node.parent.initializer === node;
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: isJsxAttrValue ? `{t(${esc(c.text)})}` : `t(${esc(c.text)})` });
      } else if (c.kind === 'jsx') {
        keys.add(c.text);
        const raw = node.getText(sf);
        const lead = raw.slice(0, raw.indexOf(c.text));
        const tail = raw.slice(raw.indexOf(c.text) + c.text.length);
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `${lead}{t(${esc(c.text)})}${tail}` });
      } else {
        // 模板串：片段用 {n} 占位，表达式原样搬进参数
        let key = c.pieces[0];
        const params = [];
        c.node.templateSpans.forEach((s, i) => {
          key += `{${i}}` + c.pieces[i + 1];
          params.push(`${i}: ${s.expression.getText(sf)}`);
        });
        keys.add(key);
        const call = params.length ? `t(${esc(key)}, { ${params.join(', ')} })` : `t(${esc(key)})`;
        edits.push({ start: c.node.getStart(sf), end: c.node.getEnd(), text: call });
      }
    }
    edits.sort((a, b) => b.start - a.start);
    let next = text;
    for (const e of edits) next = next.slice(0, e.start) + e.text + next.slice(e.end);
    if (next === text) break;
    writeFileSync(file, next, 'utf8');
    changed += edits.length;
  }
  return changed;
}

/** 补 t 的 import（若文件里已用 t 但没有导入）。 */
function ensureImport(file) {
  let text = readFileSync(file, 'utf8');
  if (!/\bt\(/.test(text)) return false;
  if (/from '[^']*languages\/index\.js'/.test(text)) return false;
  const rel = path.relative(path.dirname(file), `${SRC}/languages/index.js`).replace(/\\/g, '/');
  const spec = rel.startsWith('.') ? rel : `./${rel}`;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let lastImportEnd = -1;
  for (const st of sf.statements) if (ts.isImportDeclaration(st)) lastImportEnd = st.getEnd();
  const line = `\nimport { t } from '${spec}';`;
  text = lastImportEnd >= 0 ? text.slice(0, lastImportEnd) + line + text.slice(lastImportEnd) : line.trimStart() + '\n' + text;
  writeFileSync(file, text, 'utf8');
  return true;
}

/** Collect the t() keys that live code actually references (used by --prune).
 *  Mirrors test/languages.test.mjs: a Han string literal used as the first argument
 *  of a t(...) call. Files skipped there (shared/brand.ts) are skipped here too. */
function collectUsedKeys() {
  const used = new Set();
  for (const file of walk(SRC)) {
    if (SKIP_FILES.has(file.replace(/\\/g, '/'))) continue;
    const text = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const parent = node.parent;
        if (HAN.test(node.text) && parent && ts.isCallExpression(parent)
          && parent.arguments[0] === node && parent.expression.getText() === 't') used.add(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return used;
}

const prune = process.argv.includes('--prune');
const usedKeys = prune ? collectUsedKeys() : new Set();

const files = walk(SRC).filter((f) => !SKIP_FILES.has(f.replace(/\\/g, '/')));
let total = 0;
let touched = 0;
for (const file of files) {
  const n = transform(file);
  if (n > 0) { touched += 1; total += n; }
}
let imported = 0;
for (const file of files) if (ensureImport(file)) imported += 1;

console.log(`改文件: ${touched}  替换点: ${total}  补 import: ${imported}  键: ${keys.size}`);

// 语言包由抽取结果生成：键 = 中文原串（消息即键），value 与 key 相同。
const existing = existsSync(`${SRC}/languages/zh-CN.json`) ? JSON.parse(readFileSync(`${SRC}/languages/zh-CN.json`, 'utf8')) : {};
const pack = prune ? {} : { ...existing };
for (const key of (prune ? usedKeys : keys)) pack[key] = key; // 并集：重跑不丢上一轮已抽取的键
const ordered = {};
for (const key of Object.keys(pack).sort((a, b) => a.localeCompare(b, 'zh'))) ordered[key] = key;
writeFileSync(`${SRC}/languages/zh-CN.json`, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
writeFileSync('C:/Users/Blues/AppData/Local/Temp/l10n-keys.json', JSON.stringify([...keys].sort((a, b) => a.localeCompare(b, 'zh')), null, 2), 'utf8');
console.log(`语言包已生成: languages/zh-CN.json（本轮 ${keys.size} 条，累计 ${Object.keys(ordered).length} 条）`);
if (prune) console.log(`l10n prune: kept ${Object.keys(ordered).length} referenced keys, dropped ${Object.keys(existing).length - Object.keys(ordered).length} unreferenced keys`);
