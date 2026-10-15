import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

const CHANNELS = {
  minimizeWindow: 'window:minimize',
  toggleMaximizeWindow: 'window:toggle-maximize',
  closeWindow: 'window:close',
  isWindowMaximized: 'window:is-maximized',
};

test('the protocol declares the window controls', async () => {
  const protocol = await read('../../../packages/mindlink-protocol/src/index.ts');
  for (const method of [...Object.keys(CHANNELS), 'onWindowMaximizeChanged']) {
    assert.ok(protocol.includes(`${method}(`), `DesktopBridge is missing ${method}`);
  }
});

test('the preload maps every window control to its channel', async () => {
  const preload = await read('../src/preload.ts');
  for (const [method, channel] of Object.entries(CHANNELS)) {
    assert.ok(preload.includes(`${method}: () => ipcRenderer.invoke('${channel}')`), `${method} is not bridged to ${channel}`);
  }
  assert.ok(preload.includes("ipcRenderer.on('window:maximize-changed'"), 'maximize changes are never delivered');
});

test('every window channel is registered and behind trustedHandler', async () => {
  // 先把空白归一化再匹配：否则 `\s*` 会退让成零宽、负向前瞻被一个空格骗过
  // （实测：`ipcMain.handle('window:minimize', trustedHandler(...))` 会被误判为没走 guarded）。
  const main = (await read('../src/main.ts')).replace(/\s+/g, ' ');
  const registrations = [...main.matchAll(/ipcMain\.handle\( ?'(window:[^']+)', ?([A-Za-z]+)\(/g)]
    .map((match) => ({ channel: match[1], wrapper: match[2] }));
  const channels = registrations.map((entry) => entry.channel);
  for (const channel of Object.values(CHANNELS)) {
    assert.ok(channels.includes(channel), `${channel} is not registered`);
  }
  for (const entry of registrations) {
    assert.equal(entry.wrapper, 'trustedHandler', `${entry.channel} is not wrapped in trustedHandler`);
  }
});

test('the window hides the system title bar except on macOS', async () => {
  const main = await read('../src/main.ts');
  assert.match(main, /process\.platform === 'darwin'\s*\?\s*\{\s*titleBarStyle:\s*'hiddenInset'/, 'macOS lost the traffic lights');
  assert.match(main, /:\s*\{\s*frame:\s*false\s*\}/, 'Windows/Linux keep the system title bar');
  assert.ok(!/'default'/.test(main), 'the window still requests a default title bar');
});

test('the main process forwards maximize state changes to the renderer', async () => {
  const main = await read('../src/main.ts');
  assert.ok(main.includes("window.on('maximize'"), 'maximize is not observed');
  assert.ok(main.includes("window.on('unmaximize'"), 'unmaximize is not observed');
  assert.ok(main.includes("webContents.send('window:maximize-changed'"), 'the renderer is never told');
});

test('the macOS traffic lights stay inside the inset the renderer reserves for them', async () => {
  // 跨层不变量：主进程放灯的位置必须落在渲染层预留的让位宽度内，
  // 否则红绿灯会压住上栏的标签条（本次就是靠这条发现旧让位被重构丢掉了）。
  const main = (await read('../src/main.ts')).replace(/\s+/g, ' ');
  const position = main.match(/titleBarStyle: 'hiddenInset' as const, trafficLightPosition: \{ x: (\d+), y: (\d+) \}/);
  assert.ok(position, 'macOS 红绿灯没有设定位置（trafficLightPosition）');
  const [, x, y] = position.map(Number);

  const css = await read('../../app/src/top-bar/styles.css');
  const insetMatch = css.match(/\[data-os='mac'\] \.top-bar \{([^}]*)\}/);
  assert.ok(insetMatch, '渲染层缺少 macOS 让位规则');
  const inset = Number(insetMatch[1].match(/--top-bar-leading-inset:\s*(\d+)px/)[1]);
  const barHeight = Number(css.match(/\.top-bar \{([^}]*)\}/)[1].match(/min-height:\s*(\d+)px/)[1]);

  // 三个灯各 12px、间距 8px：总宽约 52px
  assert.ok(x + 52 <= inset, `红绿灯占 ${x}–${x + 52}px，超出渲染层预留的 ${inset}px`);
  // 灯垂直居中于上栏（容差 2px）
  assert.ok(Math.abs(y + 6 - barHeight / 2) <= 2, `${barHeight}px 高的上栏里红绿灯没有垂直居中（y=${y}）`);
});
