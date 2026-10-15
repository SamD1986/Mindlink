/**
 * 只为解释 runtime-manager.test.mjs:55 在 Windows 上稳定失败的根因：
 * Node 在 Windows 上把 child.kill('SIGTERM') 实现为无条件终止进程，
 * 子进程的 process.on('SIGTERM') 处理器根本没机会跑。
 * 这里用最小复现证明「SIGTERM 处理器没被执行」。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mindlink-sigterm-'));
const out = join(dir, 'events.txt');
writeFileSync(out, '');

const childSource = `const fs = require('node:fs');
process.on('SIGTERM', () => { fs.appendFileSync(${JSON.stringify(out)}, 'term\\n'); process.exit(0); });
setInterval(() => {}, 1000);`;

const child = spawn(process.execPath, ['-e', childSource], { stdio: ['ignore', 'inherit', 'inherit'] });
await sleep(700);
const beforeKill = readFileSync(out, 'utf8');
child.kill('SIGTERM');
await sleep(1200);
const afterKill = readFileSync(out, 'utf8');

console.log(JSON.stringify({
  platform: process.platform,
  sigtermHandlerRan: afterKill.includes('term'),
  eventsBeforeKill: JSON.stringify(beforeKill),
  eventsAfterKill: JSON.stringify(afterKill),
  childExitCode: child.exitCode,
  childSignalCode: child.signalCode,
}, null, 2));
