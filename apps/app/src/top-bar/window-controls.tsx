import { useEffect, useState } from 'react';

/**
 * 窗口按钮（最小化/最大化/关闭）。
 *
 * - Windows/Linux：系统标题栏已被隐藏（`frame: false`），这里就是唯一的窗口按钮。
 * - macOS：系统红绿灯由 Electron 保留（`hiddenInset`），整块不渲染，避免两套控件。
 * - 在普通浏览器里打开（vite 直开、没有 `window.mindlink`）时按钮可用但不做事，
 *   不抛错——渲染层的验收常常在浏览器里做。
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const bridge = window.mindlink;
    if (!bridge?.isWindowMaximized) return;
    let disposed = false;
    void bridge.isWindowMaximized().then((value) => { if (!disposed) setMaximized(value); });
    const unsubscribe = bridge.onWindowMaximizeChanged?.((value) => setMaximized(value));
    return () => { disposed = true; unsubscribe?.(); };
  }, []);

  if (isMacPlatform()) return null;

  const invoke = (run: () => Promise<unknown> | undefined) => () => { void run(); };

  return (
    <div className="top-bar-window-controls" data-window-controls>
      <button
        type="button"
        className="window-control"
        data-window-action="minimize"
        aria-label="Minimize window"
        title="Minimize window"
        onClick={invoke(() => window.mindlink?.minimizeWindow())}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7" /></svg>
      </button>
      <button
        type="button"
        className="window-control"
        data-window-action="toggle-maximize"
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
        title={maximized ? 'Restore window' : 'Maximize window'}
        onClick={invoke(() => window.mindlink?.toggleMaximizeWindow())}
      >
        {maximized
          ? <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="4.5" width="5" height="5" rx="1" /><path d="M4.5 4.5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1.5" /></svg>
          : <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1" /></svg>}
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        data-window-action="close"
        aria-label="Close window"
        title="Close window"
        onClick={invoke(() => window.mindlink?.closeWindow())}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3l-6 6" /></svg>
      </button>
    </div>
  );
}

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
}
