import { useMemo, type CSSProperties } from 'react';
import { useWorkspace } from '../shell/workspace.js';
import { cellSize, rectToPixels } from './grid/geometry.js';
import { useCanvasSize } from './grid/use-canvas-size.js';
import { loadBuiltinLayouts, WIDGET_REGISTRY } from './layouts/builtin.js';
import { WidgetPlaceholder } from './widget-placeholder.js';
import { WorkbenchBackdrop } from './workbench-backdrop.js';
import { WorkbenchBrand } from './workbench-brand.js';
import '../../themes/fit-text.css';
import './styles.css';

/**
 * 画布：背景层（永远显示）+ 品牌字标（空态）+ widget 容器（有布局时）。
 *
 * 新结构（2026-10-15）：
 * - 背景层（WorkbenchBackdrop）永远显示，四层堆叠（底色+纹理+墨洗+网格），跟随主题
 * - 品牌字标（WorkbenchBrand）在无布局或空布局时显示，叠在背景上方
 * - widget 容器在有布局时显示，渲染占位 widget
 *
 * 布局来自 `layouts/`（UI-09），网格换算见 `grid/geometry.ts`（UI-08）。
 */
export function Workbench() {
  const { state } = useWorkspace();
  const [ref, size] = useCanvasSize<HTMLElement>();
  const { layouts, errors } = useMemo(() => loadBuiltinLayouts(WIDGET_REGISTRY), []);
  const registry = useMemo(() => new Map(WIDGET_REGISTRY.map((spec) => [spec.id, spec])), []);

  const layout = state.activeId ? layouts.get(state.activeId) : undefined;
  const ready = layout !== undefined && size.width > 0 && size.height > 0;
  const cell = ready ? cellSize(layout.grid, size) : undefined;
  const showBrand = !layout || (layout && layout.widgets.length === 0);

  return (
    <main className="workbench" data-workbench-canvas ref={ref}>
      {/* 背景层：永远显示 */}
      <WorkbenchBackdrop />

      {/* 品牌字标：无布局或空布局时显示 */}
      {showBrand && <WorkbenchBrand />}

      {/* Widget 容器：有布局时显示 */}
      {ready && cell && (
        <>
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
