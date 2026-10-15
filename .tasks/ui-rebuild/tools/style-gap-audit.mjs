/**
 * 样式缺口审计：算出「活代码用到、但活样式表里没定义」的 class。
 *
 * 背景：UI-01 把整份旧全局样式表归档了（src/_legacy-ui/styles.css），
 * 而 UI-10/11/12/13 搬过来的组件仍在用那些类名 —— 结果是元素没样式（实测 .composer/.approval-card 在生产 CSS 里 0 处）。
 *
 * 输出：按出现次数排序的缺口清单，并标出「归档区里有定义」的部分（= 可迁移候选）。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SRC = 'D:/MindLink/apps/app/src';
const ARCHIVE = `${SRC}/_legacy-ui`;

function walk(dir, out = [], skip = new Set()) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (!skip.has(name)) walk(full, out, skip); }
    else out.push(full);
  }
  return out;
}

const live = walk(SRC, [], new Set(['_legacy-ui', 'languages']));
const archived = walk(ARCHIVE);

const CLS_RE = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/g;
const TOKEN_RE = /[A-Za-z][A-Za-z0-9_-]*/g;

const used = new Map();      // class -> count
for (const f of live.filter((f) => /\.tsx?$/.test(f))) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(CLS_RE)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    // 模板/表达式里只取字面量片段里的 token
    for (const token of raw.match(TOKEN_RE) ?? []) {
      if (token.length < 3) continue;
      used.set(token, (used.get(token) ?? 0) + 1);
    }
  }
}

/** 从 CSS 文本里抽所有被定义的 class 名（含 .a .b 组合、:hover 等）。 */
function defined(text) {
  const set = new Set();
  for (const m of text.matchAll(/([^{}]+)\{/g)) {
    for (const token of m[1].match(/\.([A-Za-z][A-Za-z0-9_-]*)/g) ?? []) set.add(token.slice(1));
  }
  return set;
}

const liveCss = live.filter((f) => f.endsWith('.css'));
const archCss = archived.filter((f) => f.endsWith('.css'));
const liveDefined = new Set();
for (const f of liveCss) for (const c of defined(readFileSync(f, 'utf8'))) liveDefined.add(c);
const archDefined = new Set();
for (const f of archCss) for (const c of defined(readFileSync(f, 'utf8'))) archDefined.add(c);

const gaps = [...used.entries()]
  .filter(([c]) => !liveDefined.has(c))
  .sort((a, b) => b[1] - a[1]);

const withArchive = gaps.filter(([c]) => archDefined.has(c));
const nowhere = gaps.filter(([c]) => !archDefined.has(c));

console.log(`活代码 class 用量: ${used.size}  活样式定义: ${liveDefined.size}  归档定义: ${archDefined.size}`);
console.log(`缺口: ${gaps.length}（其中归档区有定义、可迁移: ${withArchive.length}；哪都没有、疑误报: ${nowhere.length}）`);
console.log('\n=== 缺口 TOP 40（类名 | 用处数 | 归档能不能救）===');
for (const [c, n] of gaps.slice(0, 40)) console.log(`  ${c.padEnd(34)} ${String(n).padStart(3)}  ${archDefined.has(c) ? '归档有' : '——'}`);
writeFileSync('C:/Users/Blues/AppData/Local/Temp/style-gaps.json', JSON.stringify({ withArchive, nowhere }, null, 2), 'utf8');
console.log('\n完整清单: %TEMP%/style-gaps.json');
