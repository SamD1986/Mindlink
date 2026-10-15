import { parseLayout, type WidgetSpec, type WorkbenchLayout } from './format.js';

/**
 * 内置 widget 登记表与内置布局（UI-16 之后由 widget 清单接管，这里先够 UI-09 用）。
 *
 * 登记表是**白名单**：布局文件只能引用这里的 id；能力只声明不授权。
 */
export const WIDGET_REGISTRY: WidgetSpec[] = [
  {
    id: 'note.text',
    titleKey: 'widget.noteText',
    placeholderTitle: 'Notes',
    capabilities: [],
    size: { min: { w: 8, h: 6 } },
  },
  {
    id: 'work.tree',
    titleKey: 'widget.workTree',
    placeholderTitle: 'Conversations',
    capabilities: ['work.conversations.list'],
    size: { min: { w: 12, h: 20 } },
  },
  {
    id: 'viewer.files',
    titleKey: 'widget.viewerFiles',
    placeholderTitle: 'Files',
    capabilities: ['work.files.list', 'work.files.read'],
    size: { min: { w: 16, h: 16 } },
  },
];

/** 内置布局的原始数据（与用户自建的布局同一格式，走同一个校验器）。 */
const BUILTIN_SOURCES: Record<string, unknown> = {
  wiki: {
    id: 'wiki',
    titleKey: 'layout.wiki',
    grid: { columns: 96, rows: 54 },
    widgets: [
      { id: 'tree', widget: 'work.tree', rect: { x: 0, y: 0, w: 22, h: 54 } },
      { id: 'notes', widget: 'note.text', rect: { x: 22, y: 0, w: 48, h: 30 } },
      { id: 'files', widget: 'viewer.files', rect: { x: 70, y: 0, w: 26, h: 54 } },
      { id: 'outline', widget: 'note.text', rect: { x: 22, y: 30, w: 48, h: 24 } },
    ],
  },
  skills: {
    id: 'skills',
    titleKey: 'layout.skills',
    grid: { columns: 96, rows: 54 },
    widgets: [
      { id: 'catalog', widget: 'note.text', rect: { x: 0, y: 0, w: 56, h: 54 } },
      { id: 'details', widget: 'viewer.files', rect: { x: 56, y: 0, w: 40, h: 54 } },
    ],
  },
  settings: {
    id: 'settings',
    titleKey: 'layout.settings',
    grid: { columns: 96, rows: 54 },
    widgets: [
      { id: 'form', widget: 'note.text', rect: { x: 12, y: 8, w: 72, h: 38 } },
    ],
  },
};

export type LayoutLoadResult = { layouts: Map<string, WorkbenchLayout>; errors: string[] };

/**
 * 加载内置布局：**加载期只解析本地数据，不做动态 import**（CSP 是 script-src 'self'，
 * 布局也不许成为代码路径）。任何一份不合法都记进 errors 并跳过，不影响其它布局。
 */
export function loadBuiltinLayouts(registry: readonly WidgetSpec[] = WIDGET_REGISTRY): LayoutLoadResult {
  const layouts = new Map<string, WorkbenchLayout>();
  const errors: string[] = [];
  for (const [key, source] of Object.entries(BUILTIN_SOURCES)) {
    const result = parseLayout(source, registry);
    if (result.ok) layouts.set(key, result.layout);
    else errors.push(`${key}: ${result.errors.join('；')}`);
  }
  return { layouts, errors };
}
