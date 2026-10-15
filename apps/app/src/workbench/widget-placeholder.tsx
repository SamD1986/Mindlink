import type { PixelBox } from './grid/geometry.js';
import type { WidgetInstance, WidgetSpec } from './layouts/format.js';

/**
 * widget 的占位渲染：一只带标题的格子。
 *
 * 真实实现留给 UI-13（旧页面包成整页 widget）与 UI-16（DSL 解释器）。
 * 位置与尺寸全部来自网格换算，本组件不接受 px 常量。
 */
export function WidgetPlaceholder({ instance, spec, box }: {
  instance: WidgetInstance;
  spec: WidgetSpec;
  box: PixelBox;
}) {
  return (
    <section
      className="workbench-widget"
      data-widget={spec.id}
      data-widget-instance={instance.id}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    >
      <header className="workbench-widget-title">
        <span>{spec.placeholderTitle}</span>
        <span className="workbench-widget-grid" aria-hidden="true">
          {instance.rect.x},{instance.rect.y} · {instance.rect.w}×{instance.rect.h}
        </span>
      </header>
    </section>
  );
}
