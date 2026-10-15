"""
真机验收四项改动（2026-10-15 用户需求）。

无 CDP 端口（开发模式未启），只能做窗口可见性判断 + 手工截图确认。
四项：
1. 上栏无标签
2. 左栏最底下无"固定当前布局"按钮
3. 画布空态 = 印章 + 中英文字标
4. 画布有宣纸底纹

手工确认清单（用户在窗口上看）：
□ 上栏右上角只有最小化/最大化/关闭三个按钮，**没有标签条**
□ 左栏三个固定入口（Wiki / 技能 / 设置），底部**没有向下箭头**
□ 画布中央有"印章 + 元朴思联 + MindLink"字标（竖排右侧也有小字标）
□ 画布背景有**宣纸底纹**（淡黄色纹理，不是纯色）
"""
import sys
import subprocess

print(__doc__)
print("\n四项手工验收（请在 Electron 窗口上确认）：")
print("1. 上栏无标签 → 只有右上角窗口按钮")
print("2. 左栏无底部按钮 → 三项入口后无向下箭头")
print("3. 画布空态 → 印章 + 中英文字标")
print("4. 画布底纹 → 宣纸纹理")

# 窗口可见性：4 个 electron 进程 = 主 + 2 渲染 + GPU
result = subprocess.run(
    'tasklist', capture_output=True, text=True, shell=True, encoding='gbk', errors='ignore'
)
procs = result.stdout or ''
electron_count = procs.lower().count('electron.exe')
if electron_count >= 4:
    print(f"\n✓ Electron 已起（{electron_count} 个进程）")
else:
    print(f"\n✗ Electron 未完全启动（只有 {electron_count} 个进程）")
    sys.exit(1)

print("\n请手工确认窗口四项，全通过后回复\"验收通过\"。")
