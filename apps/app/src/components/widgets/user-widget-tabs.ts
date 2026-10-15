/**
 * 画布标签与用户 widget 之间的映射（纯函数）。
 *
 * 画布的"当前布局"就是一个标签 id：左栏点入口/ pin 都经 `openLayout` 切标签。
 * 自建 widget 与其"创作台"各占一个标签：
 *   - 创作台：`widget-studio`
 *   - 一份用户 widget：`user-widget:<widgetId>`
 * 画布据此决定渲染内置布局、创作台还是用户 widget（见 `workbench/index.tsx`）。
 */
export const WIDGET_STUDIO_TAB_ID = 'widget-studio';

const USER_WIDGET_PREFIX = 'user-widget:';

export function userWidgetTabId(id: string): string {
  return `${USER_WIDGET_PREFIX}${id}`;
}

export function isUserWidgetTab(tabId: string): boolean {
  return tabId.startsWith(USER_WIDGET_PREFIX);
}

export function userWidgetIdFromTab(tabId: string): string {
  return tabId.slice(USER_WIDGET_PREFIX.length);
}
