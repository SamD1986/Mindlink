import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

const BARS = {
  'top-bar': '../src/top-bar/index.tsx',
  'left-bar': '../src/left-bar/index.tsx',
  'right-bar': '../src/right-bar/index.tsx',
  'bottom-bar': '../src/bottom-bar/index.tsx',
};
const WORKBENCH = 'workbench';

test('the shell composes four bars around the canvas slot', async () => {
  const shell = await read('../src/shell/index.tsx');
  for (const name of [...Object.keys(BARS), WORKBENCH]) {
    assert.ok(shell.includes(`../${name}/index.js`), `shell does not mount ${name}`);
  }
});

test('the stage places every bar and the canvas through grid areas', async () => {
  const css = await read('../src/shell/layout.css');
  const areas = css.match(/grid-template-areas:([^;]+);/)?.[1] ?? '';
  for (const area of ['top', 'left', WORKBENCH, 'right', 'bottom']) {
    assert.ok(areas.includes(area), `grid-template-areas misses ${area}`);
    assert.ok(css.includes(`grid-area: ${area};`), `no grid-area rule for ${area}`);
  }
});

test('bars stay independent: no bar imports another bar or the canvas', async () => {
  const files = { ...BARS, [WORKBENCH]: '../src/workbench/index.tsx' };
  for (const [name, path] of Object.entries(files)) {
    const source = await read(path);
    for (const other of Object.keys(files)) {
      if (other === name) continue;
      assert.ok(!source.includes(`../${other}/`), `${name} imports ${other}`);
    }
  }
});

test('every bar and the canvas own their stylesheet', async () => {
  for (const name of [...Object.keys(BARS), WORKBENCH]) {
    const source = await read(`../src/${name}/index.tsx`);
    assert.ok(source.includes("import './styles.css';"), `${name} does not import its own stylesheet`);
  }
});

