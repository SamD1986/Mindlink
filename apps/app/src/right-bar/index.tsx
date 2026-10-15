import mindlinkSeal from '../../themes/assets/mindlink-seal.png';
import { AppIcon } from '../shared/app-icon.js';
import { useWorkspace } from '../shell/workspace.js';
import './styles.css';

/**
 * 右栏：会话按钮（开合对话浮层）＋ 常驻 LOGO。
 *
 * LOGO 在所有布局下都常驻、不随布局或主题消失 —— 它是用户的定位锚点。
 * 会话浮层本体在 `chatbox/`（UI-11），这里只负责开合。
 */
export function RightBar() {
  const { state, toggleChatbox } = useWorkspace();

  return (
    <aside className="right-bar" data-bar="right">
      <button
        type="button"
        className="right-bar-button"
        data-right-action="conversations"
        aria-label="Conversations"
        title="Conversations"
        aria-pressed={state.chatboxOpen}
        onClick={toggleChatbox}
      >
        <AppIcon name="panel" />
      </button>
      <div className="right-bar-brand" data-brand-logo>
        <img src={mindlinkSeal} alt="MindLink" />
      </div>
    </aside>
  );
}
