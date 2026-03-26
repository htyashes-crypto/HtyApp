#!/usr/bin/env python3
"""从 build/移除图片黑色背景.png 去水印、方形裁切、白底转透明，导出 htyapp-icon PNG/ICO。"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

_DARK_SUM_THRESH = 180 * 3


def _dark_content_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    px = im.load()
    w, h = im.size
    min_x, min_y = w, h
    max_x, max_y = 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r + g + b < _DARK_SUM_THRESH:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if max_x < min_x:
        return 0, 0, w - 1, h - 1
    return min_x, min_y, max_x, max_y


def _square_crop(
    im: Image.Image, min_x: int, min_y: int, max_x: int, max_y: int
) -> tuple[Image.Image, int, int]:
    """Returns cropped image and (crop_x0, crop_y0) in source coords."""
    cw = max_x - min_x + 1
    ch = max_y - min_y + 1
    side = min(cw, ch)
    cx = (min_x + max_x) // 2
    cy = (min_y + max_y) // 2
    x0 = cx - side // 2
    y0 = cy - side // 2
    return im.crop((x0, y0, x0 + side, y0 + side)), x0, y0


def _cover_br_corner_watermark_white(im: Image.Image) -> None:
    """豆包类水印贴在白底右下角；勿用旁侧纹理修补（会留偏色白底上无法被去底）。"""
    w, h = im.size
    m = max(8, min(w, h) // 140)
    x0 = int(w * 0.83) - m
    y0 = int(h * 0.87) - m
    ImageDraw.Draw(im).rectangle([x0, y0, w - 1, h - 1], fill=(255, 255, 255))


def _white_to_alpha(im_rgb: Image.Image) -> Image.Image:
    """Near-white neutral background -> transparent; soft edge for anti-aliasing."""
    arr = np.asarray(im_rgb.convert("RGB"), dtype=np.int16)
    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]
    lum = r + g + b
    chroma = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    neutral = chroma < 22
    # Opaque by default; fade out as background approaches paper white.
    alpha = np.full(lum.shape, 255, dtype=np.uint8)
    # Hard-ish cut: most white pixels
    bg = neutral & (lum >= 738)
    alpha[bg] = 0
    edge = neutral & (lum >= 720) & (lum < 738)
    alpha[edge] = np.clip(255 - (738 - lum[edge]) * 14, 0, 255).astype(np.uint8)
    # 右下角曾用修补留下的浅灰/偏色块：中性色且够亮则当底去掉
    hh, ww = lum.shape
    xr = int(ww * 0.78)
    yr = int(hh * 0.88)
    band = np.zeros_like(lum, dtype=bool)
    band[yr:, xr:] = True
    fringe = band & (chroma < 38) & (lum >= 680)
    alpha[fringe] = 0
    rgba = np.dstack([arr.astype(np.uint8), alpha])
    return Image.fromarray(rgba, mode="RGBA")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="源 PNG（默认 build/移除图片黑色背景.png）",
    )
    parser.add_argument("--size", type=int, default=1024, help="输出边长")
    parser.add_argument(
        "--no-update-main",
        action="store_true",
        help="只写入 htyapp-icon-from-removed-bg.*，不覆盖 htyapp-icon.*",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    src = args.input or (root / "build" / "移除图片黑色背景.png")
    if not src.is_file():
        print("missing", src, file=sys.stderr)
        return 1

    raw = Image.open(src)
    if raw.mode == "RGBA":
        bg = Image.new("RGB", raw.size, (255, 255, 255))
        bg.paste(raw, mask=raw.split()[3])
        im = bg
    else:
        im = raw.convert("RGB")

    min_x, min_y, max_x, max_y = _dark_content_bbox(im)
    square, _, _ = _square_crop(im, min_x, min_y, max_x, max_y)

    _cover_br_corner_watermark_white(square)

    out_side = max(16, args.size)
    scaled_rgb = square.resize((out_side, out_side), Image.Resampling.LANCZOS)
    rgba = _white_to_alpha(scaled_rgb)

    branch = root / "build" / "htyapp-icon-from-removed-bg.png"
    rgba.save(branch, "PNG", optimize=True)
    print("wrote", branch.relative_to(root))

    ico_branch = root / "build" / "htyapp-icon-from-removed-bg.ico"
    ico_side = (256, 128, 64, 48, 32, 16)
    icon0 = rgba.resize((ico_side[0], ico_side[0]), Image.Resampling.LANCZOS)
    icon0.save(ico_branch, format="ICO", sizes=[(s, s) for s in ico_side])
    print("wrote", ico_branch.relative_to(root))

    if not args.no_update_main:
        png_main = root / "build" / "htyapp-icon.png"
        ico_main = root / "build" / "htyapp-icon.ico"
        rgba.save(png_main, "PNG", optimize=True)
        icon0.save(ico_main, format="ICO", sizes=[(s, s) for s in ico_side])
        print("wrote", png_main.relative_to(root))
        print("wrote", ico_main.relative_to(root))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
