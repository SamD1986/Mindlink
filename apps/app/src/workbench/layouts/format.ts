import { fits, overlaps, type GridRect, type GridSpec } from '../grid/geometry.js';

/**
 * 布局文件的格式与校验（见 ARCHITECTURE「三份数据格式」之一）。
 *
 * 布局文件是**数据**：它只能引用已登记的 widget，不能成为代码路径，
 * 也不能指定任意组件名。所以这里的解析器是白名单式的 —— 校验不过就整份拒掉并给出可读错误，
 * 不做"猜一半"的容错。
 */
export type WidgetInstance = { id: string; widget: string; rect: GridRect };

export type WorkbenchLayout = {
  id: string;
  titleKey: string;
  grid: GridSpec;
  background?: string;
  widgets: WidgetInstance[];
};

export type WidgetSpec = {
  id: string;
  titleKey: string;
  /** 占位标题：UI-15 抽语言包前的临时文案。 */
  placeholderTitle: string;
  /** 它需要什么能力 —— 只声明，是否放行由 Runtime 逐请求决定。 */
  capabilities: string[];
  size: { min: { w: number; h: number } };
};

export type ParseResult = { ok: true; layout: WorkbenchLayout } | { ok: false; errors: string[] };

const MIN_COLUMNS = 12;
const MIN_ROWS = 8;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isRect = (value: unknown): value is GridRect =>
  isObject(value)
  && ['x', 'y', 'w', 'h'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]));

export function parseLayout(input: unknown, registry: readonly WidgetSpec[]): ParseResult {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ['布局必须是对象'] };

  const id = input.id;
  const titleKey = input.titleKey;
  if (typeof id !== 'string' || id.trim() === '') errors.push('缺少 id');
  if (typeof titleKey !== 'string' || titleKey.trim() === '') errors.push('缺少 titleKey（文案要走语言包，不写死）');

  const grid = input.grid;
  if (!isObject(grid) || !isPositiveInt(grid.columns) || !isPositiveInt(grid.rows)) {
    errors.push('grid 必须是 { columns, rows } 正整数');
  } else {
    if (grid.columns < MIN_COLUMNS) errors.push(`grid.columns 至少 ${MIN_COLUMNS}`);
    if (grid.rows < MIN_ROWS) errors.push(`grid.rows 至少 ${MIN_ROWS}`);
  }

  const widgets = input.widgets;
  if (!Array.isArray(widgets) || widgets.length === 0) {
    errors.push('widgets 必须是非空数组');
    return { ok: false, errors };
  }

  const byId = new Map(registry.map((spec) => [spec.id, spec]));
  const seen = new Set<string>();
  const placed: GridRect[] = [];
  const parsed: WidgetInstance[] = [];

  widgets.forEach((entry, index) => {
    const where = `widgets[${index}]`;
    if (!isObject(entry)) { errors.push(`${where} 必须是对象`); return; }
    const instanceId = entry.id;
    const widgetId = entry.widget;
    if (typeof instanceId !== 'string' || instanceId.trim() === '') { errors.push(`${where} 缺少 id`); return; }
    if (seen.has(instanceId)) { errors.push(`${where} 的 id "${instanceId}" 重复`); return; }
    seen.add(instanceId);
    if (typeof widgetId !== 'string' || !byId.has(widgetId)) {
      errors.push(`${where} 引用了未登记的 widget："${String(widgetId)}"`);
      return;
    }
    if (!isRect(entry.rect)) { errors.push(`${where} 的 rect 必须是 { x, y, w, h } 数字`); return; }
    const rect = entry.rect;
    const spec = byId.get(widgetId) as WidgetSpec;
    if (!fits(rect, grid as unknown as GridSpec)) {
      errors.push(`${where} 越出画布（${rect.x},${rect.y} ${rect.w}x${rect.h} > ${(grid as GridSpec).columns}x${(grid as GridSpec).rows}）`);
      return;
    }
    if (rect.w < spec.size.min.w || rect.h < spec.size.min.h) {
      errors.push(`${where} 小于 ${widgetId} 的最小尺寸 ${spec.size.min.w}x${spec.size.min.h}`);
      return;
    }
    if (placed.some((other) => overlaps(other, rect))) {
      errors.push(`${where} 与已放置的 widget 重叠`);
      return;
    }
    placed.push(rect);
    parsed.push({ id: instanceId, widget: widgetId, rect });
  });

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    layout: {
      id: id as string,
      titleKey: titleKey as string,
      grid: grid as GridSpec,
      ...(typeof input.background === 'string' ? { background: input.background } : {}),
      widgets: parsed,
    },
  };
}
