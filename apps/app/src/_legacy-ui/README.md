# 旧 UI 归档（_legacy-ui）

这里是**旧 UI 的快照**：重构前的渲染层布局与页面实现，整体搬进来保留可查阅形态。

**它不参与构建，也不参与类型检查**（`apps/app/tsconfig.json` 已 `exclude` 本目录，
`vite` 只从 `src/main.tsx` 入口打包），所以：

- IDE 里出现报红**属正常** —— 归档件引用的旧路径可能已经搬走或改名。
- 不要在这里继续开发。需要复用某个旧件时，**逐个搬出到新位置并改名**，
  按 [渲染层架构](../../ARCHITECTURE.md) 的目录约定落位。

## 内容对照

| 归档项 | 原位置 | 新位置 / 归属 |
| --- | --- | --- |
| `shell/` | `src/shell/` | 新的 `src/shell/`（容器，只有四条栏与画布槽）见 UI-02 |
| `modules/` | `src/modules/` | 各页在 UI-13 逐个包装成 widget 搬入 `src/components/widgets/` |
| `composition/` | `src/composition/` | 页面目录被"布局文件 + widget"取代，见 UI-09 / UI-16 |
| `ui-registry.ts` | `src/ui-registry.ts` | 类型接缝暂留 `src/shared/ui-destination.ts`；注册表本身不再使用 |
| `styles.css` / `muse-theme.css` / `management.tsx` / `management.css` | `src/` | 样式在 UI-14 收编进 `src/theme/`；定时任务页在 UI-13 变成 widget |
| `emo.ts` | `src/emo.ts` | 品牌与文案分别由 UI-06（品牌）与 UI-15（语言包）接管 |

## 两处**没有**归档的例外（有意为之）

- **`src/modules/work-tree-model.ts` → 已搬到 `src/components/widgets/work-tree/work-tree-model.ts`。**
  它是被 `test/work-tree-model.test.mjs` 覆盖的**纯模型**（只依赖协议类型），属资产而非布局，
  留在归档区会让这条测试失去目标。它最终就是工作树 widget 的模型。
- **`apps/app/emo.json` 仍留在原处。** 它不只是渲染层的文案与导航开关，还被
  **桌面壳跨包消费**：`apps/desktop/src/main.ts`（窗口标题、应用名、图标）、
  `apps/desktop/scripts/prepare-emo-icon.mjs`（生成安装包图标）、
  `apps/desktop/electron-builder.yml`（打进产物）。删除它必须和 `apps/desktop` 协同改，不能算 UI 一处的事。

## 两个旧机核

`test/composition-boundary.test.mjs`、`test/ui-registry.test.mjs` 已移入
`apps/app/test/_legacy/`（`test/*.test.mjs` 的 glob 不再包含它们）。
它们守的是旧结构关系，新结构下由 `test/shell-layout.test.mjs`、
`test/no-legacy-imports.test.mjs` 接管；按卡片要求，这些机核是**重写**而不是删除。
