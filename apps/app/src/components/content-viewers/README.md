# content-viewers — 内容查看与交互模块

`apps/app/src/components/content-viewers/` 承载右侧面板里的内容查看器：文件树、各内容类型预览，以及后续的内置浏览器视图。它只负责查看器组件、内部交互和内容类型适配；面板布局、打开哪个视图、与会话的关联由上层（chatbox 等）决定，宿主能力通过 `host/` 接缝注入。

## 模块

| 目录 | 职责 |
| --- | --- |
| `core/` | 视图类型、内容类型判定（`classifyWorkFile`）、展示格式化；随浏览器视图加入注册与状态恢复 |
| `files/` | 目录树浏览（懒加载、展开状态、选中联动） |
| `preview/` | 文本（行号/截断）、Markdown、图片、PDF（pdf.js 分批渲染）的只读预览 |
| `browser/` | 预留：地址栏、导航与浏览器状态 UI；原生实例由宿主提供 |
| `review/` | 代码审阅面板 |
| `host/` | 宿主接口（`ViewerFileHost`、`ViewerBrowserHost` 等）。实现方在 content-viewers 之外 |

## 职责边界

| 位置 | 职责 |
| --- | --- |
| `app/src/components/content-viewers/` | 查看器组件、内部交互、不同内容类型的适配 |
| `apps/app` 其余部分 | 右侧面板布局、拖拽比例、打开哪个视图、会话关联（conversationId → host 实现） |
| `apps/desktop`（含其管理的 runtime sidecar） | 实际文件读写（containment/realpath 校验在 sidecar）、创建 Electron 浏览器视图、系统能力 |

## 接缝约定

- content-viewers 组件不直接触碰 `window.mindlink`、Electron 或存储布局，只消费 `host/` 中的接口。当前 `chatbox/chat.tsx` 用桌面桥 + 会话 ID 实现 `ViewerFileHost`。
- 数据契约类型沿用 `@mindlink-agent/protocol`（`WorkFileEntry` / `WorkDirectoryListing` / `WorkFilePreview`），保持协议单一来源。
- 后续浏览器视图：界面与控制协议放在 `browser/`，宿主（apps/desktop）提供原生浏览器实例并实现控制接口；浏览器 MCP 复用同一浏览器会话。

## 后续重构：widget 映射表

当前所有内容查看器仍为传统组件。后续按 widget 体系重构时，映射关系如下：

| 当前路径 | 目标 widget 路径 | 说明 |
| --- | --- | --- |
| `files/file-tree.tsx` | `components/widgets/file-tree/` | 目录树 widget |
| `files/file-tabs.tsx` | `components/widgets/file-workspace/` | 文件标签页 widget |
| `preview/file-preview.tsx` | `components/widgets/file-preview/` | 文件预览 widget |
| `preview/file-diff-view.tsx` | `components/widgets/file-diff/` | 文件对比 widget |
| `preview/pdf-view.tsx` | `components/widgets/pdf-viewer/` | PDF 查看器 widget |
| `browser/browser-view.tsx` | `components/widgets/browser-view/` | 浏览器视图 widget |
| `review/review-panel.tsx` | `components/widgets/code-review/` | 代码审阅 widget |
| `session-trajectory.tsx` | `components/widgets/session-trajectory/` | 会话轨迹 widget |

重构原则：
1. **host 接缝保持唯一**：`host/file-host.ts` 和 `host/browser-host.ts` 作为对外接口不变
2. **不 import chatbox 实现**：widget 层保持独立，不依赖上层业务逻辑
3. **渐进式迁移**：一次迁移一个 widget，保持其他部分正常工作
4. **测试同步迁移**：widget 化后测试文件同步更新路径
