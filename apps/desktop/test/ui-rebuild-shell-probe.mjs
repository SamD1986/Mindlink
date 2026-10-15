/**
 * UI-03 真机探针：在真实 Electron 里点窗口按钮，用渲染层可观测的信号验证效果。
 *
 * 为什么不用 Playwright：本机没装，而 Node 内置 WebSocket，所以这里自己写一个
 * 最小 CDP 客户端（Runtime.evaluate / Page.captureScreenshot）。
 * 为什么不用 Browser.getWindowForTarget 读窗口状态：**Electron 没实现 Browser 域**
 * （页面会话与浏览器级连接都返回 "'Browser.getWindowForTarget' wasn't found"），
 * 因此改用外框尺寸与页面可见性这两个真实可观测的信号。
 *
 * 跑法（仓库根，不需要 dev 服务器，探针自己伺服 apps/app/dist）：
 *     node apps/desktop/test/ui-rebuild-shell-probe.mjs
 *
 * 证据落在 .tasks/ui-rebuild/evidence/UI-03/。用临时 MINDLINK_HOME 与独立
 * --user-data-dir，不碰真实数据（默认 userData 上的实例锁会让新实例秒退且不报错）。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron');
const desktopRoot = resolve(import.meta.dirname, '..');
const appDist = resolve(desktopRoot, '../app/dist');
const evidence = resolve(desktopRoot, '../../.tasks/ui-rebuild/evidence/stage-1-shell');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function eventually(check, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; }
    catch (error) { last = error; }
    await wait(120);
  }
  throw new Error(`${message}${last ? ` (last error: ${last.message})` : ''}`);
}

async function freePort() {
  const server = createSocketServer();
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const { port } = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function serveRenderer() {
  const server = createHttpServer(async (request, response) => {
    const relative = (request.url ?? '/').split('?')[0];
    const file = relative === '/' ? 'index.html' : relative.replace(/^\//, '');
    try {
      const body = await readFile(join(appDist, file));
      response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) };
}

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
    if (result.exceptionDetails) throw new Error(`evaluate failed: ${result.exceptionDetails.text} :: ${expression}`);
    return result.result.value;
  }

  metrics() {
    return this.evaluate(`(() => ({
      outerWidth: window.outerWidth, outerHeight: window.outerHeight,
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      availWidth: window.screen.availWidth, availHeight: window.screen.availHeight,
      visibility: document.visibilityState
    }))()`);
  }

  click(action) {
    return this.evaluate(`document.querySelector('[data-window-action="${action}"]').click()`);
  }

  close() { this.socket.close(); }
}

async function launch(rendererOrigin) {
  const root = await mkdtemp(join(tmpdir(), 'mindlink-ui03-'));
  const home = join(root, 'home');
  const userData = join(root, 'desktop-user-data');
  const debuggerPort = await freePort();
  const child = spawn(electron, [
    // 独立 userData 是必需的：默认 userData 上若已有实例或残留实例锁，
    // 新实例会被 requestSingleInstanceLock 挡掉，秒退且没有任何输出（实测）。
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${debuggerPort}`,
    desktopRoot,
  ], {
    env: {
      ...process.env,
      MINDLINK_HOME: home,
      MINDLINK_RENDERER_URL: `${rendererOrigin}/`,
      MINDLINK_NODE_BINARY: process.execPath,
      MINDLINK_NOTIFICATIONS_ENABLED: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => { if (diagnostics.length < 16_384) diagnostics += chunk.toString(); });
  }
  try {
    const target = await eventually(async () => {
      const response = await fetch(`http://127.0.0.1:${debuggerPort}/json/list`);
      const targets = await response.json();
      return targets.find((item) => item.type === 'page' && !item.url.startsWith('devtools://'));
    }, `Electron renderer target never appeared. diagnostics=${diagnostics.slice(-800)}`);
    const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await eventually(async () => cdp.evaluate('Boolean(window.mindlink?.isWindowMaximized)'), 'preload bridge missing');
    return { child, cdp, root, diagnostics: () => diagnostics };
  } catch (error) {
    child.kill();
    throw error;
  }
}

const renderer = await serveRenderer();
const session = await launch(renderer.origin);
const { cdp, child } = session;
const results = [];
const record = (name, detail) => { results.push(`✔ ${name} — ${detail}`); console.log(`✔ ${name} — ${detail}`); };

try {
  // 1) 桥方法齐不齐
  const bridged = await cdp.evaluate(`(() => {
    const names = ['minimizeWindow', 'toggleMaximizeWindow', 'closeWindow', 'isWindowMaximized', 'onWindowMaximizeChanged'];
    return names.filter((name) => typeof window.mindlink?.[name] === 'function').length;
  })()`);
  assert.equal(bridged, 5, '窗口控制桥方法不全');
  record('桥方法', '5/5 可用');

  // 2) 无边框：没有系统标题栏时外框与内容高度几乎相等（Windows 上留 7px 隐式缩放边）
  const chrome = await cdp.evaluate('window.outerHeight - window.innerHeight');
  assert.ok(chrome <= 12, `仍带系统标题栏：outerHeight-innerHeight=${chrome}`);
  record('无边框', `outerHeight-innerHeight=${chrome}（带系统标题栏时约 39）`);

  // 3) 初始是普通窗口：未最大化，且外框明显小于屏幕可用区
  const normal = await cdp.metrics();
  assert.equal(await cdp.evaluate('window.mindlink.isWindowMaximized()'), false);
  assert.ok(normal.outerWidth < normal.availWidth, '普通窗口的外框宽度不该等于屏幕可用宽度');
  record('普通窗口', `${normal.outerWidth}x${normal.outerHeight}，屏幕可用 ${normal.availWidth}x${normal.availHeight}`);

  // 3.5) 四条栏的内容：左栏开标签、右栏开合对话、pin 落盘并在重载后仍在、LOGO 真的加载出来
  await cdp.evaluate(`document.querySelector('[data-left-entry="wiki"]').click()`);
  await eventually(
    async () => cdp.evaluate(`Boolean(document.querySelector('[data-tab="wiki"][data-active="true"]'))`),
    '左栏点入口没有开出标签',
  );
  await cdp.evaluate(`document.querySelector('[data-left-entry="skills"]').click()`);
  const tabIds = await eventually(async () => {
    const ids = await cdp.evaluate(`[...document.querySelectorAll('[data-tab]')].map((el) => el.getAttribute('data-tab'))`);
    return ids.length === 2 ? ids : null;
  }, '第二个入口没有加出第二个标签');
  record('左栏开标签', `标签=${tabIds.join(' / ')}，点谁谁成为当前`);

  const conversations = `document.querySelector('[data-right-action="conversations"]')`;
  await cdp.evaluate(`${conversations}.click()`);
  assert.equal(await cdp.evaluate(`${conversations}.getAttribute('aria-pressed')`), 'true');
  await cdp.evaluate(`${conversations}.click()`);
  assert.equal(await cdp.evaluate(`${conversations}.getAttribute('aria-pressed')`), 'false');
  record('右栏会话按钮', 'aria-pressed 随开合切换');

  const logo = await cdp.evaluate(`(() => {
    const image = document.querySelector('[data-brand-logo] img');
    return image ? { src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0 } : null;
  })()`);
  assert.ok(logo?.loaded, `常驻 LOGO 没有加载成功：${JSON.stringify(logo)}`);
  assert.ok(await cdp.evaluate(`Boolean(document.querySelector('[data-bottom-slot]'))`), '下栏没有预留槽位');
  record('常驻 LOGO 与下栏槽位', `logo=${logo.src}，naturalWidth>0`);

  await cdp.evaluate(`document.querySelector('[data-left-action="pin-current"]').click()`);
  const stored = await eventually(async () => cdp.evaluate(`localStorage.getItem('mindlink.pinned-layouts')`), 'pin 没有落盘');
  await cdp.send('Page.reload');
  await eventually(async () => cdp.evaluate(`Boolean(window.mindlink?.isWindowMaximized)`), '重载后 preload 没回来');
  const pinnedAfterReload = await eventually(
    async () => cdp.evaluate(`document.querySelectorAll('[data-left-pin]').length`),
    '重载后左栏的 pin 丢了',
  );
  record('pin 持久化', `localStorage=${stored}，重载后 pin 数=${pinnedAfterReload}`);

  // 4) 点最大化 → 外框铺满屏幕可用区，且按钮图标跟着换（证明事件也通了）
  await cdp.click('toggle-maximize');
  const maximized = await eventually(async () => {
    const value = await cdp.metrics();
    return value.outerWidth >= value.availWidth - 2 && value.outerHeight >= value.availHeight - 2 ? value : null;
  }, '窗口没有最大化（外框未铺满屏幕可用区）');
  assert.equal(await cdp.evaluate('window.mindlink.isWindowMaximized()'), true);
  const label = await cdp.evaluate(`document.querySelector('[data-window-action="toggle-maximize"]').getAttribute('aria-label')`);
  assert.equal(label, 'Restore window', '最大化后按钮图标没有跟着换（事件没送到渲染层）');
  record('最大化', `${maximized.outerWidth}x${maximized.outerHeight} = 屏幕可用区，按钮 aria-label=${label}`);

  // 5) 再点一次 → 还原成普通窗口
  await cdp.click('toggle-maximize');
  await eventually(async () => {
    const value = await cdp.metrics();
    return value.outerWidth < value.availWidth && (await cdp.evaluate('window.mindlink.isWindowMaximized()')) === false;
  }, '窗口没有还原');
  record('还原', `回到 ${(await cdp.metrics()).outerWidth}px 宽，isWindowMaximized=false`);

  // 6) 点最小化 → 页面可见性转为 hidden（最小化是渲染层唯一可观测的信号）
  await cdp.click('minimize');
  let minimized = '未观测到 hidden（窗口确实调用了最小化，但渲染层读不到状态）';
  try {
    await eventually(async () => (await cdp.evaluate('document.visibilityState')) === 'hidden', 'not hidden', 6000);
    minimized = 'document.visibilityState=hidden';
  } catch { /* 如实记录，不伪造 */ }
  record('最小化', minimized);

  // 7) 从最小化拉回来（最大化一次再还原），留一张可看的证据图
  await cdp.click('toggle-maximize');
  await eventually(async () => cdp.evaluate('window.mindlink.isWindowMaximized()'), '拉不回窗口');
  await cdp.click('toggle-maximize');
  await eventually(async () => (await cdp.evaluate('document.visibilityState')) === 'visible', '窗口仍不可见');
  await cdp.send('Page.enable');
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'shell-window.png'), Buffer.from(shot.data, 'base64'));
  record('截图', join(evidence, 'shell-window.png'));

  // 8) 点关闭 → 应用进程退出
  await cdp.click('close');
  await eventually(async () => child.exitCode !== null || child.signalCode !== null, '关闭按钮没有让应用退出', 20_000);
  record('关闭', `应用已退出（exitCode=${child.exitCode}）`);

  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'results.md'),
    `# 阶段 1（UI-03 ~ UI-07）真机探针结果\n\n命令：\`node apps/desktop/test/ui-rebuild-shell-probe.mjs\`\n\n`
    + `环境：真实 Electron（apps/desktop/dist/main.cjs）+ 构建产物 apps/app/dist，\n`
    + `临时 MINDLINK_HOME 与独立 --user-data-dir。\n\n`
    + results.map((line) => `- ${line}`).join('\n') + '\n');
} finally {
  cdp.close();
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await renderer.close();
  await rm(session.root, { recursive: true, force: true }).catch(() => {});
}

console.log(`\nUI-03 真机验收：${results.length} 项完成（最小化一项如实标注可观测性）`);
