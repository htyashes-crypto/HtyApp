#!/usr/bin/env python3
"""Remove navy background and warm glow from 黑色荆棘 app icon; keep rose, thorns, light frame."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image


def _build_foreground_mask(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    lum = r + g + b

    black = mx <= 38
    bright_frame = lum >= 600
    light_mn = mn >= 175

    warm = (r > b + 8) & (r > 50)

    blue_high = (b > 85) & ~warm
    blue_mid = (b > r + 35) & ((b > 72) | (lum > 140) | (g > 42))
    blue_leafy = (g > 75) & (b > r + 10)

    blue_rose = blue_high | blue_mid | blue_leafy

    fg = black | blue_rose | bright_frame | light_mn

    # Warm haze / rim glow (not blue petal); leave light frame (high mn, neutral r≈b).
    tan_glow = (r > b + 18) & (b < 195) & (lum > 165) & (lum < 720)

    return fg & ~tan_glow


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    path = root / "build" / "黑色荆棘App图标.png"
    if not path.is_file():
        print("missing", path, file=sys.stderr)
        return 1

    src = Image.open(path)
    if src.mode == "RGBA":
        ch = src.split()
        im = Image.merge("RGB", ch[:3])
    else:
        im = src.convert("RGB")
    rgb = np.array(im, dtype=np.uint8)
    fg = _build_foreground_mask(rgb)
    alpha = Image.fromarray(np.where(fg, 255, 0).astype(np.uint8), mode="L")

    rgba = Image.merge("RGBA", (*im.split(), alpha))
    rgba.save(path, "PNG", optimize=True)
    print("updated", path.relative_to(root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
