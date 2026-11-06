# Style recipes

**Proven** recipes have shipped in finished films. Read the source in this skill's `examples/` and port it: the
`seaside-scene` files are TypeScript for Remotion, but the drawing is plain Canvas 2D, so dropping the types is most of
the work. `examples/bee-dance/piece.html` is already the right format. **Starting points** are untested ideas; expect to tune them against your reference.

## Proven

| Look | Source | Idea |
| --- | --- | --- |
| Anime cumulus clouds | `examples/seaside-scene/clouds.ts` | Pile spheres into a height map, bend it with noise, light it with cast shadows by marching towards the sun, snap to 4-5 flat tones. Paint wider than the frame so drifting shows no edge. |
| Trees and foliage | `seaside-scene/foliage.ts` | Stamp leaves per lobe, sorted dark to light by which way they face the sun. One sprite per clump so each sways alone. |
| Walking people | `seaside-scene/people.ts` | Two-bone legs. In stance a foot moves back at exactly the body's speed, so feet stay planted. Stride, period and speed must agree or they skate. Keep figures small: the face is the weak point. |
| Street, shop, signage | `seaside-scene/scene.ts` | Perspective slab grid from a vanishing point. Dark line art plus flat shadow shapes. Dither long gradients with faint noise so they don't band in video. |
| Water | `seaside-scene/Seaside.tsx` | Painted swell strokes, then per-frame glints that pulse in and out, plus shoreline shapes breathing on slow sines. |
| Tree shade | `paintDapple` in `seaside-scene/scene.ts` | Leaf stamps squashed by perspective, gaps punched out, multiplied over the ground, two copies sliding against each other. |
| Bloom and vignette | `drawGrade` in `seaside-scene/Seaside.tsx` | Blurred quarter-size copy, screened and soft-lit over the frame. |
| Flight | `drawBirds` in `seaside-scene/Seaside.tsx` | Several flocks spaced so one is always crossing; each bird has its own flap rate and phase. |
| Watercolour wash, spreading ink | `paintWash`, `paintBloom` in `examples/bee-dance/piece.html` | Wobbled edge, pigment pooling at the rim, soft blooms, granulation, multiplied on paper. Grows from a drop through a noise-edged reveal. |
| Paper | `paintPaper` in `examples/bee-dance/piece.html` | Fixed fibre and grain layer. Grain that crawls reads as video noise unless you want a film look. |
| Painted creature from above | `buildBee`, `drawBee` in `examples/bee-dance/piece.html` | Build the body once as a sprite, draw legs and wings live, add a soft offset shadow. |
| Meadow, blossom tree, clouds in watercolour | `paintMeadow`, `paintTree`, `paintClouds` in `examples/bee-dance/piece.html` | The same wash language applied to a landscape. |
| Hand-drawn line that draws itself | `linePoints`, `stroke`, `drawLine` in `examples/bee-dance/piece.html` | Sample a path evenly, reveal it by length, add a seeded wobble. |

Depth order bugs are easy to miss in one still. Draw by where things touch the ground, and check the frames where
something crosses a prop.

## Starting points

- **Paper-cut**: flat shapes with slightly rough edges, each with an offset soft shadow. Animate by sliding layers.
- **Risograph**: 2-3 spot colours, multiply blending, halftone dots, a small misregistration between plates.
- **Line art**: draw strokes with a growing dash offset, and redraw a slight wobble on twos (every other frame) for
  a hand-drawn boil. Seed it from the frame number so it stays deterministic.
- **Botanical plate**: fine ink outlines, thin wash fills, cream paper, small serif captions.

## Motion feel

- Ease everything. Linear motion looks like a screensaver, except drift at constant speed.
- Stagger groups by a few frames; things appearing together look mechanical.
- Overshoot small pops, never large masses.
- Use calm, fast, calm: tension comes from the change of pace, not constant speed.
- The `motion-design` skill has more on timing and easing.
