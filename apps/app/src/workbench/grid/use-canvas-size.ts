import { useEffect, useRef, useState } from 'react';
import type { CanvasSize } from './geometry.js';

/**
 * 量画布的实际尺寸（CSS px）。
 *
 * 用 ResizeObserver 而不是 window.resize：画布尺寸会被四条栏的变化影响，
 * 窗口没变也可能变。getBoundingClientRect/clientWidth 已是 CSS px，
 * **不要再乘 devicePixelRatio**。
 */
export function useCanvasSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}
