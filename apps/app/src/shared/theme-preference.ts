export type RendererTheme = 'mindlink-light' | 'mindlink-dark' | 'mindlink';

const storageKey = 'mindlink:theme:v1';

export function readThemePreference(): RendererTheme {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === 'mindlink' || stored === 'mindlink-dark' ? stored : 'mindlink-light';
  } catch {
    return 'mindlink-light';
  }
}

export function applyThemePreference(theme: RendererTheme): void {
  document.documentElement.dataset.mindlinkTheme = theme;
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // The theme still applies for this session when storage is unavailable.
  }
}
