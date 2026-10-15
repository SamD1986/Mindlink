import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'tsx/esm/api';

register();
const {
  REFERENCE_WIDTH_PX, cellSize, clampRect, fits, normalizeBox, overlaps, rectToPixels, snapRect, snapStepGrid,
} = await import('../src/workbench/grid/geometry.ts');
const { WIDGET_REGISTRY, loadBuiltinLayouts } = await import('../src/workbench/layouts/builtin.ts');

const spec = { columns: 96, rows: 54 };
const wikiLayout = () => {
  const { layouts, errors } = loadBuiltinLayouts(WIDGET_REGISTRY);
  assert.deepEqual(errors, [], '内置布局必须全部合法');
  return layouts.get('wiki');
};

test('cell size is proportional to the canvas', () => {
  assert.deepEqual(cellSize(spec, { width: 960, height: 540 }), { width: 10, height: 10 });
  assert.deepEqual(cellSize(spec, { width: 1920, height: 1080 }), { width: 20, height: 20 });
  // 只与画布尺寸有关，与 DPR 无关：函数签名里根本没有 DPR 这一项
  assert.equal(cellSize.length, 2);
});

test('the same layout keeps the same relative position on very different canvases', () => {
  const layout = wikiLayout();
  const small = { width: 800, height: 600 };
  const large = { width: 1920, height: 1080 };

  for (const instance of layout.widgets) {
    const smallBox = normalizeBox(rectToPixels(instance.rect, layout.grid, small), small);
    const largeBox = normalizeBox(rectToPixels(instance.rect, layout.grid, large), large);
    for (const key of ['left', 'top', 'width', 'height']) {
      assert.ok(Math.abs(smallBox[key] - largeBox[key]) < 1e-9,
        `${instance.id} 的 ${key} 在两种画布下不一致：${smallBox[key]} vs ${largeBox[key]}`);
    }
  }
});

test('the snapping step is 5px at the reference width and scales with the canvas', () => {
  const reference = { width: REFERENCE_WIDTH_PX, height: 810 };
  const doubled = { width: REFERENCE_WIDTH_PX * 2, height: 1620 };

  // 以"格"为单位时步长恒定（这是它按比例的含义）
  assert.ok(Math.abs(snapStepGrid(spec, reference) - snapStepGrid(spec, doubled)) < 1e-9);
  // 换成像素则是 5px 与 10px
  const stepToPx = (canvas) => snapStepGrid(spec, canvas) * cellSize(spec, canvas).width;
  assert.ok(Math.abs(stepToPx(reference) - 5) < 1e-9);
  assert.ok(Math.abs(stepToPx(doubled) - 10) < 1e-9);
});

test('snapping rounds to the step and never returns a degenerate size', () => {
  const canvas = { width: REFERENCE_WIDTH_PX, height: 810 };
  const snapped = snapRect({ x: 4.9, y: 9.8, w: 22.1, h: 13.9 }, spec, canvas);
  assert.ok(snapped.w > 0 && snapped.h > 0);
  for (const key of ['x', 'y', 'w', 'h']) {
    const steps = snapped[key] / snapStepGrid(spec, canvas);
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9, `${key} 没有吸附到基准步长`);
  }
});

test('out of bounds rects are pulled back and min sizes are enforced', () => {
  assert.equal(fits({ x: 0, y: 0, w: 96, h: 54 }, spec), true);
  assert.equal(fits({ x: 96, y: 0, w: 12, h: 12 }, spec), false);
  assert.equal(fits({ x: 0, y: 0, w: 0, h: 12 }, spec), false);

  const clamped = clampRect({ x: 90, y: 50, w: 40, h: 40 }, spec, { w: 12, h: 12 });
  assert.deepEqual(clamped, { x: 56, y: 14, w: 40, h: 40 });
  const tiny = clampRect({ x: 0, y: 0, w: 2, h: 2 }, spec, { w: 8, h: 6 });
  assert.deepEqual(tiny, { x: 0, y: 0, w: 8, h: 6 });
});

test('overlap detection catches the touching-versus-crossing boundary', () => {
  assert.equal(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false, '紧邻不算重叠');
  assert.equal(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 }), true);
});

test('every builtin layout respects the registry min sizes and stays inside the canvas', () => {
  const { layouts } = loadBuiltinLayouts(WIDGET_REGISTRY);
  assert.equal(layouts.size, 3);
  const byId = new Map(WIDGET_REGISTRY.map((entry) => [entry.id, entry]));
  for (const layout of layouts.values()) {
    for (const instance of layout.widgets) {
      const widgetSpec = byId.get(instance.widget);
      assert.ok(widgetSpec, `${instance.widget} 不在登记表里`);
      assert.ok(instance.rect.w >= widgetSpec.size.min.w && instance.rect.h >= widgetSpec.size.min.h,
        `${layout.id}/${instance.id} 小于最小尺寸`);
      assert.ok(fits(instance.rect, layout.grid), `${layout.id}/${instance.id} 越界`);
    }
  }
});
