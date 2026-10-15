import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '../components/composites/app-icon.js';
import { setUserWidgetPinned, subscribeUserWidgets, userWidgetStore } from '../components/widgets/user-widget-store.js';
import { WIDGET_STUDIO_TAB_ID, userWidgetTabId } from '../components/widgets/user-widget-tabs.js';
import type { UserWidget } from '../components/widgets/user-widget-format.js';
import { useWorkspace } from '../shell/workspace.js';
import {
  FIXED_ENTRIES,
  createLocalPinStore,
  entryForLayout,
  movePin,
  unpinLayout,
  type LeftBarEntry,
} from './entries.js';
import './styles.css';
import { t } from '../languages/index.js';

/** 创作台入口的文案（走语言包；见 languages/zh-CN.json）。 */
const STUDIO_LABEL = t("我的 Widget");

/**
 * 左栏：固定入口（Wiki / 技能与工具 / 设置）＋ 用户固定到左栏的布局与自建 widget，
 * 以及打开「自建 widget 创作台」的入口。
 *
 * 点入口/ pin 切换的是**画布标签**（经 shell 的窗口状态通道），本栏不 import 上栏。
 * 布局 pin 走 `entries.ts` 的 `LayoutPinStore`；自建 widget 的 pin 是 widget 记录上的
 * `pinned` 标记，读同一个存储接缝 `userWidgetStore`（栏可以消费 `components/` 的共享单元）。
 */
export function LeftBar() {
  const { state, openLayout, closeLayout } = useWorkspace();
  const store = useMemo(() => createLocalPinStore(), []);
  const [pinned, setPinned] = useState<string[]>([]);
  const [pinnedWidgets, setPinnedWidgets] = useState<UserWidget[]>([]);

  useEffect(() => {
    let alive = true;
    void store.load().then((ids) => { if (alive) setPinned(ids); });
    return () => { alive = false; };
  }, [store]);

  useEffect(() => {
    let alive = true;
    const reload = () => {
      void userWidgetStore.load().then((list) => {
        if (alive) setPinnedWidgets(list.filter((widget) => widget.pinned === true));
      });
    };
    reload();
    const unsubscribe = subscribeUserWidgets(reload);
    return () => { alive = false; unsubscribe(); };
  }, []);

  const persist = (ids: string[]) => { setPinned(ids); void store.save(ids); };
  const labels = new Map(state.tabs.map((tab) => [tab.id, tab.label]));
  const pinnedEntries = pinned.map((id) => entryForLayout(id, labels.get(id) ?? id));

  return (
    <aside className="left-bar" data-bar="left">
      <nav className="left-bar-entries" data-left-entries>
        {FIXED_ENTRIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="left-bar-button"
            data-left-entry={entry.id}
            aria-label={entry.label}
            title={entry.label}
            onClick={() => {
              if (entry.id === 'home') {
                // Home 按钮：关闭当前布局，回到空画布
                if (state.activeId) closeLayout(state.activeId);
              } else {
                // 其他入口：打开对应布局
                openLayout({ id: entry.id, label: entry.label, labelKey: entry.labelKey });
              }
            }}
          >
            <EntryIcon entry={entry} />
          </button>
        ))}
      </nav>

      <div className="left-bar-pins" data-left-pins>
        {pinnedEntries.map((entry, index) => (
          <span key={entry.id} className="left-bar-pin" data-left-pin={entry.id}>
            <button
              type="button"
              className="left-bar-button"
              aria-label={entry.label}
              title={entry.label}
              onClick={() => openLayout({ id: entry.id, label: entry.label, labelKey: entry.labelKey })}
            >
              <EntryIcon entry={entry} />
            </button>
            <span className="left-bar-pin-actions">
              <button
                type="button"
                className="left-bar-pin-action"
                data-pin-action="up"
                aria-label={`Move ${entry.label} up`}
                disabled={index === 0}
                onClick={() => persist(movePin(pinned, entry.id, -1))}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 9.5v-7m-3 3 3-3 3 3" /></svg>
              </button>
              <button
                type="button"
                className="left-bar-pin-action"
                data-pin-action="down"
                aria-label={`Move ${entry.label} down`}
                disabled={index === pinned.length - 1}
                onClick={() => persist(movePin(pinned, entry.id, 1))}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2.5v7m-3-3 3 3 3-3" /></svg>
              </button>
              <button
                type="button"
                className="left-bar-pin-action"
                data-pin-action="unpin"
                aria-label={`Unpin ${entry.label}`}
                onClick={() => persist(unpinLayout(pinned, entry.id))}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3.5 3.5 5 5m0-5-5 5" /></svg>
              </button>
            </span>
          </span>
        ))}

        {pinnedWidgets.map((widget) => (
          <span
            key={widget.id}
            className="left-bar-pin"
            data-left-pin={userWidgetTabId(widget.id)}
            data-left-pin-kind="user-widget"
          >
            <button
              type="button"
              className="left-bar-button"
              aria-label={widget.name}
              title={widget.name}
              onClick={() => openLayout({
                id: userWidgetTabId(widget.id),
                label: widget.name,
                labelKey: `nav.layout.${userWidgetTabId(widget.id)}`,
              })}
            >
              <AppIcon name="layers" />
            </button>
            <span className="left-bar-pin-actions">
              <button
                type="button"
                className="left-bar-pin-action"
                data-pin-action="unpin"
                aria-label={t("取消固定 {0}", { 0: widget.name })}
                onClick={() => { void setUserWidgetPinned(userWidgetStore, widget.id, false); }}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3.5 3.5 5 5m0-5-5 5" /></svg>
              </button>
            </span>
          </span>
        ))}
      </div>

      <div className="left-bar-actions" data-left-actions>
        <button
          type="button"
          className="left-bar-button"
          data-left-action="widget-studio"
          aria-label={STUDIO_LABEL}
          title={STUDIO_LABEL}
          onClick={() => openLayout({ id: WIDGET_STUDIO_TAB_ID, label: STUDIO_LABEL, labelKey: 'nav.widgetStudio' })}
        >
          <svg className="left-bar-glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

/** 固定入口的图标：AppIcon 没有房子与齿轮字形，这两个在本栏自绘。 */
function EntryIcon({ entry }: { entry: LeftBarEntry }) {
  if (entry.icon === 'home') {
    return (
      <svg className="left-bar-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 4.5l8 7" />
        <path d="M6.5 9.8V19.5h11V9.8" />
        <path d="M10 19.5v-5h4v5" />
      </svg>
    );
  }
  if (entry.icon === 'settings') {
    return (
      <svg className="left-bar-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.2" strokeDasharray="2.1 1.5" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  const name = entry.icon === 'wiki' ? 'knowledge-filled' : entry.icon === 'skills' ? 'layers' : 'bookmark';
  return <AppIcon name={name} />;
}
