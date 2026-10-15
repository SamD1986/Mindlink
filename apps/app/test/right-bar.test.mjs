import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('the right bar carries the conversation button and the permanent logo', async () => {
  const source = await read('../src/right-bar/index.tsx');
  assert.ok(source.includes('data-right-action="conversations"'), '缺少会话按钮');
  assert.ok(source.includes('data-brand-logo'), '缺少常驻 LOGO 槽位');
  assert.ok(/<img[^>]*src=\{yuanpuSeal\}/.test(source), 'LOGO 没有真的渲染出来');
  assert.ok(!/data-brand-logo[^>]*\{\s*state\./.test(source), 'LOGO 不该随布局/主题消失');
});

test('the conversation button drives the shell window state', async () => {
  const source = await read('../src/right-bar/index.tsx');
  assert.ok(source.includes("import { useWorkspace } from '../shell/workspace.js'"));
  assert.ok(source.includes('onClick={toggleChatbox}'), '按钮没接开合动作');
  assert.ok(source.includes('aria-pressed={state.chatboxOpen}'), '按钮没反映浮层开关状态');
  assert.ok(!source.includes('../top-bar/') && !source.includes('../left-bar/'), '右栏 import 了别的栏');
});

test('the bottom bar reserves a slot without swallowing events', async () => {
  const source = await read('../src/bottom-bar/index.tsx');
  assert.ok(source.includes('data-bottom-slot'), '下栏没有预留槽位');
  const css = await read('../src/bottom-bar/styles.css');
  const bar = css.slice(css.indexOf('.bottom-bar {'));
  assert.ok(bar.slice(0, bar.indexOf('}')).includes('pointer-events: none'), '空着的下栏会挡住画布');
  const slot = css.slice(css.indexOf('.bottom-bar-slot {'));
  assert.ok(slot.slice(0, slot.indexOf('}')).includes('pointer-events: auto'), '槽位将来点不动');
});
