# 方案：界面侧「助理」下线（后端保留）

> 2026-10-15 确认口径：**只撤界面上的助理入口与面板，后端/Runtime 一律不动**（可逆、低风险）。
> 本文件是待确认的方案与影响面清单，**尚未执行**。

## 一句话

新壳的 chatbox 只渲染 `surface="work"`（`chatbox/index.tsx:123` 写死），助理面在界面上**已经点不到** ——
所以这一刀实质是「删死代码 + 撤残留设置项」，**不碰后端**，回退只需 revert。

## 判定依据（实测，非推断）

| 事实 | 怎么核的 |
|---|---|
| 全库没有任何地方传 `surface="assistant"` | 扫 apps/app/src |
| chat.tsx 里 **42 处** `surface === 'assistant'` / `!== 'work'` 分支 | `grep -c` |
| `assistant-home`（助理首页）唯一消费者 = chat.tsx | grep 引用 |
| `assistant-companion`（宠物助手）唯一消费者 = assistant-home | grep 引用 |
| `assistant-activity`（助理活动库）唯一消费者 = assistant-home（chat.tsx 不用它） | grep 引用 |
| `emo.json` 的 `navigation.assistant` 已无人读（新左栏是硬编码 `entries.ts`） | grep 引用 |
| 审批卡片是**两面共用**的：工作面的能力审批必须留 | 读 chat.tsx:1504-1510 |

## 一、删（助理专用、无人再引用）

| 文件 | 是什么 |
|---|---|
| `src/legacy-pages/modules/assistant-home.tsx` | 助理首页（欢迎大字标 + 宠物） |
| `src/components/composites/assistant-companion.tsx` | 宠物助手动画（含重播） |
| `src/components/composites/assistant-activity.ts` | 助理活动类别文案 |
| `test/assistant-activity.test.mjs` | 跟随删除 |
| `emo.json` 的 `welcome.assistant` / `navigation.assistant` 两个键 | 助理欢迎文字等（**emo.json 本体不删**：apps/desktop 读它取窗口标题与图标） |

## 二、改（chat.tsx 去面化：删 assistant 分支、固定工作面）

- 去掉 `surface` prop 与全[PERSON_55179eece4fb2334] 42 处 assistant 分支
- 连带删：助理 transcript 查询、`assistantLink` 查询、`mirrorQuery`（旧企微投递记录只读视图）、
  `assistantGreeting`、助理头像、`<AssistantHome />` 渲染
- **验收主判据**：现有工作面的行为逐条不变（发送/取消/恢复/能力审批/滚动锚定/加载更早/工作会话树）

## 三、撤设置项

- `src/legacy-pages/modules/settings.tsx`：删「助理会话 / 绑定助理会话」整节（含绑定按钮与说明文字）

## 四、两处需要你拍板（我未动）

1. **消息上的「保存到记忆 / 保存到知识库」按钮**（`assistant-reply.tsx` + `saved-content.ts`）
   - 问题：知识库/记忆算独立功能，还是助理附属？
   - 我的建议：**保留**（左栏 Wiki 在用；将来的记忆面板会取它）
   - 若你判断属助理：连带删 `saved-content.ts` + `test/saved-content.test.mjs` + 语言包里相关键
2. **「专业任务授权」卡片**（`approval.assistantDelegation` 分支 + `DelegationApprovalDetails` 组件）
   - 我的建议：**删**（属助理委托；助理下线后不会再有新的委托）
   - 但**能力审批（工作面用）必须保留**；连带删 `test/delegation-approval-details.test.mjs`

## 五、连带收尾（不做就是机核红）

1. **语言包去孤儿键**：删界面 = 删 `t()` 调用点，而 `test/languages.test.mjs` 断言
   「代码与包之间无缺键也无死条目」→ 会被判红。做法：给 `.tasks/ui-rebuild/tools/l10n-extract.mjs`
   加 `--prune` 开关（重算键集合并把孤儿键从 `zh-CN.json` 剔掉），一条命令收敛
2. 测试跟随：上面点到的两个 test 文件
3. **UI-18 回归验收清单剔除「助理」项**（它排在 UI-17 之后跑）
4. `tasks.yaml` 补一张新卡：UI-19「界面侧助理下线」

## 六、界面口径下会丢的功能

- 助理对话面：本地助理聊天、助理历史会话、助理上下文环、助理运行轨迹面板
- 助理首页（欢迎大字标 + 宠物动画）、「你停止了当前任务」这类助理专属提示
- 旧企微投递记录（只读）视图
- 设置里的「助理会话绑定企业微信」
- 「专业任务授权」卡片（助理委托）

**保留**：工作对话全功能、能力审批、文件/审查/轨迹查看器、chatbox 浮层（拖拽/缩放/开合）、
四栏与画布、widget 体系、中文语言包、主题

## 七、执行方式（确认后）

1 个张分支 `ui/drop-assistant`：先删后改 → `typecheck:mindlink` 8 包 Done + `build` 通过 +
`apps/app` 测试全绿 + 语言包无孤儿键 → 账本记 UI-19 → 并入 main。
（若 UI-17 已并入，先 merge main 再开工，避免改到旧基点。）

## 八、风险与回退

- 纯界面改动，后端 / Runtime / 协议一律不动 → 回退 = `git revert`（被删的助理首页等仍留在 git 历史里，随时可取回）
- 唯一真风险：`chat.tsx` 1712 行，去面化必须**精准删块**而不是重写 —— 只删 assistant 相关块，
  用 tsc + build + 测试三条机核兜底
- 助理后端仍在、但界面无入口 → 不会误触发
