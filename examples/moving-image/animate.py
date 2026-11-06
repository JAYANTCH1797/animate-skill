"""Animate the still: python3 animate.py            -> ../out.mp4
                     python3 animate.py <dir> 0 75  -> preview frames as PNGs
Needs: pip install opencv-python-headless
"""
import math
import subprocess
import sys

import cv2
import numpy as np

from layers import BENCH, H, K, PATH, VANISH, W, build, crop, orig, polygon

FPS, FRAMES, OUT_H = 30, 150, 1920
SECONDS = FRAMES / FPS
TRAIN_END_SCALE = 1.14
rng = np.random.default_rng(21)

X, Y = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))


def field(cell, seed):
    """Smooth random pattern in about -1..1; `cell` is the size of its blobs in pixels."""
    local = np.random.default_rng(seed)
    small = local.standard_normal((H // cell + 3, W // cell + 3)).astype(np.float32)
    big = cv2.resize(small, (W, H), interpolation=cv2.INTER_CUBIC)
    return np.clip(big / 1.6, -1, 1)


def smoothstep(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def premultiply(rgba):
    out = rgba.astype(np.float32) / 255
    out[..., :3] *= out[..., 3:]
    return out


def camera(t, depth):
    """Slow push-in. Nearer layers (bigger depth) grow more, which is what sells the parallax."""
    zoom = 1 + depth * (t / SECONDS) ** 1.2
    cx, cy = W / 2, H * 0.56
    return zoom, cx, cy


def camera_sample(t, depth):
    zoom, cx, cy = camera(t, depth)
    return cx + (X - cx) / zoom, cy + (Y - cy) / zoom


def warp(layer, map_x, map_y):
    return cv2.remap(layer, map_x.astype(np.float32), map_y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def over(base, layer):
    return base * (1 - layer[..., 3:]) + layer[..., :3]


def grass_weight(image):
    """1 on plants, 0 on stones, rails, path and bench, so only things that bend in wind bend."""
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    plant = ((hue > 20) & (hue < 90) & (sat > 55)) | ((val > 190) & (sat > 80))
    zone = (Y > 1400) | ((Y > 1000) & (X < 215))
    solid = cv2.dilate(polygon(PATH) | polygon(BENCH), np.ones((11, 11), np.uint8)) > 0
    weight = (plant & zone & ~solid).astype(np.float32)
    return cv2.GaussianBlur(weight, (0, 0), 5)


def make_petal(seed):
    """A notched sakura petal drawn big, then shrunk per use."""
    local = np.random.default_rng(seed)
    n = 96
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / n * 2 - 1
    width = 0.62 * np.sqrt(np.clip(1 - ((v - 0.1) / 0.85) ** 2, 0, 1)) * (0.75 + 0.35 * (-v + 1) / 2)
    body = smoothstep(0.03, -0.03, np.abs(u) - width)
    notch = smoothstep(-0.03, 0.03, (v + 0.82) - np.abs(u) * 0.8)
    alpha = body * notch
    shade = np.clip((v + 1) / 2, 0, 1)[..., None]
    tip = np.array([240, 228, 255], np.float32) / 255  # BGR
    root = np.array([190, 150, 250], np.float32) / 255 * (0.92 + local.random() * 0.1)
    colour = tip * (1 - shade) + root * shade
    return np.dstack([colour * alpha[..., None], alpha]).astype(np.float32)


PETAL_SPRITES = [make_petal(i) for i in range(4)]


def make_petals(count=300):
    petals = []
    for _ in range(count):
        near = rng.random() < 0.09
        petals.append({
            "born": rng.uniform(-11, SECONDS),
            "x": rng.uniform(-200, 860),
            "y": rng.uniform(-80, 900),
            "vx": rng.uniform(55, 120) * (1.7 if near else 1),
            "vy": rng.uniform(70, 125) * (1.7 if near else 1),
            "size": rng.uniform(26, 40) if near else rng.uniform(9, 19),
            "blur": 1.0 if near else 0,
            "spin": rng.uniform(-3, 3),
            "tumble": rng.uniform(1.5, 4.5) * rng.choice([-1, 1]),
            "phase": rng.uniform(0, math.tau),
            "sprite": PETAL_SPRITES[rng.integers(0, 4)],
        })
    return petals


def draw_petal(frame, p, t):
    age = t - p["born"]
    if age < 0:
        return
    x = p["x"] + p["vx"] * age + 26 * math.sin(age * 1.5 + p["phase"])
    y = p["y"] + p["vy"] * age + 12 * math.sin(age * 2.3 + p["phase"] * 2)
    size = p["size"]
    if not (-size < x < W + size and -size < y < H + size):
        return
    # A flat petal tumbling in 3D looks like one that keeps getting thinner and wider.
    squash = 0.22 + 0.78 * abs(math.cos(age * p["tumble"] + p["phase"]))
    angle = age * p["spin"] + p["phase"]
    n = p["sprite"].shape[0]
    scale = size / n
    ca, sa = math.cos(angle), math.sin(angle)
    box = int(size) + 4
    a, b = scale * ca, -scale * squash * sa
    c, d = scale * sa, scale * squash * ca
    fx, fy = x - int(x), y - int(y)
    tx = box + fx - (a + b) * n / 2
    ty = box + fy - (c + d) * n / 2
    small = cv2.warpAffine(p["sprite"], np.float32([[a, b, tx], [c, d, ty]]), (box * 2, box * 2), flags=cv2.INTER_AREA)
    if p["blur"]:
        small = cv2.GaussianBlur(small, (0, 0), p["blur"])
    x0, y0 = int(x) - box, int(y) - box
    sx0, sy0 = max(0, -x0), max(0, -y0)
    x1, y1 = min(W, x0 + box * 2), min(H, y0 + box * 2)
    if x1 <= max(0, x0) or y1 <= max(0, y0):
        return
    patch = small[sy0:sy0 + y1 - max(0, y0), sx0:sx0 + x1 - max(0, x0)]
    target = frame[max(0, y0):y1, max(0, x0):x1]
    target[:] = target * (1 - patch[..., 3:]) + patch[..., :3]


def train_scale(t):
    """Constant real-world speed, so the on-screen size grows slightly faster as it gets closer."""
    return 1 / (1 - (1 - 1 / TRAIN_END_SCALE) * t / SECONDS)


def headlights(frame, t, s, zoom, cx, cy):
    for lamp in crop([(306, 458), (338, 458), (498, 458), (543, 458)]):
        x = VANISH[0] + s * (lamp[0] - VANISH[0])
        y = VANISH[1] + s * (lamp[1] - VANISH[1])
        x, y = cx + (x - cx) * zoom, cy + (y - cy) * zoom
        r = 34
        x0, y0 = int(x) - r, int(y) - r
        gy, gx = np.mgrid[0:2 * r, 0:2 * r].astype(np.float32)
        glow = np.exp(-((gx - r) ** 2 + (gy - r) ** 2) / (2 * 9.5 ** 2))[..., None]
        strength = 0.42 + 0.05 * math.sin(t * 9)
        target = frame[y0:y0 + 2 * r, x0:x0 + 2 * r]
        target[:] = 1 - (1 - target) * (1 - glow * strength * np.array([0.8, 0.95, 1.0], np.float32))


def grade(frame):
    small = cv2.resize(frame, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    bloom = cv2.GaussianBlur(np.clip(small - 0.62, 0, 1), (0, 0), 9)
    bloom = cv2.resize(bloom, (W, H), interpolation=cv2.INTER_LINEAR)
    frame = 1 - (1 - frame) * (1 - bloom * 0.55)
    return frame


class Scene:
    def __init__(self):
        layers = build()
        self.clouds = layers["clouds"].astype(np.float32) / 255
        self.land = premultiply(layers["land"])
        self.train = premultiply(layers["train"])
        self.tree = premultiply(layers["tree"])
        self.grass = grass_weight(layers["image"])
        self.petals = make_petals()

        # Branch tips move most, the trunk at the left edge hardly at all.
        self.reach = np.hypot(X + 60, Y - 420)
        self.sway = smoothstep(110, 1000, self.reach)
        self.flutter = [field(46, 1), field(46, 2), field(46, 3), field(46, 4)]
        self.billow = [field(240, 5), field(240, 6)]
        self.grass_bend = field(70, 7)
        self.lift = 0.45 + 3.6 * smoothstep(1420, 1924, Y)

        # The near rail is a fixed line: the train may never draw over the ground in front of it.
        rail_y = (975 - 0.183 * (X / K)) * K + 5
        self.above_rail = smoothstep(1.5, -1.5, Y - rail_y)[..., None]

        path = polygon(PATH).astype(np.float32) / 255
        self.path = cv2.GaussianBlur(path, (0, 0), 3)
        blot = np.clip(field(34, 8) * 1.5 + field(90, 9), -1, 1)
        self.blot = smoothstep(0.1, 0.5, blot)

    def render(self, t):
        cam_x, cam_y = camera_sample(t, 0.006)
        drift = 18 * t / SECONDS
        bend = np.sin(0.6 * t + 1.2)
        frame = warp(self.clouds, cam_x - drift + self.billow[0] * 7 * bend, cam_y + self.billow[1] * 4 * bend)

        # Wind crosses the ground as moving bands, stronger in the foreground.
        cam_x, cam_y = camera_sample(t, 0.016)
        wave = np.sin(0.011 * X + 0.004 * Y - 2.4 * t + self.grass_bend * 2.2) + 0.55 * np.sin(0.029 * X - 0.012 * Y - 3.4 * t + 1)
        push = self.grass * self.lift * wave
        frame = over(frame, warp(self.land, cam_x + push, cam_y + push * 0.28))

        # Dappled light on the stones shifts with the branches overhead.
        sun = cv2.warpAffine(self.blot, np.float32([[1, 0, 9 * math.sin(1.3 * t)], [0, 1, 3 * math.sin(1.1 * t)]]), (W, H), borderMode=cv2.BORDER_REFLECT)
        frame *= (1 - 0.2 * self.path * sun)[..., None]

        # Train slides along its own perspective lines, so nothing has to be re-drawn.
        s = train_scale(t)
        zoom, cx, cy = camera(t, 0.016)
        rumble = 0.55 * math.sin(math.tau * 3.1 * t) + 0.3 * math.sin(math.tau * 7.3 * t + 1)
        total = s * zoom
        tx = cx + zoom * (VANISH[0] * (1 - s) - cx)
        ty = cy + zoom * (VANISH[1] * (1 - s) - cy) + rumble
        moved = cv2.warpAffine(self.train, np.float32([[total, 0, tx], [0, total, ty]]), (W, H), flags=cv2.INTER_LINEAR)
        clip = cv2.warpAffine(self.above_rail, np.float32([[zoom, 0, cx * (1 - zoom)], [0, zoom, cy * (1 - zoom)]]), (W, H), borderMode=cv2.BORDER_REPLICATE)
        frame = over(frame, moved * clip[..., None])
        headlights(frame, t, s, zoom, cx, cy)

        cam_x, cam_y = camera_sample(t, 0.034)
        lag = self.reach * 0.0042
        gust = 8 * np.sin(1.25 * t - lag) + 3.2 * np.sin(2.6 * t - lag * 1.8 + 1)
        lift = 3.6 * np.sin(1.05 * t - lag + 0.7)
        leaf_x = self.flutter[0] * math.sin(3.4 * t) + self.flutter[1] * math.cos(2.9 * t)
        leaf_y = self.flutter[2] * math.sin(3.1 * t + 1) + self.flutter[3] * math.cos(3.7 * t)
        tree = warp(self.tree, cam_x + self.sway * (gust + 2 * leaf_x), cam_y + self.sway * (lift + 1.6 * leaf_y))
        frame = over(frame, tree)

        for petal in self.petals:
            draw_petal(frame, petal, t)
        return grade(frame)


def to_video_frame(frame):
    top = (H - OUT_H) // 2
    return (np.clip(frame[top:top + OUT_H], 0, 1) * 255 + 0.5).astype(np.uint8)


def main():
    scene = Scene()
    if len(sys.argv) > 2:
        for number in map(int, sys.argv[2:]):
            cv2.imwrite(f"{sys.argv[1]}/f{number:03d}.png", to_video_frame(scene.render(number / FPS)))
        return
    encoder = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{OUT_H}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "../out.mp4"],
        stdin=subprocess.PIPE,
    )
    for number in range(FRAMES):
        encoder.stdin.write(to_video_frame(scene.render(number / FPS)).tobytes())
    encoder.stdin.close()
    encoder.wait()


if __name__ == "__main__":
    main()
