#!/usr/bin/env python3
"""Mix narration over a score, ducking the score while the voice talks: python3 mix.py voice.wav score.wav out.wav"""
import subprocess
import sys
import wave

import numpy as np

RATE = 44100


def read(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ar", str(RATE), "-ac", "2", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    voice, score = read(sys.argv[1]), read(sys.argv[2])
    length = max(len(voice), len(score))
    voice = np.pad(voice, ((0, length - len(voice)), (0, 0)))
    score = np.pad(score, ((0, length - len(score)), (0, 0)))

    hop = RATE // 100
    level = np.abs(voice).max(1)[: length // hop * hop].reshape(-1, hop).max(1)
    window = np.hanning(41)
    talking = np.minimum(1, np.convolve((level > 0.02).astype(np.float32), window / window.max() * 0.5, "same"))
    gain = np.repeat(1 - 0.62 * talking, hop)
    gain = np.pad(gain, (0, length - len(gain)), mode="edge")[:, None]

    mix = voice / max(1e-6, float(np.abs(voice).max())) * 0.85 + score * gain * 0.55
    mix = np.clip(mix / max(1.0, float(np.abs(mix).max())), -1, 1)
    with wave.open(sys.argv[3], "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes((mix * 32767).astype("<i2").tobytes())
    print(sys.argv[3])


if __name__ == "__main__":
    main()
