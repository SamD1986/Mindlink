import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const SRC = new URL('../src/', import.meta.url);
const LEGACY = '_legacy-ui';

async function sourceFiles(dir = SRC) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === LEGACY) continue;
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) files.push(...(await sourceFiles(url)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(url);
  }
  return files;
}

test('live renderer sources never reach into the archived UI', async () => {
  const files = await sourceFiles();
  assert.ok(files.length > 5, 'expected the live renderer sources to be scanned');
  for (const url of files) {
    const source = await readFile(url, 'utf8');
    assert.ok(!source.includes(LEGACY), `${url.pathname} references ${LEGACY}`);
  }
});

test('the archived UI is excluded from type checking', async () => {
  const tsconfig = await readFile(new URL('../tsconfig.json', import.meta.url), 'utf8');
  assert.match(tsconfig, /"exclude"\s*:\s*\[[^\]]*_legacy-ui/, 'tsconfig does not exclude src/_legacy-ui');
});
