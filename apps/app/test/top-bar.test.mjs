import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

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
  // 标签页已移除（2026-10-15），上栏只剩窗口按钮
  for (const selector of ['.top-bar-window-controls {']) {
    const block = css.slice(css.indexOf(selector));
    assert.ok(block.slice(0, block.indexOf('}')).includes('no-drag'), `${selector} would swallow clicks into dragging`);
  }
});
