#!/usr/bin/env python3
"""Crop 黑色荆棘 source PNG to the icon, remove bottom-right watermark, export app assets."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

# Source layout (2048 canvas): light border ~236 RGB; icon ~#0A1128 family; watermark bright cluster.
_DARK_SUM_THRESH = 180 * 3
# Watermark bright-pixel bbox on full image (from sampling); expanded slightly
_WM_X0, _WM_Y0, _WM_X1, _WM_Y1 = 1675, 1753, 1884, 1890


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
) -> Image.Image:
    cw = max_x - min_x + 1
    ch = max_y - min_y + 1
    side = min(cw, ch)
    cx = (min_x + max_x) // 2
    cy = (min_y + max_y) // 2
    x0 = cx - side // 2
    y0 = cy - side // 2
    return im.crop((x0, y0, x0 + side, y0 + side))


def _remove_watermark_region(im: Image.Image, full_wx0: int, full_wy0: int, full_wx1: int, full_wy1: int, crop_x0: int, crop_y0: int) -> None:
    """In-place patch: copy a strip from the left of the watermark over the watermark."""
    wx0 = full_wx0 - crop_x0
    wy0 = full_wy0 - crop_y0
    wx1 = full_wx1 - crop_x0
    wy1 = full_wy1 - crop_y0
    w, h = im.size
    rw = wx1 - wx0
    rh = wy1 - wy0
    gap = 24
    src_x1 = wx0 - gap
    src_x0 = src_x1 - rw
    if src_x0 < 0:
        src_x0 = 0
        src_x1 = min(rw, wx0 - gap)
    src_y0 = max(0, wy0 - 2)
    src_y1 = min(h, wy0 + rh + 2)
    # match heights
    dst_h = wy1 - wy0
    src_h = src_y1 - src_y0
    if src_h < dst_h:
        src_y1 = min(h, src_y0 + dst_h)
        src_h = src_y1 - src_y0
    patch_src = im.crop((src_x0, src_y0, src_x1, src_y1)).resize((rw, dst_h), Image.Resampling.LANCZOS)
    im.paste(patch_src, (wx0, wy0))


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    src = root / "build" / "黑色荆棘App图标.png"
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
    side = min(max_x - min_x + 1, max_y - min_y + 1)
    cx = (min_x + max_x) // 2
    cy = (min_y + max_y) // 2
    crop_x0 = cx - side // 2
    crop_y0 = cy - side // 2
    square = _square_crop(im, min_x, min_y, max_x, max_y)
    _remove_watermark_region(square, _WM_X0, _WM_Y0, _WM_X1, _WM_Y1, crop_x0, crop_y0)

    out_png = 1024
    final = square.resize((out_png, out_png), Image.Resampling.LANCZOS)

    png_path = root / "build" / "htyapp-icon.png"
    ico_path = root / "build" / "htyapp-icon.ico"
    derivative = root / "build" / "htyapp-icon-black-thorn-rose.png"

    final.save(png_path, "PNG", optimize=True)
    final.save(derivative, "PNG", optimize=True)
    ico_side = (256, 128, 64, 48, 32, 16)
    icon0 = final.convert("RGBA").resize((ico_side[0], ico_side[0]), Image.Resampling.LANCZOS)
    icon0.save(ico_path, format="ICO", sizes=[(s, s) for s in ico_side])
    print("wrote", png_path.relative_to(root))
    print("wrote", ico_path.relative_to(root))
    print("wrote", derivative.relative_to(root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
