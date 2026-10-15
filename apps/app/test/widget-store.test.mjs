import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { register } from 'tsx/esm/api';

register();

const {
  USER_WIDGET_MAX_NODES,
  USER_WIDGET_MAX_DEPTH,
  parseUserWidget,
  validateUserWidgetDSL,
} = await import('../src/components/widgets/user-widget-format.ts');
const {
  addUserWidget,
  buildUserWidget,
  copyUserWidget,
  exportUserWidget,
  importIntoLibrary,
  importUserWidget,
  removeUserWidget,
} = await import('../src/components/widgets/user-widget-model.ts');
const {
  USER_WIDGET_STORAGE_KEY,
  createLocalUserWidgetStore,
  createMemoryUserWidgetStore,
  setUserWidgetPinned,
  subscribeUserWidgets,
} = await import('../src/components/widgets/user-widget-store.ts');
const {
  WIDGET_STUDIO_TAB_ID,
  isUserWidgetTab,
  userWidgetIdFromTab,
  userWidgetTabId,
} = await import('../src/components/widgets/user-widget-tabs.ts');

const NOW = '2026-10-15T00:00:00.000Z';

/** 一份合法的用户 widget DSL（纯数据）。 */
const validDSL = (overrides = {}) => ({
  widgetId: 'my-usage',
  version: '1.0.0',
  root: {
    type: 'Panel',
    props: { variant: 'card' },
    children: [
      { type: 'Text', props: { content: 'Usage' } },
      { type: 'Divider' },
      { type: 'Text', props: { content: '42%' } },
    ],
  },
  ...overrides,
});
const asText = (value) => JSON.stringify(value);

function fakeStorage() {
  const memory = new Map();
  return {
    memory,
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, value); },
  };
}

// ─────────────────────────── 创作 / 增删改 ───────────────────────────

test('创作：合法 DSL 生成带元数据的 widget 记录', () => {
  const result = buildUserWidget(asText(validDSL()), '用量面板', NOW);
  assert.equal(result.ok, true, '合法 DSL 应当能创作成功');
  assert.equal(result.value.id, 'my-usage', 'id 取自 DSL 的 widgetId');
  assert.equal(result.value.name, '用量面板');
  assert.equal(result.value.version, '1.0.0');
  assert.equal(result.value.createdAt, NOW);
  assert.equal(result.value.updatedAt, NOW);
  assert.equal(result.value.dsl.widgetId, 'my-usage');
});

test('保存 / 删除 / 复制：列表变换正确且不覆盖同名 id', () => {
  const widget = buildUserWidget(asText(validDSL()), '用量面板', NOW).value;

  const added = addUserWidget([], widget);
  assert.equal(added.ok, true);
  assert.equal(added.value.length, 1);

  const duplicated = addUserWidget(added.value, widget);
  assert.equal(duplicated.ok, false, '同 id 入库必须被拒');
  assert.equal(duplicated.errors[0].code, 'duplicate-id');

  const copied = copyUserWidget(added.value, 'my-usage', NOW);
  assert.equal(copied.ok, true);
  assert.equal(copied.value.length, 2);
  const copy = copied.value[1];
  assert.equal(copy.id, 'my-usage-copy', '复制要换一个不冲突的 id');
  assert.notEqual(copy.name, '用量面板', '复制要改名');
  assert.equal(copy.pinned, false, '副本不应继承 pin');
  assert.deepEqual(copy.dsl, widget.dsl, '复制要保留原始 DSL');

  const removed = removeUserWidget(copied.value, 'my-usage-copy');
  assert.deepEqual(removed.map((item) => item.id), ['my-usage']);
});

// ─────────────────────────── 非法 DSL 一律整份拒掉 ───────────────────────────

test('非法 DSL 被拒：未知原子 / 函数 props / 对象 props', () => {
  const unknown = validateUserWidgetDSL({ widgetId: 'x', root: { type: 'EvilScript' } });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.some((error) => error.code === 'unknown-atomic'));

  // 函数 props：直接传对象（JSON 里不可能出现，但内存对象可以）
  const withFunction = validateUserWidgetDSL({
    widgetId: 'x',
    root: { type: 'Button', props: { onClick: () => {} } },
  });
  assert.equal(withFunction.ok, false);
  assert.ok(withFunction.errors.some((error) => error.code === 'invalid-prop'));

  const withObject = validateUserWidgetDSL({
    widgetId: 'x',
    root: { type: 'Button', props: { config: { nested: 1 } } },
  });
  assert.equal(withObject.ok, false);
  assert.ok(withObject.errors.some((error) => error.code === 'invalid-prop'));
});

test('非法 DSL 被拒：超出节点数 / 深度上限', () => {
  const manyNodes = {
    widgetId: 'big',
    root: {
      type: 'Panel',
      children: Array.from({ length: USER_WIDGET_MAX_NODES + 1 }, () => ({ type: 'Text', props: { content: 'x' } })),
    },
  };
  const tooMany = validateUserWidgetDSL(manyNodes);
  assert.equal(tooMany.ok, false);
  assert.ok(tooMany.errors.some((error) => error.code === 'too-large'));

  let deep = { type: 'Text' };
  for (let index = 0; index < USER_WIDGET_MAX_DEPTH + 2; index += 1) {
    deep = { type: 'Panel', children: [deep] };
  }
  const tooDeep = validateUserWidgetDSL({ widgetId: 'deep', root: deep });
  assert.equal(tooDeep.ok, false);
  assert.ok(tooDeep.errors.some((error) => error.code === 'too-large'));
});

test('非法 DSL 被拒：缺字段 / 非对象 / 占用内置 id / 非法 JSON / 空名称', () => {
  assert.equal(validateUserWidgetDSL(null).errors[0].code, 'not-an-object');
  assert.ok(validateUserWidgetDSL({ root: { type: 'Panel' } }).errors.some((error) => error.code === 'missing-field'),
    '缺 widgetId 应被拒');
  assert.ok(validateUserWidgetDSL({ widgetId: 'x' }).errors.some((error) => error.code === 'missing-field'),
    '缺 root 应被拒');
  assert.ok(validateUserWidgetDSL({ widgetId: 'skills', root: { type: 'Panel' } }).errors
    .some((error) => error.code === 'reserved-id'), '占用内置 id 应被拒');

  assert.equal(buildUserWidget('{ 不是 JSON', '名字', NOW).errors[0].code, 'bad-json');
  assert.equal(buildUserWidget(asText(validDSL()), '   ', NOW).errors[0].code, 'missing-field');
});

test('失败是整份拒掉：多处错误全部报出，绝不"半份通过"', () => {
  const messy = validateUserWidgetDSL({
    widgetId: 'x',
    root: {
      type: 'Panel',
      children: [
        { type: 'EvilScript' },
        { type: 'Button', props: { handler: () => {} } },
      ],
    },
  });
  assert.equal(messy.ok, false);
  assert.ok(messy.errors.length >= 2, '两条错误都要报出来');
  assert.ok(messy.errors.every((error) => typeof error.message === 'string' && error.message.length > 0),
    '每条错误都要可读');
});

test('记录级防坏：id/name 缺失或 dsl 不一致时整体拒收', () => {
  const widget = buildUserWidget(asText(validDSL()), '用量面板', NOW).value;
  assert.equal(parseUserWidget(widget).ok, true);
  assert.equal(parseUserWidget({ ...widget, id: '' }).errors.some((error) => error.code === 'missing-field'), true);
  assert.equal(parseUserWidget({ ...widget, dsl: validDSL({ widgetId: 'other' }) }).errors
    .some((error) => error.code === 'invalid-field'), true, 'dsl.widgetId 与记录 id 不一致应被拒');
});

// ─────────────────────────── 导出 → 导入往返一致 ───────────────────────────

test('导出→导入往返一致（含元数据与版本）', () => {
  const widget = buildUserWidget(asText(validDSL()), '用量面板', NOW).value;
  const file = exportUserWidget(widget, '2026-10-16T08:30:00.000Z');

  const envelope = JSON.parse(file);
  assert.equal(envelope.format, 'mindlink.widget');
  assert.equal(envelope.schema, 1);
  assert.equal(envelope.exportedAt, '2026-10-16T08:30:00.000Z');
  assert.equal(envelope.widget.name, '用量面板');
  assert.equal(envelope.widget.version, '1.0.0');

  const imported = importUserWidget(file);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.value, widget, '往返后整条记录（含元数据）应一致');
});

test('导入同样校验：未知原子 / 版本过高 / 非本格式 / 非 JSON 一律拒收并给可读错误', () => {
  const badAtomic = asText({
    format: 'mindlink.widget',
    schema: 1,
    exportedAt: NOW,
    widget: { id: 'x', name: 'x', version: '1.0.0', createdAt: NOW, updatedAt: NOW, dsl: { widgetId: 'x', root: { type: 'EvilScript' } } },
  });
  const rejected = importUserWidget(badAtomic);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.some((error) => error.code === 'unknown-atomic'));
  assert.ok(rejected.errors.every((error) => typeof error.message === 'string'));

  assert.equal(importUserWidget(asText({ format: 'mindlink.widget', schema: 99, exportedAt: NOW, widget: {} }))
    .errors[0].code, 'bad-envelope');
  assert.equal(importUserWidget(asText({ hello: 'world' })).errors[0].code, 'bad-envelope');
  assert.equal(importUserWidget('not json').errors[0].code, 'bad-json');
});

test('导入入库：首次成功，同 id 第二次被拒', () => {
  const widget = buildUserWidget(asText(validDSL()), '用量面板', NOW).value;
  const file = exportUserWidget(widget, NOW);

  const first = importIntoLibrary([], file);
  assert.equal(first.ok, true);
  assert.deepEqual(first.value.map((item) => item.id), ['my-usage']);

  const second = importIntoLibrary(first.value, file);
  assert.equal(second.ok, false);
  assert.equal(second.errors[0].code, 'duplicate-id');
});

// ─────────────────────────── 持久化 / 重启后仍在 ───────────────────────────

test('存储接缝往返，且重启（重读存储）后 widget 与 pin 仍在', async () => {
  const storage = fakeStorage();
  const store = createLocalUserWidgetStore(storage);
  assert.deepEqual(await store.load(), [], '空存储应为空列表');

  const widget = buildUserWidget(asText(validDSL()), '用量面板', NOW).value;
  await store.save([widget]);
  assert.ok(storage.memory.get(USER_WIDGET_STORAGE_KEY).includes('my-usage'));

  // 模拟重启：在同一份存储上新建实例（等价于进程重启后重新读取）
  const restarted = createLocalUserWidgetStore(storage);
  const reloaded = await restarted.load();
  assert.equal(reloaded.length, 1);
  assert.deepEqual(reloaded[0], widget);

  // pin 到左栏后重启，pin 仍在
  await setUserWidgetPinned(restarted, 'my-usage', true);
  const afterPin = await createLocalUserWidgetStore(storage).load();
  assert.equal(afterPin[0].pinned, true);
  // 取消固定后重启，pin 消失
  await setUserWidgetPinned(restarted, 'my-usage', false);
  assert.equal((await createLocalUserWidgetStore(storage).load())[0].pinned, false);
});

test('存储损坏退化成空；单条坏记录只丢它自己', async () => {
  const storage = fakeStorage();
  const store = createLocalUserWidgetStore(storage);
  const widget = buildUserWidget(asText(validDSL()), '用量面板', NOW).value;

  storage.memory.set(USER_WIDGET_STORAGE_KEY, '{ not json');
  assert.deepEqual(await store.load(), [], '存储损坏应退化成空列表而不是抛错');

  storage.memory.set(USER_WIDGET_STORAGE_KEY, JSON.stringify([widget, { id: 'broken' }, 42]));
  assert.deepEqual((await store.load()).map((item) => item.id), ['my-usage'], '坏记录要单独丢弃');
});

test('保存后广播，订阅者据此刷新；退订后不再收到', async () => {
  let hits = 0;
  const unsubscribe = subscribeUserWidgets(() => { hits += 1; });

  const store = createMemoryUserWidgetStore();
  await store.save([]);
  assert.equal(hits, 1);

  unsubscribe();
  await store.save([]);
  assert.equal(hits, 1, '退订后不应再收到广播');
});

// ─────────────────────── 画布标签映射 与 "数据不变成代码" ───────────────────────

test('画布标签与用户 widget 的映射可往返', () => {
  assert.equal(userWidgetTabId('my-usage'), 'user-widget:my-usage');
  assert.equal(isUserWidgetTab('user-widget:my-usage'), true);
  assert.equal(userWidgetIdFromTab('user-widget:my-usage'), 'my-usage');
  assert.equal(isUserWidgetTab(WIDGET_STUDIO_TAB_ID), false);
});

test('widget 相关源码里不存在任何"数据变代码"的通道（无 eval / Function / 动态导入）', async () => {
  const files = await collectWidgetSources();
  assert.ok(files.length >= 4, '没扫到 widget 源码');
  for (const url of files) {
    const source = await readFile(url, 'utf8');
    assert.ok(!/\beval\s*\(/.test(source), `${url.pathname} 出现了 eval`);
    assert.ok(!/new\s+Function\s*\(/.test(source), `${url.pathname} 出现了 new Function`);
    assert.ok(!/\bimport\s*\(/.test(source), `${url.pathname} 出现了动态导入`);
  }
});

async function collectWidgetSources() {
  const root = new URL('../src/components/widgets/', import.meta.url);
  const walk = async (dir) => {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) out.push(...(await walk(url)));
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(url);
    }
    return out;
  };
  return walk(root);
}
