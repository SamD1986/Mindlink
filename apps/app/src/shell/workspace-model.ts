/**
 * 窗口级共享状态（纯函数，便于机核）。
 *
 * 为什么放在 shell：标签、当前布局、对话浮层开合都是**窗口级**状态 ——
 * 左栏点入口要开标签、右栏按钮要开合对话，而栏之间不许互相 import，
 * 因此由容器（shell）持有、各栏消费（边界说明见 ARCHITECTURE.md）。
 *
 * 一个标签 = 画布上的一份布局（对应 `workbench/layouts/<id>.layout.json`）。
 * `label` 现为占位文案；UI-15 抽语言包时改成按 `labelKey` 取值。
 */
export type WorkbenchTab = { id: string; label: string; labelKey: string };

export type WorkspaceState = {
  tabs: WorkbenchTab[];
  activeId: string | null;
  chatboxOpen: boolean;
};

export const INITIAL_WORKSPACE: WorkspaceState = { tabs: [], activeId: null, chatboxOpen: false };

/** 打开布局：已在条上则不重复、不改顺序，只切为当前。 */
export function openLayout(state: WorkspaceState, tab: WorkbenchTab): WorkspaceState {
  const tabs = state.tabs.some((item) => item.id === tab.id) ? state.tabs : [...state.tabs, tab];
  return { ...state, tabs, activeId: tab.id };
}

/** 关闭布局：关的是当前标签时，优先激活右邻，其次左邻。 */
export function closeLayout(state: WorkspaceState, id: string): WorkspaceState {
  const activeId = state.activeId === id ? neighborAfterClose(state.tabs, state.activeId, id) : state.activeId;
  return { ...state, tabs: state.tabs.filter((item) => item.id !== id), activeId };
}

export function setChatboxOpen(state: WorkspaceState, open: boolean): WorkspaceState {
  return { ...state, chatboxOpen: open };
}

export function toggleChatbox(state: WorkspaceState): WorkspaceState {
  return setChatboxOpen(state, !state.chatboxOpen);
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
  const rest = tabs.filter((item) => item.id !== closedId);
  if (rest.length === 0) return null;
  const index = tabs.findIndex((item) => item.id === closedId);
  const next = rest[Math.min(index, rest.length - 1)];
  return next ? next.id : null;
}
