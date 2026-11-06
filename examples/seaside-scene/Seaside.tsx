import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { CLOUD_LAYERS, CLOUD_PAD, H, W, paintCloud, rng } from "./clouds";
import { drawClumps, paintClump, type Sprite } from "./foliage";
import { WALKERS, drawWalker } from "./people";
import { HORIZON, INK, newLayer, paintBackdrop, paintDapple, paintFront, paintProps, paintSea, paintSky } from "./scene";

export const SEASIDE_FRAMES = 150;
const FPS = 30;

type Ctx = CanvasRenderingContext2D;

const CANOPY_LEFT: [number, number, number][] = [
  [40, 690, 78], [10, 590, 90], [70, 420, 120], [180, 330, 96], [30, 250, 140], [250, 170, 110], [140, 120, 130], [320, 60, 100], [20, 60, 120], [420, 30, 70],
];
const CANOPY_RIGHT: [number, number, number][] = [[880, 40, 90], [980, 70, 110], [1070, 170, 90], [1050, 30, 100], [790, 20, 60]];
const TREE_BEHIND_SHOP: [number, number, number][] = [[30, 1300, 70], [75, 1250, 60], [10, 1210, 55]];

type Assets = ReturnType<typeof paintAll>;
let assets: Assets | undefined;

const paintAll = () => {
  const clouds = CLOUD_LAYERS.map((spec) => {
    const canvas = newLayer(W + CLOUD_PAD * 2, H);
    const pixels = paintCloud(spec);
    canvas.getContext("2d")!.putImageData(new ImageData(pixels as unknown as Uint8ClampedArray<ArrayBuffer>, canvas.width, H), 0, 0);
    return canvas;
  });
  const clumps = (list: [number, number, number][], seed: number): Sprite[] => list.map(([x, y, r], i) => paintClump(x, y, r, seed + i));
  const rand = rng(3);
  return {
    sky: paintSky(),
    clouds,
    sea: paintSea(),
    backdrop: paintBackdrop(),
    props: paintProps(),
    front: paintFront(),
    dapples: [paintDapple(14), paintDapple(15)],
    behind: clumps(TREE_BEHIND_SHOP, 300),
    canopy: [...clumps(CANOPY_LEFT, 100), ...clumps(CANOPY_RIGHT, 200)],
    glints: Array.from({ length: 300 }, () => {
      const u = rand() ** 1.5;
      return { x: rand() * W, y: HORIZON + 4 + u * 100, len: 5 + u * 42 + rand() * 12, rate: 0.5 + rand() * 1.1, phase: rand(), width: 1 + u * 2.4 };
    }),
  };
};

const drawSeaLife = (c: Ctx, a: Assets, t: number) => {
  c.drawImage(a.sea, 0, 0);
  c.lineCap = "round";
  for (const g of a.glints) {
    const pulse = Math.sin((t * g.rate + g.phase) * Math.PI * 2);
    if (pulse <= 0) continue;
    c.strokeStyle = `rgba(255,255,255,${pulse * pulse * 0.85})`;
    c.lineWidth = g.width;
    const x = g.x + Math.sin(t * 0.8 + g.phase * 6) * 7;
    c.beginPath();
    c.moveTo(x, g.y);
    c.lineTo(x + g.len, g.y);
    c.stroke();
  }
  // Waves rolling up the sand: each one has its own slow in-and-out.
  for (let k = 0; k < 3; k++) {
    const reach = 1600 + k * 7 + Math.sin(t * 1.25 + k * 2.1) * 6;
    c.beginPath();
    c.moveTo(0, reach - 16);
    for (let x = 0; x <= W; x += 18) c.lineTo(x, reach + Math.sin(x * 0.021 + t * 1.1 + k * 1.7) * 3.4 + Math.sin(x * 0.057 - t * 0.7 + k) * 1.8);
    c.lineTo(W, reach - 16);
    c.closePath();
    c.fillStyle = `rgba(255,255,255,${0.75 - k * 0.2})`;
    c.fill();
  }
};

const drawBoats = (c: Ctx, t: number) => {
  // Sailboat.
  c.save();
  c.translate(548 - t * 2.2, 1497 + Math.sin(t * 1.5) * 1.6);
  c.rotate(Math.sin(t * 1.1) * 0.022);
  c.beginPath();
  c.moveTo(1, -8);
  c.lineTo(1, -76);
  c.lineTo(30, -8);
  c.closePath();
  const sail = c.createLinearGradient(0, -76, 30, -8);
  sail.addColorStop(0, "#ffffff");
  sail.addColorStop(1, "#bfdcf4");
  c.fillStyle = sail;
  c.fill();
  c.beginPath();
  c.moveTo(-2, -12);
  c.lineTo(-2, -66);
  c.lineTo(-22, -12);
  c.closePath();
  c.fillStyle = "#e7f2fb";
  c.fill();
  c.fillStyle = "#26334f";
  c.beginPath();
  c.moveTo(-26, -7);
  c.lineTo(34, -7);
  c.lineTo(24, 1);
  c.lineTo(-20, 1);
  c.closePath();
  c.fill();
  c.fillStyle = "#f4f6f8";
  c.fillRect(-25, -8, 58, 2.4);
  c.restore();
  // Distant ship.
  c.save();
  c.translate(772 - t * 1.1, 1513 + Math.sin(t * 0.9 + 1) * 0.8);
  c.fillStyle = "#2d3a55";
  c.fillRect(-34, -5, 68, 6);
  c.fillRect(-18, -12, 30, 7);
  c.fillRect(-4, -26, 2, 15);
  c.fillRect(-24, -20, 1.6, 15);
  c.fillRect(18, -18, 1.6, 13);
  c.fillStyle = "#e9eef2";
  c.fillRect(-14, -11, 22, 2);
  c.restore();
};

const FLOCK: { x: number; y: number; size: number }[] = [
  [640, 846, 1], [604, 858, 0.9], [572, 830, 1.05], [538, 868, 0.9], [508, 838, 0.95], [476, 880, 0.85], [690, 822, 0.8], [746, 872, 0.75],
].map(([x, y, size]) => ({ x, y, size }));

const drawBird = (c: Ctx, x: number, y: number, size: number, flap: number) => {
  c.save();
  c.translate(x, y);
  c.scale(size * 1.85, size * 1.85);
  const up = flap * 8.5;
  c.fillStyle = "#14182c";
  // Far wing, then body, then near wing; the bird faces left.
  c.beginPath();
  c.moveTo(-2, -0.5);
  c.quadraticCurveTo(1, -3 - up * 0.7, 5 - Math.abs(flap) * 1.2, -up - 1);
  c.quadraticCurveTo(4.5, -up * 0.2, 2, 1);
  c.closePath();
  c.fill();
  c.beginPath();
  c.ellipse(0, 0, 8, 1.9, -0.05, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(-8, -0.4);
  c.lineTo(-11, 0.2);
  c.lineTo(-7.6, 0.8);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(7, 0);
  c.lineTo(12, -1.6);
  c.lineTo(11.4, 1.5);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(-3, 0);
  c.quadraticCurveTo(-1, 3 - up * 0.75, 2 - Math.abs(flap), -up * 1.2 + 4);
  c.quadraticCurveTo(3, 1 - up * 0.2, 3, 1);
  c.closePath();
  c.fill();
  c.restore();
};

const drawBirds = (c: Ctx, t: number) => {
  // Three flocks spaced so one is always crossing; each flies right to left and leaves the frame.
  const flocks = [
    { dx: 0, dy: 0, scale: 1, speed: 205 },
    { dx: 640, dy: -210, scale: 0.72, speed: 168 },
    { dx: 1020, dy: 170, scale: 0.88, speed: 190 },
  ];
  flocks.forEach((f, n) => {
    FLOCK.forEach((b, i) => {
      const x = b.x + f.dx - t * f.speed + Math.sin(t * 0.9 + i) * 6;
      const y = b.y + f.dy + Math.sin(t * 1.3 + i * 1.9) * 5 - t * 3;
      const flap = Math.sin(t * Math.PI * 2 * (2.3 + (i % 3) * 0.17) + i * 1.3 + n);
      drawBird(c, x, y, b.size * f.scale, flap);
    });
  });
};

const WIRES: { from: [number, number]; to: [number, number]; sag: [number, number]; width: number }[] = [
  { from: [-20, 930], to: [948, 492], sag: [420, 1560], width: 3.2 },
  { from: [-20, 1000], to: [985, 492], sag: [460, 1490], width: 2 },
  { from: [250, 1215], to: [1058, 474], sag: [640, 1050], width: 2.2 },
  { from: [290, 1218], to: [1016, 620], sag: [640, 1120], width: 1.6 },
  { from: [340, 1222], to: [1016, 700], sag: [660, 1160], width: 1.4 },
  { from: [370, 1228], to: [1090, 240], sag: [720, 1020], width: 2.4 },
  { from: [245, 1214], to: [952, 800], sag: [600, 1130], width: 1.6 },
  { from: [690, 1212], to: [1016, 1100], sag: [860, 1215], width: 1.8 },
  { from: [688, 1214], to: [952, 1000], sag: [820, 1180], width: 1.3 },
];

const drawWires = (c: Ctx, t: number) => {
  c.strokeStyle = "#1a2036";
  c.lineCap = "round";
  WIRES.forEach((w, i) => {
    c.lineWidth = w.width;
    c.beginPath();
    c.moveTo(w.from[0], w.from[1]);
    c.quadraticCurveTo(w.sag[0], w.sag[1] + Math.sin(t * 1.1 + i) * 5, w.to[0], w.to[1]);
    c.stroke();
  });
};

const drawLiveSigns = (c: Ctx, t: number, frame: number) => {
  // "GO" board and the odometer tick like the real thing.
  c.save();
  c.shadowColor = "#ff3760";
  c.shadowBlur = 16;
  c.font = '800 28px "Courier New", monospace';
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = Math.floor(frame / 4) % 9 === 3 ? "#a01d3a" : "#ff3f62";
  c.fillText("GO", 1037, 840);
  c.shadowBlur = 0;
  c.font = '700 15px "Helvetica Neue", sans-serif';
  c.fillStyle = "#4a2f86";
  c.fillText("LET'S", 1037, 810);
  c.shadowColor = "#8fb0ff";
  c.shadowBlur = 14;
  c.font = '800 42px "Helvetica Neue", sans-serif';
  c.fillStyle = "#e8eeff";
  c.fillText("M", 992, 896);
  c.shadowBlur = 8;
  c.font = '700 36px "Courier New", monospace';
  c.fillStyle = "#6c7fd6";
  c.fillText(String(120 + Math.floor(t * 3)).padStart(3, "0"), 1043, 896);
  c.restore();
  // Amber traffic lamp breathing.
  const glow = 0.78 + Math.sin(t * 3.1) * 0.22;
  c.save();
  c.shadowColor = "#ffe04a";
  c.shadowBlur = 30 * glow;
  c.beginPath();
  c.arc(985, 1271, 12.5, 0, Math.PI * 2);
  c.fillStyle = `rgb(255,${200 + glow * 40},${40 + glow * 30})`;
  c.fill();
  c.restore();
};

const drawGrade = (c: Ctx, source: HTMLCanvasElement, scratch: HTMLCanvasElement) => {
  // Bloom: a blurred low-res copy screened over the top makes whites feel lit, like the reference's glow.
  const s = scratch.getContext("2d")!;
  s.clearRect(0, 0, scratch.width, scratch.height);
  s.filter = "blur(10px)";
  s.drawImage(source, 0, 0, scratch.width, scratch.height);
  s.filter = "none";
  c.save();
  c.globalCompositeOperation = "soft-light";
  c.globalAlpha = 0.3;
  c.drawImage(scratch, 0, 0, W, H);
  c.globalCompositeOperation = "screen";
  c.globalAlpha = 0.09;
  c.drawImage(scratch, 0, 0, W, H);
  c.restore();
  const vignette = c.createRadialGradient(W / 2, H * 0.48, H * 0.42, W / 2, H * 0.5, H * 0.72);
  vignette.addColorStop(0, "rgba(10,20,70,0)");
  vignette.addColorStop(1, "rgba(10,20,70,0.3)");
  c.fillStyle = vignette;
  c.fillRect(0, 0, W, H);
};

export const Seaside: React.FC = () => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const a = (assets ??= paintAll());
    const canvas = ref.current!;
    const c = canvas.getContext("2d")!;
    const t = frame / FPS;

    c.drawImage(a.sky, 0, 0);
    a.clouds.forEach((layer, i) => c.drawImage(layer, -CLOUD_PAD - t * [3, 8, 14][i] + 28, 0));
    drawBirds(c, t);
    drawSeaLife(c, a, t);
    drawBoats(c, t);
    drawClumps(c, a.behind, t);
    c.drawImage(a.backdrop, 0, 0);
    drawLiveSigns(c, t, frame);
    drawWalker(c, WALKERS[0], t);
    c.drawImage(a.props, 0, 0);
    drawWalker(c, WALKERS[1], t);
    c.drawImage(a.front, 0, 0);
    drawWalker(c, WALKERS[2], t);

    c.save();
    c.globalCompositeOperation = "multiply";
    c.globalAlpha = 0.72;
    c.drawImage(a.dapples[0], Math.sin(t * 1.4) * 5, Math.sin(t * 1.1) * 1.5);
    c.globalAlpha = 0.45;
    c.drawImage(a.dapples[1], Math.sin(t * 1.9 + 2) * 8, 0);
    c.restore();

    drawWires(c, t);
    drawClumps(c, a.canopy, t);
    drawGrade(c, canvas, scratch());
  }, [frame]);

  return (
    <AbsoluteFill style={{ background: INK }}>
      <canvas ref={ref} width={W} height={H} style={{ width: W, height: H }} />
    </AbsoluteFill>
  );
};

let scratchLayer: HTMLCanvasElement | undefined;
const scratch = () => (scratchLayer ??= newLayer(W / 4, H / 4));
