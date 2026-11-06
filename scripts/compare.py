#!/usr/bin/env python3
"""Put images side by side for review: python3 compare.py out.jpg image1 image2 ..."""
import sys

from PIL import Image

WIDTH = 540


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    images = [Image.open(path).convert("RGB") for path in sys.argv[2:]]
    images = [image.resize((WIDTH, round(image.height * WIDTH / image.width))) for image in images]
    sheet = Image.new("RGB", (WIDTH * len(images), max(image.height for image in images)), "#222")
    for i, image in enumerate(images):
        sheet.paste(image, (WIDTH * i, 0))
    sheet.save(sys.argv[1], quality=90)


if __name__ == "__main__":
    main()
