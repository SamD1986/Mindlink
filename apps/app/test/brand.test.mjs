import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { register } from 'tsx/esm/api';

register();
const { PROJECT_SLOGAN, PROJECT_SLOGAN_EN, PROJECT_SLOGAN_ZH } = await import('../src/shared/brand.ts');
const { loadBuiltinLayouts } = await import('../src/workbench/layouts/builtin.ts');

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('brand strings keep one source of truth', async () => {
  assert.equal(PROJECT_SLOGAN, `${PROJECT_SLOGAN_ZH} ${PROJECT_SLOGAN_EN}`);
  // 品牌串不进语言包：语言包文件（UI-15 才建）一旦出现品牌串就该拆出来
  const languages = new URL('../src/languages/', import.meta.url);
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(languages, { withFileTypes: true }).catch(() => []);
  for (const entry of files) {
    const source = await readFile(new URL(entry.name + (entry.isDirectory() ? '/' : ''), languages), 'utf8');
    assert.ok(!source.includes(PROJECT_SLOGAN_ZH), `语言包 ${entry.name} 不该包含品牌串`);
  }
});

test('the brand wordmark fonts are bundled and OFL-licensed', async () => {
  for (const file of ['Cormorant-Regular.woff2', 'NotoSerifSC-Brand.woff2', 'NotoSerifSC-OFL.txt']) {
    const stat = await readFile(new URL(`../themes/assets/fonts/${file}`, import.meta.url));
    assert.ok(stat.byteLength > 1000, `${file} 缺失或为空`);
  }
  const ofl = await readFile(new URL('../themes/assets/fonts/NotoSerifSC-OFL.txt', import.meta.url), 'utf8');
  assert.ok(/Open Font License/i.test(ofl), 'OFL 授权文本没有随字体分发');
  const declarations = await read('../themes/brand-fonts.css');
  for (const family of ['Cormorant', 'Noto Serif SC Brand']) {
    assert.ok(declarations.includes(`font-family: '${family}';`), `${family} 没有 @font-face 声明`);
  }
  // token 已按层级拆成 themes/tokens/*.css（UI-14）：品牌三项归 brand.css，这里扫全组
  const dir = new URL('../themes/tokens/', import.meta.url);
  const group = (await Promise.all((await readdir(dir)).map((name) => read(dir + name)))).join('\n');
  for (const token of ['--yp-font-brand-song', '--yp-font-brand-cormorant', '--yp-brand-ink']) {
    assert.ok(group.includes(`${token}:`), `themes/tokens/ 缺少 ${token}`);
  }
});

test('the brand subset covers every glyph the wordmark needs', async () => {
  // 子集只含品牌字形（含账户登录），字标一旦改字就必须重新 subset —— 这里守着那条线
  const { execFileSync } = await import('node:child_process');
  const fontPath = new URL('../themes/assets/fonts/NotoSerifSC-Brand.woff2', import.meta.url);
  let text = '';
  try {
    text = execFileSync(
      process.execPath,
      ['-e', `
        const { execSync } = require('node:child_process');
        const font = require(process.argv[1]);
      `],
      { stdio: 'ignore' },
    );
  } catch { /* 没有 JS 解析器也无妨，走 python */ }
  const result = execFileSync('C:/Python314/python.exe', ['-c', `
from fontTools.ttLib import TTFont
import json, sys
f = TTFont(sys.argv[1])
print(json.dumps(sorted(f.getBestCmap())))
`, fontPath.pathname.replace(/^\/([A-Za-z]):/, '$1:')]);
  const codepoints = JSON.parse(result.toString());
  for (const char of new Set(PROJECT_SLOGAN_ZH)) {
    assert.ok(codepoints.includes(char.codePointAt(0)), `品牌子集缺字形「${char}」—— 改了字标就要重新 subset`);
  }
});

test('the right rail carries the vertical brand wordmark over the seal', async () => {
  const source = await read('../src/right-bar/index.tsx');
  assert.ok(source.includes('PROJECT_SLOGAN_ZH'), '右栏字标没有用品牌常量');
  assert.ok(source.includes('PROJECT_SLOGAN_EN'), '右栏字标没有用品牌常量');
  assert.ok(source.includes('data-brand-logo'), '品牌区没有定位锚点');
  assert.ok(source.includes('right-bar-brand-zh') && source.includes('right-bar-brand-en'), '竖排两行缺失');

  const css = await read('../src/right-bar/styles.css');
  assert.ok(css.includes('writing-mode: vertical-rl'), '品牌字标没有竖排');
  assert.ok(css.includes('var(--yp-font-brand-song)'), '中文行没有走品牌宋体');
  assert.ok(css.includes('var(--yp-font-brand-cormorant)'), '英文行没有走 Cormorant');
  assert.ok(css.includes('var(--yp-brand-ink)'), '字标没有用品牌墨色');
  // 顺序：中文在上、英文其次、印章最后
  const order = source.indexOf('right-bar-brand-zh') < source.indexOf('right-bar-brand-en')
    && source.indexOf('right-bar-brand-en') < source.indexOf('<img');
  assert.ok(order, '品牌区顺序应为 中文 → 英文 → 印章');
});

test('builtin layouts stay independent of brand strings', () => {
  const { layouts } = loadBuiltinLayouts();
  for (const layout of layouts.values()) {
    assert.ok(!layout.titleKey.includes('元朴思联'), '布局标题不该写死品牌串');
  }
});
