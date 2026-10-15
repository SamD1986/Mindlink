import { useState, type FormEvent } from 'react';

import { AppIcon } from '../../composites/app-icon.js';
import { normalizeAddressInput, type BrowserViewState } from './browser-state.js';
import { t } from '../../../languages/index.js';

/** Address bar and navigation controls; drives the webview directly (zcode BrowserToolbar port). */
export function BrowserToolbar({ state, disabled, onNavigate, onBack, onForward, onReload, onOpenExternal }: {
  state: BrowserViewState;
  disabled?: boolean;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onOpenExternal: (url: string) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const value = draft ?? (state.url === 'about:blank' ? '' : state.url);

  function submit(event: FormEvent) {
    event.preventDefault();
    const url = normalizeAddressInput(value);
    if (!url) return;
    setDraft(undefined);
    onNavigate(url);
  }

  return <form className="browser-toolbar" onSubmit={submit} role="search" aria-label={t("浏览器控制")}>
    <button type="button" className="browser-nav-button browser-nav-back" title={t("后退")} aria-label={t("后退")} disabled={disabled || !state.canGoBack}
      onClick={onBack}><AppIcon name="chevron" /></button>
    <button type="button" className="browser-nav-button" title={t("前进")} aria-label={t("前进")}
      disabled={disabled || !state.canGoForward} onClick={onForward}><AppIcon name="chevron" /></button>
    <button type="button" className={`browser-nav-button ${state.isLoading ? 'browser-reloading' : ''}`} title={state.isLoading ? t("停止") : t("重新加载")}
      aria-label={state.isLoading ? t("停止") : t("重新加载")} disabled={disabled} onClick={onReload}><AppIcon name="refresh" /></button>
    <input className="browser-address" type="text" spellCheck={false} autoComplete="off"
      aria-label={t("地址栏")} placeholder={t("输入网址（http(s)）")} value={value} disabled={disabled}
      onChange={(event) => setDraft(event.target.value)} />
    {state.url && <button type="button" className="browser-nav-button" title={t("在系统浏览器中打开")} aria-label={t("在系统浏览器中打开")}
      disabled={disabled} onClick={() => onOpenExternal(state.url)}><AppIcon name="expand" /></button>}
  </form>;
}
