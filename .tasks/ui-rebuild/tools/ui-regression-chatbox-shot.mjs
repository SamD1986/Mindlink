/**
 * UI-18 补充取证：单独截一张「chatbox 打开」的图，用于证明工作面在新壳里的实际渲染。
 * 复用主探针的启动方式（独立 user-data-dir + 最小 CDP 客户端 + 自伺服 dist）。
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const requireFromDesktop = createRequire(resolve(import.meta.dirname, '../../../apps/desktop/package.json'));
const electron = requireFromDesktop('electron');
const root = resolve(import.meta.dirname, '../../..');
const appDist = resolve(root, 'apps/app/dist');
const evidence = resolve(root, '.tasks/ui-rebuild/evidence/regression');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function eventually(check, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { try { const v = await check(); if (v) return v; } catch {} await wait(150); }
  throw new Error(message);
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
    const rel = (request.url ?? '/').split('?')[0];
    const file = rel === '/' ? 'index.html' : rel.replace(/^\//, '');
    try { const body = await readFile(join(appDist, file)); response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }); response.end(body); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((d) => server.close(d)) };
}
class Cdp {
  constructor(socket) {
    this.socket = socket; this.sequence = 0; this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const m = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      const e = this.pending.get(m.id); if (!e) return; this.pending.delete(m.id);
      if (m.error) e.reject(new Error(m.error.message)); else e.resolve(m.result);
    });
  }
  static connect(url) { return new Promise((res, rej) => { const s = new WebSocket(url); s.addEventListener('open', () => res(new Cdp(s))); s.addEventListener('error', () => rej(new Error('cdp fail'))); }); }
  send(method, params = {}) { const id = ++this.sequence; return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; }
  close() { this.socket.close(); }
}

const renderer = await serveRenderer();
const dir = await mkdtemp(join(tmpdir(), 'mindlink-ui18-shot-'));
const debugPort = await freePort();
const child = spawn(electron, [`--user-data-dir=${join(dir, 'ud')}`, `--remote-debugging-port=${debugPort}`, resolve(root, 'apps/desktop')], {
  env: { ...process.env, MINDLINK_HOME: join(dir, 'home'), MINDLINK_RENDERER_URL: `${renderer.origin}/`, MINDLINK_NODE_BINARY: process.execPath, MINDLINK_NOTIFICATIONS_ENABLED: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
try {
  const target = await eventually(async () => {
    const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return (await res.json()).find((i) => i.type === 'page' && !i.url.startsWith('devtools://'));
  }, 'no renderer target');
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('[data-bar="left"] button')) && Boolean(document.querySelector('[data-workbench-canvas]'))`), 'shell not ready');
  await mkdir(evidence, { recursive: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await wait(400);
  await cdp.evaluate(`document.querySelector('[data-right-action="conversations"]').click()`);
  await eventually(async () => cdp.evaluate(`Boolean(document.querySelector('.conversation'))`), 'chatbox did not open');
  await wait(600);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(evidence, 'chatbox-open-1280x800.png'), Buffer.from(shot.data, 'base64'));
  const cs = await cdp.evaluate(`(() => { const c = document.querySelector('.conversation'); const cs = getComputedStyle(c); const m = document.querySelector('.message'); return { conversationOverflowY: cs.overflowY, conversationHeight: c.clientHeight, composerBg: getComputedStyle(document.querySelector('.composer')).backgroundColor, messageFont: m ? getComputedStyle(m).fontSize : null, stylesheetCount: document.styleSheets.length }; })()`);
  console.log('CHATBOX_STYLE_PROBE=' + JSON.stringify(cs));
  console.log('SHOT=' + join(evidence, 'chatbox-open-1280x800.png'));
  cdp.close();
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await renderer.close();
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
