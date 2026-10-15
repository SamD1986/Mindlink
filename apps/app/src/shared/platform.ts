/**
 * 平台判定：**渲染层唯一的判定处**。
 *
 * 为什么需要：macOS 用 `titleBarStyle: 'hiddenInset'`，系统红绿灯会压在顶栏左侧，
 * 必须给它让位；Windows 是 `frame: false` + 自绘按钮，不需要让位。
 *
 * 判定结果一次性写到 `<html data-os>` 上，让 CSS 直接分支；这样各处不必重复嗅探
 * userAgent，也让"让位多少"这件事只有一处可改。
 */
export type DesktopOs = 'mac' | 'win' | 'linux' | 'other';

export function detectOs(userAgent?: string): DesktopOs {
  const value = userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);
  if (/Mac|iPhone|iPad|iPod/i.test(value)) return 'mac';
  if (/Windows/i.test(value)) return 'win';
  if (/Linux|X11/i.test(value)) return 'linux';
  return 'other';
}

/** 在首屏渲染前调用：让 CSS 的 `[data-os='mac']` 规则从第一帧就生效。 */
export function applyPlatformAttribute(
  target: HTMLElement | undefined = typeof document === 'undefined' ? undefined : document.documentElement,
): DesktopOs {
  const os = detectOs();
  if (target) target.dataset.os = os;
  return os;
}
