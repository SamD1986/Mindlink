/**
 * 画布背景层（四层堆叠，跟随主题，yuanpu2.0 口径）。
 *
 * 从底到顶：
 *   1. 底色（#F9F8F5 宣纸白，防玻璃模式下透明）
 *   2. 宣纸纹理（400×400 平铺，opacity 0.14）
 *   3. 墨洗渐变（左上冷蓝+右下暖赭，opacity 0.09）
 *   4. 48px 网格线（仅编辑模式，现在占位、不显示）
 */
export function WorkbenchBackdrop() {
  return (
    <div className="workbench-backdrop" aria-hidden>
      {/* 1. 宣纸白底色（硬编码 #F9F8F5，防玻璃模式覆盖 token） */}
      <div className="workbench-backdrop-ground" />

      {/* 2. 宣纸纹理（400×400 平铺，opacity 0.14） */}
      <div className="workbench-backdrop-texture" />

      {/* 3. 墨洗渐变（左上冷蓝 + 右下暖赭，opacity 0.09） */}
      <div className="workbench-backdrop-wash" />

      {/* 4. 编辑网格（48px 蓝色发丝线，现在不显示，UI-16 补） */}
      <div className="workbench-backdrop-grid" data-edit-mode="false" />
    </div>
  );
}
