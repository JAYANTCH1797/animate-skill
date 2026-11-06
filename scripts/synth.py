#!/usr/bin/env python3
"""Synthesize a soundtrack: python3 synth.py score.json out.wav

score.json: {"duration": 15, "events": [...]}. Every event has "t" (seconds) and "sound". Optional on all:
"vel" 0-1 (default 0.7), "pan" -1..1 (default 0), "wet" reverb 0-1 (default 0.25).

  pluck  note                 plucked string, e.g. "note": "A4"
  bell   note                 glassy bell
  pad    notes, len, fade     soft sustained chord, e.g. "notes": ["D3", "A3", "F#4"]; "fade" in seconds, default 1.2
  buzz   note, len, rate      vibrating hum for wings and motors; "rate" is its flutter per second, default 30
  drip                        water drop, pitch rises
  tick                        tiny percussive click
  kick                        soft low thump
  impact                      deep soft hit with a tail
  swell  len                  noise rising into a moment; add "reverse": true to fall away
  whoosh len                  air passing
  bed    len, tone            quiet noise bed; tone 0 is dark, 1 is airy (wind, sea, room)

It prints the level for each half second, so you can see dips and peaks you can't hear. To hold a level across chord
changes, overlap pads by their fade.
"""
import json
import sys
import wave

import numpy as np

RATE = 44100
NOTES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
noise = np.random.default_rng(9)


def hertz(name):
    return 440 * 2 ** ((NOTES[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)


def clock(seconds):
    return np.arange(int(seconds * RATE)) / RATE


def lowpass(signal, cutoff):
    """Brick-wall-free low pass in the frequency domain; a soft roll-off keeps it from ringing."""
    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(len(signal), 1 / RATE)
    return np.fft.irfft(spectrum / (1 + (freqs / cutoff) ** 4), len(signal))


def pluck(note, seconds=2.6):
    """Karplus-Strong: a burst of noise circulating in a short delay is what a plucked string sounds like."""
    period = int(RATE / hertz(note))
    blocks = int(seconds * RATE / period) + 1
    out = np.zeros((blocks, period))
    out[0] = noise.uniform(-1, 1, period)
    for i in range(1, blocks):
        out[i] = 0.996 * 0.5 * (out[i - 1] + np.roll(out[i - 1], 1))
    return lowpass(out.reshape(-1)[: int(seconds * RATE)], 3800) * 1.6


def bell(note, seconds=4):
    t = clock(seconds)
    base = hertz(note)
    parts = [(1, 1, 1.4), (2.76, 0.5, 2.4), (5.4, 0.25, 4), (8.93, 0.1, 7)]
    return sum(level * np.sin(2 * np.pi * base * ratio * t) * np.exp(-t * decay) for ratio, level, decay in parts) * 0.6


def pad(notes, seconds, fade=1.2):
    t = clock(seconds)
    out = np.zeros_like(t)
    for name in notes:
        for detune in (0.997, 1, 1.003):
            for harmonic, level in ((1, 1), (2, 0.35), (3, 0.12)):
                out += level * np.sin(2 * np.pi * hertz(name) * detune * harmonic * t + detune * 40)
    fade = min(fade, seconds / 3)
    envelope = np.minimum(1, np.minimum(t / fade, (seconds - t) / fade))
    return out * envelope ** 2 / (len(notes) * 4.5)


def buzz(note, seconds, rate=30):
    t = clock(seconds)
    base = hertz(note)
    tone = sum(np.sin(2 * np.pi * base * k * t) / k for k in range(1, 9))
    flutter = 0.65 + 0.35 * np.sin(2 * np.pi * rate * t)
    edge = np.minimum(1, np.minimum(t, seconds - t) / 0.03)
    return tone * flutter * edge * 0.45


def drip():
    t = clock(0.22)
    return np.sin(2 * np.pi * (500 * t + 2600 * t ** 2)) * np.exp(-t * 22)


def tick():
    t = clock(0.05)
    return noise.normal(0, 1, len(t)) * np.exp(-t * 130) * 0.5 + np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 160) * 0.4


def kick():
    t = clock(0.35)
    return np.sin(2 * np.pi * (46 * t + 40 * (1 - np.exp(-t * 28)) / 28)) * np.exp(-t * 11)


def impact():
    t = clock(2.2)
    body = np.sin(2 * np.pi * (34 * t + 30 * (1 - np.exp(-t * 9)) / 9)) * np.exp(-t * 2.6)
    return body + lowpass(noise.normal(0, 1, len(t)), 900) * np.exp(-t * 5) * 0.25


def swell(seconds, reverse=False):
    t = clock(seconds)
    rise = (t / seconds) ** 2.4
    out = lowpass(noise.normal(0, 1, len(t)), 1800) * rise * 0.5 + np.sin(2 * np.pi * (70 * t + 60 * t ** 2 / seconds)) * rise * 0.3
    return out[::-1] if reverse else out


def whoosh(seconds):
    t = clock(seconds)
    return lowpass(noise.normal(0, 1, len(t)), 2400) * np.sin(np.pi * t / seconds) ** 2 * 0.7


def bed(seconds, tone=0.4):
    t = clock(seconds)
    rise = np.minimum(1, np.minimum(t, seconds - t) / min(1.5, seconds / 3))
    drift = 0.75 + 0.25 * np.sin(2 * np.pi * t / 5.3) * np.sin(2 * np.pi * t / 2.9)
    return lowpass(noise.normal(0, 1, len(t)), 300 + 5000 * tone ** 2) * rise * drift * 0.3


def voice(event):
    sound = event["sound"]
    length = event.get("len", 1.0)
    if sound == "pluck":
        return pluck(event["note"])
    if sound == "bell":
        return bell(event["note"])
    if sound == "pad":
        return pad(event["notes"], length, event.get("fade", 1.2))
    if sound == "buzz":
        return buzz(event["note"], length, event.get("rate", 30))
    if sound == "swell":
        return swell(length, event.get("reverse", False))
    if sound == "whoosh":
        return whoosh(length)
    if sound == "bed":
        return bed(length, event.get("tone", 0.4))
    if sound in ("drip", "tick", "kick", "impact"):
        return {"drip": drip, "tick": tick, "kick": kick, "impact": impact}[sound]()
    raise SystemExit(f"Unknown sound: {sound}")


def room(seconds=2.4):
    """A decaying burst of noise is a simple but convincing room."""
    t = clock(seconds)
    left, right = (lowpass(noise.normal(0, 1, len(t)), 5200) * np.exp(-t * 2.6) for _ in range(2))
    return left, right


def convolve(signal, impulse):
    size = len(signal) + len(impulse)
    return np.fft.irfft(np.fft.rfft(signal, size) * np.fft.rfft(impulse, size), size)[: len(signal)]


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    score = json.load(open(sys.argv[1]))
    samples = int((score["duration"] + 0.5) * RATE)
    dry = np.zeros((2, samples))
    wet = np.zeros((2, samples))
    for event in score["events"]:
        signal = voice(event) * event.get("vel", 0.7)
        start = int(event["t"] * RATE)
        end = min(samples, start + len(signal))
        signal = signal[: end - start]
        angle = (event.get("pan", 0) + 1) * np.pi / 4
        gains = (np.cos(angle), np.sin(angle))
        amount = event.get("wet", 0.25)
        for side in (0, 1):
            dry[side, start:end] += signal * gains[side]
            wet[side, start:end] += signal * gains[side] * amount
    left, right = room()
    mix = dry + 0.06 * np.stack([convolve(wet[0], left), convolve(wet[1], right)])
    mix = mix[:, : int(score["duration"] * RATE)]
    mix = np.tanh(mix / max(1e-6, np.abs(mix).max()) * 1.2) * 0.9  # gentle limiter; final loudness is set at the render
    with wave.open(sys.argv[2], "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes((mix.T * 32767).astype("<i2").tobytes())
    step = RATE // 2
    levels = [20 * np.log10(max(1e-5, float(np.sqrt((mix[:, i:i + step] ** 2).mean())))) for i in range(0, mix.shape[1], step)]
    print("Level per half second, dB:", [round(level) for level in levels])
    print(sys.argv[2])


if __name__ == "__main__":
    main()
