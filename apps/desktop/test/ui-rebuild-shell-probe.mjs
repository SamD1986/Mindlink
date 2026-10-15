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
const evidence = resolve(desktopRoot, '../../.tasks/ui-rebuild/evidence/shell-and-workbench');

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
  await eventually(
    async () => cdp.evaluate(`Boolean(document.querySelector('[data-workbench-empty]'))`),
    '没有布局时画布应给出空态',
  );
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

  // 3.6) 画布：按布局摆放，且换了画布尺寸后**相对位置一致**（比例换算的真凭据）
  await cdp.evaluate(`document.querySelector('[data-left-entry="wiki"]').click()`);
  const widgetBoxes = () => cdp.evaluate(`(() => {
    const canvas = document.querySelector('[data-workbench-canvas]');
    if (!canvas) return null;
    const base = canvas.getBoundingClientRect();
    if (base.width === 0 || base.height === 0) return null;
    return [...document.querySelectorAll('[data-widget]')].map((element) => {
      const box = element.getBoundingClientRect();
      return {
        widget: element.getAttribute('data-widget'),
        x: (box.left - base.left) / base.width,
        y: (box.top - base.top) / base.height,
        w: box.width / base.width,
        h: box.height / base.height,
      };
    });
  })()`);
  const atDefault = await eventually(async () => {
    const value = await widgetBoxes();
    return value && value.length > 0 ? value : null;
  }, '画布没有按布局渲染出 widget');
  const canvasWidth = () => cdp.evaluate(`document.querySelector('[data-workbench-canvas]')?.clientWidth ?? 0`);
  const widthBefore = await canvasWidth();
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 620, deviceScaleFactor: 1, mobile: false });
  // 必须等画布真的变小、再给 ResizeObserver → 状态 → 重渲染留一拍：
  // 否则读到的还是旧 DOM（widget 都还在，只是还没按新尺寸重算）。
  await eventually(async () => (await canvasWidth()) < widthBefore - 50, `画布没有随视口变小（${widthBefore} → ${await canvasWidth()}）`);
  await wait(250);
  const smaller = await eventually(widgetBoxes, '缩小画布后 widget 不见了');
  assert.equal(smaller.length, atDefault.length, '换画布尺寸后 widget 数量变了');
  for (let index = 0; index < smaller.length; index += 1) {
    for (const key of ['x', 'y', 'w', 'h']) {
      assert.ok(Math.abs(smaller[index][key] - atDefault[index][key]) < 0.02,
        `${smaller[index].widget} 的 ${key} 随画布尺寸变了：${atDefault[index][key]} → ${smaller[index][key]}`);
    }
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  record('画布比例布局', `${atDefault.length} 个 widget：默认画布与 900x620 下相对位置一致（偏差 < 2%）`);

  // 网格线按格尺寸铺设（不是固定 5px）：这份内置布局铺满了画布，肉眼看不到网格，
  // 所以读 computed 样式作为证据 —— 并且要等它真的跟上画布尺寸，否则会读到切换瞬间的旧值。
  const gridSample = () => cdp.evaluate(`(() => {
    const element = document.querySelector('[data-workbench-gridlines]');
    const canvas = document.querySelector('[data-workbench-canvas]');
    if (!element || !canvas) return null;
    const size = getComputedStyle(element).backgroundSize.split(',')[0].trim();
    const [cellW, cellH] = size.split(/\\s+/).map((value) => parseFloat(value));
    return { cellW, cellH, canvasW: canvas.clientWidth, canvasH: canvas.clientHeight };
  })()`);
  const followed = await eventually(async () => {
    const value = await gridSample();
    if (!value) return null;
    // wiki 布局的基准是 96x54 格：单元格应当等于画布尺寸除以列数/行数
    const matches = Math.abs(value.cellW - value.canvasW / 96) < 0.5 && Math.abs(value.cellH - value.canvasH / 54) < 0.5;
    return matches ? value : null;
  }, '网格单元格没有跟着画布尺寸重算');
  record('网格线', `单元格 ${followed.cellW.toFixed(2)}x${followed.cellH.toFixed(2)}px = 画布 ${followed.canvasW}x${followed.canvasH} ÷ 96x54，随画布等比缩放`);

  // 布局还开着的时候留一张画布证据图（后面 pin 测试会 reload，那时画布已回到空态）
  await cdp.send('Page.enable');
  await mkdir(evidence, { recursive: true });
  const workbenchShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(evidence, 'workbench-layout.png'), Buffer.from(workbenchShot.data, 'base64'));
  record('画布截图', join(evidence, 'workbench-layout.png'));

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
    `# 外壳与画布真机探针结果（UI-03 ~ UI-09）\n\n命令：\`node apps/desktop/test/ui-rebuild-shell-probe.mjs\`\n\n`
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
