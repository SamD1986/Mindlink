import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConnectionManagement } from '../management.js';
import { ModelSettingsPanel } from './model-settings.js';
import { HotkeySettingsPanel } from './hotkey-settings.js';
import { TailscaleSettingsPanel } from './tailscale-settings.js';
import { applyThemePreference, readThemePreference, type RendererTheme } from '../../components/composites/theme-preference.js';
import {
  applyFontPreference,
  readFontPreference,
  FONT_CONTENT_SIZES,
  type FontFamilyPreset,
  type FontPreference,
  type FontUiScale,
} from '../../components/composites/font-preference.js';
import { t } from '../../languages/index.js';

const UI_SCALE_OPTIONS: Array<{ id: FontUiScale; label: string }> = [
  { id: 'compact', label: t("紧凑 90%") },
  { id: 'standard', label: t("标准 100%") },
  { id: 'large', label: t("大 110%") },
  { id: 'xlarge', label: t("特大 125%") },
];

const CONTENT_SIZE_LABELS: Record<number, string> = { 13: t("小 13"), 14: t("标准 14"), 15: t("大 15"), 16: t("特大 16"), 17: t("超大 17") };

const CONTENT_SIZE_OPTIONS = FONT_CONTENT_SIZES.map((size) => ({ size, label: CONTENT_SIZE_LABELS[size] ?? String(size) }));

const FONT_FAMILY_OPTIONS: Array<{ id: FontFamilyPreset; label: string }> = [
  { id: 'system', label: t("系统默认") },
  { id: 'pingfang', label: t("苹方·思源黑体") },
  { id: 'yahei', label: t("微软雅黑") },
  { id: 'songti', label: t("宋体（衬线）") },
  { id: 'custom', label: t("自定义…") },
];

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SettingsPage({ active, configRoot }: { active: boolean; configRoot: string }) {
  const [searchParams] = useSearchParams();
  const [section, setSection] = useState<'general' | 'models' | 'connections' | 'tailscale' | 'hotkeys'>('general');
  useEffect(() => {
    if (active && searchParams.get('section') === 'connections') setSection('connections');
  }, [active, searchParams]);
  const [theme, setTheme] = useState<RendererTheme>(readThemePreference);
  const selectTheme = (nextTheme: RendererTheme) => {
    applyThemePreference(nextTheme);
    setTheme(nextTheme);
  };
  const [font, setFont] = useState<FontPreference>(readFontPreference);
  const selectFont = (nextPreference: FontPreference) => {
    applyFontPreference(nextPreference);
    setFont(nextPreference);
  };
  return <section className={`settings-page ${active ? '' : 'view-hidden'}`} aria-hidden={!active}>
    <aside className="settings-navigation"><span className="eyebrow">MINDLINK / SETTINGS</span><h1>{t("设置")}</h1>
      <button type="button" className={section === 'general' ? 'selected' : ''} onClick={() => setSection('general')}>{t("通用")}</button>
      <button type="button" className={section === 'models' ? 'selected' : ''} onClick={() => setSection('models')}>{t("模型")}</button>
      <button type="button" className={section === 'hotkeys' ? 'selected' : ''} onClick={() => setSection('hotkeys')}>{t("快捷键")}</button>
      <button type="button" className={section === 'connections' ? 'selected' : ''} onClick={() => setSection('connections')}>{t("企业微信连接")}</button>
      <button type="button" className={section === 'tailscale' ? 'selected' : ''} onClick={() => setSection('tailscale')}>Tailscale</button>
    </aside>
    <div className="settings-content">
      <div className={`settings-general ${section === 'general' ? '' : 'view-hidden'}`} aria-hidden={section !== 'general'}><h2>{t("通用")}</h2>
        <div className="theme-setting"><h3>{t("界面主题")}</h3><p>{t("选择界面配色。MindLink 为临时测试主题。")}</p>
          <div className="theme-options" role="group" aria-label={t("界面主题")}>
            <button type="button" aria-pressed={theme === 'mindlink-light'} onClick={() => selectTheme('mindlink-light')}>{t("浅色")}</button>
            <button type="button" aria-pressed={theme === 'mindlink-dark'} onClick={() => selectTheme('mindlink-dark')}>{t("深色")}</button>
            <button type="button" aria-pressed={theme === 'mindlink'} onClick={() => selectTheme('mindlink')}>{t("MindLink 测试主题")}</button>
          </div>
        </div>
        <div className="theme-setting"><h3>{t("界面字体大小")}</h3><p>{t("仅缩放界面文字，不影响聊天正文；档位不改变布局尺寸。")}</p>
          <div className="theme-options" role="group" aria-label={t("界面字体大小")}>
            {UI_SCALE_OPTIONS.map((option) => <button key={option.id} type="button" aria-pressed={font.uiScale === option.id}
              onClick={() => selectFont({ ...font, uiScale: option.id })}>{option.label}</button>)}
          </div>
        </div>
        <div className="theme-setting"><h3>{t("正文字体大小")}</h3><p>{t("调整聊天消息正文、输入框及其标题、表格等衍生文字。")}</p>
          <div className="theme-options" role="group" aria-label={t("正文字体大小")}>
            {CONTENT_SIZE_OPTIONS.map((option) => <button key={option.size} type="button" aria-pressed={font.contentSize === option.size}
              onClick={() => selectFont({ ...font, contentSize: option.size })}>{option.label}</button>)}
          </div>
        </div>
        <div className="theme-setting"><h3>{t("界面字型")}</h3><p>{t("选择界面与正文使用的字体族；自定义可填入浏览器可识别的 font-family 值。")}</p>
          <div className="font-family-row">
            <select aria-label={t("界面字型")} value={font.fontFamily}
              onChange={(event) => selectFont({ ...font, fontFamily: event.target.value as FontFamilyPreset })}>
              {FONT_FAMILY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            {font.fontFamily === 'custom' && <input aria-label={t("自定义字型")} value={font.customFontFamily}
              placeholder={t("例如 'PingFang SC', sans-serif")}
              onChange={(event) => selectFont({ ...font, customFontFamily: event.target.value })} />}
          </div>
        </div>
        <p>{t("当前配置目录")}</p><code>{configRoot}</code>
        <p>{t("运行状态、更新与权限仍由桌面应用和 Runtime 管理。")}</p></div>
      <div className={`settings-connections ${section === 'connections' ? '' : 'view-hidden'}`} aria-hidden={section !== 'connections'}>
        <ConnectionManagement active={active && section === 'connections'} />
      </div>
      <div className={`settings-models-view ${section === 'models' ? '' : 'view-hidden'}`} aria-hidden={section !== 'models'}>
        <ModelSettingsPanel active={active && section === 'models'} />
      </div>
      <div className={`settings-tailscale-view ${section === 'tailscale' ? '' : 'view-hidden'}`} aria-hidden={section !== 'tailscale'}>
        <TailscaleSettingsPanel active={active && section === 'tailscale'} configRoot={configRoot} />
      </div>
      <div className={section === 'hotkeys' ? '' : 'view-hidden'} aria-hidden={section !== 'hotkeys'}>
        <HotkeySettingsPanel active={active && section === 'hotkeys'} />
      </div>
    </div>
  </section>;
}
