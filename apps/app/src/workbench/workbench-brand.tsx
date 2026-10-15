import { type CSSProperties } from 'react';
import { PROJECT_SLOGAN, PROJECT_SLOGAN_EN, PROJECT_SLOGAN_ZH } from '../shared/brand.js';
import yuanpuSeal from '../../themes/assets/yuanpu-seal.png';

/**
 * 画布品牌字标（空态时显示，叠在背景上方）。
 *
 * 条件：无布局或空布局时显示。
 * 布局与字体处理沿用 yuanpu2.0 欢迎页：
 * - 印章居中，宽 13.2%
 * - 中文一行（思源宋体子集，bold，宽 40%，`.fit-text` 自适应字号，tracking 0.08em）
 * - 英文一行（Cormorant，逐字母 span，`justify-between` 撑到同宽，字号 3.3cqi，左右各留 1.27cqi 内缩对齐中文墨边）
 * - 中文行渲染两份（第二份 `aria-hidden`，legacy 样式兼容）
 *
 * 容器查询 + `.fit-text` 让文字铺满容器而不溢出，无 resize 监听、无测量循环。
 */
export function WorkbenchBrand() {
  return (
    <div
      className="workbench-brand"
      data-workbench-state="empty"
      aria-label="No layout open"
    >
      <div className="workbench-brand-wordmark">
        <img
          alt=""
          draggable={false}
          src={yuanpuSeal}
          className="workbench-brand-seal"
        />
        <p
          aria-label={PROJECT_SLOGAN}
          className="workbench-brand-zh fit-text"
          style={{ '--fit-min': '2.75rem' } as CSSProperties}
        >
          <span>
            <span>{PROJECT_SLOGAN_ZH}</span>
          </span>
          <span aria-hidden="true">{PROJECT_SLOGAN_ZH}</span>
        </p>
        <div
          aria-hidden="true"
          className="workbench-brand-en"
        >
          {Array.from(PROJECT_SLOGAN_EN).map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
