/**
 * 覆盖率分析：已有 233 条语义键 vs 活代码里的 412 个不重复中文串。
 * 只读。
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pack = JSON.parse(execSync('git show ui/languages:apps/app/src/languages/zh-CN.json', { cwd: 'D:/MindLink', maxBuffer: 1 << 24 }).toString());
const rows = JSON.parse(readFileSync('C:/Users/Blues/AppData/Local/Temp/l10n-survey.json', 'utf8'));

// 展平语言包：语义键 -> 中文值
const pairs = [];
const walk = (obj, prefix = '') => {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') walk(v, prefix ? `${prefix}.${k}` : k);
    else pairs.push([prefix ? `${prefix}.${k}` : k, v]);
  }
};
walk(pack);

const byValue = new Map();
for (const [key, value] of pairs) if (!byValue.has(value)) byValue.set(value, key);

const uniq = [...new Set(rows.flatMap((r) => r.hits.map((h) => h.text)))];

// 命中里带插值的位置（模板串）单独看
const tmpl = uniq.filter((t) => /\$\{/.test(t));

const matched = [];
const unmatched = [];
for (const s of uniq) {
  const hit = byValue.get(s);
  if (hit) matched.push([hit, s]);
  else unmatched.push(s);
}

console.log(`语言包条目: ${pairs.length}  活代码不重复串: ${uniq.length}`);
console.log(`命中(可复用): ${matched.length}   未命中(需新键): ${unmatched.length}`);
console.log(`\n=== 未命中串（按长度升序，前 80 条）===`);
unmatched.sort((a, b) => a.length - b.length).forEach((s, i) => { if (i < 80) console.log(`  ${JSON.stringify(s)}`); });
console.log(`\n=== 未命中里含插值占位的 ===`);
unmatched.filter((s) => /\$\{/.test(s)).forEach((s) => console.log(`  ${JSON.stringify(s)}`));
