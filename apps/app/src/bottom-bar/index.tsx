import './styles.css';

/**
 * 下栏：占位（内容见 UI-07）。
 * 参与舞台布局但不能吞掉画布的指针事件，也不得让画布无法铺满。
 */
export function BottomBar() {
  return <footer className="bottom-bar" data-bar="bottom" />;
}
