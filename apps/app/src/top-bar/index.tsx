import { WindowControls } from './window-controls.js';
import './styles.css';

/**
 * 上栏：窗口控制按钮（最小化 / 最大化 / 关闭）。
 *
 * 标签页功能已移除（2026-10-15 用户需求），本栏只留窗口按钮。
 * 空白处是窗口拖拽区（见 styles.css 的 -webkit-app-region），
 * 按钮显式声明 no-drag，否则点不动。
 */
export function TopBar() {
  return (
    <header className="top-bar" data-bar="top">
      <WindowControls />
    </header>
  );
}
