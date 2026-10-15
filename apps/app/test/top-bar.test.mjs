import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { register } from 'tsx/esm/api';

register();
const { PLACEHOLDER_TABS, closeTab, neighborAfterClose, openTab } = await import('../src/top-bar/tabs.ts');

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('opening an already open tab neither duplicates nor reorders', () => {
  const tabs = [{ id: 'work', label: 'Work', labelKey: 'tab.work' }];
  assert.deepEqual(openTab(tabs, { id: 'work', label: 'Work', labelKey: 'tab.work' }), tabs);
  assert.deepEqual(
    openTab(tabs, { id: 'skills', label: 'Skills', labelKey: 'tab.skills' }).map((tab) => tab.id),
    ['work', 'skills'],
  );
});

test('closing a tab removes only that tab', () => {
  const tabs = PLACEHOLDER_TABS;
  assert.deepEqual(closeTab(tabs, 'assistant').map((tab) => tab.id), ['work']);
  assert.deepEqual(closeTab(tabs, 'missing'), tabs);
});

test('closing the active tab activates the right neighbour, then the left one', () => {
  const tabs = [
    { id: 'a', label: 'A', labelKey: 'tab.a' },
    { id: 'b', label: 'B', labelKey: 'tab.b' },
    { id: 'c', label: 'C', labelKey: 'tab.c' },
  ];
  // 关掉当前标签 → 取右邻
  assert.equal(neighborAfterClose(tabs, 'b', 'b'), 'c');
  // 右邻不存在 → 取左邻
  assert.equal(neighborAfterClose(tabs, 'c', 'c'), 'b');
  // 关的不是当前标签 → 当前标签不变
  assert.equal(neighborAfterClose(tabs, 'a', 'c'), 'a');
  // 只剩一个 → 没有可激活的标签
  assert.equal(neighborAfterClose([{ id: 'a', label: 'A', labelKey: 'tab.a' }], 'a', 'a'), null);
});

test('the top bar renders the tab strip and the window controls', async () => {
  const source = await read('../src/top-bar/index.tsx');
  assert.ok(source.includes("import { WindowControls } from './window-controls.js';"));
  assert.ok(source.includes('role="tablist"'), 'the tab strip is not a tablist');
  assert.ok(source.includes('data-tab='), 'tabs are not addressable for probes');
  assert.ok(source.includes('onClick={() => activate(tab)}'), 'tabs do not switch the active layout');
});

test('window controls call the bridge and stay hidden on macOS', async () => {
  const source = await read('../src/top-bar/window-controls.tsx');
  for (const method of ['minimizeWindow', 'toggleMaximizeWindow', 'closeWindow', 'isWindowMaximized', 'onWindowMaximizeChanged']) {
    assert.ok(source.includes(method), `window controls never call ${method}`);
  }
  assert.ok(source.includes('if (isMacPlatform()) return null;'), 'macOS would render a duplicate control set');
  for (const action of ['minimize', 'toggle-maximize', 'close']) {
    assert.ok(source.includes(`data-window-action="${action}"`), `${action} is not addressable for probes`);
  }
});

test('the drag region excludes every interactive element', async () => {
  const css = await read('../src/top-bar/styles.css');
  assert.ok(/-webkit-app-region:\s*drag/.test(css), 'the top bar is not draggable');
  for (const selector of ['.top-bar-tab {', '.top-bar-window-controls {']) {
    const block = css.slice(css.indexOf(selector));
    assert.ok(block.slice(0, block.indexOf('}')).includes('no-drag'), `${selector} would swallow clicks into dragging`);
  }
});
