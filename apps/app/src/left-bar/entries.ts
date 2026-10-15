/**
 * 左栏条目模型与 pin 的纯函数（便于机核）。
 *
 * 固定入口按需求为三项：Wiki、技能与工具、设置；
 * 其余是用户自己"固定到左栏"的 dashboard 布局（一个 pin = 一个布局标识）。
 * `label` 现为占位文案，UI-15 抽语言包时按 `labelKey` 取值。
 */
export type LeftBarEntry = {
  id: string;
  label: string;
  labelKey: string;
  icon: 'home' | 'wiki' | 'skills' | 'settings' | 'pinned';
};

export const FIXED_ENTRIES: LeftBarEntry[] = [
  { id: 'home', label: 'Home', labelKey: 'nav.home', icon: 'home' },
  { id: 'wiki', label: 'Wiki', labelKey: 'nav.wiki', icon: 'wiki' },
  { id: 'skills', label: 'Skills & tools', labelKey: 'nav.skills', icon: 'skills' },
  { id: 'settings', label: 'Settings', labelKey: 'nav.settings', icon: 'settings' },
];

export function entryForLayout(id: string, label: string): LeftBarEntry {
  return { id, label, labelKey: `nav.layout.${id}`, icon: 'pinned' };
}

/** 固定：已在列表里则原样返回（保序、不重复）。 */
export function pinLayout(pinned: string[], id: string): string[] {
  return pinned.includes(id) ? pinned : [...pinned, id];
}

export function unpinLayout(pinned: string[], id: string): string[] {
  return pinned.filter((item) => item !== id);
}

/** 排序：与相邻项交换；越界则原样返回。 */
export function movePin(pinned: string[], id: string, direction: -1 | 1): string[] {
  const index = pinned.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= pinned.length) return pinned;
  const current = pinned[index];
  const neighbour = pinned[target];
  if (current === undefined || neighbour === undefined) return pinned;
  const next = [...pinned];
  next[index] = neighbour;
  next[target] = current;
  return next;
}

/**
 * pin 的存储接缝：**渲染层只有实现这一处碰存储**。
 *
 * 它是过渡实现（localStorage）。用户 pin 是用户资产、将来要跨设备，所以最终
 * 搬到 Runtime 侧（MINDLINK_HOME 下）；届时只替换这个实现，组件与模型不动。
 */
export type LayoutPinStore = {
  load(): Promise<string[]>;
  save(ids: string[]): Promise<void>;
};

export const PIN_STORAGE_KEY = 'mindlink.pinned-layouts';

export function createLocalPinStore(storage?: Pick<Storage, 'getItem' | 'setItem'>): LayoutPinStore {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  return {
    async load() {
      try {
        const raw = target?.getItem(PIN_STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
      } catch {
        return [];  // 存储损坏或不可用：退化成"没有 pin"，不阻断界面
      }
    },
    async save(ids) {
      try { target?.setItem(PIN_STORAGE_KEY, JSON.stringify(ids)); } catch { /* 存储不可用就静默降级 */ }
    },
  };
}
