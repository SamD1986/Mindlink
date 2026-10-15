import { AppIcon } from '../shared/app-icon.js';
import { useWorkspace } from '../shell/workspace.js';
import { PROJECT_SLOGAN, PROJECT_SLOGAN_EN, PROJECT_SLOGAN_ZH } from '../shared/brand.js';
import yuanpuSeal from '../../themes/assets/yuanpu-seal.png';
import './styles.css';
/**
 * 右栏：会话按钮（开合对话浮层）＋ 常驻品牌字标。
 *
 * 品牌区竖排（中文 → 英文 → 印章），贴在右栏底部 —— 与 yuanpu2.0 欢迎页右缘的
 * 竖排字标同构。LOGO 在所有布局下都常驻、不随布局或主题消失 —— 它是用户的定位锚点。
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
        <span aria-hidden="true" className="right-bar-brand-line right-bar-brand-zh">
          {PROJECT_SLOGAN_ZH}
        </span>
        <span aria-hidden="true" className="right-bar-brand-line right-bar-brand-en">
          {PROJECT_SLOGAN_EN}
        </span>
        <img src={yuanpuSeal} alt={PROJECT_SLOGAN} />
      </div>
    </aside>
  );
}
