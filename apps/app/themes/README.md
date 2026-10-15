# MindLink renderer theme

`tokens.css` defines the built-in light palette. `dark.css` supplies the built-in dark palette, and `mindlink.css` supplies the optional MindLink test theme. The test theme uses the MindLink seal and xuan-paper tile from the local `yuanpu2.0/hermes-agent` desktop project. Import the palette overrides after component CSS:

```ts
import '../themes/tokens.css';
import './muse-theme.css';
import '../themes/mindlink.css';
import '../themes/dark.css';
```

Use `var(--yp-…)` in renderer CSS. The renderer's Settings page saves the selected theme in local storage and restores it on launch.

The assistant panel uses `--yp-assistant-gradient-start/middle/end` for its vertical background and `--yp-assistant-card-surface` for translucent cards. All three palettes define these tokens. `--yp-on-accent` supplies readable text on primary actions. Chat messages and the toolbar retain the shared work-page tokens.

## Typography tokens

`tokens.css` also declares the palette-independent typography defaults shared by all three themes: `--yp-font-family` (UI and content font stack), `--yp-font-scale-ui` (interface text scale factor applied to the root font size), and `--yp-font-size-content` (chat content text size). Component CSS must consume these tokens instead of hardcoding `px` font sizes; interface chrome text uses `rem` so it follows the root scale, while chat content rules derive from `--yp-font-size-content` with `calc()` ratios so content and interface scale independently. The Settings page persists the user's font preference in local storage and re-applies it on launch as inline custom properties on `<html>`, which override these defaults for all themes. `theme-contract.test.mjs` guards both the token declarations and the no-hardcoded-px rule.

Run `pnpm --filter @mindlink-agent/app theme:export` to copy this disposable test theme into `~/.mindlink/themes/mindlink-test/`. An optional path argument exports elsewhere. The directory contains `theme.json`, `tokens.css`, `theme.css`, `logo.png`, and `xuan-paper-tile.jpg`. The running renderer uses the bundled files in `apps/app/themes`; this exported snapshot is for inspection and future theme loading work. Delete the directory after testing without affecting the app.

## Token 分组

`tokens.css` 聚合了五个分组文件，每组负责不同的视觉层级：

- **`tokens/skeleton.css`**：骨架层 — 应用外壳、侧边栏、画布表面与边框（`--yp-app-backdrop`, `--yp-sidebar-surface`, `--yp-canvas-surface`, `--yp-canvas-grid-color`, `--yp-border-*`）
- **`tokens/page.css`**：页面层 — 页面表面、文本与交互状态（`--yp-surface-*`, `--yp-text-*`, `--yp-action-hover`）
- **`tokens/component.css`**：组件层 — 强调色、用户气泡、助手渐变与状态色（`--yp-accent-*`, `--yp-user-*`, `--yp-assistant-*`, `--yp-success`）
- **`tokens/brand.css`**：品牌层 — 品牌字标字体与墨色（`--yp-font-brand-*`, `--yp-brand-ink`）；**这些 token 不可被主题覆盖**，确保品牌标识在所有主题下保持一致
- **`tokens/typography.css`**：字体层 — 字体族、界面缩放与内容字号（`--yp-font-family`, `--yp-font-scale-ui`, `--yp-font-size-content`）

主题文件（`mindlink.css` 和 `dark.css`）只覆盖骨架、页面和组件层的 token，不触碰品牌层。

## 主题包格式

第三方主题包是一个包含以下文件的目录：

- **`manifest.json`**：主题元数据
  ```json
  {
    "name": "Autumn Forest",
    "id": "autumn-forest",
    "author": "Jane Doe",
    "version": "1.0.0",
    "description": "Warm autumn palette with forest accents"
  }
  ```
- **`theme.css`**：主题覆盖文件，只覆盖允许的 token（骨架、页面、组件层）
  ```css
  :root[data-mindlink-theme='autumn-forest'] {
    --yp-app-backdrop: #f5e6d3;
    --yp-accent: #d4845a;
    /* ... 其他 token 覆盖 */
  }
  ```
- **可选资源**：`logo.png`、背景纹理等

**约束**：
- 主题包不得覆盖品牌 token（`--yp-brand-ink`, `--yp-font-brand-*`）
- 主题包不得引入新的 token 名称，只能覆盖已声明的 token
- 加载机制留待后续实现（本卡只定义格式）
