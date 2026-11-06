# Move an image

Working example: `examples/moving-image/layers.py` and `animate.py` in this skill's folder, written for a picture of a
train under a blossom tree (the picture itself isn't included). Copy them into `animations/<slug>/` and change the masks
and coordinates. This job needs OpenCV: `pip install opencv-python-headless`.

Moving the real artwork keeps its quality, which code can't repaint. The craft is in deciding what can move without
exposing something that was never painted.

## Cut layers

Split into what moves differently: sky, far land, subject, foreground plants.

- **Geometric subjects** (vehicles, buildings): a hand-drawn polygon refined by `cv2.grabCut` gives a clean edge.
  Measure the polygon on a 2x close-up, not the full frame.
- **Colourful organic shapes** (blossoms, foliage): threshold on colour, limited to a hand-drawn zone. Check the
  cutout on a loud green or magenta background.
- **Thin dark lines** (wires, struts): `MORPH_BLACKHAT` finds thinness. Darkness alone drags in hills behind them,
  and on blossoms it picks up the gaps between petals, so keep it away from busy areas.
- **Sky**: anything above a hand-traced ridge line that isn't another layer.

Always build a review sheet of every layer before animating. Mask mistakes are invisible in a single final frame.

## Fill what moves away

Each moved layer needs something behind it.

- Sway of a few pixels: `cv2.inpaint` at 1/3 size is enough, since almost none of it shows.
- A real reveal: clone the neighbouring scenery across instead. Inpaint gives an obvious smear there.
- Beneath a vehicle: darken it. What's uncovered should read as its shadow.
- Remove anything painted frozen that you'll now animate, like petals in the sky, or they hang still in the moving air.

## Move a vehicle along perspective

Find where its roof line and floor line meet. Scaling the sprite about that point slides it along its own rails: lines
through that point map onto themselves, so rails and overhead wire stay put and the pantograph stays under the wire.
The far end barely moves, so almost nothing is uncovered. Use `1 / (1 - c*t)` for scale, which is constant real speed.

Keep it behind what's nearer: clip the sprite at the near rail, and draw hanging branches over it.

## Make things bend

Warp with `cv2.remap` using smooth displacement fields instead of moving rigid pieces.

- Weight by how free the part is. A branch tip moves, the trunk doesn't. Weight grass by plant colour, so stones and
  rails stay still.
- Send wind across the frame as a travelling wave, with a phase lag by distance, so gusts visibly pass through.
- Add small high-frequency flutter on top of slow sway.
- Give each layer a different slow push-in. That's cheap parallax.

Add particles (petals, snow, dust) in the same wind direction, with a few large, slightly blurred ones near the lens.

A source under about 1000px wide will look soft when upscaled. Say so in the hand-over.
