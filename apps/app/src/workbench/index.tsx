import './styles.css';

/**
 * 画布：按布局文件摆放 widget 的区域。
 *
 * 网格引擎（格坐标 → 比例换算、吸附、resize 重排）见 UI-08；
 * 布局文件格式与加载见 UI-09。现在只是空槽位：占住舞台中央，
 * 用来验证四栏与画布互不干扰、窗口缩放不破版。
 */
export function Workbench() {
  return <main className="workbench" data-workbench-canvas />;
}
