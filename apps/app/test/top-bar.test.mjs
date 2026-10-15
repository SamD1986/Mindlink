import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('the top bar renders every open tab and marks the active one', async () => {
  const source = await read('../src/top-bar/index.tsx');
  assert.ok(source.includes('state.tabs.map'), '标签不是按窗口状态渲染的');
  assert.ok(source.includes('data-tab={tab.id}'), '标签不可被探针定位');
  assert.ok(source.includes("data-active={tab.id === state.activeId}"), '没有标出当前标签');
  assert.ok(source.includes('role="tablist"'), '标签条不是 tablist');
});

test('the top bar reads and dispatches window state instead of holding it', async () => {
  const source = await read('../src/top-bar/index.tsx');
  assert.ok(source.includes("import { useWorkspace } from '../shell/workspace.js'"), '没有走容器的共享状态');
  assert.ok(source.includes('openLayout(tab)'), '点击标签没有切换布局');
  assert.ok(source.includes('closeLayout(tab.id)'), '关闭标签没有回到窗口状态');
  assert.ok(!source.includes('useState'), '上栏仍自持标签状态（应交给 shell）');
});

test('window controls call the bridge and stay hidden on macOS', async () => {
  const source = await read('../src/top-bar/window-controls.tsx');
  for (const method of ['minimizeWindow', 'toggleMaximizeWindow', 'closeWindow', 'isWindowMaximized', 'onWindowMaximizeChanged']) {
    assert.ok(source.includes(method), `window controls never call ${method}`);
  }
  assert.ok(source.includes("if (detectOs() === 'mac') return null;"), 'macOS would render a duplicate control set');
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
