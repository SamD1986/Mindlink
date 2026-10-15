import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '../shared/app-icon.js';
import { useWorkspace } from '../shell/workspace.js';
import {
  FIXED_ENTRIES,
  createLocalPinStore,
  entryForLayout,
  movePin,
  pinLayout,
  unpinLayout,
  type LeftBarEntry,
} from './entries.js';
import './styles.css';

/**
 * 左栏：固定入口（Wiki / 技能与工具 / 设置）＋ 用户固定到左栏的布局。
 *
 * 点入口切换的是**画布布局**（开上栏标签），不是整页 —— 状态经 shell 的窗口状态通道，
 * 本栏不 import 上栏。pin 走 entries.ts 里的存储接缝（渲染层只有那一处碰存储）。
 */
export function LeftBar() {
  const { state, openLayout } = useWorkspace();
  const store = useMemo(() => createLocalPinStore(), []);
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void store.load().then((ids) => { if (alive) setPinned(ids); });
    return () => { alive = false; };
  }, [store]);

  const persist = (ids: string[]) => { setPinned(ids); void store.save(ids); };
  const labels = new Map(state.tabs.map((tab) => [tab.id, tab.label]));
  const pinnedEntries = pinned.map((id) => entryForLayout(id, labels.get(id) ?? id));
  const canPinActive = state.activeId !== null && !pinned.includes(state.activeId);

  return (
    <aside className="left-bar" data-bar="left">
      <nav className="left-bar-entries" aria-label="Pages">
        {FIXED_ENTRIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="left-bar-button"
            data-left-entry={entry.id}
            aria-label={entry.label}
            title={entry.label}
            onClick={() => openLayout({ id: entry.id, label: entry.label, labelKey: entry.labelKey })}
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
      </div>

      <button
        type="button"
        className="left-bar-button left-bar-pin-current"
        data-left-action="pin-current"
        aria-label="Pin current layout"
        title="Pin current layout"
        disabled={!canPinActive}
        onClick={() => { if (state.activeId) persist(pinLayout(pinned, state.activeId)); }}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2.5v7m-3-3 3 3 3-3" /></svg>
      </button>
    </aside>
  );
}

/** 固定入口的图标：AppIcon 里没有齿轮字形，设置的齿轮在本栏自绘。 */
function EntryIcon({ entry }: { entry: LeftBarEntry }) {
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
