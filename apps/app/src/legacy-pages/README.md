# legacy-pages —— 仍在使用的旧页面实现（待逐页重写）

## 这是什么

旧 UI 的**页面实现**。它们本来在 `src/_legacy-ui/`（归档区），但 UI-11 的 chatbox 与 UI-13 的
过渡 widget 包装层**确实在调用它们**：

| 调用方（活代码） | 用到的毕业件 |
|---|---|
| `chatbox/chat.tsx` | `emo.ts`、`modules/assistant-home.tsx`、`modules/work-tree.tsx` |
| `components/widgets/settings/` | `modules/settings.tsx`（连带 model-settings / hotkey-settings / tailscale-settings） |
| `components/widgets/skills/` | `modules/skills.tsx` |
| `components/widgets/scheduled-tasks/` | `management.tsx` |
| `components/widgets/work-tree/` | `modules/work-tree.tsx` + `modules/work-node-icons.tsx` |

归档区（`src/_legacy-ui/`）的规矩是「活代码不许 import」；既然这些文件被活代码依赖，
就**不能说它们是归档件** —— 所以搬到本目录，语义上诚实：`_legacy-ui` 只剩真正没人用的旧壳，
这里则是「还在用、但还没按新结构重写」的页面。

## 规矩

- 本目录**参与构建与类型检查**（不要再往里加 `_legacy-ui` 那种豁免）
- 新功能不要写在这里；这里是重写的**输入**，不是落脚点
- 逐页重写完成后，对应文件从本目录删除，直到本目录变空 —— 那时可以整目录删掉
- 相对路径口径：本目录与 `src` 只隔一层，`src/assets/**` 从这里数是 `../assets/**`
  （`modules/` 里是 `../../assets/**`）；共享组件在 `components/composites/**`
