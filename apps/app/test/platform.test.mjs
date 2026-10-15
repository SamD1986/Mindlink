import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { register } from 'tsx/esm/api';

register();
const { applyPlatformAttribute, detectOs } = await import('../src/shared/platform.ts');

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('detectOs classifies the desktop platforms', () => {
  assert.equal(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'), 'mac');
  assert.equal(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'), 'win');
  assert.equal(detectOs('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'), 'linux');
  assert.equal(detectOs(''), 'other');
});

test('the platform flag is written to the document element for CSS to branch on', () => {
  const target = { dataset: {} };
  assert.equal(applyPlatformAttribute(target), detectOs());
  assert.equal(target.dataset.os, detectOs());
});

test('macOS reserves room for the system traffic lights', async () => {
  const css = await read('../src/top-bar/styles.css');
  const mac = css.match(/\[data-os='mac'\] \.top-bar \{([^}]*)\}/);
  assert.ok(mac, '缺少 macOS 的让位规则');
  assert.match(mac[1], /--top-bar-leading-inset:\s*(\d+)px/, '让位宽度必须是一个可核对的数值');
  const inset = Number(mac[1].match(/--top-bar-leading-inset:\s*(\d+)px/)[1]);
  // 红绿灯约 13–65px
  assert.ok(inset >= 80, `让位宽度 ${inset}px 不足以避开系统红绿灯`);
  // 标签页已移除，检查上栏本身消费让位宽度
  assert.ok(css.includes('padding-left: var(--top-bar-leading-inset);'), '上栏没有消费让位宽度');
});

test('window controls delegate platform detection to the shared module', async () => {
  const source = await read('../src/top-bar/window-controls.tsx');
  assert.ok(source.includes("import { detectOs } from '../shared/platform.js'"), '窗口按钮自己嗅探了平台');
  assert.ok(source.includes("if (detectOs() === 'mac') return null;"), 'macOS 仍会渲染出重复的控件');
  assert.ok(!/navigator\.userAgent/.test(source), '渲染层不允许再出现第二处平台嗅探');
});
