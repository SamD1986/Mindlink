import './styles.css';

/**
 * 下栏：占位。
 *
 * 参与舞台布局但不吞事件：整条栏 `pointer-events: none`，
 * 槽位内部再 `auto` 显式开启 —— 这样空着的时候不会挡住画布，
 * 将来放状态/进度条时又能点。
 */
export function BottomBar() {
  return (
    <footer className="bottom-bar" data-bar="bottom">
      <div className="bottom-bar-slot" data-bottom-slot />
    </footer>
  );
}
