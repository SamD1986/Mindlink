# UI-18 迁移后整体回归验收（results.md）

## 环境与版本（取证时实况）

| 项 | 值 |
| --- | --- |
| 仓库 | `D:\MindLink` |
| 分支 | `ui/regression` |
| `git rev-parse HEAD` | `322f1e46d11cd70b92053db4e9d0282ec55e4b14`（= 最新 main，UI-19 之后） |
| Windows | `Microsoft Windows [版本 10.0.26200.9711]`（Windows 11） |
| Node | `v24.14.0`（仓库要求 `>=24.15.0 <25`，pnpm 只 WARN 不阻塞） |
| pnpm | `11.22.0` |
| Electron | `apps/desktop/node_modules/electron/dist/electron.exe`（真机探针用的就是它） |

验收口径：**每项都附命令与真实输出片段或截图片文键**；拿不到的写「未验证 + 原因」，不用「构建通过」替代业务验收，也不用旧 UI 截图当新结构证据。

---

## 一、命令基线（实跑输出）

### 1.1 `pnpm run typecheck:mindlink`

```
$ pnpm run typecheck:mindlink
...
packages/mindlink-protocol typecheck: Done
packages/mindlink-sandbox typecheck: Done
apps/desktop typecheck: Done
server typecheck: Done
packages/mindlink-assistant typecheck: Done
apps/app typecheck: Done
packages/mindlink-runtime typecheck: Done
apps/runtime typecheck: Done
TYPECHECK_EXIT=0
```

→ **8 包全部 Done**（日志：`.tasks/ui-rebuild/evidence/regression/logs/typecheck.txt`）

### 1.2 `pnpm -F @mindlink-agent/app build`

```
(!) Some chunks are larger than 500 kB after minification. ...
✓ built in 6.90s
APP_BUILD_EXIT=0
```

→ 构建通过（日志：`logs/app-build.txt`）。产物 `apps/app/dist/`（含唯一 CSS：`assets/index-dS-RzPCO.css`）。

### 1.3 `pnpm -F @mindlink-agent/app test`

```
ℹ tests 111
ℹ pass 111
ℹ fail 0
APP_TEST_EXIT=0
```

→ **111/111**，与任务给的基线一致（日志：`logs/app-test.txt`）。

### 1.4 `pnpm -F @mindlink-agent/desktop test`

```
ℹ tests 28
ℹ pass 26
ℹ fail 2
DESKTOP_TEST_EXIT=1
```

→ **26/28**，两个失败见文末「已知失败」。（日志：`logs/desktop-test.txt`）

---

## 二、真机探针

两个探针脚本（都在 `.tasks/` 下，未碰产品代码）：

| 脚本 | 作用 | 产物 |
| --- | --- | --- |
| `.tasks/ui-rebuild/tools/ui-regression-probe.mjs` | 主回归（结构/尺寸/语言包/UI-19/widget/浮层） | `probe-results.json` + 截图 |
| `.tasks/ui-rebuild/tools/ui-regression-chatbox-shot.mjs` | 单独截「chatbox 打开」并量工作面样式 | `chatbox-open-1280x800.png` |
| `.tasks/ui-rebuild/tools/probe-sigterm-windows.mjs` | 复现 SIGTERM 语义（解释已知失败②） | `logs/sigterm-experiment.json` |

启动方式沿用仓库既有探针（`apps/desktop/test/ui-rebuild-shell-probe.mjs`）的做法：真机 Electron + 独立 `--user-data-dir` + 临时 `MINDLINK_HOME` + 自伺服 `apps/app/dist` + Node 内置 WebSocket 的最小 CDP 客户端。

> 说明：**必须前台跑**。经 `terminal(background=true)` 直接起 `node` 会得到 `stdin is not a tty` 并立即退出（本机实测）；前台正常。探针总结果 **pass=21 / fail=12 / total=33**。

---

## 三、逐项验收列表

图例：**pass** = 已取到硬证据；**fail** = 测得不符合预期（附重现步骤）；**未验证** = 拿不到证据并写明原因。

### 3.1 原功能清单

| # | 项 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | 工作面对话：消息列表 / 输入区 / 附件区 / 发送键 / 空态欢迎 | **pass** | 探针 E2：`.conversation`、`.conversation-inner`、`.composer`、`textarea[aria-label="消息"]`、`[aria-label="发送消息"]`、`[aria-label="添加附件"]`、`.composer-attachment-input`、`.empty-chat`/`.mindlink-welcome` 全部存在 |
| 2 | 工作面对话：**上下滚动区** | **fail** | 探针 E3：`.conversation` 的 computed `overflow-y=visible`（应为 `auto`，见「已知失败③」）。补充取证：`chatbox-open-1280x800.png` 探针输出 `{"conversationOverflowY":"visible","conversationHeight":340,"composerBg":"rgba(0, 0, 0, 0)","stylesheetCount":1}` |
| 3 | 工作面对话：发送 / 取消 / 恢复 / 能力审批 / 加载更早 | **未验证** | 原因：`window.mindlink`（contextBridge）**不可重定义** → 注入桥夹具失败（`Cannot redefine property: mindlink`，探针 K1–K5 全部停在夹具安装），而真实 Runtime 在本机 dev 态未起。重现：`node .tasks/ui-rebuild/tools/ui-regression-probe.mjs` → `FAIL K1: 桥夹具安装失败：fail:Cannot redefine property: mindlink` |
| 4 | 工作会话树 / 归档 | **未验证** | 原因同上（K6 未能取得面板）。替代证据：`legacy-pages/modules/work-tree.tsx` 被 `chat.tsx:37` 引用、`work-tree-model.test.mjs` 通过 |
| 5 | 文件预览（含 diff / 代码高亮） | **未验证** | 原因：需打开真实工作文件/变更才能渲染；F1 未能取得宿主。替代证据：`components/content-viewers/**` 在位；`viewer-modules 4/4`、`viewer-code-highlight`、`viewer-text-diff` 单测通过 |
| 6 | 审查面板 | **未验证** | 同上（需真实变更集）。替代证据：`components/content-viewers/review/review-panel.tsx` 在位 |
| 7 | 消息渲染（复制、运行详情） | **未验证** | 原因：无夹具 → 无消息可渲染（K7「消息区没有渲染任何消息」）。替代证据：`ReplyRunDetails`/复制按钮 JSX 在 `chat.tsx:1351/1381`；样式缺失见「已知失败③」 |
| 8 | 技能页 | **fail** | 探针 D1：点左栏「技能」打开的是**占位布局**，非技能页。实测 `widgets=["note.text","viewer.files"]`、画布文本 `"Notes 0,0 · 56×54 Files 56,0 · 40×54"`。重现：启动后点 `[data-left-entry="skills"]`，画布只出两个占位块 |
| 9 | 定时任务 | **fail** | 探针 D3：界面上找不到任何定时任务入口/页面。`ScheduleManagement` 只在自己的包装层里被 re-export，**无任何入口挂载** |
| 10 | 设置（字体 / 主题 / 快捷键） | **fail** | 探针 D2：点左栏「设置」打开的是**占位布局**。实测 `widgets=["note.text"]`、文本 `"Notes 12,8 · 72×38"`。重现：点 `[data-left-entry="settings"]` |
| 11 | 企微连接 | **未验证** | 原因：实现文件在（`legacy-pages/management.tsx` 的 `listWecomConnections/saveWecomConnection`，探针 D4 已核对），但**页面未挂载**（与 8/9/10 同因） |
| 12 | Tailscale | **未验证** | 同上（`legacy-pages/modules/tailscale-settings.tsx` 在，页面未挂载） |

> 8/9/10 的共同根因（已取证）：`SkillPage` / `SettingsPage` / `ScheduleManagement` **只在 `legacy-pages/**` 里定义**，`components/widgets/{skills,settings,scheduled-tasks}/index.tsx` 只是 re-export 包装层，**活代码里没有任何地方 import 它们**。左栏 `skills`/`settings` 键绑的是 `workbench/layouts/builtin.ts` 的**占位布局**（`note.text`/`viewer.files`）。硬证据：
> ```
> $ grep -rn "SkillPage\|SettingsPage\|ScheduleManagement" apps/app/src --include=*.ts --include=*.tsx | grep -v _legacy-ui | grep -v "index.tsx:.*export"
> （无输出，exit=1）
> ```
> 完整审计：`logs/source-audit.txt`。

### 3.2 UI-15 / UI-19 手术专查

| # | 项 | 判定 | 证据 |
| --- | --- | --- | --- |
| 13 | 语言包恒等映射（`value === key`，"消息即键"） | **pass** | 探针 H1：`apps/app/src/languages/zh-CN.json` **884 条全部 `value===key`** |
| 14 | 界面真实渲染的中文与 zh-CN.json 逐字相等 | **pass（部分样本）/ 未验证（运行态样本）** | 探针 H2 抽 9 个真实渲染串（`消息`/`发送消息`/`添加附件`/`我的 Widget`/`校验并预览`/`保存`/`连接提示`…）**全部命中语言包键**；另 3 个（`停止任务`/`工作列表`/`复制这条消息`）需运行态才有 DOM → 未验证。注：探针原始判定为 fail，仅因这 3 个样本 DOM 缺失 |
| 15 | 语言包无孤儿键 | **pass** | 探针 H3 + `apps/app/test/languages.test.mjs` 4 条全绿（含「代码与包之间无缺键也无死条目」） |
| 16 | 工作面未被去面化改坏：chatbox 能开能关 | **pass** | 探针 E1：开→`.chatbox-overlay` 出现（`z-index=1000`）→关→移除；右栏 `aria-pressed` 跟随 |
| 17 | 工作面未被改坏：空态欢迎区正常 | **pass** | 探针 B1/E2：`.empty-chat` + `.mindlink-welcome` 在；截图 `chatbox-open-1280x800.png` 目视可见印章 +「元朴思联 MindLink」+「开始一项工作」 |
| 18 | 工作面未被改坏：消息列表 / 输入区 / 附件区在 | **pass** | 探针 E2（同 #1） |
| 19 | 工作面未被改坏：上下滚动区在 | **fail** | 同 #2（样式表缺失） |
| 20 | 工作面未被改坏：能力审批卡片还在 | **未验证**（含样式缺失） | 活代码在（`chat.tsx:1411-1423` 的 `.approval-actions` / 「允许这次操作」/「拒绝」）；但生产 CSS 里 `approval-actions` 出现 **0 次**（样式一并丢失），且需运行态才渲染 → 未取得真机证据 |
| 21 | 助理痕迹没了：界面无「专业任务授权/保存到记忆/保存到知识库/绑定助理会话/助理会话」 | **pass** | 探针 I1：界面文本四个短语命中数为 0 |
| 22 | 助理痕迹没了：助理组件/模块已从活代码移除 | **pass** | 探针 I2：6 个件（`assistant-home`/`assistant-companion`/`assistant-activity`/`delegation-approval-details`/`saved-content`/`assets/assistant`）均不存在 |
| 23 | 活代码无 `surface === 'assistant'` / `!== 'work'` 残文件锁 | **pass** | `grep -rn "surface === 'assistant'\|surface !== 'work'" apps/app/src --include=*.ts --include=*.tsx \| grep -v _legacy-ui` → 无输出（exit=1） |
| — | 补充发现（UI-19 未清尽的「助理/助手」字样） | **观察项** | 活代码仍 3 处：`chat.tsx:909`（浏览器预览兜底文案「…消息会交给本地**助理**处理。」）、`components/content-viewers/session-trajectory.tsx:6,113`（角色名 `t("助手")`）、`legacy-pages/management.tsx:549`（「个人**助手**默认仅允许已配对私聊…」，该页未挂载）。语言包对应 3 键。**UI-19 卡里声明的 4 个短语确已清空**，此处为清单外的遗漏字样，按观察项列出，不计 fail |

### 3.3 新能力

| # | 项 | 判定 | 证据 |
| --- | --- | --- | --- |
| 24 | 四栏外壳结构（上/下/左/右 + 中央画布） | **pass** | 探针 B3/C1：五槽齐；下栏 `pointer-events:none`、槽位 `auto`；左栏固定入口 `home/wiki/skills/settings` |
| 25 | 窗口尺寸稳定性 1280x800 | **pass** | 探针 A1：`vw=1280 vh=800 左46 右46 上36 下36 画布1188x728，无滚动条`（四边贴齐、无缝、无重叠、无滚动条） |
| 26 | 窗口尺寸稳定性 1920x1080 | **pass** | 探针 A2：`vw=1920 vh=1080 … 画布1828x1008，无滚动条`；A3 尺寸往复回 1280x800 亦稳定 |
| 27 | 空画布品牌字标 + 背景层/宣纸纹理 | **pass** | 探针 B1；截图 `shell-1280x800.png` / `shell-1920x1080.png` |
| 28 | 右栏常驻印章图片真加载 | **pass** | 探针 B2：`yuanpu-seal-DFD5AeNR.png naturalWidth>0` |
| 29 | 布局加载与切换 | **pass** | 探针 C2/C3：`wiki:4 / skills:2 / settings:1` 个 widget，点 home 回空态 |
| 30 | chatbox 浮层：开合 | **pass** | 探针 E1 |
| 31 | chatbox 浮层：拖拽 / 缩放 | **未验证** | 原因：需真实指针按下-移动-抬起序列；本机无法在既有探针里可靠驱动，未做 |
| 32 | widget 体系：清单 / DSL / 解释器 / 注册表 | **pass** | `widget-dsl.test.mjs` 10/10（未知原子/函数 props/嵌套递归校验一律拒）、`workbench-layout.test.mjs`（含「布局数据不能变成代码」）、`registry.ts` 与 `dsl-interpreter.tsx` 在位；探针 G2 实测拒非法 DSL |
| 33 | 用户自建 widget：创作台能开 | **pass** | 探针 G1：画布 `data-workbench-mode=widget-studio` |
| 34 | 用户自建 widget：校验拒非法 DSL | **pass** | 探针 G2：`未知原子：EvilAtom` |
| 35 | 用户自建 widget：校验通过→预览→命名保存→进库→固定到左栏 | **pass** | 探针 G3：预览出现、库项 `regression-widget`、左栏 pin 1 项、`localStorage` 键 `["mindlink.user-widgets"]`；G4 打开后画布 `mode=user-widget` 且渲染出用户 DSL 文本 |
| 36 | 用户自建 widget：导入/导出区 | **pass**（界面在）/ **未验证**（真点文件对话框与 Blob 下载） | 探针 G5：导入文件框/粘贴区/导入钮/导出钮全在；文件选择对话框与 `Blob` 下载未真点 |

### 3.4 截图清单（`.tasks/ui-rebuild/evidence/regression/`）

| 文件 | 内容 |
| --- | --- |
| `shell-1280x800.png` | 四栏 + 空画布（1280x800） |
| `shell-1920x1080.png` | 四栏 + 空画布（1920x1080） |
| `chatbox-open-1280x800.png` | **chatbox 打开**：外层卡片有样式，内层工作面缺样式（无可见输入框） → 「已知失败③」的证据 |
| `widget-studio.png` | 创作台 |
| `final-empty-canvas.png` / `final-wiki-layout.png` | 收尾空态 / wiki 布局 |

---

## 四、已知失败（附根因 / 判定）

### ① `window-controls.test.mjs` —「the macOS traffic lights stay inside the inset…」

- **判定：fail（跨层校验未随栏高改动同步）**
- 原始输出：
  ```
  test at test\window-controls.test.mjs:58:1
  ✖ the macOS traffic lights stay inside the inset the renderer reserves for them (0.922ms)
    TypeError: Cannot read properties of null (reading '1')
        at TestContext.<anonymous> (file:///D:/MindLink/apps/desktop/test/window-controls.test.mjs:70:96)
  ```
- 根因：该用例第 70 行按 `min-height` 从上栏 CSS 取高度；四栏尺寸统一那轮把 `.top-bar` 从 `min-height: 40px` 改成 `height: 36px`（`apps/app/src/top-bar/styles.css:15-26`，实测文件里是 36px，无 `min-height`），正则取不到 → 对 null 取 `[1]` 抛错；主进程 `trafficLightPosition` 的 `y` 也未随栏高同步。
- **根因已由主 Agent 定位，将另行修复（UI-20）**；本轮**未改** `apps/desktop/**`，也**未改**这条测试。

### ② `runtime-manager.test.mjs:55` —「deduplicates concurrent starts and performs a bounded graceful stop」

- **判定：稳定失败（非偶发/时序），平台语义所致**
- 单独重跑 3 次（命令 `node --test apps/desktop/test/runtime-manager.test.mjs`，前台）：

  | 轮次 | 结果 | 「deduplicates…」用时 | 整套用时 | 退出码 |
  | --- | --- | --- | --- | --- |
  | 1 | pass 7 / fail 1 | 109.96ms | 1812.47ms | 1 |
  | 2 | pass 7 / fail 1 | 121.48ms | 1886.21ms | 1 |
  | 3 | pass 7 / fail 1 | 113.09ms | 1841.61ms | 1 |

  （每次都是同一条断言：`AssertionError … 0 !== 1`；日志 `logs/runtime-manager-rerun.txt`）
- 断言内容（`test:52-55`）：并发 `Promise.all([start(), start(), info()])` 后 `await manager.stop()`，要求 fixture 事件文件里 `event === 'term'` 的记录**恰好 1 条**。
- **根因假设（只作分析，未改代码）**：断言数到 0 条 `term`。`RuntimeManager.terminate()`（`apps/desktop/src/runtime-manager.ts:219-225`）走 `child.kill('SIGTERM')`；而 fixture（`test/fixtures/runtime-process.mjs:146-151`）是靠 `process.once('SIGTERM', () => record('term'))` 记录该事件。**Windows 上 Node 把 `child.kill('SIGTERM')` 实现为无条件终止进程，子进程的 `SIGTERM` JS 处理器根本不会执行** → 事件文件永远拿不到 `term` → 稳定为 0。
  最小复现（`tools/probe-sigterm-windows.mjs` → `logs/sigterm-experiment.json`）：
  ```json
  { "platform": "win32", "sigtermHandlerRan": false,
    "eventsAfterKill": "\"\"", "childExitCode": null, "childSignalCode": "SIGTERM" }
  ```
  子进程注册了 `SIGTERM` 处理器，被 `kill('SIGTERM')` 后**处理器一次都没跑**（事件文件为空），进程以 `signalCode=SIGTERM` 直接终止。
  侧证：同文件 `forceTerminate()` 对 win32 专门改用 `taskkill /PID /T /F`，说明代码作者已知 Windows 的 kill 语义与 POSIX 不同。
  → 结论：**这是 Windows 上的稳定失败，属平台语义与断言口径不匹配**（该用例隐含「SIGTERM 可被对端捕获」的 POSIX 前提）；在 POSIX 上应能通过。修复方向（供参考，未实施）：Windows 上改断言终止事件的口径（或以 `exit`/`signalCode` 判定），不要依赖子进程 SIGTERM 处理器。

### ③（本轮新发现）工作面在新壳里**丢了核心样式表** → 消息列表不滚动、输入区/消息/审批卡无排版

- **判定：fail**（影响原功能清单的「上下滚动区」「滚动锚定」「加载更早」与消息/审批渲染）
- 证据链（全部可复跑）：
  1. 生产 CSS 产物里相关选择器**一个都没有**：
     ```
     $ for s in composer empty-chat approval-actions message-body run-recovery conversation-inner; do printf "%s=" $s; grep -o $s apps/app/dist/assets/index-dS-RzPCO.css | wc -l; done
     composer=0
     empty-chat=0
     approval-actions=0
     message-body=0
     run-recovery=0
     conversation-inner=0
     ```
     且 `grep -o "conversation[a-z-]*" …css | sort | uniq -c` 只有 `conversation-list-preview` / `conversation-list-heading`（都来自活文件 `legacy-pages/modules/work-tree.css`），**没有 `.conversation` 滚动规则**。
  2. 这些规则**只存在于归档区**：`apps/app/src/_legacy-ui/styles.css:149` `.conversation { min-height: 0; overflow-y: auto; … }`（另含 `.composer`/`.message`/`.message-body`/`.approval-*`/`.empty-chat`）。
  3. 归档样式表**没有被任何活代码 import**：
     ```
     $ grep -rn "_legacy-ui/styles.css" apps/app/src --include=*.ts --include=*.tsx | grep -v "src/_legacy-ui/"
     （无输出，exit=1）
     ```
     并且 `apps/app/test/no-legacy-imports.test.mjs` 断言活代码**不得**出现 `_legacy-ui`。[PERSON_5fb1da4d899572cd]。
  4. 真机实测 `.conversation` 的 computed `overflow-y=visible`（应为 `auto`），`composer` 背景透明、无边框：
     ```
     node .tasks/ui-rebuild/tools/ui-regression-chatbox-shot.mjs
     CHATBOX_STYLE_PROBE={"conversationOverflowY":"visible","conversationHeight":340,"composerBg":"rgba(0, 0, 0, 0)","stylesheetCount":1}
     ```
  5. 截图 `chatbox-open-1280x800.png`：chatbox 外壳（圆角卡片/阴影/「对话」标题/分隔线）有样式，但**内层工作面几乎无样式** —— 看不到输入框与发送键，消息区空白无排版。
- 归因：UI-11「整块搬运 `chat.tsx`」搬了**代码**，没有把它的**样式表**一起搬出归档区（`_legacy-ui/styles.css`）。`chatbox/styles.css` 只覆盖 `.chatbox-overlay/header/content/resize-handle`；`work-tree.css` 只带过 `.chat-panel/.chat-main/.conversation-list-*` 的布局片段。
- 重现步骤：起探针（或 `pnpm dev`）→ 打开 chatbox → 消息列表滚不动、输入框不可见 → 打开 DevTools 查 `.conversation` computed `overflow-y` 为 `visible`。

---

## 五、未验证清单（含原因）

| 项 | 原因 |
| --- | --- |
| 发送 / 取消 / 恢复 / 能力审批 / 加载更早（真机交互） | `window.mindlink` 是 contextBridge 暴露的**不可重定义**属性，桥夹具注入失败（`Cannot redefine property: mindlink`）；真实 Runtime 在 dev 态未起（缺能力制品信任根）。→ 这 5 项的**界面分支存在**（`chat.tsx` 的 `submitDesktopMessage` / `cancelAgentRun` / `.run-recovery` / `.approval-actions` / `.chat-load-older` 均在），但**行为未真机验证** |
| 工作会话树/归档真机开合 | 同因（K6 未取得）。替代：`work-tree-model.test.mjs` 通过 |
| 文件预览（diff/代码高亮）/ 审查面板真机渲染 | 需真实工作文件与变更集；Mock/夹具不可用（同因） |
| 消息渲染（复制按钮、运行详情）真机 | 无夹具 → 无消息可渲染；样式同时缺失（见已知失败③） |
| chatbox 拖拽 / 缩放 | 需真实指针事件序列，本轮未驱动 |
| 创作台的**真点**文件选择与 Blob 下载 | 导入/导出**控件**已在（G5），文件对话框与下载未真点 |
| 企微连接 / Tailscale / 字体 / 主题 / 快捷键 页面 | 页面未挂载（与 3.1 的 8/9/10 同因），实现文件在但界面上不可达 |
| 技能页 / 设置页 / 定时任务页的**功能等价性** | 页面不可达（fail），故其内部功能（模型配置、热键改绑、定时增删等）无从验收 |

---

## 六、统计

**pass = 21**（探针 21 项 + 基线 3 条命令通过；见上表 3.1/3.2/3.3 中判 pass 的行）
**fail = 5**（#2 滚动区、#8 技能页、#9 定时任务、#10 设置页、已知失败③同源；另加已知失败① ② 两条测试）
**未验证 = 10**（#3、#4、#5、#6、#7、#11、#12、#20、#31、#36-下载部分）

### 名单

- **fail**：① 上下滚动区（`.conversation` 无样式）；② 技能页不可达；③ 定时任务不可达；④ 设置页不可达；⑤ `window-controls.test.mjs`（跨层校验未同步）；⑥ `runtime-manager.test.mjs`（Windows SIGTERM 语义）。
- **未验证**：发送/取消/恢复/能力审批/加载更早；工作会话树/归档；文件预览；审查面板；消息渲染；企微连接；Tailscale；能力审批卡片真机渲染；chatbox 拖拽/缩放；创作台文件选择与下载。
- **pass**：四栏结构；1280x800 / 1920x1080 / 往复尺寸稳定；空态品牌字标与背景；右栏印章；布局加载与切换；chatbox 开合；空态欢迎区；消息列表/输入区/附件区存在；语言包恒等映射（884 条）；语言包无孤儿键；界面中文串命中语言包键（部分样本）；UI-19 界面与活代码无助理面；widget 注册表/DSL/解释器；创作台开/校验拒非法 DSL/保存/pin/打开/导入导出控件在。

### 结论

1. **UI-15 与 UI-19 没有把工作面改坏**：语言包恒等映射成立、界面串与包逐字相符、助理面从界面与活代码移除（UI-19 声明项全清）。
2. **两次手术之外的老账被回归抓到两处**：UI-11 搬运 `chat.tsx` 时**漏搬样式表**（工作面无样式、消息列表不滚动）；UI-13 的旧页面包装层是**死代码**，技能页/设置页/定时任务在界面上**完全不可达**。
3. 两个桌面壳测试失败已分别定位：① 跨层校验未随栏高同步（待 UI-20 修）；② Windows 下 `child.kill('SIGTERM')` 不触发子进程处理器（平台语义，属断言口径问题）。
