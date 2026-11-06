// Procedural cel-shaded cumulus. Each cloud is a pile of spheres turned into a height map, so light and cast shadows
// fall on it like a real 3D object, then the shading is snapped to a few flat tones, which is what reads as hand-painted anime.
export const W = 1080;
export const H = 1920;
export const CLOUD_PAD = 90;
const CW = W + CLOUD_PAD * 2; // clouds are painted wider than the frame so drifting never shows an empty edge

export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const makeNoise = (seed: number) => {
  const r = rng(seed);
  const grid = new Float32Array(256 * 256).map(() => r() * 2 - 1);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = smooth(x - xi), v = smooth(y - yi);
    const at = (a: number, b: number) => grid[(b & 255) * 256 + (a & 255)];
    const top = at(xi, yi) * (1 - u) + at(xi + 1, yi) * u;
    const bottom = at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u;
    return top * (1 - v) + bottom * v;
  };
};

export const fbm = (noise: (x: number, y: number) => number, x: number, y: number, octaves: number) => {
  let sum = 0, amp = 0.5;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x, y);
    x = x * 2.03 + 17;
    y = y * 2.03 + 9;
    amp *= 0.5;
  }
  return sum;
};

const boxBlur = (src: Float32Array, radius: number, passes: number) => {
  let a = src.slice(), b = new Float32Array(src.length);
  const span = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) {
      let acc = 0;
      const row = y * CW;
      for (let x = -radius; x <= radius; x++) acc += a[row + Math.min(CW - 1, Math.max(0, x))];
      for (let x = 0; x < CW; x++) {
        b[row + x] = acc / span;
        acc += a[row + Math.min(CW - 1, x + radius + 1)] - a[row + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < CW; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += b[Math.min(H - 1, Math.max(0, y)) * CW + x];
      for (let y = 0; y < H; y++) {
        a[y * CW + x] = acc / span;
        acc += b[Math.min(H - 1, y + radius + 1) * CW + x] - b[Math.max(0, y - radius) * CW + x];
      }
    }
  }
  return a;
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export type Puff = [x: number, y: number, r: number];
type Rgb = [number, number, number];

export type CloudSpec = {
  seed: number;
  puffs: Puff[];
  levels: number; // how many generations of smaller puffs grow on each big one
  ramp: Rgb[]; // shadow to highlight
  stops: number[]; // shade value where each ramp colour takes over
  haze?: Rgb; // colour the cloud fades into towards the horizon
  hazeFrom?: number;
  hazeTo?: number;
  warp?: number;
};

export const paintCloud = (spec: CloudSpec) => {
  const rand = rng(spec.seed);
  const height = new Float32Array(CW * H);

  const stamp = (cx: number, cy: number, zc: number, r: number) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(CW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 >= r2) continue;
        const z = zc + Math.sqrt(r2 - d2);
        if (z > height[y * CW + x]) height[y * CW + x] = z;
      }
    }
  };

  const grow = (cx: number, cy: number, zc: number, r: number, level: number) => {
    stamp(cx, cy, zc, r);
    if (level === 0 || r < 7) return;
    const count = 9 + Math.floor(rand() * 7);
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI * (1.2 * rand() - 0.1); // mostly over the top and sides, like rising cumulus
      const dist = r * (0.6 + rand() * 0.38);
      const rr = r * (0.26 + rand() * 0.24);
      const px = cx + Math.cos(angle) * dist, py = cy + Math.sin(angle) * dist;
      const surface = Math.sqrt(Math.max(0, r * r - dist * dist));
      grow(px, py, zc + surface - rr * 0.55, rr, level - 1);
    }
  };

  for (const [x, y, r] of spec.puffs) grow(x + CLOUD_PAD, y, rand() * 30, r, spec.levels);

  // Ragged edges: read the height map through a noise-bent lens instead of drawing perfect circles.
  const noiseA = makeNoise(spec.seed + 1), noiseB = makeNoise(spec.seed + 2);
  const warp = spec.warp ?? 13;
  const bent = new Float32Array(CW * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < CW; x++) {
      const dx = fbm(noiseA, x * 0.016, y * 0.016, 3) * warp;
      const dy = fbm(noiseB, x * 0.016, y * 0.016, 3) * warp;
      const sx = Math.min(CW - 2, Math.max(0, x + dx)), sy = Math.min(H - 2, Math.max(0, y + dy));
      const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, i = iy * CW + ix;
      bent[y * CW + x] =
        (height[i] * (1 - fx) + height[i + 1] * fx) * (1 - fy) + (height[i + CW] * (1 - fx) + height[i + CW + 1] * fx) * fy;
    }
  }

  const fine = boxBlur(bent, 2, 2);
  const broad = boxBlur(bent, 34, 3);
  const light = [0.42, -0.78, 0.46];
  const out = new Uint8ClampedArray(CW * H * 4);

  const at = (buffer: Float32Array, x: number, y: number) =>
    buffer[Math.min(H - 1, Math.max(0, Math.round(y))) * CW + Math.min(CW - 1, Math.max(0, Math.round(x)))];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < CW; x++) {
      const i = y * CW + x;
      const cover = smoothstep(0.4, 3.5, bent[i]);
      if (cover <= 0) continue;

      const gx = (at(fine, x + 1, y) - at(fine, x - 1, y)) * 0.5, gy = (at(fine, x, y + 1) - at(fine, x, y - 1)) * 0.5;
      const smallShade = (-gx * light[0] - gy * light[1] + light[2]) / Math.hypot(gx, gy, 1);

      const bx = (at(broad, x + 8, y) - at(broad, x - 8, y)) / 16, by = (at(broad, x, y + 8) - at(broad, x, y - 8)) / 16;
      const broadShade = (-bx * light[0] - by * light[1]) / Math.hypot(bx, by, 0.5);

      // March towards the sun: anything taller on the way casts a flat shadow here.
      let shadow = 0;
      const z = fine[i];
      for (let step = 1; step <= 7; step++) {
        const d = step * step * 2.6 + 6;
        const blocker = at(fine, x + light[0] * d, y + light[1] * d) - (z + d * 0.42);
        shadow = Math.max(shadow, smoothstep(0, 14, blocker));
      }

      const mottle = fbm(noiseB, x * 0.02 + 40, y * 0.02, 3) * 0.1;
      const shade = 0.56 * smallShade + 0.4 * broadShade + 0.1 + mottle - shadow * 0.42;

      const stops = spec.stops, ramp = spec.ramp;
      let r = ramp[0][0], g = ramp[0][1], b = ramp[0][2];
      for (let k = 0; k < stops.length; k++) {
        const m = smoothstep(stops[k] - 0.012, stops[k] + 0.012, shade);
        r += (ramp[k + 1][0] - r) * m;
        g += (ramp[k + 1][1] - g) * m;
        b += (ramp[k + 1][2] - b) * m;
      }
      if (spec.haze) {
        const m = smoothstep(spec.hazeFrom ?? 0, spec.hazeTo ?? 1, y);
        r += (spec.haze[0] - r) * m;
        g += (spec.haze[1] - g) * m;
        b += (spec.haze[2] - b) * m;
      }
      out[i * 4] = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
      out[i * 4 + 3] = cover * 255;
    }
  }
  return out;
};

const BODY_RAMP: Rgb[] = [[122, 170, 226], [152, 193, 236], [198, 222, 245], [235, 244, 252], [255, 255, 255]];
const BODY_STOPS = [0.02, 0.17, 0.33, 0.46];

export const CLOUD_LAYERS: CloudSpec[] = [
  // Far bank along the horizon.
  {
    seed: 11,
    levels: 2,
    warp: 18,
    ramp: [[160, 200, 238], [186, 216, 243], [222, 236, 248], [244, 249, 253], [255, 255, 255]],
    stops: BODY_STOPS,
    haze: [214, 234, 248],
    hazeFrom: 1250,
    hazeTo: 1530,
    puffs: [
      [40, 1440, 60], [150, 1460, 70], [270, 1450, 55], [400, 1470, 60], [510, 1455, 72], [640, 1470, 58],
      [770, 1450, 74], [880, 1465, 60], [1010, 1445, 78], [1100, 1460, 60], [330, 1390, 42], [720, 1385, 46], [980, 1370, 50],
    ],
  },
  // The tall cumulus tower.
  {
    seed: 7,
    levels: 3,
    ramp: BODY_RAMP,
    stops: BODY_STOPS,
    haze: [196, 224, 246],
    hazeFrom: 1180,
    hazeTo: 1540,
    puffs: [
      [575, 400, 105], [660, 455, 120], [735, 560, 95], [500, 530, 125], [410, 650, 105], [600, 640, 170], [720, 690, 125],
      [250, 735, 90], [335, 775, 120], [835, 800, 90], [750, 815, 130], [590, 830, 185], [95, 960, 95], [210, 985, 135],
      [355, 990, 165], [520, 1010, 215], [730, 1010, 180], [870, 1010, 90], [170, 1205, 110], [395, 1225, 150],
      [600, 1235, 140], [770, 1275, 120], [950, 1335, 62], [60, 1130, 80],
    ],
  },
  // Low white bank in front of the tower's base, plus loose scraps.
  {
    seed: 23,
    levels: 2,
    ramp: BODY_RAMP,
    stops: [-0.02, 0.12, 0.27, 0.4],
    haze: [224, 240, 250],
    hazeFrom: 1320,
    hazeTo: 1540,
    puffs: [
      [470, 1395, 62], [560, 1420, 74], [650, 1400, 60], [760, 1425, 70], [850, 1400, 60], [950, 1420, 64], [1050, 1400, 56],
      [905, 610, 24], [952, 640, 17], [130, 815, 22], [958, 355, 14], [60, 660, 15], [870, 1180, 28], [1040, 1170, 22],
    ],
  },
];
