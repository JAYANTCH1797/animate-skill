#!/usr/bin/env python3
"""Check a finished video: python3 qc.py video.mp4

Prints PASS/CHECK lines and writes <video>-sheet.jpg, one frame per second.
"""
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

SIZE = (216, 384)
DEAD = 0.12  # average change per frame below this means the picture is effectively frozen


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    path = Path(sys.argv[1])
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "default=nw=1", str(path)],
        capture_output=True, text=True, check=True).stdout
    duration = float(re.search(r"duration=([\d.]+)", probe).group(1))
    fps_top, fps_bottom = re.search(r"r_frame_rate=(\d+)/(\d+)", probe).groups()
    fps = int(fps_top) / int(fps_bottom)
    has_audio = "codec_type=audio" in probe
    streams = [float(x) for x in subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=duration", "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True, check=True).stdout.split()]
    print(f"{path.name}: {duration:.2f}s at {fps:.0f} fps, {re.search(r'width=(\d+)', probe).group(1)}x{re.search(r'height=(\d+)', probe).group(1)}")

    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"scale={SIZE[0]}:{SIZE[1]}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, SIZE[1], SIZE[0]).astype(np.float32)
    change = np.abs(np.diff(frames, axis=0)).mean((1, 2))

    # One-frame glitch: a frame unlike both neighbours while those neighbours match each other.
    glitches = []
    for i in range(1, len(frames) - 1):
        around = np.abs(frames[i + 1] - frames[i - 1]).mean()
        if min(change[i - 1], change[i]) > 6 and around < min(change[i - 1], change[i]) * 0.35:
            glitches.append(round(i / fps, 2))
    print(("CHECK one-frame glitches at " + str(glitches)) if glitches else "PASS no one-frame glitches")

    # The closing hold is meant to be still, so only look before it.
    window = int(fps)
    body = change[: max(window, len(change) - int(2 * fps))]
    still = np.convolve(body < DEAD, np.ones(int(1.5 * fps)), "valid") >= int(1.5 * fps)
    dead = sorted({round(float(i) / fps) for i in np.flatnonzero(still)})
    print(f"CHECK picture frozen for 1.5s+ around {dead}s" if dead else "PASS no dead stretches")
    if change[: int(fps / 2)].mean() < DEAD:
        print("CHECK nothing moves in the first half second")
    else:
        print("PASS moves in the first half second")
    print("Motion per second:", [round(float(change[int(s * fps):int((s + 1) * fps)].mean()), 1) for s in range(int(duration))])

    if has_audio:
        gap = abs(streams[0] - streams[-1])
        print(f"{'PASS' if gap < 0.06 else 'CHECK'} picture and sound differ by {gap:.2f}s")
        report = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
        loudness = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", report)[-1])
        peak = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", report)[-1])
        ok = -15.5 <= loudness <= -12.5 and peak <= -0.5
        print(f"{'PASS' if ok else 'CHECK'} loudness {loudness:.1f} LUFS, peak {peak:.1f} dB (aim for -14 and below -1)")
    else:
        print("CHECK no audio track")

    sheet = path.with_name(f"{path.stem}-sheet.jpg")
    columns = min(8, max(1, int(duration)))
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(path), "-vf", f"fps=1,scale=240:-1,tile={columns}x{-(-int(duration) // columns)}", "-frames:v", "1", str(sheet)],
        check=True)
    print("Sheet:", sheet)


if __name__ == "__main__":
    main()
