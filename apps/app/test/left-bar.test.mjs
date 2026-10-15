import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('the left bar renders the fixed entries and the pin area', async () => {
  const source = await read('../src/left-bar/index.tsx');
  assert.ok(source.includes('FIXED_ENTRIES.map'), '固定入口不是按清单渲染的');
  assert.ok(source.includes('data-left-entry={entry.id}'), '固定入口不可被探针定位');
  assert.ok(source.includes('data-left-pins'), '缺少 pin 区');
  assert.ok(source.includes('data-left-pin={entry.id}'), 'pin 项不可被探针定位');
});

test('the left bar switches layouts through the shell, never through another bar', async () => {
  const source = await read('../src/left-bar/index.tsx');
  assert.ok(source.includes("import { useWorkspace } from '../shell/workspace.js'"), '没有走容器的共享状态');
  assert.ok(source.includes('openLayout('), '点击入口没有切换布局');
  assert.ok(!source.includes('../top-bar/'), '左栏直接 import 了上栏');
});

test('pins are added, removed and reordered from the bar', async () => {
  const source = await read('../src/left-bar/index.tsx');
  for (const action of ['up', 'down', 'unpin']) {
    assert.ok(source.includes(`data-pin-action="${action}"`), `没有 ${action} 操作`);
  }
  assert.ok(source.includes('data-left-action="pin-current"'), '不能把当前布局固定到左栏');
});

test('the renderer touches storage in exactly one place', async () => {
  const bar = await read('../src/left-bar/index.tsx');
  assert.ok(!bar.includes('localStorage'), '组件直接读了 localStorage');
  const entries = await read('../src/left-bar/entries.ts');
  assert.ok(entries.includes('localStorage'), '存储接缝应实现在 entries.ts（过渡实现）');
  const store = await read('../src/left-bar/entries.ts');
  assert.ok(store.includes('export type LayoutPinStore'), '没有可替换的存储接缝类型');
});
