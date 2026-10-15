import { useMemo, type CSSProperties } from 'react';
import { useWorkspace } from '../shell/workspace.js';
import { cellSize, rectToPixels } from './grid/geometry.js';
import { useCanvasSize } from './grid/use-canvas-size.js';
import { WIDGET_REGISTRY, loadBuiltinLayouts } from './layouts/builtin.js';
import { WidgetPlaceholder } from './widget-placeholder.js';
import './styles.css';

/**
 * 画布：按**当前布局**摆放 widget。
 *
 * - 布局文件来自 `layouts/`（UI-09），本地数据、加载期校验、不做动态 import；
 * - 网格换算见 `grid/geometry.ts`（UI-08）：只存格坐标，像素按画布尺寸按比例算，
 *   resize 只重算像素、不改写布局数据；
 * - widget 的真实实现、拖拽摆放与用户自建布局在 UI-13/UI-16/UI-17。
 */
export function Workbench() {
  const { state } = useWorkspace();
  const [ref, size] = useCanvasSize<HTMLElement>();
  const { layouts, errors } = useMemo(() => loadBuiltinLayouts(WIDGET_REGISTRY), []);
  const registry = useMemo(() => new Map(WIDGET_REGISTRY.map((spec) => [spec.id, spec])), []);

  const layout = state.activeId ? layouts.get(state.activeId) : undefined;
  const ready = layout !== undefined && size.width > 0 && size.height > 0;
  const cell = ready ? cellSize(layout.grid, size) : undefined;

  return (
    <main className="workbench" data-workbench-canvas ref={ref}>
      {!layout && (
        <p className="workbench-empty" data-workbench-empty>
          No layout open — pick one on the left bar
        </p>
      )}

      {ready && cell && (
        <>
          <div
            className="workbench-gridlines"
            data-workbench-gridlines
            style={{
              '--grid-cell-w': `${cell.width}px`,
              '--grid-cell-h': `${cell.height}px`,
            } as CSSProperties}
          />
          {layout.widgets.map((instance) => {
            const spec = registry.get(instance.widget);
            if (!spec) return null;
            return (
              <WidgetPlaceholder
                key={instance.id}
                instance={instance}
                spec={spec}
                box={rectToPixels(instance.rect, layout.grid, size)}
              />
            );
          })}
        </>
      )}

      {errors.length > 0 && (
        <p className="workbench-error" data-workbench-error>{errors.join(' / ')}</p>
      )}
    </main>
  );
}
