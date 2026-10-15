import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'tsx/esm/api';

register();
const {
  INITIAL_WORKSPACE, closeLayout, neighborAfterClose, openLayout, setChatboxOpen, toggleChatbox,
} = await import('../src/shell/workspace-model.ts');
const {
  FIXED_ENTRIES, PIN_STORAGE_KEY, createLocalPinStore, movePin, pinLayout, unpinLayout,
} = await import('../src/left-bar/entries.ts');

const tab = (id) => ({ id, label: id.toUpperCase(), labelKey: `nav.layout.${id}` });

test('opening a layout dedupes and activates it', () => {
  const opened = openLayout(INITIAL_WORKSPACE, tab('work'));
  assert.deepEqual(opened.tabs.map((item) => item.id), ['work']);
  assert.equal(opened.activeId, 'work');

  const again = openLayout(openLayout(opened, tab('skills')), tab('work'));
  assert.deepEqual(again.tabs.map((item) => item.id), ['work', 'skills'], '重新打开不该改顺序');
  assert.equal(again.activeId, 'work');
});

test('closing the active layout activates the right neighbour, then the left one', () => {
  let state = openLayout(openLayout(openLayout(INITIAL_WORKSPACE, tab('a')), tab('b')), tab('c'));
  // 关掉中间那个（非当前）→ 当前不变
  assert.equal(closeLayout({ ...state, activeId: 'a' }, 'b').activeId, 'a');
  // 关掉当前（b）→ 取右邻 c
  assert.equal(closeLayout({ ...state, activeId: 'b' }, 'b').activeId, 'c');
  // 关掉最后一个（c）→ 取左邻 b
  assert.equal(closeLayout({ ...state, activeId: 'c' }, 'c').activeId, 'b');
  // 全关掉 → 没有当前
  const empty = closeLayout(closeLayout(closeLayout(state, 'a'), 'b'), 'c');
  assert.deepEqual(empty.tabs, []);
  assert.equal(empty.activeId, null);
});

test('neighbourAfterClose keeps a non-active layout selected', () => {
  const tabs = [tab('a'), tab('b')];
  assert.equal(neighborAfterClose(tabs, 'a', 'b'), 'a');
  assert.equal(neighborAfterClose(tabs, 'b', 'b'), 'a');
});

test('the chatbox opens and closes through the window state', () => {
  assert.equal(INITIAL_WORKSPACE.chatboxOpen, false);
  assert.equal(toggleChatbox(INITIAL_WORKSPACE).chatboxOpen, true);
  assert.equal(toggleChatbox(toggleChatbox(INITIAL_WORKSPACE)).chatboxOpen, false);
  assert.equal(setChatboxOpen(INITIAL_WORKSPACE, true).chatboxOpen, true);
});

test('the left bar carries the four fixed entries', () => {
  assert.deepEqual(FIXED_ENTRIES.map((entry) => entry.id), ['home', 'wiki', 'skills', 'settings']);
  for (const entry of FIXED_ENTRIES) assert.match(entry.labelKey, /^nav\./);
});

test('pinning appends once, unpinning removes, and moving swaps neighbours', () => {
  assert.deepEqual(pinLayout([], 'wiki'), ['wiki']);
  assert.deepEqual(pinLayout(['wiki'], 'wiki'), ['wiki'], '固定两次不该重复');
  assert.deepEqual(pinLayout(['wiki'], 'skills'), ['wiki', 'skills']);
  assert.deepEqual(unpinLayout(['wiki', 'skills'], 'wiki'), ['skills']);
  assert.deepEqual(movePin(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(movePin(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  assert.deepEqual(movePin(['a', 'b'], 'a', -1), ['a', 'b'], '越界不动');
  assert.deepEqual(movePin(['a', 'b'], 'b', 1), ['a', 'b'], '越界不动');
});

test('the pin store round-trips and survives corrupt storage', async () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, value); },
  };
  const store = createLocalPinStore(storage);
  assert.deepEqual(await store.load(), []);
  await store.save(['wiki', 'skills']);
  assert.deepEqual(await store.load(), ['wiki', 'skills']);
  assert.equal(memory.get(PIN_STORAGE_KEY), JSON.stringify(['wiki', 'skills']));

  memory.set(PIN_STORAGE_KEY, '{ not json');
  assert.deepEqual(await store.load(), [], '存储损坏应退化成空列表而不是抛错');
  memory.set(PIN_STORAGE_KEY, JSON.stringify(['ok', 42, null]));
  assert.deepEqual(await store.load(), ['ok'], '非字符串项要被过滤掉');
});
