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
  const tokens = await readFile(new URL('tokens.css', THEMES), 'utf8');
  const declared = new Set([...tokens.matchAll(/(--yp-[a-z0-9-]+)\s*:/g)].map((match) => match[1]));

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
  const tokens = await readFile(new URL('tokens.css', THEMES), 'utf8');
  for (const token of ['--yp-font-family', '--yp-font-scale-ui', '--yp-font-size-content']) {
    assert.ok(tokens.includes(`${token}:`), `${token} is missing from the built-in theme tokens`);
  }

  for (const url of await liveStylesheets()) {
    // tokens.css 是声明文件，允许出现基准 px；其余样式表必须走 rem。
    if (url.pathname.endsWith('/themes/tokens.css')) continue;
    const css = await readFile(url, 'utf8');
    const hardcoded = css.match(/(?:font-size|line-height):\s*\d+(?:\.\d+)?px/g) ?? [];
    assert.deepEqual(hardcoded, [], `${url.pathname} keeps hardcoded px text sizes: ${hardcoded.join(', ')}`);
  }
});
