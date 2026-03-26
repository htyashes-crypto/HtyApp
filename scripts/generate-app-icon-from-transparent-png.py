#!/usr/bin/env python3
"""从带 Alpha 的 PNG（如抠图/插画）生成 app 用 PNG + 多尺寸 ICO。"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image


def _alpha_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    if im.mode == "RGBA":
        bb = im.split()[3].getbbox()
        if bb:
            return bb[0], bb[1], bb[2] - 1, bb[3] - 1
    return 0, 0, im.width - 1, im.height - 1


def _square_crop_rgba(
    im: Image.Image, min_x: int, min_y: int, max_x: int, max_y: int
) -> Image.Image:
    cw = max_x - min_x + 1
    ch = max_y - min_y + 1
    side = min(cw, ch)
    cx = (min_x + max_x) // 2
    cy = (min_y + max_y) // 2
    x0 = max(0, cx - side // 2)
    y0 = max(0, cy - side // 2)
    x1 = min(im.width, x0 + side)
    y1 = min(im.height, y0 + side)
    if x1 - x0 < side:
        x0 = max(0, x1 - side)
    if y1 - y0 < side:
        y0 = max(0, y1 - side)
    return im.crop((x0, y0, x1, y1))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="源 PNG（默认 build/20260326-123242.png）",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=1024,
        help="主 PNG 边长",
    )
    parser.add_argument(
        "--out-stem",
        type=str,
        default="htyapp-icon-20260326",
        help="输出 build/<stem>.png 与 .ico（不含扩展名）",
    )
    parser.add_argument(
        "--update-main",
        action="store_true",
        help="同时覆盖 build/htyapp-icon.png / build/htyapp-icon.ico",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    src = args.input or (root / "build" / "20260326-123242.png")
    if not src.is_file():
        print("missing", src, file=sys.stderr)
        return 1

    raw = Image.open(src).convert("RGBA")
    min_x, min_y, max_x, max_y = _alpha_bbox(raw)
    square = _square_crop_rgba(raw, min_x, min_y, max_x, max_y)

    out_side = max(16, int(args.size))
    final = square.resize((out_side, out_side), Image.Resampling.LANCZOS)

    stem = args.out_stem.strip() or "icon-out"
    png_path = root / "build" / f"{stem}.png"
    ico_path = root / "build" / f"{stem}.ico"
    png_path.parent.mkdir(parents=True, exist_ok=True)

    final.save(png_path, "PNG", optimize=True)
    ico_side = (256, 128, 64, 48, 32, 16)
    icon0 = final.resize((ico_side[0], ico_side[0]), Image.Resampling.LANCZOS)
    icon0.save(ico_path, format="ICO", sizes=[(s, s) for s in ico_side])

    print("wrote", png_path.relative_to(root))
    print("wrote", ico_path.relative_to(root))

    if args.update_main:
        main_png = root / "build" / "htyapp-icon.png"
        main_ico = root / "build" / "htyapp-icon.ico"
        final.save(main_png, "PNG", optimize=True)
        icon0.save(main_ico, format="ICO", sizes=[(s, s) for s in ico_side])
        print("wrote", main_png.relative_to(root))
        print("wrote", main_ico.relative_to(root))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
