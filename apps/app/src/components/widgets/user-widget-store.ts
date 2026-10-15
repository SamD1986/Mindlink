/**
 * 用户自建 widget 的**存储接缝**（与 UI-05 的 `LayoutPinStore` 同一风格）。
 *
 * widget 是**用户资产**，将来要跨设备，所以最终搬到 Runtime 侧（MINDLINK_HOME 下）；
 * 当前是 localStorage 过渡实现 —— 届时只替换这里的实现，模型与界面都不动。
 *
 * 只有这一个文件碰 `localStorage`（渲染层其余地方一律走这个接口）。
 * 读取时逐条做「防坏」校验：坏掉的一条只丢它自己，不带崩整个列表。
 */
import { parseUserWidget, type UserWidget } from './user-widget-format.js';

export type UserWidgetStore = {
  load(): Promise<UserWidget[]>;
  save(list: readonly UserWidget[]): Promise<void>;
};

export const USER_WIDGET_STORAGE_KEY = 'mindlink.user-widgets';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * 模块级订阅：任一实例 save 之后广播，左栏与画布据此重读刷新。
 * （localStorage 的 storage 事件只在**其它文档**触发，同文档内改动收不到，所以自建广播。）
 */
const listeners = new Set<() => void>();

export function subscribeUserWidgets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function createLocalUserWidgetStore(storage?: StorageLike): UserWidgetStore {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  return {
    async load() {
      try {
        const raw = target?.getItem(USER_WIDGET_STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        const out: UserWidget[] = [];
        for (const item of parsed) {
          const result = parseUserWidget(item);
          if (result.ok) out.push(result.value);
        }
        return out;
      } catch {
        return []; // 存储损坏或不可用：退化成"没有自建 widget"，不阻断界面
      }
    },
    async save(list) {
      try {
        target?.setItem(USER_WIDGET_STORAGE_KEY, JSON.stringify(list));
      } catch {
        /* 存储不可用就静默降级 */
      }
      notify();
    },
  };
}

/** 内存实现：给测试与无存储环境用。 */
export function createMemoryUserWidgetStore(initial: readonly UserWidget[] = []): UserWidgetStore {
  let data = [...initial];
  return {
    async load() {
      return [...data];
    },
    async save(list) {
      data = [...list];
      notify();
    },
  };
}

/** 应用内共享的单一存储实例。 */
export const userWidgetStore: UserWidgetStore = createLocalUserWidgetStore();

/** 固定 / 取消固定到左栏：改的是 widget 记录上的 `pinned` 标记。 */
export async function setUserWidgetPinned(
  store: UserWidgetStore,
  id: string,
  pinned: boolean,
): Promise<void> {
  const list = await store.load();
  await store.save(list.map((widget) => (widget.id === id ? { ...widget, pinned } : widget)));
}
