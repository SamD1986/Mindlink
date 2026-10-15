/**
 * 上栏标签模型（纯函数，便于机核）。
 *
 * 一个标签 = 画布上的一份布局（对应 `workbench/layouts/<id>.layout.json`）。
 * 左栏点入口 → 打开/切换到对应标签；关闭标签 → 从条上移除。
 * 布局文件的加载在 UI-09 接入，这里只维护"打开了哪些、当前是哪个"。
 *
 * `label` 现为占位文案；UI-15 抽语言包时改成按 `labelKey` 取值（字段已按此设计）。
 */
export type WorkbenchTab = { id: string; label: string; labelKey: string };

export const PLACEHOLDER_TABS: WorkbenchTab[] = [
  { id: 'work', label: 'Work', labelKey: 'tab.work' },
  { id: 'assistant', label: 'Assistant', labelKey: 'tab.assistant' },
];

/** 打开标签：已存在则原样返回（不重复、不改顺序）。 */
export function openTab(tabs: WorkbenchTab[], tab: WorkbenchTab): WorkbenchTab[] {
  return tabs.some((item) => item.id === tab.id) ? tabs : [...tabs, tab];
}

export function closeTab(tabs: WorkbenchTab[], id: string): WorkbenchTab[] {
  return tabs.filter((item) => item.id !== id);
}

/**
 * 关掉一个标签之后该激活谁：关的不是当前标签就保持原样；
 * 关的是当前标签则优先取右邻，没有右邻取左邻，都不剩则 null。
 */
export function neighborAfterClose(
  tabs: WorkbenchTab[],
  activeId: string | null,
  closedId: string,
): string | null {
  if (activeId !== closedId) return activeId;
  const rest = closeTab(tabs, closedId);
  if (rest.length === 0) return null;
  const index = tabs.findIndex((item) => item.id === closedId);
  const next = rest[Math.min(index, rest.length - 1)];
  return next ? next.id : null;
}
