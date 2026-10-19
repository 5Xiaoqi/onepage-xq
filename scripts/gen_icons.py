"""生成一页的 App 图标（1024 画布，输出 512/192/180/maskable）"""
from __future__ import annotations

import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

S = 1024


def gradient_bg() -> Image.Image:
    # 对角渐变：#1E9474 → #0A4E3C
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    t = (x * 0.55 + y * 0.75) / (S * 1.3)
    t = np.clip(t, 0, 1)[..., None]
    c1 = np.array([30, 148, 116], dtype=np.float32)
    c2 = np.array([8, 74, 57], dtype=np.float32)
    rgb = c1 * (1 - t) + c2 * t
    # 右上角高光
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.sqrt((xx - S * 0.78) ** 2 + (yy - S * 0.18) ** 2) / (S * 0.62)
    glow = np.clip(1 - d, 0, 1)[..., None] ** 2 * 34
    rgb = np.clip(rgb + glow, 0, 255).astype(np.uint8)
    return Image.fromarray(rgb, "RGB").convert("RGBA")


def draw_ring(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, width: float, start: float, end: float, fill):
    box = [cx - r, cy - r, cx + r, cy + r]
    d.arc(box, start=start, end=end, fill=fill, width=int(width))


def option_a() -> Image.Image:
    """秒表：白环 + 指针 + 顶部按钮"""
    img = gradient_bg()
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S / 2 + 34
    r = 300
    d.rounded_rectangle([cx - 72, cy - r - 96, cx + 72, cy - r - 34], radius=26, fill=(255, 255, 255, 255))
    draw_ring(d, cx, cy, r, 62, 0, 360, (255, 255, 255, 255))
    # 指针：12 点 → 中心 → 4 点
    d.line([cx, cy, cx, cy - r + 96], fill=(255, 255, 255, 255), width=58)
    d.line([cx, cy, cx + 176, cy + 96], fill=(255, 255, 255, 255), width=58)
    d.ellipse([cx - 34, cy - 34, cx + 34, cy + 34], fill=(255, 255, 255, 255))
    # 品牌点
    d.ellipse([cx + 236, cy - 214, cx + 292, cy - 158], fill=(255, 176, 138, 255))
    return img


def option_b() -> Image.Image:
    """一页纸 + 三条横线 + 对勾"""
    img = gradient_bg()
    d = ImageDraw.Draw(img)
    w, h = 452, 566
    x0, y0 = (S - w) / 2, (S - h) / 2 - 4
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=70, fill=(255, 253, 248, 255))
    # 折角
    fold = 138
    d.polygon([(x0 + w - fold, y0), (x0 + w, y0 + fold), (x0 + w - fold, y0 + fold)], fill=(224, 238, 231, 255))
    for i, yy in enumerate([y0 + 232, y0 + 322, y0 + 412]):
        d.rounded_rectangle([x0 + 74, yy, x0 + w - (168 if i == 2 else 74), yy + 34], radius=17, fill=(24, 120, 95, 205))
    # 对勾
    cx, cy = x0 + w - 104, y0 + h - 92
    d.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], fill=(184, 85, 58, 255))
    d.line([cx - 32, cy + 2, cx - 7, cy + 29, cx + 36, cy - 27], fill=(255, 255, 255, 255), width=18, joint="curve")
    return img


def option_c() -> Image.Image:
    """环 + 对勾"""
    img = gradient_bg()
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S / 2
    r = 310
    draw_ring(d, cx, cy, r, 72, -54, 306, (255, 255, 255, 255))
    # 对勾
    pts = [(cx - 150, cy + 6), (cx - 40, cy + 118), (cx + 176, cy - 128)]
    d.line(pts, fill=(255, 255, 255, 255), width=82, joint="curve")
    # 端点圆角
    for px, py in pts:
        d.ellipse([px - 41, py - 41, px + 41, py + 41], fill=(255, 255, 255, 255))
    d.ellipse([cx + 214, cy - 292, cx + 286, cy - 220], fill=(255, 176, 138, 255))
    return img


def export(img: Image.Image, name: str, size: int, pad_ratio: float = 0.0):
    im = img.convert("RGB")
    if pad_ratio:
        # 给 maskable 留安全区
        inner = int(size * (1 - pad_ratio * 2))
        im = im.resize((inner, inner), Image.LANCZOS)
        canvas = Image.new("RGB", (size, size), (10, 78, 60))
        # 底色取自角落，避免露出白边
        px = img.getpixel((4, 4))
        canvas = Image.new("RGB", (size, size), px)
        canvas.paste(im, ((size - inner) // 2, (size - inner) // 2))
        canvas.save(os.path.join(OUT, name), quality=95)
    else:
        im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), quality=95)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    opts = {"a": option_a, "b": option_b, "c": option_c}
    for key, fn in opts.items():
        img = fn()
        img.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f"preview-{key}.png"))
        if which == "all" or which == key:
            export(img, "icon-512.png", 512)
            export(img, "icon-192.png", 192)
            export(img, "icon-180.png", 180)
            export(img, "icon-maskable-512.png", 512, pad_ratio=0.12)
            img.save(os.path.join(OUT, "icon-1024.png"))
    print("done", os.path.abspath(OUT))
