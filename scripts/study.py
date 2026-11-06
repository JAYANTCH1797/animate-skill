#!/usr/bin/env python3
"""Study reference images and videos: python3 study.py <out dir> <files or folders...>

Writes <out dir>/report.md, plus a contact sheet per reference. Videos also get their cuts and pacing.
To study only part of a video, add a range in seconds: "reel.mp4@0-12".
"""
import json
import re
import subprocess
import sys
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

IMAGES = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic", ".gif"}
VIDEOS = {".mp4", ".mov", ".webm", ".m4v", ".mkv"}
SIZE = (144, 256)  # small frames are plenty for measuring change


def ffprobe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration",
         "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    info = json.loads(out)
    stream = info["streams"][0]
    top, bottom = stream["r_frame_rate"].split("/")
    return stream["width"], stream["height"], float(top) / float(bottom), float(info["format"]["duration"])


def palette(image, colours=6):
    small = image.convert("RGB").resize((200, 200))
    reduced = small.quantize(colours, method=Image.Quantize.MEDIANCUT)
    counts = sorted(reduced.getcolors(), reverse=True)
    table = reduced.getpalette()
    total = sum(count for count, _ in counts)
    return [f"#{table[i * 3]:02x}{table[i * 3 + 1]:02x}{table[i * 3 + 2]:02x} {count / total:.0%}" for count, i in counts]


def frames_at(path, times, height=360):
    shots = []
    for time in times:
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", f"{time:.3f}", "-i", str(path), "-frames:v", "1", "-vf", f"scale=-2:{height}",
             "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True, check=True).stdout
        if raw:
            shots.append(Image.open(BytesIO(raw)).convert("RGB"))
    return shots


def tile(shots, columns=8):
    w, h = shots[0].size
    rows = -(-len(shots) // columns)
    sheet = Image.new("RGB", (w * min(columns, len(shots)), h * rows), "#111")
    for i, shot in enumerate(shots):
        sheet.paste(shot, ((i % columns) * w, (i // columns) * h))
    return sheet


def measure(path, fps, start, end):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", str(start), "-to", str(end), "-i", str(path), "-vf", f"scale={SIZE[0]}:{SIZE[1]}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, SIZE[1], SIZE[0]).astype(np.float32)
    change = np.abs(np.diff(frames, axis=0)).mean((1, 2))
    floor = max(25.0, float(np.median(change)) * 12)
    cuts = [round(float(i + 1) / fps, 2) for i in np.flatnonzero(change > floor)]
    per_second = [round(float(change[int(s * fps):int((s + 1) * fps)].mean()), 1) for s in range(int(len(change) / fps))]
    return cuts, per_second


def study_image(path, out):
    image = Image.open(path)
    sheet = out / f"{path.stem}.jpg"
    preview = image.convert("RGB")
    preview.thumbnail((1000, 1000))
    preview.save(sheet, quality=88)
    return [f"## {path.name} (image, {image.width}x{image.height})", f"- Palette: {', '.join(palette(image))}", f"- Preview: `{sheet}`"]


def study_video(path, out, span):
    width, height, fps, duration = ffprobe(path)
    start, end = span or (0, duration)
    end = min(end, duration)
    cuts, per_second = measure(path, fps, start, end)
    cuts = [round(start + cut, 2) for cut in cuts]
    bounds = [start, *cuts, end]
    shots = [(a + b) / 2 for a, b in zip(bounds, bounds[1:]) if b - a > 0.15]
    if len(shots) > 32:  # keep the sheet readable on long references
        shots = [shots[i] for i in np.linspace(0, len(shots) - 1, 32).astype(int)]
    elif len(shots) < 12:
        shots = list(np.linspace(start + 0.2, end - 0.2, 12))
    frames = frames_at(path, shots)
    suffix = f"@{start:g}-{end:g}" if span else ""
    sheet = out / f"{path.stem}{suffix}.jpg"
    contact = tile(frames)
    contact.save(sheet, quality=86)
    lengths = np.diff(bounds)
    return [
        f"## {path.name}{suffix} (video, {width}x{height}, {fps:.0f} fps, {end - start:.1f}s)",
        f"- Shots: {len(lengths)}, median {np.median(lengths):.1f}s, shortest {lengths.min():.1f}s, longest {lengths.max():.1f}s",
        f"- Cuts at: {cuts}",
        f"- Motion per second (higher is busier): {per_second}",
        f"- Palette across all shots: {', '.join(palette(tile(frames, len(frames))))}",
        f"- Contact sheet, one frame per shot: `{sheet}`",
    ]


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    items = []
    for name in sys.argv[2:]:
        match = re.fullmatch(r"(.+)@([\d.]+)-([\d.]+)", name)
        path = Path(match.group(1) if match else name)
        span = (float(match.group(2)), float(match.group(3))) if match else None
        items += [(p, None) for p in sorted(path.rglob("*")) if p.is_file()] if path.is_dir() else [(path, span)]
    report = ["# Reference study", ""]
    for path, span in items:
        kind = path.suffix.lower()
        if kind in IMAGES:
            report += study_image(path, out) + [""]
        elif kind in VIDEOS:
            report += study_video(path, out, span) + [""]
    (out / "report.md").write_text("\n".join(report))
    print("\n".join(report))


if __name__ == "__main__":
    main()
