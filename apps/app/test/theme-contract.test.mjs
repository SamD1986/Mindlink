import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const SRC = new URL('../src/', import.meta.url);
const THEMES = new URL('../themes/', import.meta.url);

/**
 * 扫描活样式表：归档区（_legacy-ui）不参与。
 * 这里刻意**不再硬编码文件路径** —— 上一版写死了 muse-theme.css / modules/*.css，
 * 结构一动这些路径就失效，机核会因文件不存在而报错而不是因为真的违规。
 */
async function cssFiles(dir, { skipLegacy = false } = {}) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (skipLegacy && entry.name === '_legacy-ui') continue;
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) files.push(...(await cssFiles(url, { skipLegacy })));
    else if (entry.name.endsWith('.css')) files.push(url);
  }
  return files;
}

const liveStylesheets = async () => [
  ...(await cssFiles(SRC, { skipLegacy: true })),
  ...(await cssFiles(THEMES)),
];

test('every token referenced by live stylesheets is declared by the built-in theme', async () => {
  // tokens.css 现在是聚合层，需要扫描 tokens/ 目录下的所有分组文件
  const tokenFiles = await cssFiles(new URL('tokens/', THEMES));
  const declared = new Set();
  for (const url of tokenFiles) {
    const css = await readFile(url, 'utf8');
    for (const [, name] of css.matchAll(/(--yp-[a-z0-9-]+)\s*:/g)) {
      declared.add(name);
    }
  }

  let referenced = 0;
  for (const url of await liveStylesheets()) {
    const css = await readFile(url, 'utf8');
    for (const [, name] of css.matchAll(/var\((--yp-[a-z0-9-]+)\)/g)) {
      referenced += 1;
      assert.ok(declared.has(name), `${name} is missing from the built-in theme (${url.pathname})`);
    }
  }
  assert.ok(referenced > 0, 'no live stylesheet references a theme token');
});

test('live stylesheets scale text through rem and declare the font tokens', async () => {
  // 扫描 tokens/ 目录下的所有文件
  const tokenFiles = await cssFiles(new URL('tokens/', THEMES));
  let allTokens = '';
  for (const url of tokenFiles) {
    allTokens += await readFile(url, 'utf8');
  }
  
  for (const token of ['--yp-font-family', '--yp-font-scale-ui', '--yp-font-size-content']) {
    assert.ok(allTokens.includes(`${token}:`), `${token} is missing from the built-in theme tokens`);
  }

  for (const url of await liveStylesheets()) {
    // tokens/ 目录下的文件是声明文件，允许出现基准 px；其余样式表必须走 rem。
    if (url.pathname.includes('/themes/tokens/')) continue;
    const css = await readFile(url, 'utf8');
    const hardcoded = css.match(/(?:font-size|line-height):\s*\d+(?:\.\d+)?px/g) ?? [];
    assert.deepEqual(hardcoded, [], `${url.pathname} keeps hardcoded px text sizes: ${hardcoded.join(', ')}`);
  }
});
