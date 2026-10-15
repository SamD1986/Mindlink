import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { register } from 'tsx/esm/api';

register();
const { parseLayout } = await import('../src/workbench/layouts/format.ts');
const { WIDGET_REGISTRY, loadBuiltinLayouts } = await import('../src/workbench/layouts/builtin.ts');

const VALID = {
  id: 'demo',
  titleKey: 'layout.demo',
  grid: { columns: 96, rows: 54 },
  widgets: [
    { id: 'a', widget: 'note.text', rect: { x: 0, y: 0, w: 20, h: 20 } },
    { id: 'b', widget: 'viewer.files', rect: { x: 20, y: 0, w: 20, h: 20 } },
  ],
};

const parse = (input) => parseLayout(input, WIDGET_REGISTRY);

test('a well-formed layout parses and keeps its widget order', () => {
  const result = parse(VALID);
  assert.equal(result.ok, true);
  assert.deepEqual(result.layout.widgets.map((instance) => instance.id), ['a', 'b']);
  assert.deepEqual(result.layout.grid, { columns: 96, rows: 54 });
});

test('invalid layouts are rejected with readable errors', () => {
  const cases = [
    [{ ...VALID, widgets: [{ id: 'a', widget: 'nope.unknown', rect: { x: 0, y: 0, w: 20, h: 20 } }] }, /未登记的 widget/],
    [{ ...VALID, widgets: [{ id: 'a', widget: 'note.text', rect: { x: 90, y: 0, w: 20, h: 20 } }] }, /越出画布/],
    [{ ...VALID, widgets: [{ id: 'a', widget: 'note.text', rect: { x: 0, y: 0, w: 2, h: 2 } }] }, /最小尺寸/],
    [{ ...VALID, widgets: [
      { id: 'a', widget: 'note.text', rect: { x: 0, y: 0, w: 20, h: 20 } },
      { id: 'a', widget: 'note.text', rect: { x: 20, y: 0, w: 20, h: 20 } },
    ] }, /重复/],
    [{ ...VALID, widgets: [
      { id: 'a', widget: 'note.text', rect: { x: 0, y: 0, w: 20, h: 20 } },
      { id: 'b', widget: 'note.text', rect: { x: 10, y: 10, w: 20, h: 20 } },
    ] }, /重叠/],
    [{ ...VALID, id: '' }, /缺少 id/],
    [{ ...VALID, titleKey: '' }, /titleKey/],
    [{ ...VALID, grid: { columns: 4, rows: 4 } }, /columns 至少/],
    [{ ...VALID, widgets: [] }, /非空数组/],
  ];
  for (const [input, pattern] of cases) {
    const result = parse(input);
    assert.equal(result.ok, false, `本该拒掉：${JSON.stringify(input).slice(0, 80)}`);
    assert.ok(result.errors.some((error) => pattern.test(error)), `错误不够可读：${result.errors.join(' / ')}`);
  }
});

test('builtin layouts load without errors and carry no raw pixel data', async () => {
  const { layouts, errors } = loadBuiltinLayouts(WIDGET_REGISTRY);
  assert.deepEqual(errors, []);
  assert.deepEqual([...layouts.keys()].sort(), ['settings', 'skills', 'wiki']);
  const source = await readFile(new URL('../src/workbench/layouts/builtin.ts', import.meta.url), 'utf8');
  assert.ok(!/\bpx\b/.test(source), '内置布局里不该出现像素单位');
});

test('the workbench never turns layout data into code', async () => {
  const root = new URL('../src/workbench/', import.meta.url);
  const files = await collect(root);
  assert.ok(files.length >= 5, '没扫到 workbench 的源码');
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.ok(!/\bimport\s*\(/.test(source), `${file.pathname} 里出现了动态 import`);
    assert.ok(!/\beval\s*\(/.test(source), `${file.pathname} 里出现了 eval`);
  }
});

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) files.push(...(await collect(url)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(url);
  }
  return files;
}
