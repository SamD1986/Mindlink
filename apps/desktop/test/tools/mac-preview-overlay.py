"""把 macOS 系统红绿灯叠加到真实渲染截图上，并生成 Windows/macOS 对照图。

叠加的依据：主进程 BrowserWindow 的 trafficLightPosition = { x: 16, y: 14 }，
灯直径 12、间距 8（macOS 标准），截图是 2 倍像素比，所以坐标与半径都乘 2。
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

TEMP = Path(sys.argv[1])
OUT = Path(sys.argv[2])
SCALE = 2                      # devicePixelRatio
LIGHT_X, LIGHT_Y = 16, 14      # 来自 apps/desktop/src/main.ts 的 trafficLightPosition
LIGHT_D, LIGHT_GAP = 12, 8     # macOS 交通灯直径与间距

COLORS = [(255, 95, 87), (254, 188, 46), (40, 200, 64)]
BORDER = (0, 0, 0, 40)
CAPTION_BG = (246, 246, 248)
CAPTION_FG = (32, 39, 45)
PANEL_BG = (255, 255, 255)
GAP = 18


def font(size):
    for candidate in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_traffic_lights(image: Image.Image) -> Image.Image:
    draw = ImageDraw.Draw(image, "RGBA")
    radius = (LIGHT_D // 2) * SCALE
    center_y = (LIGHT_Y + LIGHT_D / 2) * SCALE
    for index, color in enumerate(COLORS):
        center_x = (LIGHT_X + LIGHT_D / 2 + index * (LIGHT_D + LIGHT_GAP)) * SCALE
        box = [center_x - radius, center_y - radius, center_x + radius, center_y + radius]
        draw.ellipse(box, fill=color + (255,), outline=BORDER, width=max(1, SCALE))
    return image


def caption_strip(width: int, lines: list[str]) -> Image.Image:
    f_title, f_body = font(34), font(26)
    # 行数用 len(lines) 算，别用 len(lines[1])（那是字符串长度，会撑出一大片空白）
    height = 20 + 46 + 34 * (len(lines) - 1) + 20
    strip = Image.new("RGB", (width, height), CAPTION_BG)
    draw = ImageDraw.Draw(strip)
    draw.text((22, 16), lines[0], font=f_title, fill=CAPTION_FG)
    for index, line in enumerate(lines[1:]):
        draw.text((22, 62 + index * 34), line, font=f_body, fill=(90, 99, 108))
    return strip


def panel(path: Path, title: str, notes: list[str], lights: bool) -> Image.Image:
    shot = Image.open(path).convert("RGB")
    if lights:
        shot = draw_traffic_lights(shot)
    strip = caption_strip(shot.width, [title, *notes])
    canvas = Image.new("RGB", (shot.width + 2, shot.height + strip.height + 2), PANEL_BG)
    canvas.paste(shot, (1, 1))
    canvas.paste(strip, (1, shot.height + 1))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([0, 0, canvas.width - 1, canvas.height - 1], outline=(214, 219, 224))
    return canvas


windows = panel(
    TEMP / "topbar-windows.png",
    "Windows（真实渲染）",
    ["上栏 40px · 标签条左内缩 8px · 右上自绘三个窗口按钮（无系统标题栏）"],
    lights=False,
)
macos = panel(
    TEMP / "topbar-macos.png",
    "macOS（模拟渲染 + 叠加系统红绿灯）",
    [
        "把应用伪装成 macOS（改 userAgent/platform，走自己的 detectOs()）后真渲染：",
        "让位 112px · 自绘按钮 0 个 · 系统红绿灯按主进程 trafficLightPosition (x=16, y=14) 叠加",
    ],
    lights=True,
)

width = max(windows.width, macos.width)
height = windows.height + macos.height + GAP
compare = Image.new("RGB", (width, height), (235, 238, 241))
compare.paste(windows, (0, 0))
compare.paste(macos, (0, windows.height + GAP))

# 缩到便于查看的宽度
target_width = 1400
for image, name in ((compare, "mac-preview-compare.png"), (macos, "mac-preview-macos.png")):
    ratio = target_width / image.width
    resized = image.resize((target_width, round(image.height * ratio)), Image.LANCZOS)
    resized.save(OUT / name)
    print(f"写出 {OUT / name}  {resized.width}x{resized.height}")
