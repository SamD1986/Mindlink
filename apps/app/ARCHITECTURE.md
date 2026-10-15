# 渲染层架构（UI 结构）

> **状态**：本文描述**目标结构**（UI 重构完成后的形态），是本仓库 UI 结构的**唯一权威**。
> 当前代码**仍是旧结构**；旧 UI 将整体归档到 `src/_legacy-ui/`（不参与构建）。
> 迁移进度与验收判据见 [`.tasks/ui-rebuild/tasks.yaml`](../../.tasks/ui-rebuild/tasks.yaml)。

## 一句话

窗口是**一个容器**（`shell`），里面装**四条栏**和**一块画布**（`workbench`）；画布按**布局文件**摆放 **widget**；
对话（`chatbox`）是可拖拽的自由浮层，浮在画布之上；一切组件、配色、文字分别收在 `components/`、`theme/`、`languages/`。

## 目录与职责

```
apps/app/src/
├── shell/                 窗口容器：定义四条栏与画布的舞台（grid 布局），不含业务
├── top-bar/               上栏：标签页 · 最小化/最大化/关闭
├── bottom-bar/            下栏：占位（预留）
├── left-bar/              左栏：Wiki / 技能与工具 / 设置 ＋ 用户 pin 的入口
├── right-bar/             右栏：会话入口 ＋ 常驻 LOGO
├── workbench/             画布：网格引擎 + 布局文件 + widget 宿主
│   ├── grid/              坐标换算、吸附、resize 重排
│   └── layouts/           布局文件（内置 + 用户自建）
├── chatbox/               上层浮层：可拖拽/缩放的对话窗口（含 inspector 槽位）
├── components/            组件基座
│   ├── atoms/             原子：Button/Panel/Toolbar/Text/Tree/Icon（只吃主题 token）
│   ├── composites/        组合件：消息行、回复卡、markdown/mermaid 预览、灯箱、diff…
│   ├── widgets/           可挂载单元：widget 清单 + DSL 解释器
│   └── content-viewers/   内容查看器（文件树/预览/审查/轨迹/内置浏览器）
├── theme/                 配色 · 字体 · 网格背景色 · 主题包
├── languages/             语言包（zh-CN / en-US）+ t()
└── _legacy-ui/            旧 UI 归档（不参与构建、IDE 报红属正常）
```

## 各层边界（能放什么、不能放什么）

| 层 | 职责 | 硬边界 |
| --- | --- | --- |
| `shell/` | 只做舞台：四条栏 + 画布的位置关系 | 不含业务、不读数据、不知道有哪些栏内容 |
| 四条栏 | 各自独立的窗口部件，互不影响 | **栏之间不得互相 import**；栏不直接实现画布内容 |
| `workbench/` | 读布局文件 → 摆放 widget；网格坐标 → 像素 | 布局文件是**数据**，不得成为代码路径 |
| `chatbox/` | 对话编排与展示；上层浮层 | 不承担 dashboard 职责；不直接读写画布布局 |
| `components/` | 可复用组件与可挂载单元 | 原子/组合件**不持有宿主状态**（不碰 `window.mindlink`）；查看器只经宿主接缝取数 |
| `theme/` | 所有颜色/字体/网格背景 | 组件里不得出现颜色字面量；`var(--yp-*)` 必须已声明 |
| `languages/` | 所有界面文字 | 除语言包与品牌配置外，`src/**` 不得出现中日韩字符 |

## 两层结构

- **下层**：`workbench` 画布。左栏点入口 → 读对应**布局文件** → 画布按格坐标摆出该页的 widget。
- **上层**：`chatbox` 浮层，**可拖拽、可缩放**的自由窗口，浮于画布之上。
- 两层是**堆叠关系**（不是并列页面）：浮层收起时画布完全可用；浮层的 inspector（内容查看区）属于上层，随浮层移动。

> 与旧结构的关键差别：旧实现把所有页面**常驻挂载**、用 CSS 隐藏来"切页"；新结构里"页面"已溶解为**布局文件 + widget**，
> 目录中不再存在 `pages/` 或 `modules/`。

## workbench 网格语义（最容易被做错的一处）

- **5×5px 是"基准分辨率下的吸附粒度"，不是运行时单位。** 布局文件存**格坐标 + 基准列数**（如 96×54），渲染时按画布尺寸换算像素。
- **必须用相对单位**：界面字号缩放（`--yp-font-scale-ui`）会改变根字号，若网格用硬 px，文字一放大排版就撕裂。
- **resize 只重算像素，不改写布局数据**；因此同一布局在 800×600 与 1920×1080 下**相对位置一致**。
- 网格背景色走主题 token（复用现有 `--yp-canvas-grid` 语义），不硬编码。

## 三份数据格式

**① 布局文件**（一页 = 一个文件）
```jsonc
{
  "id": "wiki",
  "titleKey": "layout.wiki",              // 文案走 languages，不写死
  "grid": { "columns": 96, "rows": 54 },  // 基准格坐标
  "background": "workbench.default",      // 主题 token
  "widgets": [
    { "id": "docs", "widget": "tree.list",     "rect": { "x": 0,  "y": 0, "w": 24, "h": 54 } },
    { "id": "body", "widget": "markdown.view", "rect": { "x": 24, "y": 0, "w": 72, "h": 54 } }
  ]
}
```

**② widget 清单**（我们预置，声明所需能力）
```jsonc
{
  "id": "tree.list",
  "titleKey": "widget.treeList",
  "size": { "min": { "w": 12, "h": 12 }, "preferred": { "w": 24, "h": 40 } },
  "capabilities": ["work.files.list", "work.files.read"],   // 只声明，不授权
  "view": { "atom": "VStack", "children": [ { "atom": "Tree", "bind": "props.root" } ] }
}
```

**③ 用户自建 widget = 一份纯数据**（用户/LLM 用原子白名单"创作"的产物）
```jsonc
{ "id": "my-usage", "uses": ["VStack", "Text", "Tree"], "capabilities": ["work.files.list"],
  "view": { "atom": "VStack", "children": [ { "atom": "Text", "textKey": "..." } ] } }
```

**解释器只渲染数据，永不 `eval`、永不动态 `import`。**

## 三条不可动摇的约束

1. **CSP 是 `script-src 'self'`**：运行时加载任何外部脚本都活不过首屏。用户产出必须是数据。
2. **`src/**` 不得出现动态 `import(`**（旧 `composition-boundary` 约定的新版本）：防止"数据变成可执行 UI 贡献"。
3. **注册不授予权限**：widget 声明的能力只是"我需要什么"，是否放行由 Runtime **逐请求独立授权**。

## 能力底座（不可重写，只能搬迁）

UI 重写不等于重做产品。以下四类必须**原样搬迁**，不得借重构改造：

| 底座 | 位置 | 为什么 |
| --- | --- | --- |
| 宿主桥与协议 | `window.mindlink` + `packages/mindlink-protocol` | 与 Runtime/桌面壳的契约；改桥要另开卡（见 UI-03） |
| 内容查看器 + 宿主接缝 | `components/content-viewers/`（原 `viewer/`） | 已稳定；两个接缝是它与外界唯一接口 |
| 展示件资产 | `components/composites/`（原 `shared/` 中的渲染件） | 承载 markdown 渲染与 XSS 防护等安全边界 |
| 对话编排 | `chatbox/`（原 `modules/chat.tsx`，约 1496 行） | 是**功能本体**，不是 UI 外壳；先整块搬，后按需拆 |

## 机核（新增结构必须有的自动检查）

| 检查 | 断言 |
| --- | --- |
| `test/shell-layout.test.mjs` | 四条栏与 `workbench` 槽位都存在，且栏不被塞进画布 |
| `test/no-legacy-imports.test.mjs` | `src/**`（除 `_legacy-ui/`）不得 import 归档区 |
| `test/workbench-grid.test.mjs` | 同一布局在不同窗口尺寸/字号下相对位置一致 |
| `test/workbench-layout.test.mjs` | 非法布局（越界、未知 widget、缺字段）被拒并报可读错误 |
| `test/theme-contract.test.mjs` | `var(--yp-*)` 必须已在 theme 中声明；网格背景走 token |
| `test/languages.test.mjs` | 语言包键集合一致；`src/**` 无中日韩字符残留（品牌除外） |
| `test/widget-dsl.test.mjs` | 白名单外的原子、越界、未声明能力一律被拒 |

## 沿用自旧结构、仍然有效的约定

这几条与结构无关，重构后继续遵守：

- **根 Provider 只有一个**：Router 与 QueryClient 在 `main.tsx` 挂载一次，任何层都不得再装根 Provider。
- **查询键按域隔离**：各页面/widget 用自己的 query key 命名空间，写操作后必须失效对应键。
- **页面/栏不得反向依赖舞台**：旧规则是"页面模块不得 import `shell/`、`composition/`"；新规则是"栏与 widget 不得 import `shell/` 的舞台实现"。
- **主题只有一个**：由 `theme/` 统一选择，旧实现经 `data-mindlink-theme` 切换、可导出快照到 `~/.mindlink/themes/`，新结构保留这一口径。
- **技能与 MCP 包扩展的是 Agent 能力，不是渲染层代码**：这条在旧文档里就写明，新结构继续成立（也是"用户自建 UI 必须是数据"的另一面）。

## 迁移策略

1. **先归档再动工**：旧 UI 整体移入 `src/_legacy-ui/`（`tsconfig` exclude），需要旧件时逐个搬出**并改名**。
2. **先搬后拆**：每个旧页面先包一层"整页 widget"搬进新结构，等 DSL 解释器稳定后再拆成原子组合 —— 保证每次提交都可运行。
3. **文案最后抽**：约 1800 条界面文案的抽取必须在结构定型后进行，否则位移返工。
4. **跨层改动单独成卡**：只有"窗口控制桥 + 无边框窗口"需要动 `apps/desktop`，单独验收。
