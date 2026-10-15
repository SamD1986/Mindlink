import './styles.css';

/**
 * 左栏：Wiki / 技能与工具 / 设置 ＋ 用户 pin 的 dashboard 入口（内容见 UI-05）。
 * 点击入口切换的是 workbench 的布局，不是整页。
 */
export function LeftBar() {
  return <aside className="left-bar" data-bar="left" />;
}
