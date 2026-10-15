# UI-03 真机探针结果

命令：`node apps/desktop/test/ui-rebuild-shell-probe.mjs`

环境：真实 Electron（apps/desktop/dist/main.cjs）+ 构建产物 apps/app/dist，
临时 MINDLINK_HOME 与独立 --user-data-dir。

- ✔ 桥方法 — 5/5 可用
- ✔ 无边框 — outerHeight-innerHeight=7（带系统标题栏时约 39）
- ✔ 普通窗口 — 1136x769，屏幕可用 3072x1680
- ✔ 最大化 — 3072x1680 = 屏幕可用区，按钮 aria-label=Restore window
- ✔ 还原 — 回到 1136px 宽，isWindowMaximized=false
- ✔ 最小化 — document.visibilityState=hidden
- ✔ 截图 — D:\MindLink\.tasks\ui-rebuild\evidence\UI-03\ui-03-window-controls.png
- ✔ 关闭 — 应用已退出（exitCode=0）
