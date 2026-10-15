/**
 * 读取用户 widget 的 React 钩子：一次加载 + 订阅变更。
 *
 * 左栏与画布都靠它拿到同一份数据并保持同步；数据来源统一是存储接缝 `userWidgetStore`。
 */
import { useEffect, useState } from 'react';
import type { UserWidget } from '../user-widget-format.js';
import { subscribeUserWidgets, userWidgetStore, type UserWidgetStore } from '../user-widget-store.js';

/** 列出全部自建 widget；store.save() 之后自动重读。 */
export function useUserWidgets(store: UserWidgetStore = userWidgetStore): UserWidget[] {
  const [list, setList] = useState<UserWidget[]>([]);
  useEffect(() => {
    let alive = true;
    const reload = () => {
      void store.load().then((items) => {
        if (alive) setList(items);
      });
    };
    reload();
    const unsubscribe = subscribeUserWidgets(reload);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [store]);
  return list;
}

/** 取单个 widget（找不到返回 undefined）。 */
export function useUserWidget(id: string, store: UserWidgetStore = userWidgetStore): UserWidget | undefined {
  return useUserWidgets(store).find((widget) => widget.id === id);
}
