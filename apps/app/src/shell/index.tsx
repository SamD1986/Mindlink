import { BottomBar } from '../bottom-bar/index.js';
import { LeftBar } from '../left-bar/index.js';
import { RightBar } from '../right-bar/index.js';
import { TopBar } from '../top-bar/index.js';
import { Workbench } from '../workbench/index.js';
import { WorkspaceProvider } from './workspace.js';
import './layout.css';

/**
 * 窗口容器：四条栏（上/下/左/右）＋ 中央画布。
 *
 * 只负责位置关系与**窗口级共享状态**：不含业务、不读数据、不知道栏里放了什么。
 * 栏之间互不影响 —— 增删或替换任一条栏都不需要改动其它栏；
 * 跨栏协作（左栏开标签、右栏开合对话）统一经这里的状态通道。
 */
export function Shell() {
  return (
    <WorkspaceProvider>
      <div className="shell" data-shell-root>
        <TopBar />
        <LeftBar />
        <Workbench />
        <RightBar />
        <BottomBar />
      </div>
    </WorkspaceProvider>
  );
}
