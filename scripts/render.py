#!/usr/bin/env python3
"""Render piece.html with headless system Chrome.

  render.py <piece.html> --stills 0.5 3 7        preview frames into out/stills/
  render.py <piece.html> [--audio score.wav]     draw every frame, then write out/<folder name>.mp4
  render.py <piece.html> --audio score.wav --remux   keep the drawn picture, swap only the sound (seconds, no redraw)

piece.html sets window.PIECE = {width, height, fps, duration}, window.ready (optional promise), window.renderFrame(t).
With audio, the result is mastered to -14 LUFS.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

LOUDNESS = "I=-14:TP=-1.5:LRA=11"


def launch(playwright):
    try:
        return playwright.chromium.launch(channel="chrome", headless=True)
    except Exception:  # no Chrome installed: use Playwright's own build (playwright install chromium)
        return playwright.chromium.launch(headless=True)


def open_piece(playwright, html):
    browser = launch(playwright)
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(html.as_uri())
    piece = page.evaluate("window.PIECE")
    page.set_viewport_size({"width": piece["width"], "height": piece["height"]})
    page.evaluate("window.ready")
    return browser, page, piece, errors


def draw(page, errors, time):
    page.evaluate("t => window.renderFrame(t)", time)
    if errors:
        raise SystemExit(f"piece.html failed at t={time:.2f}: {errors[0]}")
    return page.screenshot(type="jpeg", quality=97)


def render_stills(html, times, out):
    stills = out / "stills"
    stills.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser, page, _, errors = open_piece(playwright, html)
        for time in times:
            path = stills / f"t{time:06.2f}.jpg"
            path.write_bytes(draw(page, errors, time))
            print(path)
        browser.close()


def render_picture(html, picture):
    """One page in one process, streaming straight to ffmpeg. A pool of browsers saved little and could hang on exit."""
    with sync_playwright() as playwright:
        browser, page, piece, errors = open_piece(playwright, html)
        encoder = subprocess.Popen(
            ["ffmpeg", "-y", "-v", "error", "-f", "image2pipe", "-framerate", str(piece["fps"]), "-c:v", "mjpeg", "-i", "-",
             "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(picture)],
            stdin=subprocess.PIPE)
        total = round(piece["duration"] * piece["fps"])
        for number in range(total):
            encoder.stdin.write(draw(page, errors, number / piece["fps"]))
            if number % piece["fps"] == 0:
                print(f"frame {number}/{total}", flush=True)
        encoder.stdin.close()
        if encoder.wait():
            raise SystemExit("ffmpeg failed while encoding the picture")
        browser.close()


def picture_seconds(picture):
    return subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "default=nw=1:nk=1", str(picture)],
        capture_output=True, text=True, check=True).stdout.strip()


def master(source, target):
    """Two-pass loudness normalisation to the level Reels and Shorts expect."""
    report = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(source), "-af", f"loudnorm={LOUDNESS}:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    m = json.loads(re.findall(r"\{[^{}]*\}", report)[-1])
    measured = (f"measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
                f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(source), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-af", f"loudnorm={LOUDNESS}:{measured}", str(target)], check=True)


def add_sound(picture, audio, final):
    seconds = picture_seconds(picture)
    joined, mastered = final.with_name("joined.mp4"), final.with_name("mastered.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(picture), "-i", str(audio), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
         "-t", seconds, str(joined)], check=True)
    master(joined, mastered)
    # Mastering pads the sound slightly, so trim back to the picture's exact length.
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mastered), "-c", "copy", "-t", seconds, "-movflags", "+faststart", str(final)], check=True)
    joined.unlink()
    mastered.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("piece", type=Path)
    parser.add_argument("--stills", type=float, nargs="+")
    parser.add_argument("--audio", type=Path)
    parser.add_argument("--remux", action="store_true")
    args = parser.parse_args()

    html = args.piece.resolve()
    out = html.parent / "out"
    out.mkdir(exist_ok=True)
    if args.stills:
        render_stills(html, args.stills, out)
        return

    picture = out / "picture.mp4"  # kept so a sound change never needs a redraw
    final = out / f"{html.parent.name}.mp4"
    if not args.remux:
        render_picture(html, picture)
    if args.audio:
        add_sound(picture, args.audio.resolve(), final)
    else:
        final.write_bytes(picture.read_bytes())
    print(final)


if __name__ == "__main__":
    main()
