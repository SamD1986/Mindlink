/**
 * UI-18 整体回归验收探针（真机 Electron + 最小 CDP 客户端）。
 *
 * 复用 apps/desktop/test/ui-rebuild-shell-probe.mjs 的既有做法：
 * 独立 --user-data-dir（否则被单实例锁秒退且零输出）、Node 内置 WebSocket 的最小 CDP 客户端、
 * 自己伺服 apps/app/dist。
 *
 * 跑法（仓库根，前台）：
 *     node .tasks/ui-rebuild/tools/ui-regression-probe.mjs
 *
 * 顺序：先跑不依赖桥夹具的结构/DOM/语言包检查，最后才跑夹具驱动的交互（避免一处注入失败毁掉后面）。
 * 只做验收与取证，不改产品代码。
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const requireFromDesktop = createRequire(resolve(import.meta.dirname, '../../../apps/desktop/package.json'));
const electron = requireFromDesktop('electron');
const root = resolve(import.meta.dirname, '../../..');
const desktopRoot = resolve(root, 'apps/desktop');
const appDist = resolve(root, 'apps/app/dist');
const evidence = resolve(root, '.tasks/ui-rebuild/evidence/regression');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function eventually(check, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try { const v = await check(); if (v) return v; } catch (e) { last = e; }
    await wait(150);
  }
  throw new Error(`${message}${last ? ` (last error: ${last.message})` : ''}`);
}

async function freePort() {
  const s = createSocketServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
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
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((d) => server.close(d)) };
}

class Cdp {
  constructor(socket) {
    this.socket = socket; this.sequence = 0; this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const m = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      const entry = this.pending.get(m.id);
      if (!entry) return;
      this.pending.delete(m.id);
      if (m.error) entry.reject(new Error(`${m.error.message} (${entry.method})`));
      else entry.resolve(m.result);
    });
  }
  static connect(url) {
    return new Promise((res, rej) => {
      const socket = new WebSocket(url);
      socket.addEventListener('open', () => res(new Cdp(socket)));
      socket.addEventListener('error', () => rej(new Error(`CDP connect failed: ${url}`)));
    });
  }
  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const text = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text;
      throw new Error(`evaluate failed: ${text}`);
    }
    return r.result.value;
  }
  close() { this.socket.close(); }
}

const SHELL_READY = `Boolean(document.querySelector('[data-shell-root]')) && Boolean(document.querySelector('[data-bar="left"] button')) && Boolean(document.querySelector('[data-workbench-canvas]'))`;

async function launch(rendererOrigin) {
  const dir = await mkdtemp(join(tmpdir(), 'mindlink-ui18-'));
  const home = join(dir, 'home');
  const userData = join(dir, 'user-data');
  const debugPort = await freePort();
  const child = spawn(electron, [
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${debugPort}`,
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
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (c) => { if (diagnostics.length < 16_384) diagnostics += c.toString(); });
  const target = await eventually(async () => {
    const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const list = await res.json();
    return list.find((i) => i.type === 'page' && !i.url.startsWith('devtools://'));
  }, `Electron renderer never appeared. diagnostics=${diagnostics.slice(-600)}`);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await eventually(async () => cdp.evaluate(SHELL_READY), '外壳没有渲染（data-shell-root / 左栏按钮 / 画布）');
  return { child, cdp, dir, diagnostics: () => diagnostics };
}

const results = [];
function record(id, name, status, detail) {
  results.push({ id, name, status, detail: String(detail).slice(0, 400) });
  const mark = status === 'pass' ? '✔' : status === 'fail' ? '✖' : '⚠';
  console.log(`${mark} [${id}] ${name} — ${String(detail).slice(0, 160)}`);
}
async function step(id, name, fn) {
  try { record(id, name, 'pass', (await fn()) ?? 'ok'); }
  catch (error) { record(id, name, 'fail', error.message); }
}

const GEOMETRY = `(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const de = document.documentElement;
  return { vw: window.innerWidth, vh: window.innerHeight,
    top: box(q('[data-bar="top"]')), bottom: box(q('[data-bar="bottom"]')), left: box(q('[data-bar="left"]')), right: box(q('[data-bar="right"]')),
    work: box(q('[data-workbench-canvas]')),
    scrollW: de.scrollWidth, clientW: de.clientWidth, scrollH: de.scrollHeight, clientH: de.clientHeight, bodyScrollW: document.body.scrollWidth, bodyScrollH: document.body.scrollHeight };
})()`;

function assertGeometry(g, label) {
  const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
  assert.ok(g.top && g.bottom && g.left && g.right && g.work, `${label}: 四栏/画布有缺`);
  assert.ok(near(g.top.l, 0) && near(g.top.t, 0) && near(g.top.r, g.vw), `${label}: 上栏没贴顶/未横跨全宽`);
  assert.ok(near(g.left.l, 0) && near(g.right.r, g.vw), `${label}: 左右栏没贴到窗口两侧`);
  assert.ok(near(g.bottom.b, g.vh) && near(g.bottom.l, 0) && near(g.bottom.r, g.vw), `${label}: 下栏没贴底`);
  assert.ok(near(g.left.t, g.top.b) && near(g.right.t, g.top.b), `${label}: 左右栏没接在上栏下方`);
  assert.ok(near(g.left.b, g.bottom.t) && near(g.right.b, g.bottom.t), `${label}: 左右栏没接在下栏上方`);
  assert.ok(near(g.work.t, g.top.b) && near(g.bottom.t, g.work.b), `${label}: 画布与上下栏有缝/重叠`);
  assert.ok(near(g.work.l, g.left.r) && near(g.work.r, g.right.l), `${label}: 画布与左右栏有缝/重叠`);
  assert.ok(g.work.w > 0 && g.work.h > 0, `${label}: 画布尺寸为 0`);
  assert.ok(g.scrollW <= g.clientW + 1 && g.scrollH <= g.clientH + 1, `${label}: 出现滚动条 (scroll=${g.scrollW}x${g.scrollH} client=${g.clientW}x${g.clientH})`);
  return `vw=${g.vw} vh=${g.vh} 左${Math.round(g.left.w)} 右${Math.round(g.right.w)} 上${Math.round(g.top.h)} 下${Math.round(g.bottom.h)} 画布${Math.round(g.work.w)}x${Math.round(g.work.h)}，无滚动条`;
}

// 持久夹具：只替换 window.mindlink 的引用（contextBridge 对象是冻结的，不能原地改）。
const USE_FIXTURE = `(() => {
  if (!window.__real) window.__real = window.mindlink;
  if (!window.__fx) window.__fx = Object.create(window.__real);
  try { Object.defineProperty(window, 'mindlink', { value: window.__fx, configurable: true, writable: true, enumerable: true }); return 'ok'; }
  catch (e) { return 'fail:' + e.message; }
})()`;

const renderer = await serveRenderer();
const session = await launch(renderer.origin);
const { cdp, child } = session;

try {
  await cdp.send('Page.enable');
  await mkdir(evidence, { recursive: true });
  const shot = async (name) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(evidence, name), Buffer.from(r.data, 'base64'));
    return name;
  };
  const openChatbox = async () => {
    await cdp.evaluate(`document.querySelector('[data-left-entry="home"]').click()`);
    await cdp.evaluate(`document.querySelector('[data-right-action="conversations"]').click()`);
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('.conversation'))`), 'chatbox/会话区没打开');
  };

  // ── A. 窗口尺寸稳定性 ──
  await step('A1', '四栏外壳与画布在 1280x800 下不破版', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await wait(450);
    const detail = assertGeometry(await cdp.evaluate(GEOMETRY), '1280x800');
    await shot('shell-1280x800.png');
    return detail;
  });
  await step('A2', '四栏外壳与画布在 1920x1080 下不破版', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await wait(450);
    const detail = assertGeometry(await cdp.evaluate(GEOMETRY), '1920x1080');
    await shot('shell-1920x1080.png');
    return detail;
  });
  await step('A3', '尺寸往复回 1280x800 仍稳定', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await wait(450);
    return assertGeometry(await cdp.evaluate(GEOMETRY), '1280x800#2');
  });

  // ── B. 空态与常驻件 ──
  await step('B1', '空画布显示品牌字标（空态欢迎区）+ 背景层/纹理', async () => {
    const s = await cdp.evaluate(`(() => ({ bg: Boolean(document.querySelector('.workbench-backdrop')), texture: Boolean(document.querySelector('.workbench-backdrop-texture')), brand: Boolean(document.querySelector('[data-workbench-state="empty"]')), text: document.querySelector('.workbench-brand-zh')?.textContent ?? '' }))()`);
    assert.ok(s.bg && s.texture, '背景层/纹理缺失');
    assert.ok(s.brand, '空态品牌字标缺失');
    return `背景层+宣纸纹理+空态品牌字标均在（text="${s.text.slice(0, 8)}"）`;
  });
  await step('B2', '右栏常驻印章图片真的加载', async () => {
    const logo = await cdp.evaluate(`(() => { const i = document.querySelector('[data-brand-logo] img'); return i ? { src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 } : null; })()`);
    assert.ok(logo?.loaded, `右栏印章没加载：${JSON.stringify(logo)}`);
    return `印章 ${logo.src} naturalWidth>0`;
  });
  await step('B3', '下栏不吞事件（栏 pointer-events:none + 槽位 auto）', async () => {
    const info = await cdp.evaluate(`(() => { const b = document.querySelector('[data-bar="bottom"]'); const s = document.querySelector('[data-bottom-slot]'); return b && s ? { bar: getComputedStyle(b).pointerEvents, slot: getComputedStyle(s).pointerEvents } : null; })()`);
    assert.ok(info, '下栏/槽位缺失');
    assert.equal(info.bar, 'none', `栏 pointer-events=${info.bar}`);
    assert.equal(info.slot, 'auto', `槽位 pointer-events=${info.slot}`);
    return `栏=${info.bar} 槽位=${info.slot}`;
  });

  // ── C. 左栏入口与布局加载/切换 ──
  await step('C1', '左栏四个固定入口齐（home/wiki/skills/settings）', async () => {
    const entries = await cdp.evaluate(`[...document.querySelectorAll('[data-left-entry]')].map((e) => e.getAttribute('data-left-entry'))`);
    assert.deepEqual(entries, ['home', 'wiki', 'skills', 'settings'], `固定入口=${JSON.stringify(entries)}`);
    assert.ok(await cdp.evaluate(`Boolean(document.querySelector('[data-left-action="widget-studio"]'))`), '缺「创作台」入口');
    return `入口=${entries.join('/')}；另有创作台入口`;
  });
  await step('C2', '点 wiki 布局渲染 widget；点 home 回空态', async () => {
    await cdp.evaluate(`document.querySelector('[data-left-entry="wiki"]').click()`);
    const widgets = await eventually(async () => {
      const l = await cdp.evaluate(`[...document.querySelectorAll('[data-widget]')].map((e) => e.getAttribute('data-widget'))`);
      return l.length ? l : null;
    }, '点 wiki 后没有 widget');
    await cdp.evaluate(`document.querySelector('[data-left-entry="home"]').click()`);
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('[data-workbench-state="empty"]'))`), '点 home 没回空态');
    return `wiki 渲染 ${widgets.length} 个 widget:[${widgets.join(', ')}]；home 回空态`;
  });
  await step('C3', '布局切换 wiki→skills→settings 都渲染出 widget', async () => {
    const seen = [];
    for (const id of ['wiki', 'skills', 'settings']) {
      await cdp.evaluate(`document.querySelector('[data-left-entry="${id}"]').click()`);
      const list = await eventually(async () => {
        const l = await cdp.evaluate(`[...document.querySelectorAll('[data-widget]')].map((e) => e.getAttribute('data-widget'))`);
        return l.length ? l : null;
      }, `点 ${id} 没渲染 widget`);
      seen.push(`${id}:${list.length}`);
    }
    return seen.join(' / ');
  });

  // ── D. 技能/设置/定时页真实可达性 ──
  await step('D1', '左栏「技能」入口打开的是真技能页（技能列表/管理）', async () => {
    await cdp.evaluate(`document.querySelector('[data-left-entry="skills"]').click()`);
    await wait(450);
    const p = await cdp.evaluate(`(() => ({ widgets: [...document.querySelectorAll('[data-widget]')].map((e) => e.getAttribute('data-widget')), text: (document.querySelector('[data-workbench-canvas]')?.innerText ?? '').slice(0, 300) }))()`);
    assert.ok(/技能|Skill/.test(p.text), `左栏 skills 打开的是占位布局而非技能页：widgets=${JSON.stringify(p.widgets)} 文本="${p.text.slice(0, 80)}"`);
    return `技能页可达`;
  });
  await step('D2', '左栏「设置」入口打开的是真设置页（字体/主题/快捷键）', async () => {
    await cdp.evaluate(`document.querySelector('[data-left-entry="settings"]').click()`);
    await wait(450);
    const p = await cdp.evaluate(`(() => ({ widgets: [...document.querySelectorAll('[data-widget]')].map((e) => e.getAttribute('data-widget')), text: (document.querySelector('[data-workbench-canvas]')?.innerText ?? '').slice(0, 300) }))()`);
    assert.ok(/字体|主题|快捷键|模型|设置/.test(p.text), `左栏 settings 打开的是占位布局而非设置页：widgets=${JSON.stringify(p.widgets)} 文本="${p.text.slice(0, 80)}"`);
    return `设置页可达`;
  });
  await step('D3', '定时任务页在界面上可达', async () => {
    const p = await cdp.evaluate(`(() => { const texts = [...document.querySelectorAll('button,a,[data-left-entry],[data-left-action],[data-left-pin]')].map((e) => (e.textContent || e.getAttribute('aria-label') || '')); return { entry: texts.some((s) => /定时/.test(s)), page: Boolean(document.querySelector('[data-schedule], .schedule-management, [class*="schedule"]')) }; })()`);
    assert.ok(p.entry || p.page, '界面找不到任何定时任务入口/页面');
    return `入口=${p.entry} 页面=${p.page}`;
  });
  await step('D4', '企微连接 / Tailscale 设置项在活代码里可达', async () => {
    const files = ['apps/app/src/legacy-pages/management.tsx', 'apps/app/src/legacy-pages/modules/tailscale-settings.tsx'];
    const blobs = await Promise.all(files.map((f) => readFile(resolve(root, f), 'utf8')));
    assert.ok(/listWecomConnections|saveWecomConnection/.test(blobs[0]), '企微连接设置实现缺失');
    assert.ok(/Tailscale|tailscale/.test(blobs[1]), 'Tailscale 设置实现缺失');
    const mounted = await cdp.evaluate(`(() => { const t = document.body.innerText; return /企业微信|Tailscale/.test(t); })()`);
    return `企微/Tailscale 实现文件在；界面上当前${mounted ? '出现' : '未出现'}相关文本（页面未挂载，见 D1-D3 同类问题）`;
  });

  // ── E. chatbox 浮层与工作面结构 ──
  await step('E1', 'chatbox 能开能关，浮层在画布之上（z-index≥1000）', async () => {
    await cdp.evaluate(`document.querySelector('[data-left-entry="home"]').click()`);
    await cdp.evaluate(`document.querySelector('[data-right-action="conversations"]').click()`);
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('.chatbox-overlay'))`), 'chatbox 没打开');
    const z = await cdp.evaluate(`getComputedStyle(document.querySelector('.chatbox-overlay')).zIndex`);
    assert.ok(Number(z) >= 1000, `浮层层级不足 z-index=${z}`);
    await cdp.evaluate(`document.querySelector('[data-right-action="conversations"]').click()`);
    await eventually(async () => !(await cdp.evaluate(`Boolean(document.querySelector('.chatbox-overlay'))`)), 'chatbox 没关闭');
    return `开(z-index=${z})→关→移除`;
  });
  await step('E2', '工作面关键件在：消息列表/输入区/附件区/空态欢迎/发送键', async () => {
    await openChatbox();
    const parts = await cdp.evaluate(`(() => ({ conversation: Boolean(document.querySelector('.conversation')), inner: Boolean(document.querySelector('.conversation-inner')), composer: Boolean(document.querySelector('.composer')), textarea: Boolean(document.querySelector('textarea[aria-label="消息"]')), send: Boolean(document.querySelector('[aria-label="发送消息"]')), attach: Boolean(document.querySelector('[aria-label="添加附件"]')), attachInput: Boolean(document.querySelector('.composer-attachment-input')), welcome: Boolean(document.querySelector('.mindlink-welcome')) || Boolean(document.querySelector('.empty-chat')) }))()`);
    const missing = Object.entries(parts).filter(([, v]) => !v).map(([k]) => k);
    assert.deepEqual(missing, [], `工作面缺件：${missing.join(',')}`);
    return `消息列表/输入区/附件区/发送键/空态欢迎全在`;
  });
  await step('E3', '滚动区存在且可滚动（.conversation overflow 可滚）', async () => {
    const s = await cdp.evaluate(`(() => { const c = document.querySelector('.conversation'); const cs = getComputedStyle(c); return { overflowY: cs.overflowY, ariaLive: c.getAttribute('aria-live'), client: c.clientHeight }; })()`);
    assert.ok(['auto', 'scroll'].includes(s.overflowY), `会话区 overflowY=${s.overflowY}`);
    assert.equal(s.ariaLive, 'polite', `aria-live=${s.ariaLive}`);
    return `overflowY=${s.overflowY} aria-live=${s.ariaLive} clientHeight=${s.client}（消息列表可滚动、滚动锚定逻辑所在）`;
  });

  // ── G. 用户自建 widget（创作台）──
  await step('G1', '创作台能开（左栏 → 我的 Widget），画布 mode=widget-studio', async () => {
    await cdp.evaluate(`document.querySelector('[data-right-action="conversations"]')?.click()`);
    await cdp.evaluate(`document.querySelector('[data-left-action="widget-studio"]').click()`);
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('[data-widget-studio]'))`), '创作台没打开', 10_000);
    const mode = await cdp.evaluate(`document.querySelector('[data-workbench-canvas]').getAttribute('data-workbench-mode')`);
    assert.equal(mode, 'widget-studio', `画布 mode=${mode}`);
    return `创作台打开，mode=widget-studio`;
  });
  await step('G2', '校验拒非法 DSL（未知原子整份拒掉 + 列出错误）', async () => {
    await cdp.evaluate(`(() => { const ta = document.querySelector('[data-widget-studio-dsl]'); const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; s.call(ta, JSON.stringify({ widgetId: 'bad', version: '1.0.0', root: { type: 'EvilAtom', props: {} } })); ta.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-widget-studio-action="validate"]').click(); })()`);
    const errors = await eventually(async () => {
      const l = await cdp.evaluate(`[...document.querySelectorAll('[data-widget-studio-errors] li')].map((e) => e.textContent)`);
      return l.length ? l : null;
    }, '非法 DSL 没被拒', 8_000);
    return `拒收并列出 ${errors.length} 条错误：${JSON.stringify(errors[0])}`;
  });
  await step('G3', '合法 DSL → 预览；命名保存 → 进库；固定到左栏 → pin 出现', async () => {
    await cdp.evaluate(`(() => { const dsl = JSON.stringify({ widgetId: 'regression-widget', version: '1.0.0', root: { type: 'Panel', props: { variant: 'card' }, children: [ { type: 'Text', props: { content: 'UI-18 regression widget' } }, { type: 'Divider' }, { type: 'Text', props: { content: 'preview me' } } ] } }); const ta = document.querySelector('[data-widget-studio-dsl]'); const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; s.call(ta, dsl); ta.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-widget-studio-action="validate"]').click(); })()`);
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('[data-widget-studio-preview]'))`), '合法 DSL 没渲染预览', 8_000);
    await cdp.evaluate(`(() => { const n = document.querySelector('[data-widget-studio-name]'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(n, '回归自建件'); n.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-widget-studio-action="save"]').click(); })()`);
    const item = await eventually(async () => cdp.evaluate(`document.querySelector('[data-widget-item]')?.getAttribute('data-widget-item') ?? null`), '保存后库列表没该项', 8_000);
    await cdp.evaluate(`document.querySelector('[data-widget-item] [data-widget-action="pin"]').click()`);
    const pinned = await eventually(async () => cdp.evaluate(`document.querySelectorAll('[data-left-pin-kind="user-widget"]').length`), 'pin 后左栏没出现', 8_000);
    const stored = await cdp.evaluate(`Object.keys(localStorage).filter((k) => /widget/i.test(k))`);
    return `预览在；保存进库(id=${item})；pin 到左栏 ${pinned} 项；localStorage 键=${JSON.stringify(stored)}`;
  });
  await step('G4', '自建 widget 可打开（画布 mode=user-widget，渲染用户 DSL 文本）', async () => {
    await cdp.evaluate(`document.querySelector('[data-widget-item] [data-widget-action="open"]').click()`);
    const mode = await eventually(async () => cdp.evaluate(`document.querySelector('[data-workbench-canvas]').getAttribute('data-workbench-mode')`), '画布没切到 user-widget', 8_000);
    assert.equal(mode, 'user-widget', `画布 mode=${mode}`);
    const text = await cdp.evaluate(`document.querySelector('[data-workbench-canvas]').innerText`);
    assert.ok(/UI-18 regression widget/.test(text), `用户 DSL 没渲染：${text.slice(0, 120)}`);
    return `mode=user-widget，用户 DSL 文本已渲染`;
  });
  await step('G5', '导入/导出区在（创作台 IO 段）', async () => {
    await cdp.evaluate(`document.querySelector('[data-left-action="widget-studio"]').click()`);
    await wait(350);
    const io = await cdp.evaluate(`(() => ({ file: Boolean(document.querySelector('[data-widget-studio-file]')), importArea: Boolean(document.querySelector('[data-widget-studio-import]')), importBtn: Boolean(document.querySelector('[data-widget-studio-action="import"]')), exportBtn: Boolean(document.querySelector('[data-widget-item] [data-widget-action="export"]')) }))()`);
    const missing = Object.entries(io).filter(([, v]) => !v).map(([k]) => k);
    assert.deepEqual(missing, [], `导入/导出缺件：${missing.join(',')}`);
    return `导入文件/粘贴区/导入钮/导出钮全在`;
  });
  await shot('widget-studio.png');

  // ── H. 语言包（手术专查）──
  const zh = JSON.parse(await readFile(resolve(root, 'apps/app/src/languages/zh-CN.json'), 'utf8'));
  await step('H1', '语言包是恒等映射（value===key，t() 取值即原字）', async () => {
    const bad = Object.entries(zh).filter(([k, v]) => k !== v);
    assert.deepEqual(bad.slice(0, 3), [], `存在 value≠key：${JSON.stringify(bad.slice(0, 3))}`);
    return `${Object.keys(zh).length} 条全部 value===key`;
  });
  await step('H2', '界面真实渲染的中文与 zh-CN.json 的键逐字相等（无变字/丢字）', async () => {
    // 同一步内保证 DOM 就位：开 chatbox + 创作台后再抽样
    await openChatbox();
    const chatSamples = await cdp.evaluate(`(() => ({ composer: document.querySelector('textarea[aria-label="消息"]')?.getAttribute('aria-label') ?? null, send: document.querySelector('[aria-label="发送消息"]')?.getAttribute('aria-label') ?? null, stop: document.querySelector('[aria-label="停止任务"]')?.getAttribute('aria-label') ?? null, attach: document.querySelector('[aria-label="添加附件"]')?.getAttribute('aria-label') ?? null, workList: document.querySelector('[aria-label="工作列表"]')?.getAttribute('aria-label') ?? null, copy: document.querySelector('[aria-label="复制这条消息"]')?.getAttribute('aria-label') ?? null }))()`);
    await cdp.evaluate(`document.querySelector('[data-right-action="conversations"]').click()`);
    await cdp.evaluate(`document.querySelector('[data-left-action="widget-studio"]').click()`);
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('[data-widget-studio]'))`), '创作台没打开');
    const studioSamples = await cdp.evaluate(`(() => ({ title: document.querySelector('.widget-studio-title')?.textContent ?? null, validate: document.querySelector('[data-widget-studio-action="validate"]')?.textContent ?? null, save: document.querySelector('[data-widget-studio-action="save"]')?.textContent ?? null, hint: document.querySelector('.widget-studio-hint')?.textContent ?? null }))()`);
    const samples = { ...chatSamples, ...studioSamples };
    const missing = [];
    for (const [k, v] of Object.entries(samples)) {
      if (v === null) { missing.push(`${k}(DOM 缺失)`); continue; }
      if (!Object.prototype.hasOwnProperty.call(zh, v)) missing.push(`${k}="${v}" 不在语言包键里`);
    }
    assert.deepEqual(missing, [], `界面串与语言包不一致：${missing.join('；')}`);
    return `抽样 ${Object.keys(samples).length} 个真实渲染串全部命中语言包键：${JSON.stringify(Object.values(samples))}`;
  });
  await step('H3', '语言包无孤儿键（抽样键在活代码里都有 t() 调用点）', async () => {
    const sampleKeys = ['发送消息', '停止任务', '消息', '添加附件', '我的 Widget', '校验并预览', '工作列表', '复制这条消息'];
    const files = ['apps/app/src/chatbox/chat.tsx', 'apps/app/src/left-bar/index.tsx', 'apps/app/src/components/widgets/user-widgets/studio.tsx'].map((p) => resolve(root, p));
    const blob = (await Promise.all(files.map((f) => readFile(f, 'utf8')))).join('\n');
    const notFound = sampleKeys.filter((k) => !blob.includes(`t("${k}")`) && !blob.includes(`t('${k}')`));
    assert.deepEqual(notFound, [], `语言包抽样键在活代码里找不到：${notFound.join('，')}`);
    return `抽样 ${sampleKeys.length} 个键都有 t() 引用点`;
  });

  // ── I. UI-19 助理下线专查 ──
  await step('I1', '界面找不到助理入口/面板/专业任务授权卡片', async () => {
    const dom = await cdp.evaluate(`(() => { const t = document.body.innerText; const p = ['专业任务授权', '保存到记忆', '保存到知识库', '绑定助理会话', '助理会话']; return p.filter((x) => t.includes(x)); })()`);
    assert.deepEqual(dom, [], `界面仍出现助理面文案：${dom.join('，')}`);
    return `界面无「专业任务授权/保存到记忆/保存到知识库/绑定助理会话/助理会话」`;
  });
  await step('I2', '助理组件/模块已从活代码移除', async () => {
    const { stat } = await import('node:fs/promises');
    const gone = [];
    for (const p of ['apps/app/src/legacy-pages/modules/assistant-home.tsx', 'apps/app/src/components/composites/assistant-companion.tsx', 'apps/app/src/components/composites/assistant-activity.ts', 'apps/app/src/components/composites/delegation-approval-details.tsx', 'apps/app/src/components/composites/saved-content.ts', 'apps/app/src/assets/assistant']) {
      if (await stat(resolve(root, p)).then(() => true, () => false)) gone.push(p);
    }
    assert.deepEqual(gone, [], `应删除的件仍在：${gone.join('，')}`);
    return `6 个助理件均已不存在`;
  });

  // ── K. 夹具驱动的交互（放最后）──
  const useFixture = async () => {
    const mode = await cdp.evaluate(USE_FIXTURE);
    assert.equal(mode, 'ok', `桥夹具安装失败：${mode}（contextBridge 对象冻结且不可替换）`);
    return mode;
  };

  await step('K1', '夹具：发送消息 → 提交被调用一次且消息进列表', async () => {
    await useFixture();
    await cdp.evaluate(`(() => { const fx = window.__fx; window.__p = { submits: [], cancels: [], decisions: [], status: 'succeeded' }; const conv = { id: 'work:probe', createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z', workingDirectory: 'C:/probe', current: true, archived: false, archivedAt: null, title: '回归测试会话', iconId: 'work', folderId: null, sortOrder: 0, tagIds: [] }; const run = () => ({ runId: 'run-probe', status: window.__p.status, owner: { entryPoint: 'desktop', identity: { kind: 'local_user', subjectId: 'l', authorityId: 'a', authenticatedBy: 'electron' } }, context: { workspaceId: 'C:/probe', conversation: { namespace: 'desktop', conversationId: 'work:probe' }, delivery: { kind: 'desktop' } }, requestFingerprint: 'p', inputDigest: 'p', externalEffectState: 'none', createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:01.000Z', output: { message: '夹具完成', tools: [] } }); Object.assign(fx, { listWorkConversations: async () => [conv], listWorkFolders: async () => [], listWorkTags: async () => [], getModelSettings: async () => ({ providers: [] }), getHotkeySettings: async () => ({}), getWorkTrajectory: async () => ({ history: [] }), listCapabilityApprovals: async () => [], getPrivateImRunSummary: async () => undefined, getDesktopTranscript: async () => [], submitDesktopMessage: async (text) => { window.__p.submits.push(text); return { runId: 'run-probe', status: 'queued' }; }, getAgentRun: async () => run(), cancelAgentRun: async () => { window.__p.cancels.push(1); window.__p.status = 'cancelled'; return { result: 'cancelled' }; }, decideCapabilityApproval: async () => { window.__p.decisions.push(1); return { status: 'completed' }; } }); return true; })()`);
    await openChatbox();
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('textarea[aria-label="消息"]')) && !document.querySelector('textarea[aria-label="发送消息"]').disabled || document.querySelector('textarea[aria-label="消息"]').value !== undefined`), '输入区没就绪');
    await cdp.evaluate(`(() => { const ta = document.querySelector('textarea[aria-label="消息"]'); const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; s.call(ta, '回归发送测试'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await eventually(async () => cdp.evaluate(`!document.querySelector('[aria-label="发送消息"]').disabled`), '输入后发送键仍禁用（会话没选中）', 12_000);
    await cdp.evaluate(`document.querySelector('[aria-label="发送消息"]').click()`);
    const n = await eventually(async () => { const v = await cdp.evaluate('window.__p.submits.length'); return v > 0 ? v : null; }, 'submitDesktopMessage 没被调用');
    assert.equal(n, 1, `提交被调用 ${n} 次`);
    return `submitDesktopMessage 调用 1 次，文本=${JSON.stringify(await cdp.evaluate('window.__p.submits[0]'))}`;
  });

  await step('K2', '夹具：能力审批卡片出现 → 点「允许这次操作」→ 决定回传 approved', async () => {
    await useFixture();
    await cdp.evaluate(`(() => { const fx = window.__fx; window.__p.status = 'waiting_approval'; fx.listCapabilityApprovals = async () => [{ requestId: 'approval-probe', runId: 'run-probe', capabilityId: 'controlled-echo', sourceInstanceId: 'probe', argumentsDigest: '000000000000000000' }]; fx.getAgentRun = async () => ({ runId: 'run-probe', status: 'waiting_approval', owner: { entryPoint: 'desktop', identity: { kind: 'local_user', subjectId: 'l', authorityId: 'a', authenticatedBy: 'electron' } }, context: { workspaceId: 'C:/probe', conversation: { namespace: 'desktop', conversationId: 'work:probe' }, delivery: { kind: 'desktop' } }, pendingApproval: { approvalRequestId: 'approval-probe' }, requestFingerprint: 'p', inputDigest: 'p', externalEffectState: 'none', createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:01.000Z', output: { message: '', tools: [] } }); fx.decideCapabilityApproval = async (_id, decision) => { window.__p.decisions.push(decision); return { status: 'completed', message: 'ok' }; }; return true; })()`);
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('.approval-actions'))`), '能力审批卡片没出现', 15_000);
    await eventually(async () => cdp.evaluate(`(() => { const b = [...document.querySelectorAll('.approval-actions button')].find((x) => x.textContent.includes('允许这次操作')); return b && !b.disabled ? true : null; })()`), '「允许这次操作」一直没就绪', 15_000);
    await cdp.evaluate(`[...document.querySelectorAll('.approval-actions button')].find((x) => x.textContent.includes('允许这次操作')).click()`);
    const d = await eventually(async () => cdp.evaluate('window.__p.decisions[0] ?? null'), 'decideCapabilityApproval 没被调用', 10_000);
    assert.equal(d, 'approved', `决定=${d}`);
    return `审批卡片在；允许这次操作 → decideCapabilityApproval(approved)`;
  });

  await step('K3', '夹具：运行中停止键 → cancelAgentRun 被调用', async () => {
    await useFixture();
    await cdp.evaluate(`(() => { const fx = window.__fx; window.__p.status = 'running'; fx.listCapabilityApprovals = async () => []; fx.submitDesktopMessage = async () => ({ runId: 'run-probe', status: 'running' }); fx.getAgentRun = async () => ({ runId: 'run-probe', status: window.__p.status, owner: { entryPoint: 'desktop', identity: { kind: 'local_user', subjectId: 'l', authorityId: 'a', authenticatedBy: 'electron' } }, context: { workspaceId: 'C:/probe', conversation: { namespace: 'desktop', conversationId: 'work:probe' }, delivery: { kind: 'desktop' } }, requestFingerprint: 'p', inputDigest: 'p', externalEffectState: 'none', createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:05.000Z', output: { message: '', tools: [] } }); fx.cancelAgentRun = async () => { window.__p.cancels.push(1); window.__p.status = 'cancelled'; return { result: 'cancelled' }; }; window.confirm = () => true; return true; })()`);
    await cdp.evaluate(`(() => { const ta = document.querySelector('textarea[aria-label="消息"]'); const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; s.call(ta, '取消测试'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await cdp.evaluate(`document.querySelector('[aria-label="发送消息"]').click()`);
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('[aria-label="停止任务"]'))`), '运行中没出现停止键', 12_000);
    await cdp.evaluate(`document.querySelector('[aria-label="停止任务"]').click()`);
    const n = await eventually(async () => { const v = await cdp.evaluate('window.__p.cancels.length'); return v > 0 ? v : null; }, 'cancelAgentRun 没被调用', 12_000);
    return `停止键 → cancelAgentRun 调用 ${n} 次`;
  });

  await step('K4', '夹具：轮询故障 → 运行恢复卡出现 → 点「重新获取状态」恢复', async () => {
    await useFixture();
    await cdp.evaluate(`(() => { const fx = window.__fx; let fail = true; window.__p.status = 'running'; fx.listCapabilityApprovals = async () => []; fx.submitDesktopMessage = async () => ({ runId: 'run-probe', status: 'running' }); fx.getAgentRun = async () => { if (fail) throw new Error('轮询故障'); return { runId: 'run-probe', status: 'succeeded', owner: { entryPoint: 'desktop', identity: { kind: 'local_user', subjectId: 'l', authorityId: 'a', authenticatedBy: 'electron' } }, context: { workspaceId: 'C:/probe', conversation: { namespace: 'desktop', conversationId: 'work:probe' }, delivery: { kind: 'desktop' } }, requestFingerprint: 'p', inputDigest: 'p', externalEffectState: 'none', createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:06.000Z', output: { message: '夹具完成', tools: [] } }; }; window.__p.recover = () => { fail = false; }; return true; })()`);
    await cdp.evaluate(`(() => { const ta = document.querySelector('textarea[aria-label="消息"]'); const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; s.call(ta, '恢复测试'); ta.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await cdp.evaluate(`document.querySelector('[aria-label="发送消息"]').click()`);
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('.run-recovery'))`), '轮询失败没出现运行恢复卡', 20_000);
    await cdp.evaluate('window.__p.recover()');
    await cdp.evaluate(`[...document.querySelectorAll('.run-recovery button')].find((b) => b.textContent.includes('重新获取状态')).click()`);
    await eventually(async () => !(await cdp.evaluate(`Boolean(document.querySelector('.run-recovery'))`)), '点重新获取状态后恢复卡没消失', 20_000);
    return `轮询故障→.run-recovery 出现→重新获取状态→恢复`;
  });

  await step('K5', '夹具：加载更早消息按钮出现且点击后消息数增加', async () => {
    await useFixture();
    await cdp.evaluate(`(() => { const fx = window.__fx; const make = (i) => ({ id: 'm' + i, role: i % 2 ? 'assistant' : 'user', text: 'message ' + i, at: '2026-10-15T00:00:00.000Z' }); fx.getDesktopTranscript = async (_s, _id, beforeId) => beforeId ? Array.from({ length: 31 }, (_, i) => make(i - 31)) : Array.from({ length: 35 }, (_, i) => make(i)); fx.listCapabilityApprovals = async () => []; fx.getAgentRun = async () => ({ runId: 'run-probe', status: 'succeeded', owner: { entryPoint: 'desktop', identity: { kind: 'local_user', subjectId: 'l', authorityId: 'a', authenticatedBy: 'electron' } }, context: { workspaceId: 'C:/probe', conversation: { namespace: 'desktop', conversationId: 'work:probe' }, delivery: { kind: 'desktop' } }, requestFingerprint: 'p', inputDigest: 'p', externalEffectState: 'none', createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:01.000Z', output: { message: '', tools: [] } }); return true; })()`);
    // transcript 查询 refetchInterval=3s：等它自己刷新出 35 条
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('.chat-load-older'))`), '「加载更早消息」没出现（transcript 没刷新到 ≥31 条）', 20_000);
    const before = await cdp.evaluate(`document.querySelectorAll('[data-message-entry-id]').length`);
    await cdp.evaluate(`document.querySelector('.conversation').scrollTop = 0`);
    await cdp.evaluate(`document.querySelector('.chat-load-older').click()`);
    const after = await eventually(async () => { const v = await cdp.evaluate(`document.querySelectorAll('[data-message-entry-id]').length`); return v > before ? v : null; }, '点加载更早后消息数没增加', 20_000);
    return `加载更早：消息数 ${before} → ${after}（prepend 生效）`;
  });

  await step('K6', '夹具：工作会话树/归档面板可开', async () => {
    const found = await cdp.evaluate(`(() => { const b = document.querySelector('.chat-list-toggle'); if (!b) return false; b.click(); return true; })()`);
    assert.ok(found, '找不到工作列表开合按钮');
    await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('.conversation-list-preview'))`), '工作会话树面板没出现', 10_000);
    return `工作会话树/归档面板可开（.conversation-list-preview 出现）`;
  });

  await step('K7', '夹具：消息复制按钮与运行详情容器在（消息渲染）', async () => {
    const probe = await cdp.evaluate(`(() => ({ messages: document.querySelectorAll('[data-message-entry-id]').length, copy: Boolean(document.querySelector('[aria-label="复制这条消息"]')), runDetails: Boolean(document.querySelector('.reply-run-details')) || Boolean(document.querySelector('.conversation-stop-run')) }))()`);
    assert.ok(probe.messages > 0, '消息区没有渲染任何消息');
    assert.ok(probe.copy, '消息上没有复制按钮');
    return `消息 ${probe.messages} 条；复制按钮在；运行详情容器=${probe.runDetails}`;
  });

  // ── 最终截图 ──
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(450);
  await cdp.evaluate(`document.querySelector('[data-right-action="conversations"]')?.click()`);
  await cdp.evaluate(`document.querySelector('[data-left-entry="home"]').click()`);
  await wait(300);
  await shot('final-empty-canvas.png');
  await cdp.evaluate(`document.querySelector('[data-left-entry="wiki"]').click()`);
  await wait(450);
  await shot('final-wiki-layout.png');

  await writeFile(join(evidence, 'probe-results.json'), JSON.stringify({ head: execSync('git rev-parse HEAD', { cwd: root }).toString().trim(), results }, null, 2));
} catch (error) {
  record('PROBE', '探针整体', 'fail', `${error.message}`);
} finally {
  for (const r of results) if (r.status === 'fail') console.log(`FAIL ${r.id}: ${r.detail}`);
  cdp.close();
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await renderer.close();
  await rm(session.dir, { recursive: true, force: true }).catch(() => {});
}
const pass = results.filter((r) => r.status === 'pass').length;
const fail = results.filter((r) => r.status === 'fail').length;
console.log(`\nUI-18 探针：pass=${pass} fail=${fail} total=${results.length}`);
process.exit(fail ? 1 : 0);
