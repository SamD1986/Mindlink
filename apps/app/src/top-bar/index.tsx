import { useWorkspace } from '../shell/workspace.js';
import { WindowControls } from './window-controls.js';
import './styles.css';

/**
 * 上栏：标签页（一个标签 = 画布上的一份布局）＋ 窗口按钮。
 *
 * 标签状态在 shell 的窗口状态里（左栏点入口要能加标签），本栏只渲染与派发。
 * 空白处是窗口拖拽区（见 styles.css 的 -webkit-app-region），
 * 标签与按钮显式声明 no-drag，否则点不动。
 */
export function TopBar() {
  const { state, openLayout, closeLayout } = useWorkspace();

  return (
    <header className="top-bar" data-bar="top">
      <div className="top-bar-tabs" role="tablist" aria-label="Open layouts">
        {state.tabs.map((tab) => (
          <span key={tab.id} className="top-bar-tab" data-tab={tab.id} data-active={tab.id === state.activeId}>
            <button
              type="button"
              role="tab"
              className="top-bar-tab-label"
              aria-selected={tab.id === state.activeId}
              onClick={() => openLayout(tab)}
            >
              {tab.label}
            </button>
            <button
              type="button"
              className="top-bar-tab-close"
              aria-label={`Close ${tab.label}`}
              onClick={() => closeLayout(tab.id)}
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
