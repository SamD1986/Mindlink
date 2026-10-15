/**
 * macOS 效果预览：把运行中的应用伪装成 macOS，真渲染后截图。
 *
 * 做法：CDP 覆盖 userAgent + platform → 页面重载 → 应用自己的 detectOs() 判成 mac
 * （不是手改 DOM）→ 真渲染 → 截图。因此图里的布局/让位/字体回退都是真实渲染结果，
 * 只有系统自绘的三个圆点需要在图外叠加（坐标来自主进程 trafficLightPosition，
 * 叠加脚本见 tools/mac-preview-overlay.py）。
 *
 * 用法：
 *   node apps/desktop/test/ui-rebuild-mac-preview.mjs <调试端口> <输出目录>
 *   （需要先起一个带 --remote-debugging-port 的实例；dev.mjs 不起调试端口，
 *     所以用：electron --user-data-dir=<临时> --remote-debugging-port=9444 .
 *     --user-data-dir 是必需的，否则默认 userData 的实例锁会让新实例秒退且无输出。）
 *   python apps/desktop/test/tools/mac-preview-overlay.py <输出目录> <成品目录>
 *
 * 结束后会清掉覆盖并重载，把窗口还原成原本的平台外观。
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const port = process.argv[2];
const outDir = process.argv[3];
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) MindLink/0.1.0 Chrome/140.0.0.0 Electron/43.7.3 Safari/537.36';

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${message.error.message} (${entry.method})`));
      else entry.resolve(message.result);
    });
  }

  static connect(url) {
    return new Promise((resolveConnect, rejectConnect) => {
      const socket = new WebSocket(url);
      socket.addEventListener('open', () => resolveConnect(new Cdp(socket)));
      socket.addEventListener('error', () => rejectConnect(new Error(`CDP connect failed: ${url}`)));
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`evaluate failed: ${result.exceptionDetails.text}`);
    return result.result.value;
  }

  async eventually(check, message, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try { const value = await check(); if (value) return value; } catch { /* 重载期间 */ }
      await wait(120);
    }
    throw new Error(message);
  }

  async screenshot(file) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(file, Buffer.from(shot.data, 'base64'));
    return file;
  }

  close() { this.socket.close(); }
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((entry) => entry.type === 'page');
if (!page) throw new Error('没有找到页面目标');
const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
await cdp.send('Page.enable');

const PROBE = `(() => {
  const bar = document.querySelector('.top-bar');
  const tabs = document.querySelector('.top-bar-tabs');
  return {
    dataOs: document.documentElement.dataset.os,
    上栏: bar ? Math.round(bar.getBoundingClientRect().height) : null,
    让位宽度: bar ? getComputedStyle(bar).getPropertyValue('--top-bar-leading-inset').trim() : null,
    标签条左内边距: tabs ? getComputedStyle(tabs).paddingLeft : null,
    自绘窗口按钮数: document.querySelectorAll('[data-window-action]').length,
    widget数: document.querySelectorAll('[data-widget]').length,
    标签数: document.querySelectorAll('[data-tab]').length,
    字体: getComputedStyle(document.body).fontFamily.split(',')[0],
  };
})()`;

/** 摆出同样内容的界面：两个标签 + 一份布局。 */
async function stage() {
  await cdp.eventually(() => cdp.evaluate(`Boolean(document.querySelector('[data-left-entry="wiki"]'))`), '界面没就绪');
  await cdp.evaluate(`document.querySelector('[data-left-entry="wiki"]').click()`);
  await cdp.evaluate(`document.querySelector('[data-left-entry="skills"]').click()`);
  await cdp.evaluate(`document.querySelector('[data-left-entry="wiki"]').click()`);
  await cdp.eventually(async () => (await cdp.evaluate(`document.querySelectorAll('[data-widget]').length`)) > 0, '画布没有 widget');
  await wait(400);
}

const evidence = {};
try {
  // 统一视口与像素比（2x，接近视网膜屏的清晰度）
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 768, deviceScaleFactor: 2, mobile: false });

  // ① 真实 Windows 渲染（对照）
  await stage();
  evidence.windows = await cdp.evaluate(PROBE);
  await cdp.screenshot(join(outDir, 'topbar-windows.png'));

  // ② 伪装成 macOS：改 UA + platform，让应用自己的 detectOs() 判成 mac
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: MAC_UA, platform: 'MacIntel', acceptLanguage: 'zh-CN,zh' });
  await cdp.send('Page.reload');
  await wait(800);
  await stage();
  evidence.macos = await cdp.evaluate(PROBE);
  await cdp.screenshot(join(outDir, 'topbar-macos.png'));
} finally {
  // 还原：清掉覆盖并重载，把窗口交回原本的平台外观
  await cdp.send('Emulation.clearUserAgentOverride').catch(() => {});
  await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  await cdp.send('Page.reload').catch(() => {});
  cdp.close();
}

console.log(JSON.stringify(evidence, null, 1));
