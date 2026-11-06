---
name: animate
description: >-
  Make a finished short animation drawn entirely in code, with a synthesized soundtrack, from any number of
  reference images or videos plus a rough idea. Three jobs: animate a still image the user supplies, repaint a
  reference as a moving scene, or make a new film on a topic in the look of the references (explainers, animated
  stories, motion graphics, loops). Use whenever the user shares a reference image or video and says animate this,
  bring it to life, make it move, make something like this, in this style, or asks for an animated explainer or
  story "drawn with code" or without AI video models, even if they never say "skill". Prefer this over video-studio
  when the look of the animation is the point rather than a narrated reel.
---

# animate

Turn references and a rough idea into an MP4 where every frame is drawn by code and the sound is synthesized.
The user brings taste; you do the directing. A rough brief is enough, so make the creative calls yourself and ask
only about what would change the whole piece.

Everything lives in `animations/<slug>/`:

```
refs/  study/  style.md  beats.md  piece.html  score.json  out/<slug>.mp4
```

Add helper scripts or notes there as needed. `examples/bee-dance/` in this skill's folder is a complete worked film.

In the commands below, `$SKILL` means this skill's folder. Run them from the user's project with `$SKILL/.venv/bin/python`
if that exists, otherwise `python3`. If a package is missing, see the setup in `README.md`. They need ffmpeg and Chrome.

## Pick the job

| The user wants | Job | How |
| --- | --- | --- |
| "Animate this image" | **Move the artwork** | Cut the image into layers and move those. Read `references/move-an-image.md`. Skip stages 3-4's piece.html; the render is a Python script. |
| "Paint this", "recreate this scene" | **Repaint** | Draw the whole scene in `piece.html`, matching the reference closely. |
| A topic or story "in this style" | **New film** | Full process below. References set the look; the subject is new. |

If they don't name a length or shape, use 15 seconds at 1080x1920 for a film and 5 seconds for a moving image.

Code is strong at shapes, lines, gradients and texture: flat vector, line art, paper-cut, risograph, watercolour,
anime backgrounds, botanical plates. It is weak at photorealism and at acting faces. If a reference is photoreal,
say so before building and propose an illustrated take on it.

## Stage 1: Study every reference

The user may hand you many references, so give each one a job rather than averaging them into mush.

```bash
python3 $SKILL/scripts/study.py animations/<slug>/study <files or folders...>
```

This gives you, per reference, a contact sheet, a palette, and for videos the cuts and the pacing curve. If only part
of a video matters, add its range in seconds, as in `"reel.mp4@0-12"`, or talking-head footage skews the results.
Then look at the sheets yourself, and crop in where texture matters. Numbers can't tell you why something feels good.

Write `style.md`:

- **What each reference gives us**, one line each: texture from this one, type from that one, pacing from another.
- **What we will not copy**: poses, characters, logos, signatures, exact compositions. Take the style, not the work;
  the exception is a Repaint or Move job on an image the user asked to animate.
- **Palette** as hex values, **type** (`assets/fonts/` has two to start with, or copy in any open font), **texture**, **motion feel**.
- **One device** that ties the piece together: a lens, a ripple, a line that never breaks. Films without one feel
  like a slideshow.

Add a short card for each new reference to `animations/library.md`, so its lessons outlive this project. Reuse
cards when the user points at a style they've used before, and extend one only when you learned something new.

**Gate:** you can say in one sentence what this piece looks like and why that serves the topic.

## Stage 2: Beats

If there are facts in the piece, check them first. A wrong claim drawn beautifully is still wrong, and popular
"facts" are often loose. Note anything you softened for the final report.

Write `beats.md` as one table. Picture and sound are planned together because that sync is what makes it feel
expensive:

| Time | Picture | Sound |
| --- | --- | --- |
| 0-1.5 s | An orange drop falls and spreads | Drip, wet bloom, pad comes in |
| 1.5-3 s | Title line, details pop on | Pluck per word, tiny ticks |

**Gate:** something moves in the first half second; the shape is hook, build, a breath, payoff; no stretch over
2 seconds without a new picture idea; the end holds about 1.5 seconds so it can be read. Let the picture carry the
new ideas rather than the words: each caption needs about 1.5 seconds on screen, so cut captions before shortening
them. Keep text out of the top 12% and bottom 18% of a vertical frame.

## Stage 3: Build the picture

Copy `assets/piece-template.html` to `piece.html` and draw in it. The contract is `window.PIECE` plus
`window.renderFrame(t)`.

`renderFrame(t)` must depend only on `t`, and may be async. Stills jump straight to any time, so anything remembered
between frames, or any unseeded `Math.random()`, breaks them. Paint expensive static layers once inside `window.ready`,
from a seeded generator, then composite per frame.

To show another film inside a piece, extract its frames to `clips/` as numbered JPEGs, load the one you need with an
`Image` inside an async `renderFrame`, and draw it to the canvas.

Read `references/styles.md` before drawing; it has working recipes (cel clouds, foliage, walking figures, water,
watercolour, paper) and the source files to copy from. Depth comes from layers moving at different speeds, life
comes from small secondary motion: sway, drift, shimmer, flicker.

Review stills early and often, long before a full render:

```bash
python3 $SKILL/scripts/render.py animations/<slug>/piece.html --stills 0.5 3 7 12
```

Look at them at full size, compare them side by side with the references, and fix what's off. Expect several rounds.
The first still is usually a rough draft, and this loop is where the quality comes from.

```bash
python3 $SKILL/scripts/compare.py animations/<slug>/out/compare.jpg <stills and reference images...>
```

**Gate:** a still from the middle looks like it was made with the same materials as the references: same paper, paint,
line and colour. The subject can be new. Clip-art versions of the reference don't pass.

## Stage 4: Sound

Write `score.json` against the same times as `beats.md`. See the header of `scripts/synth.py` for the sounds
available: plucks, bells, pads, drips, ticks, swells, whooshes, impacts, kicks and noise beds.

```bash
python3 $SKILL/scripts/synth.py animations/<slug>/score.json animations/<slug>/out/score.wav
```

Stay in one key. Land the hits on picture events, not on a grid. Leave real quiet before the payoff, because the
contrast is what makes it land. Generate long runs of notes with a few lines of Python rather than typing them out.

You can't hear it, so read the level report `synth.py` prints: look for dips you didn't plan, and for the signature
sound being buried under the rest.

### If the piece is narrated

Narration comes before the picture, because word timings set every beat. Record it with whatever voice tool the user
has, transcribe it with word timings (faster-whisper works), then build the beats and captions from those times.
Whisper can start a word early in the silence before it, so check the waveform before cutting in a pause.

Mix the voice over the score, then render with the result as `--audio`. The score ducks under the voice, so music rises
in the pauses:

```bash
python3 $SKILL/scripts/mix.py animations/<slug>/out/voice.wav animations/<slug>/out/score.wav animations/<slug>/out/mix.wav
```

## Stage 5: Render, check, fix

```bash
python3 $SKILL/scripts/render.py animations/<slug>/piece.html --audio animations/<slug>/out/score.wav
python3 $SKILL/scripts/qc.py animations/<slug>/out/<slug>.mp4
```

`render.py` writes `out/<slug>.mp4`, mastered to -14 LUFS. It prints progress, and takes about 1-2 minutes for 15
seconds of a typical piece; run it in the background if a piece is heavy. After a sound-only change, add `--remux`
to swap the audio in seconds without redrawing.

`qc.py` flags dead stretches, one-frame glitches and loudness, and writes a contact sheet. It can't judge whether
motion looks good, so read the sheet too, then step through the risky moments frame by frame in close-up crops:
transitions, text on and off, where layers overlap, and a full cycle of any repeated motion. Fix and re-render until
clean.

## Hand over

Report in the user's plain language: what you made, how each reference was used, what you checked, and what you
could not check. You cannot hear the score or watch it at speed, so say so. Add:

- **One fact to know**, if you softened a claim.
- **Easy tweaks**: 3 or 4 specific changes they could ask for next.
- Whether a reference belongs to someone else and needs thought before commercial use.
