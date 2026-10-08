#!/usr/bin/env python3
"""Convert square source artwork into the canonical macOS app icon resources."""
import argparse
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    source = Image.open(args.source).convert('RGB')
    if source.width != source.height:
        parser.error('Source artwork must be square')

    assets = REPO / 'notekit-src/desktop/assets'
    iconset = REPO / 'notekit-src/tmp/app-icon.iconset'
    assets.mkdir(parents=True, exist_ok=True)
    iconset.mkdir(parents=True, exist_ok=True)

    # Normalize to an 824px continuous rounded tile on a 1024px canvas.
    # Mask only the exterior; all pixels inside the tile stay opaque.
    scale = 4
    canvas = Image.new('RGBA', (1024 * scale, 1024 * scale))
    tile = source.resize((824 * scale, 824 * scale), Image.Resampling.LANCZOS)
    mask = Image.new('L', tile.size)
    radius = (tile.width - 1) / 2
    points = []
    for step in range(1024):
        angle = step * math.tau / 1024
        x, y = math.cos(angle), math.sin(angle)
        points.append((radius + radius * math.copysign(abs(x) ** 0.5, x),
                       radius + radius * math.copysign(abs(y) ** 0.5, y)))
    ImageDraw.Draw(mask).polygon(points, fill=255)
    canvas.paste(tile, (100 * scale, 100 * scale), mask)
    icon = canvas.resize((1024, 1024), Image.Resampling.LANCZOS)
    icon.save(assets / 'app-icon.png')

    for size in (16, 32, 128, 256, 512):
        for density in (1, 2):
            pixels = size * density
            suffix = '@2x' if density == 2 else ''
            icon.resize((pixels, pixels), Image.Resampling.LANCZOS).save(
                iconset / f'icon_{size}x{size}{suffix}.png')
    subprocess.run(['iconutil', '-c', 'icns', '-o', str(assets / 'app-icon.icns'),
                    str(iconset)], check=True)
    print(f'Generated {assets / "app-icon.png"} and {assets / "app-icon.icns"}')


if __name__ == '__main__':
    main()
