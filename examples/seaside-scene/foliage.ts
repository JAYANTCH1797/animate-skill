// Leaf clumps painted one leaf at a time, each on its own sprite so it can sway independently.
import { rng } from "./clouds";

export type Sprite = { canvas: HTMLCanvasElement; x: number; y: number; phase: number; amp: number };

const TONES = ["#14502f", "#1f6b35", "#3c9436", "#79bb3c", "#b4da4b", "#ecf28c"];

const leaf = (c: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number) => {
  const dx = Math.cos(angle) * size, dy = Math.sin(angle) * size;
  const nx = -dy * 0.42, ny = dx * 0.42;
  c.beginPath();
  c.moveTo(x - dx, y - dy);
  c.quadraticCurveTo(x + nx, y + ny, x + dx, y + dy);
  c.quadraticCurveTo(x - nx, y - ny, x - dx, y - dy);
  c.fill();
};

export const paintClump = (x: number, y: number, r: number, seed: number): Sprite => {
  const rand = rng(seed);
  const size = Math.ceil(r * 2.8);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d")!;
  const lobes = Array.from({ length: 6 + Math.floor(rand() * 4) }, () => {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.72;
    return { x: size / 2 + Math.cos(a) * d, y: size / 2 + Math.sin(a) * d, r: r * (0.34 + rand() * 0.24) };
  }).sort((a, b) => b.y - a.y);

  for (const lobe of lobes) {
    const leaves = Array.from({ length: Math.ceil((lobe.r * lobe.r) / 13) }, () => {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * lobe.r;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
      return { dx, dy, tone: (dx * 0.42 - dy * 0.9) / lobe.r + (rand() - 0.5) * 0.55 };
    }).sort((a, b) => a.tone - b.tone);
    for (const l of leaves) {
      const band = Math.min(TONES.length - 1, Math.max(0, Math.floor((l.tone + 1.05) * 3.1)));
      c.fillStyle = TONES[band];
      leaf(c, lobe.x + l.dx, lobe.y + l.dy, 6 + rand() * 7, rand() * Math.PI);
    }
  }
  return { canvas, x, y, phase: rand() * Math.PI * 2, amp: 0.6 + rand() * 0.8 };
};

export const drawClumps = (c: CanvasRenderingContext2D, clumps: Sprite[], t: number) => {
  for (const s of clumps) {
    const sway = Math.sin(t * 1.5 + s.phase) + 0.5 * Math.sin(t * 2.7 + s.phase * 1.7);
    const half = s.canvas.width / 2;
    c.save();
    c.translate(s.x + sway * s.amp * 3.2, s.y + sway * s.amp * 1.2);
    c.rotate(sway * s.amp * 0.008);
    c.drawImage(s.canvas, -half, -half);
    c.restore();
  }
};
