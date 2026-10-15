/**
 * workbench 网格几何（纯函数，便于机核）。
 *
 * 核心口径（见 ARCHITECTURE「workbench 网格语义」）：
 * - **5×5px 是基准分辨率下的吸附粒度，不是运行时单位。** 布局文件只存格坐标
 *   （如 96×54 格），像素由画布尺寸按比例换算 —— 所以任何窗口尺寸下相对位置一致。
 * - **一律用 CSS px 的相对比例，禁止自己乘 devicePixelRatio**：getBoundingClientRect
 *   已经是 CSS px，再乘 DPR 会在缩放时漂。
 * - resize 只重算像素，**不改写布局数据**。
 */
export type GridSpec = { columns: number; rows: number };
export type GridRect = { x: number; y: number; w: number; h: number };
export type CanvasSize = { width: number; height: number };
export type PixelBox = { left: number; top: number; width: number; height: number };

/** 吸附粒度 5px 是按这个画布宽度定义的；换个宽度就按比例缩放。 */
export const REFERENCE_WIDTH_PX = 1440;
export const BASE_SNAP_PX = 5;

export function cellSize(spec: GridSpec, canvas: CanvasSize): { width: number; height: number } {
  return { width: canvas.width / spec.columns, height: canvas.height / spec.rows };
}

/** 一个基准吸附步长等于多少"格"：画布越大，5px 相对越小于一格。 */
export function snapStepGrid(spec: GridSpec, canvas: CanvasSize, basePx = BASE_SNAP_PX): number {
  const scale = canvas.width / REFERENCE_WIDTH_PX;
  return (basePx * scale) / cellSize(spec, canvas).width;
}

/** 格坐标 → 像素框。纯乘法，无隐藏状态；尺寸变化时重算即可，不动数据。 */
export function rectToPixels(rect: GridRect, spec: GridSpec, canvas: CanvasSize): PixelBox {
  const cell = cellSize(spec, canvas);
  return {
    left: rect.x * cell.width,
    top: rect.y * cell.height,
    width: rect.w * cell.width,
    height: rect.h * cell.height,
  };
}

/** 换算成"占画布的比例"：用来检验不同画布尺寸下相对位置是否一致。 */
export function normalizeBox(box: PixelBox, canvas: CanvasSize): PixelBox {
  return {
    left: box.left / canvas.width,
    top: box.top / canvas.height,
    width: box.width / canvas.width,
    height: box.height / canvas.height,
  };
}

export function fits(rect: GridRect, spec: GridSpec): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0
    && rect.x + rect.w <= spec.columns && rect.y + rect.h <= spec.rows;
}

export function overlaps(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 越界/过小都往回收：先保证不小于最小尺寸，再保证不越出画布。 */
export function clampRect(rect: GridRect, spec: GridSpec, min: { w: number; h: number }): GridRect {
  const w = Math.min(Math.max(rect.w, min.w), spec.columns);
  const h = Math.min(Math.max(rect.h, min.h), spec.rows);
  return {
    x: Math.min(Math.max(rect.x, 0), spec.columns - w),
    y: Math.min(Math.max(rect.y, 0), spec.rows - h),
    w,
    h,
  };
}

/** 吸附到基准步长；步长过细时（画布很大）不细于 1/4 格，避免拖动时抖动。 */
export function snapRect(rect: GridRect, spec: GridSpec, canvas: CanvasSize, basePx = BASE_SNAP_PX): GridRect {
  const step = Math.max(snapStepGrid(spec, canvas, basePx), 0.25);
  const snap = (value: number) => Math.round(value / step) * step;
  return {
    x: snap(rect.x),
    y: snap(rect.y),
    w: Math.max(snap(rect.w), step),
    h: Math.max(snap(rect.h), step),
  };
}
