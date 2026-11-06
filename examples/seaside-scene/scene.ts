// The still parts of the painting, drawn once per render into layers that Seaside.tsx stacks every frame.
import { H, W, fbm, makeNoise, rng } from "./clouds";

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
type Paint = string | CanvasGradient;

export const INK = "#1b2140";
export const HORIZON = 1502;
const VP: Pt = [610, 1500];

export const newLayer = (w = W, h = H) => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

const poly = (c: Ctx, pts: Pt[], fill?: Paint, stroke?: string, lw = 1.5) => {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.lineJoin = "round";
    c.stroke();
  }
};
const box = (c: Ctx, x: number, y: number, w: number, h: number, fill?: Paint, stroke?: string, lw = 1.5) =>
  poly(c, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, stroke, lw);
const seg = (c: Ctx, a: Pt, b: Pt, color: string, lw = 1.5) => {
  c.beginPath();
  c.moveTo(a[0], a[1]);
  c.lineTo(b[0], b[1]);
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.stroke();
};
const vgrad = (c: Ctx, y0: number, y1: number, stops: [number, string][]) => {
  const g = c.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([at, color]) => g.addColorStop(at, color));
  return g;
};
const dot = (c: Ctx, x: number, y: number, rx: number, ry: number, fill: Paint, rot = 0) => {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
};
const heart = (c: Ctx, x: number, y: number, s: number) => {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s * 1.05, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.7, y - s * 1.05, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
  c.closePath();
};
const label = (c: Ctx, text: string, x: number, y: number, size: number, fill: string, font = "Helvetica Neue", weight = 800) => {
  c.font = `${weight} ${size}px "${font}", Arial, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = fill;
  c.fillText(text, x, y);
};

export const paintSky = () => {
  const layer = newLayer();
  const c = layer.getContext("2d")!;
  c.fillStyle = vgrad(c, 0, HORIZON + 10, [
    [0, "#0a45ad"], [0.22, "#0b5cc8"], [0.45, "#127fe0"], [0.66, "#2ea2ec"], [0.84, "#7cc9f2"], [1, "#d3eefa"],
  ]);
  c.fillRect(0, 0, W, HORIZON + 12);
  const rand = rng(8);
  for (let i = 0; i < 90000; i++) {
    c.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.022)" : "rgba(0,10,60,0.03)";
    c.fillRect(rand() * W, rand() * HORIZON, 2, 2);
  }
  return layer;
};

export const paintSea = () => {
  const layer = newLayer();
  const c = layer.getContext("2d")!;
  const rand = rng(5);
  c.fillStyle = vgrad(c, HORIZON, 1612, [
    [0, "#0b4bb0"], [0.2, "#0b5fc2"], [0.48, "#0c86d6"], [0.72, "#17aedd"], [0.9, "#58d3dc"], [1, "#a7ebe2"],
  ]);
  c.fillRect(0, HORIZON, W, 120);
  // Long painterly swell strokes, closer together towards the horizon.
  for (let i = 0; i < 420; i++) {
    const u = rand() ** 1.6;
    const y = HORIZON + 3 + u * 104;
    const len = 18 + u * 110 + rand() * 40;
    const x = rand() * (W + 100) - 50;
    c.strokeStyle = rand() > 0.45 ? `rgba(6,40,130,${0.1 + rand() * 0.2})` : `rgba(150,236,240,${0.1 + rand() * 0.22})`;
    c.lineWidth = 0.8 + u * 2.6;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + len / 2, y + (rand() - 0.5) * 3, x + len, y);
    c.stroke();
  }
  c.fillStyle = vgrad(c, 1606, 1660, [[0, "#f2efe6"], [0.25, "#f1e5d3"], [1, "#e6d2bb"]]);
  c.fillRect(0, 1606, W, 60);
  // Horizon haze keeps the sea from cutting hard against the clouds.
  c.fillStyle = vgrad(c, HORIZON - 4, HORIZON + 7, [[0, "rgba(220,240,250,0)"], [0.5, "rgba(220,240,250,0.65)"], [1, "rgba(220,240,250,0)"]]);
  c.fillRect(0, HORIZON - 4, W, 11);
  return layer;
};

const paintGround = (c: Ctx) => {
  const rand = rng(31);
  const noise = makeNoise(4);
  const top = 1648;
  c.fillStyle = vgrad(c, top, H, [[0, "#d7c4bf"], [0.3, "#e6d2c6"], [0.75, "#e1c8b8"], [1, "#d3b6a6"]]);
  c.fillRect(0, top, W, H - top);

  const toFloor = (bottomX: number, y: number) => VP[0] + (bottomX - VP[0]) * ((y - VP[1]) / (H - VP[1]));
  // Slabs on a true perspective grid, each a slightly different tone.
  const rows = [1648, 1662, 1680, 1704, 1736, 1780, 1840, 1925];
  const columns = Array.from({ length: 19 }, (_, i) => -1650 + i * 250);
  for (let r = 0; r < rows.length - 1; r++) {
    for (let k = 0; k < columns.length - 1; k++) {
      const y0 = rows[r], y1 = rows[r + 1], a = columns[k], b = columns[k + 1];
      const quad: Pt[] = [[toFloor(a, y0), y0], [toFloor(b, y0), y0], [toFloor(b, y1), y1], [toFloor(a, y1), y1]];
      const v = rand();
      if (v > 0.55) poly(c, quad, `rgba(255,244,232,${(v - 0.55) * 0.5})`);
      else if (v < 0.3) poly(c, quad, `rgba(150,128,150,${(0.3 - v) * 0.42})`);
    }
  }
  for (const y of rows) seg(c, [0, y], [W, y], "rgba(112,96,122,0.38)", 0.8 + (y - 1640) / 150);
  for (const x of columns) seg(c, [toFloor(x, top), top], [toFloor(x, H), H], "rgba(112,96,122,0.34)", 1.4);

  // Pale painted strips running toward the sea.
  for (const [a, b] of [[-340, -240], [560, 660], [1500, 1600]] as Pt[]) {
    poly(c, [[toFloor(a, top), top], [toFloor(b, top), top], [toFloor(b, H), H], [toFloor(a, H), H]], "rgba(250,246,240,0.5)");
  }
  poly(c, [[0, 1712], [W, 1712], [W, 1722], [0, 1722]], "rgba(250,246,240,0.32)");

  // Hairline cracks and patches add the hand-drawn busyness of the reference.
  for (let i = 0; i < 90; i++) {
    const y = top + 8 + rand() ** 0.8 * 262;
    const x = rand() * W;
    const len = (10 + rand() * 40) * (0.4 + (y - top) / 200);
    seg(c, [x, y], [x + len, y + (rand() - 0.5) * 4], `rgba(96,84,110,${0.2 + rand() * 0.34})`, 1);
  }
  // Soft grain so big areas are not flat vector fills.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * W, y = top + rand() * (H - top);
    const n = fbm(noise, x * 0.02, y * 0.05, 2);
    c.fillStyle = n > 0 ? `rgba(255,250,240,${n * 0.5})` : `rgba(110,90,120,${-n * 0.4})`;
    c.fillRect(x, y, 2 + rand() * 7, 1 + rand() * 2);
  }
};

const paintRamp = (c: Ctx) => {
  poly(c, [[505, 1592], [578, 1592], [642, 1650], [496, 1650]], vgrad(c, 1592, 1650, [[0, "#f3d7cc"], [1, "#ecc9bb"]]));
  seg(c, [505, 1592], [496, 1650], "rgba(120,96,120,0.5)", 1.5);
  seg(c, [578, 1592], [642, 1650], "#8a7a90", 2);
  // Promenade edge to the right of the ramp.
  poly(c, [[640, 1640], [W, 1640], [W, 1652], [646, 1652]], "#efe6da", "rgba(110,100,130,0.5)", 1);
  // Railing along the ramp.
  const rail = (u: number): Pt => [578 + 64 * u, 1560 + 84 * u];
  const foot = (u: number): Pt => [578 + 64 * u, 1592 + 58 * u];
  for (let i = 0; i <= 12; i++) seg(c, rail(i / 12), foot(i / 12), "#46607a", i % 4 === 0 ? 3 : 1.5);
  seg(c, rail(0), rail(1), "#2e4258", 4);
  seg(c, [rail(0)[0], rail(0)[1] + 12], [rail(1)[0], rail(1)[1] + 6], "#2e4258", 1.5);
  // Railing along the far right of the promenade.
  for (let x = 930; x <= W; x += 11) seg(c, [x, 1570], [x, 1642], "#54708a", x % 44 === 0 ? 2.5 : 1.1);
  seg(c, [920, 1570], [W, 1570], "#3a5168", 3.5);
  seg(c, [920, 1604], [W, 1604], "#3a5168", 1.4);
};

const pastry = (c: Ctx, x: number, y: number, w: number, tone: string, rand: () => number) => {
  dot(c, x, y, w, w * 0.56, tone);
  dot(c, x - w * 0.2, y - w * 0.18, w * 0.5, w * 0.2, "rgba(255,240,190,0.75)", -0.2);
  if (rand() > 0.5) dot(c, x + w * 0.2, y - w * 0.05, w * 0.2, w * 0.14, "#d8413a");
};

const paintShop = (c: Ctx) => {
  const rand = rng(77);
  // Rooftop machinery and vents.
  poly(c, [[132, 1222], [150, 1200], [205, 1196], [214, 1222]], "#1e2336");
  box(c, 158, 1186, 24, 12, "#252c44");
  seg(c, [110, 1160], [110, 1228], "#2a3148", 5);
  seg(c, [268, 1162], [268, 1226], "#2a3148", 5);
  dot(c, 240, 1214, 6, 6, "#3c4560");
  box(c, 330, 1205, 20, 18, "#2a3148");

  // Side wall receding toward the sea.
  poly(c, [[368, 1222], [406, 1306], [412, 1642], [368, 1642]], vgrad(c, 1222, 1642, [[0, "#c98b5b"], [0.3, "#b07142"], [1, "#6a7a9c"]]));
  for (let y = 1248; y < 1340; y += 13) seg(c, [370, y], [404, y + 22], "rgba(90,50,30,0.55)", 1);
  box(c, 375, 1248, 13, 60, "#253356", "#f2dcbc", 1.5);
  box(c, 372, 1450, 36, 192, "#c6d5e6");
  for (let x = 376; x < 408; x += 9) box(c, x, 1452, 4, 188, "#8dabd0");

  // Timber front.
  box(c, 110, 1222, 258, 128, "#b8704a", INK, 2);
  for (let y = 1230; y < 1348; y += 11) {
    const tone = rand();
    box(c, 112, y, 254, 11, tone > 0.5 ? "#c9804f" : tone > 0.2 ? "#b96f42" : "#a65f3b");
    seg(c, [112, y], [366, y], "rgba(70,34,24,0.65)", 1);
  }
  box(c, 110, 1218, 262, 9, "#e9e2d9", INK, 1.5);
  box(c, 110, 1296, 258, 54, "rgba(46,44,88,0.34)");
  box(c, 112, 1290, 36, 20, "#2a3556", "#94a7c6", 1);
  box(c, 328, 1290, 30, 18, "#2a3556", "#94a7c6", 1);
  // Sign board.
  box(c, 156, 1256, 162, 64, "#a06a4c", "#dcc8ae", 3);
  for (let y = 1259; y < 1290; y += 6) seg(c, [160, y], [314, y], "rgba(70,40,26,0.45)", 1);
  c.fillStyle = "#f59a3c";
  heart(c, 236, 1272, 18);
  c.fill();
  box(c, 163, 1288, 148, 26, "#0c0d14");
  label(c, "BAKE  HOUSE", 237, 1302, 18, "#f6f3ea", "Hiragino Sans");
  for (const x of [138, 334]) {
    box(c, x - 7, 1262, 14, 22, "#eef0f0", INK, 1.2);
    box(c, x - 9, 1259, 18, 4, "#3a4560");
  }

  // Dark shopfront.
  box(c, 125, 1440, 240, 202, "#111a3a", INK, 2);
  box(c, 125, 1447, 240, 25, "#16264e");
  const posters = ["#2d7aa5", "#d9607a", "#39a6a0", "#e2b04a", "#7c64c0"];
  for (let i = 0; i < 9; i++) box(c, 132 + i * 26, 1450, 21, 19, posters[i % 5]);
  // Warm-lit windows stocked with pastries.
  const windows: [number, number, number, number][] = [[137, 1476, 42, 108], [188, 1476, 28, 108], [228, 1476, 58, 108], [296, 1476, 44, 108]];
  for (const [x, y, w, h] of windows) {
    box(c, x, y, w, h, vgrad(c, y, y + h, [[0, "#ffe6b8"], [0.6, "#f7c988"], [1, "#d89a6a"]]), "#0b0f24", 2);
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = y + 34 + shelf * 34;
      box(c, x + 1, sy, w - 2, 3, "#f4f1ea");
      for (let px = x + 8; px < x + w - 4; px += 11) {
        pastry(c, px, sy - 7, 5.5 + rand() * 2, ["#d9873c", "#c96a31", "#e9b061", "#b8552c"][Math.floor(rand() * 4)], rand);
      }
    }
  }
  c.strokeStyle = "#f6f3ea";
  c.lineWidth = 3;
  heart(c, 257, 1508, 13);
  c.stroke();
  dot(c, 257, 1533, 25, 12, "#efb558");
  dot(c, 257, 1529, 21, 7, "#ffe29a");
  // Door frame, sale burst and pizza poster on the dark panel.
  box(c, 182, 1476, 4, 166, "#2a3a6c");
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    seg(c, [196, 1612], [196 + Math.cos(a) * 21, 1612 + Math.sin(a) * 21], "#f6c92e", 5);
  }
  dot(c, 196, 1612, 15, 15, "#fbd83f");
  dot(c, 306, 1612, 30, 17, "#a9401f");
  dot(c, 306, 1610, 26, 14, "#e39a3e");
  for (let i = 0; i < 8; i++) dot(c, 288 + rand() * 36, 1604 + rand() * 12, 3.5, 2.6, "#c43a27");
  // Wooden planter by the door.
  box(c, 132, 1618, 36, 24, "#b56f3f", INK, 1.2);
  seg(c, [132, 1630], [168, 1630], "#7c4628", 1);

  // Hanging baskets.
  for (const [x, y] of [[126, 1465], [356, 1470]] as Pt[]) {
    seg(c, [x, 1446], [x, y], "#20263f", 1.2);
    for (let i = 0; i < 26; i++) dot(c, x + (rand() - 0.5) * 26, y + (rand() - 0.5) * 16, 4, 3, ["#2f7a3b", "#58a441", "#1f5a33"][i % 3]);
    box(c, x - 8, y + 6, 16, 10, "#f1ede2", INK, 1);
  }

  // Red awning: lit slope, shaded valance.
  const slope: Pt[] = [[118, 1356], [374, 1356], [444, 1408], [62, 1408]];
  poly(c, slope, vgrad(c, 1356, 1408, [[0, "#c71f27"], [0.45, "#e0242b"], [1, "#f03a34"]]), INK, 2);
  poly(c, [[62, 1408], [118, 1356], [160, 1356], [130, 1408]], "#f25a4c");
  poly(c, [[444, 1408], [374, 1356], [340, 1356], [376, 1408]], "#a81722");
  for (let i = 1; i < 6; i++) seg(c, [118 + i * 42.6, 1356], [62 + i * 63.6, 1408], "rgba(90,6,20,0.55)", 1.6);
  seg(c, [90, 1383], [410, 1383], "rgba(255,160,140,0.45)", 2);
  poly(c, [[62, 1408], [444, 1408], [446, 1440], [410, 1447], [62, 1438]], vgrad(c, 1408, 1447, [[0, "#dc2029"], [1, "#a8141f"]]), INK, 2);
  box(c, 112, 1347, 262, 10, "#6f5e96", INK, 1.5);
  label(c, "WE ARE", 236, 1416, 11, "#f8d68a");
  label(c, "OPEN", 236, 1430, 15, "#f8d68a");
  // Awning's shadow on the shopfront.
  poly(c, [[125, 1442], [365, 1442], [365, 1462], [125, 1456]], "rgba(8,8,40,0.5)");
};

const paintLeftShop = (c: Ctx) => {
  const rand = rng(12);
  box(c, 0, 1236, 98, 406, vgrad(c, 1236, 1642, [[0, "#b9d6e6"], [0.34, "#6da3bd"], [1, "#39617f"]]));
  poly(c, [[0, 1236], [36, 1250], [60, 1308], [0, 1298]], "#a9d0e3", INK, 1.2);
  poly(c, [[0, 1312], [60, 1330], [58, 1378], [0, 1362]], "#f1cdd1", INK, 1.8);
  c.save();
  c.translate(29, 1345);
  c.rotate(0.22);
  label(c, "DAILY", 0, 0, 17, "#8a2436", "Georgia", 700);
  c.restore();
  poly(c, [[0, 1380], [88, 1392], [92, 1404], [0, 1402]], "#3f7f94", INK, 1.2);
  box(c, 4, 1420, 78, 190, vgrad(c, 1420, 1610, [[0, "#c9e6ee"], [1, "#5f97ac"]]), "#20354e", 3);
  poly(c, [[14, 1420], [54, 1420], [18, 1560], [6, 1560]], "rgba(255,255,255,0.32)");
  for (let i = 0; i < 12; i++) dot(c, 18 + rand() * 54, 1560 + rand() * 42, 7, 9, ["#dcdfe4", "#b6bfc9", "#f0e9de"][i % 3]);
  box(c, 98, 1400, 8, 242, "#e4ddd3");
};

const paintMiddle = (c: Ctx) => {
  // Signal pole by the ramp.
  box(c, 686, 1207, 12, 437, vgrad(c, 1207, 1644, [[0, "#3e4a66"], [1, "#2a3249"]]));
  box(c, 702, 1500, 22, 56, "#3a4560", INK, 1.5);
  box(c, 668, 1293, 26, 140, "#0e0f18", "#2c2f44", 2);
  for (let i = 0; i < 6; i++) box(c, 676, 1302 + i * 21, 10, 14, "#e23a52");
  box(c, 665, 1463, 20, 44, "#1d212f", INK, 1.2);
  dot(c, 675, 1474, 6, 6, "#e47a2e");
  dot(c, 675, 1494, 6, 6, "#39402f");
  // Poster stand and bollard.
  box(c, 448, 1536, 56, 80, "#20263f", INK, 2);
  box(c, 454, 1542, 44, 66, "#f6efe0");
  box(c, 458, 1548, 36, 20, "#e8a13a");
  box(c, 458, 1574, 36, 26, "#e4d4b4");
  for (let i = 0; i < 4; i++) box(c, 462, 1578 + i * 6, 26 - i * 3, 2.5, "#80705c");
  seg(c, [462, 1616], [456, 1646], "#20263f", 4);
  seg(c, [490, 1616], [496, 1646], "#20263f", 4);
  box(c, 512, 1598, 13, 50, "#e8b928", INK, 1);
  box(c, 512, 1610, 13, 7, "#2b2f3a");
  // Small street sign on the promenade.
  box(c, 991, 1508, 6, 186, "#2a3249");
  c.save();
  c.translate(994, 1498);
  poly(c, Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    return [Math.cos(a) * 19, Math.sin(a) * 19] as Pt;
  }), "#d61f2a", "#f6f3ea", 2);
  c.restore();
};

const paintPoles = (c: Ctx) => {
  // Slim light pole.
  box(c, 943, 462, 13, 1256, vgrad(c, 462, 1718, [[0, "#8390a8"], [1, "#a4adc0"]]));
  box(c, 943, 462, 4, 1256, "#c8d1dd");
  box(c, 952, 462, 4, 1256, "#566079");
  // Heavy utility pole.
  box(c, 1012, 455, 42, 1320, vgrad(c, 455, 1775, [[0, "#39405a"], [0.5, "#4c5570"], [1, "#6c7690"]]));
  box(c, 1012, 455, 10, 1320, "#7b859d");
  box(c, 1044, 455, 10, 1320, "#262c42");
  for (let y = 520; y < 1740; y += 62) dot(c, 1016, y, 2.4, 2.4, "#c8d0dc");
  // Cross arm with insulators.
  box(c, 930, 492, 150, 10, "#2c3247");
  for (const x of [948, 985, 1058]) {
    box(c, x - 3, 474, 6, 18, "#ccd4de");
    dot(c, x, 474, 5, 3, "#eef2f6");
  }
  box(c, 1050, 640, 40, 160, "#7b8498", INK, 1.5);
  box(c, 1050, 1160, 40, 130, "#c8cfdb", INK, 1.5);
  for (let i = 0; i < 5; i++) box(c, 1054, 1168 + i * 24, 32, 12, "#59617b");
  box(c, 1052, 1320, 34, 84, "#c8cfdb", INK, 1.5);
  // Stacked street signs.
  box(c, 998, 794, 78, 66, "#6d4fa8", "#1b2a7a", 4);
  box(c, 1006, 800, 62, 20, "#bfa8e6");
  box(c, 1006, 824, 62, 30, "#2a0f1d");
  box(c, 952, 862, 128, 68, "#0c1230", "#14193e", 4);
  box(c, 962, 870, 116, 52, "#141b44", "#9fb0ff", 2.5);
  box(c, 1016, 932, 46, 146, "#2a1a24", "#8ed9b4", 4);
  poly(c, [[972, 1082], [1080, 1076], [1080, 1150], [980, 1148], [968, 1116]], "#b24d18", "#ffb54a", 3);
  // Vertical lettering on the blade sign.
  [..."TRIBE"].forEach((ch, i) => label(c, ch, 1039, 952 + i * 26, 24, "#ffb35c", "Helvetica Neue"));
  label(c, "The Harbour", 1026, 1096, 15, "#fff0c9", "Georgia", 700);
  label(c, "Culture Book", 1026, 1115, 12, "#e8f0ff", "Georgia", 700);
  label(c, "Seaside Story", 1026, 1134, 14, "#fff0c9", "Georgia", 700);
  // STOP sign on the slim pole.
  poly(c, Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    return [950 + Math.cos(a) * 24, 1382 + Math.sin(a) * 24] as Pt;
  }), "#d61f2a", "#f6f3ea", 2.5);
  label(c, "STOP", 950, 1383, 14, "#fbf8f0");
  // Traffic light housing, lamps are drawn live.
  box(c, 958, 1212, 54, 118, "#111622", INK, 2);
  c.beginPath();
  c.roundRect(958, 1212, 54, 118, 14);
  c.fillStyle = "#121723";
  c.fill();
  for (const y of [1236, 1271, 1306]) dot(c, 985, y, 13.5, 13.5, "#1f2533");
};

const paintRightProps = (c: Ctx) => {
  const rand = rng(90);
  // Red-and-white vending box.
  box(c, 830, 1608, 62, 96, "#f1eff2", INK, 2);
  box(c, 836, 1618, 50, 66, "#d62c2a");
  c.strokeStyle = "#f6f3ea";
  c.lineWidth = 6;
  c.beginPath();
  c.arc(861, 1652, 15, 0.5, 5);
  c.stroke();
  box(c, 830, 1608, 62, 7, "#c8ccd8");
  poly(c, [[826, 1704], [894, 1704], [870, 1718], [812, 1716]], "rgba(70,62,120,0.35)");
  // Planter box with flowers.
  box(c, 900, 1618, 88, 86, vgrad(c, 1618, 1704, [[0, "#f39a2f"], [1, "#d9731f"]]), INK, 2);
  box(c, 918, 1636, 42, 54, "#f6ead6", "#a8652a", 1.5);
  for (let i = 0; i < 40; i++) {
    const x = 906 + rand() * 76, y = 1592 + rand() * 28;
    dot(c, x, y, 7, 5, ["#2f7a3b", "#58a441", "#1f5a33"][i % 3]);
  }
  for (let i = 0; i < 24; i++) {
    const x = 908 + rand() * 72, y = 1586 + rand() * 26;
    const tone = ["#fff5cf", "#ffd24a", "#ffffff", "#f8a13f"][i % 4];
    for (let k = 0; k < 5; k++) dot(c, x + Math.cos(k * 1.26) * 3.2, y + Math.sin(k * 1.26) * 3.2, 2.4, 2.4, tone);
    dot(c, x, y, 1.6, 1.6, "#d9731f");
  }
  poly(c, [[900, 1704], [988, 1704], [960, 1720], [884, 1718]], "rgba(70,62,120,0.35)");
};

// Things nearest the camera that people walk behind.
const paintFrontLeft = (c: Ctx) => {
  const rand = rng(61);
  // Bread stall.
  box(c, 0, 1608, 142, 12, "#6b4630", INK, 1.5);
  for (let i = 0; i < 16; i++) dot(c, 8 + rand() * 118, 1600 + rand() * 7, 13, 7, ["#e4b268", "#f1cf8e", "#d6934a", "#f7e7c4"][i % 4], (rand() - 0.5) * 0.7);
  box(c, 0, 1620, 142, 80, "#3a2a26", INK, 1.5);
  for (let y = 1632; y < 1700; y += 22) {
    box(c, 2, y, 138, 3, "#a9794a");
    for (let i = 0; i < 9; i++) dot(c, 8 + i * 15 + rand() * 4, y - 6, 7, 5, ["#f0dcc0", "#e2bd8d", "#d7a771"][i % 3]);
  }
  seg(c, [4, 1620], [4, 1742], "#20201f", 5);
  seg(c, [138, 1620], [150, 1730], "#20201f", 5);
  // Chalkboard.
  poly(c, [[0, 1650], [62, 1650], [72, 1760], [0, 1760]], "#21272c", "#8a6a44", 4);
  for (let i = 0; i < 7; i++) seg(c, [8, 1668 + i * 12], [36 + rand() * 24, 1668 + i * 12], "rgba(240,240,230,0.7)", 2);
  // Café chair.
  seg(c, [24, 1806], [34, 1720], "#1f2232", 5);
  seg(c, [88, 1800], [94, 1720], "#1f2232", 5);
  seg(c, [34, 1730], [94, 1730], "#1f2232", 6);
  seg(c, [40, 1766], [90, 1766], "#1f2232", 4);
  poly(c, [[0, 1800], [130, 1776], [190, 1760], [190, 1776], [0, 1832]], "rgba(70,62,120,0.3)");
};

export const paintBackdrop = () => {
  const layer = newLayer();
  const c = layer.getContext("2d")!;
  paintGround(c);
  // Slate pavement band in the awning's shade.
  poly(c, [[0, 1642], [500, 1642], [474, 1672], [0, 1680]], vgrad(c, 1642, 1680, [[0, "#6a79a0"], [1, "rgba(120,130,170,0.1)"]]));
  paintLeftShop(c);
  paintRamp(c);
  paintMiddle(c);
  paintShop(c);
  paintPoles(c);
  return layer;
};

// Sits between the far and near walkers on the pavement.
export const paintProps = () => {
  const layer = newLayer();
  paintRightProps(layer.getContext("2d")!);
  return layer;
};

export const paintFront = () => {
  const layer = newLayer();
  paintFrontLeft(layer.getContext("2d")!);
  return layer;
};

// Tree shade on the pavement: leaf-sized stamps gathered into clusters, flattened by the ground's perspective.
export const paintDapple = (seed: number) => {
  const layer = newLayer();
  const c = layer.getContext("2d")!;
  const rand = rng(seed);
  const stamp = (x: number, y: number, s: number) => {
    const a = (rand() - 0.5) * 1.1;
    c.beginPath();
    c.ellipse(x, y, s, s * 0.3, a * 0.5, 0, Math.PI * 2);
    c.fill();
  };
  c.fillStyle = "#3d4390";
  for (let i = 0; i < 46; i++) {
    const y = 1806 + rand() * 118, x = rand() * (W + 200) - 100;
    const weight = 0.35 + (y - 1806) / 130;
    if (rand() > weight) continue;
    const spread = 60 + rand() * 90;
    for (let k = 0; k < 150; k++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * spread;
      stamp(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.34, 9 + rand() * 13);
    }
  }
  c.fillRect(0, 1896, W, 40);
  c.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 120; i++) stamp(rand() * W, 1812 + rand() * 96, 5 + rand() * 13);
  return layer;
};
