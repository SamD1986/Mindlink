import { useState } from 'react';
import { PLACEHOLDER_TABS, closeTab, neighborAfterClose, openTab, type WorkbenchTab } from './tabs.js';
import { WindowControls } from './window-controls.js';
import './styles.css';

/**
 * 上栏：标签页（一个标签 = 画布上的一份布局）＋ 窗口按钮。
 *
 * 空白处是窗口拖拽区（见 styles.css 的 -webkit-app-region），
 * 标签与按钮显式声明 no-drag，否则点不动。
 *
 * 标签状态目前由本栏自持；UI-05/UI-09 接入后提到 shell（容器）统一持有，
 * 因为"左栏点入口 → 上栏加标签"是跨栏协作，栏之间不许互相 import。
 */
export function TopBar() {
  const [tabs, setTabs] = useState<WorkbenchTab[]>(PLACEHOLDER_TABS);
  const [activeId, setActiveId] = useState<string | null>(PLACEHOLDER_TABS[0]?.id ?? null);

  const activate = (tab: WorkbenchTab) => {
    setTabs((current) => openTab(current, tab));
    setActiveId(tab.id);
  };

  const close = (id: string) => {
    setTabs((current) => {
      setActiveId((currentActive) => neighborAfterClose(current, currentActive, id));
      return closeTab(current, id);
    });
  };

  return (
    <header className="top-bar" data-bar="top">
      <div className="top-bar-tabs" role="tablist" aria-label="Open layouts">
        {tabs.map((tab) => (
          <span key={tab.id} className="top-bar-tab" data-tab={tab.id} data-active={tab.id === activeId}>
            <button
              type="button"
              role="tab"
              className="top-bar-tab-label"
              aria-selected={tab.id === activeId}
              onClick={() => activate(tab)}
            >
              {tab.label}
            </button>
            <button
              type="button"
              className="top-bar-tab-close"
              aria-label={`Close ${tab.label}`}
              onClick={() => close(tab.id)}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3.5 3.5 5 5m0-5-5 5" /></svg>
            </button>
          </span>
        ))}
      </div>
      <WindowControls />
    </header>
  );
}
