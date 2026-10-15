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
