# 外壳与画布真机探针结果（UI-03 ~ UI-09）

命令：`node apps/desktop/test/ui-rebuild-shell-probe.mjs`

环境：真实 Electron（apps/desktop/dist/main.cjs）+ 构建产物 apps/app/dist，
临时 MINDLINK_HOME 与独立 --user-data-dir。

- ✔ 桥方法 — 5/5 可用
- ✔ 无边框 — outerHeight-innerHeight=7（带系统标题栏时约 39）
- ✔ 普通窗口 — 1136x769，屏幕可用 3072x1680
- ✔ 左栏开标签 — 标签=wiki / skills，点谁谁成为当前
- ✔ 画布比例布局 — 4 个 widget：默认画布与 900x620 下相对位置一致（偏差 < 2%）
- ✔ 网格线 — 单元格 10.52x12.85px = 画布 1010x694 ÷ 96x54，随画布等比缩放
- ✔ 画布截图 — D:\MindLink\.tasks\ui-rebuild\evidence\shell-and-workbench\workbench-layout.png
- ✔ 右栏会话按钮 — aria-pressed 随开合切换
- ✔ 常驻 LOGO 与下栏槽位 — logo=http://127.0.0.1:64092/assets/mindlink-seal-DFD5AeNR.png，naturalWidth>0
- ✔ pin 持久化 — localStorage=["wiki"]，重载后 pin 数=1
- ✔ 最大化 — 3072x1680 = 屏幕可用区，按钮 aria-label=Restore window
- ✔ 还原 — 回到 1136px 宽，isWindowMaximized=false
- ✔ 最小化 — document.visibilityState=hidden
- ✔ 截图 — D:\MindLink\.tasks\ui-rebuild\evidence\shell-and-workbench\shell-window.png
- ✔ 关闭 — 应用已退出（exitCode=0）
