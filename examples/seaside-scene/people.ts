// A small walking rig. Feet are planted: during stance each foot moves back at exactly the body's speed, so nobody skates.
export type Look = {
  skin: string; skinShade: string; hair: string; hairShade: string; top: string; topShade: string;
  skirt: string; skirtShade: string; shoe: string; sock: string;
  hairStyle: "bob" | "long" | "ponytail"; skirtLength: number; headScale?: number;
};

export type Walker = {
  look: Look; x0: number; ground: number; height: number; dir: 1 | -1; speed: number; period: number; offset: number; stance?: number;
};

type Pt = [number, number];
const INK = "#22233f";
const TAU = Math.PI * 2;

const ik = (hip: Pt, ankle: Pt, l1: number, l2: number): Pt => {
  const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1];
  const d = Math.min(l1 + l2 - 0.05, Math.hypot(dx, dy));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / Math.hypot(dx, dy), uy = dy / Math.hypot(dx, dy);
  return [hip[0] + ux * a + uy * h, hip[1] + uy * a - ux * h]; // knee bends forward
};

const limb = (c: CanvasRenderingContext2D, a: Pt, b: Pt, wa: number, wb: number, fill: string, shade: string) => {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const path = (grow: number) => {
    c.beginPath();
    c.arc(a[0], a[1], wa + grow, ang + Math.PI / 2, ang - Math.PI / 2);
    c.arc(b[0], b[1], wb + grow, ang - Math.PI / 2, ang + Math.PI / 2);
    c.closePath();
  };
  c.fillStyle = INK;
  path(0.42);
  c.fill();
  c.fillStyle = fill;
  path(0);
  c.fill();
  // Flat cel shadow down the back of the limb.
  c.save();
  path(0);
  c.clip();
  c.fillStyle = shade;
  c.translate(-Math.max(wa, wb) * 0.95, 0);
  path(0);
  c.fill();
  c.restore();
};

const shape = (c: CanvasRenderingContext2D, pts: Pt[], fill: string, line = 0.45) => {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1][0] + pts[i][0]) / 2, my = (pts[i - 1][1] + pts[i][1]) / 2;
    c.quadraticCurveTo(pts[i - 1][0], pts[i - 1][1], mx, my);
  }
  c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (line) {
    c.strokeStyle = INK;
    c.lineWidth = line;
    c.lineJoin = "round";
    c.stroke();
  }
};

const footAt = (p: number, reach: number, stance: number) => {
  if (p < stance) {
    const u = p / stance;
    return { x: reach * (1 - 2 * u), lift: 0, tilt: u > 0.72 ? ((u - 0.72) / 0.28) * 0.55 : u < 0.08 ? -0.28 * (1 - u / 0.08) : 0 };
  }
  const u = (p - stance) / (1 - stance);
  const ease = u * u * (3 - 2 * u);
  return { x: -reach + 2 * reach * ease, lift: Math.sin(Math.PI * u) ** 1.4 * 7.5, tilt: 0.55 * (1 - u) - 0.28 * u };
};

const drawShoe = (c: CanvasRenderingContext2D, ankle: Pt, tilt: number, look: Look, far: boolean) => {
  c.save();
  c.translate(ankle[0], ankle[1]);
  c.rotate(tilt);
  shape(c, [[-3, -1.8], [-3.4, 3.4], [8.6, 3.5], [8.4, 1.2], [3.2, -1.6]], far ? "#2c2c48" : look.shoe);
  c.fillStyle = "#f4f1ea";
  c.fillRect(-3.3, 2.5, 11.8, 1);
  c.restore();
};

export const drawWalker = (c: CanvasRenderingContext2D, w: Walker, t: number) => {
  const { look, height, dir, speed, period } = w;
  const x = w.x0 + dir * speed * t;
  const stance = w.stance ?? 0.6;
  const p = (t / period + w.offset) % 1;
  const unit = height / 100;
  // Distance the hips travel while a foot is on the ground, in rig units, keeps stance feet fixed to the pavement.
  const reach = (speed * period * stance) / 2 / unit;
  const bob = -Math.cos(p * TAU * 2) * 1.3;
  const hip: Pt = [0, -48.5 - bob];
  const sway = Math.sin(p * TAU);

  // Contact shadow on the pavement.
  c.save();
  c.translate(x - height * 0.05, w.ground + height * 0.008);
  c.scale(1, 0.16);
  const shadow = c.createRadialGradient(0, 0, 0, 0, 0, height * 0.32);
  shadow.addColorStop(0, "rgba(60,58,110,0.55)");
  shadow.addColorStop(1, "rgba(60,58,110,0)");
  c.fillStyle = shadow;
  c.beginPath();
  c.arc(0, 0, height * 0.32, 0, TAU);
  c.fill();
  c.restore();

  c.save();
  c.translate(x, w.ground);
  c.scale(dir * unit, unit);

  const legs = [0.5, 0].map((offset) => {
    const f = footAt((p + offset) % 1, reach, stance);
    const ankle: Pt = [f.x, -4.2 - f.lift];
    return { ankle, knee: ik([hip[0], hip[1]], ankle, 24.2, 24.2), tilt: f.tilt };
  });
  const armSwing = Math.cos(p * TAU) * 0.46;
  const shoulder: Pt = [1.5, -80 - bob];
  const arm = (angle: number, bend: number): [Pt, Pt] => {
    const elbow: Pt = [shoulder[0] + Math.sin(angle) * 14.5, shoulder[1] + Math.cos(angle) * 14.5];
    const a2 = angle + bend;
    return [elbow, [elbow[0] + Math.sin(a2) * 14, elbow[1] + Math.cos(a2) * 14]];
  };

  // Far arm and leg sit behind the body in a darker tone.
  const [farElbow, farHand] = arm(armSwing, 0.3 + Math.max(0, armSwing) * 0.6);
  limb(c, shoulder, farElbow, 2.6, 2.1, look.topShade, look.topShade);
  limb(c, farElbow, farHand, 2.1, 1.6, look.skinShade, look.skinShade);

  const longSkirt = look.skirtLength < 20;
  legs.forEach((leg, i) => {
    const far = i === 0;
    const skin = far ? look.skinShade : look.skin;
    if (longSkirt) {
      limb(c, [leg.ankle[0] - 0.5, leg.ankle[1] - 5], leg.ankle, 2, 1.8, skin, look.skinShade);
    } else {
      limb(c, hip, leg.knee, 4.4, 2.9, skin, look.skinShade);
      limb(c, leg.knee, leg.ankle, 2.9, 1.8, look.sock === "skin" ? skin : look.sock, look.sock === "skin" ? look.skinShade : "#c9c6d8");
    }
    drawShoe(c, leg.ankle, leg.tilt, look, far);
  });

  // Skirt follows the knees, then trails a little behind the step.
  const hem = -look.skirtLength;
  const reachOf = (pick: (a: number, b: number) => number) =>
    longSkirt ? pick(legs[0].ankle[0], legs[1].ankle[0]) : pick(legs[0].knee[0], legs[1].knee[0]);
  const spread = reachOf(Math.max);
  const back = reachOf(Math.min);
  const flow = look.skirtLength < 25 ? 1.5 : 0.9;
  const hipY = hip[1];
  const skirtPts: Pt[] = [
    [-6.4, hipY - 12], [-8.5, hipY - 2], [back * 0.55 - 8 - 2.2 * flow, hem + sway * 0.8], [back * 0.55 - 8 - 2.2 * flow, hem + sway * 0.8],
    [back * 0.25 - 2, hem + 1.3], [spread * 0.3 + 4, hem - 0.3], [spread * 0.6 + 7, hem + sway * -0.8], [spread * 0.6 + 7, hem + sway * -0.8],
    [8.2, hipY - 3], [6, hipY - 12],
  ];
  shape(c, skirtPts, look.skirt);
  c.save();
  c.clip();
  c.fillStyle = look.skirtShade;
  c.fillRect(-30, hipY - 14, 26 + sway * 2, 80);
  c.strokeStyle = look.skirtShade;
  c.lineWidth = 0.7;
  for (const k of [-0.3, 0.3, 0.75]) {
    c.beginPath();
    c.moveTo(k * 6, hipY - 10);
    c.lineTo(k * (spread * 0.5 + 8) + sway, hem);
    c.stroke();
  }
  c.restore();

  // Torso, leaning slightly into the walk.
  const y0 = -bob;
  const torso: Pt[] = [[-5.6, -82 + y0], [-6.6, -73 + y0], [-5.6, -61 + y0], [6, -61 + y0], [7.6, -71 + y0], [6, -82 + y0], [2, -84 + y0]];
  shape(c, torso, look.top);
  c.save();
  c.clip();
  c.fillStyle = look.topShade;
  c.fillRect(-12, -90 + y0, 9.5, 34);
  c.restore();

  // Neck and head.
  limb(c, [1.2, -83 + y0], [1.8, -86.5 + y0], 2.1, 2.1, look.skinShade, look.skinShade);
  c.save();
  c.translate(1.8, -86 + y0);
  c.scale(look.headScale ?? 1, look.headScale ?? 1);
  drawHead(c, look, [1.2, -8.5], p);
  c.restore();

  const [elbow, hand] = arm(-armSwing, 0.3 + Math.max(0, -armSwing) * 0.6);
  limb(c, shoulder, elbow, 2.9, 2.3, look.top, look.topShade);
  limb(c, elbow, hand, 2.2, 1.7, look.skin, look.skinShade);
  c.restore();
};

const drawHead = (c: CanvasRenderingContext2D, look: Look, [hx, hy]: Pt, p: number) => {
  const sway = Math.sin(p * TAU * 2);
  const tail = Math.sin(p * TAU * 2 - 1);
  // Hair that sits behind the face.
  if (look.hairStyle === "long") {
    shape(c, [[hx - 2, hy - 9], [hx - 10.5, hy - 3], [hx - 12, hy + 12], [hx - 13.5 - tail, hy + 27], [hx - 7, hy + 25], [hx - 3, hy + 12], [hx, hy]], look.hairShade);
  } else if (look.hairStyle === "bob") {
    shape(c, [[hx - 2, hy - 9], [hx - 10.5, hy - 3], [hx - 11, hy + 8], [hx - 8 - tail * 0.7, hy + 12.5], [hx - 2, hy + 10], [hx + 1, hy + 2]], look.hairShade);
  } else {
    shape(c, [[hx - 8, hy - 6], [hx - 14.5, hy - 7 + sway], [hx - 19 - tail, hy + 3], [hx - 18.5 - tail * 2, hy + 13], [hx - 14 - tail, hy + 6], [hx - 10, hy - 1]], look.hairShade);
  }
  // Face: round skull, small chin pointing the way she walks.
  shape(c, [[hx - 7, hy - 7], [hx + 3, hy - 10], [hx + 9.4, hy - 4], [hx + 9.7, hy + 1], [hx + 8.6, hy + 5], [hx + 4.8, hy + 9], [hx - 1, hy + 8.2], [hx - 7, hy + 3]], look.skin);
  c.fillStyle = "rgba(240,120,120,0.45)";
  c.beginPath();
  c.ellipse(hx + 5.2, hy + 3.2, 2, 1.1, 0, 0, TAU);
  c.fill();
  // Eye.
  c.fillStyle = INK;
  c.beginPath();
  c.ellipse(hx + 6, hy - 0.4, 1.05, 1.8, 0, 0, TAU);
  c.fill();
  c.fillStyle = "#fff";
  c.beginPath();
  c.arc(hx + 6.3, hy - 1, 0.42, 0, TAU);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 0.4;
  c.beginPath();
  c.moveTo(hx + 4, hy - 3.6);
  c.quadraticCurveTo(hx + 6, hy - 4.5, hx + 8, hy - 3.2);
  c.moveTo(hx + 6.5, hy + 6);
  c.lineTo(hx + 8, hy + 5.7);
  c.stroke();
  // Hair cap with fringe.
  shape(c, [
    [hx + 8.5, hy - 3], [hx + 9.8, hy - 6.5], [hx + 5, hy - 11], [hx - 3, hy - 11.5], [hx - 10, hy - 7], [hx - 11, hy + 1],
    [hx - 8, hy + 7], [hx - 4.6, hy + 4], [hx - 2.5, hy - 1], [hx - 1.6, hy + 3.6], [hx + 0.8, hy - 2.6], [hx + 2.4, hy + 0.8], [hx + 4, hy - 4], [hx + 6, hy - 2],
  ], look.hair);
  c.strokeStyle = "rgba(255,255,255,0.45)";
  c.lineWidth = 0.9;
  c.beginPath();
  c.arc(hx - 1, hy - 1, 8.6, -2.3, -1.15);
  c.stroke();
};

const SKIN = { skin: "#ffdcc4", skinShade: "#e6ad95" };

export const WALKERS: Walker[] = [
  {
    look: { ...SKIN, hair: "#e0813f", hairShade: "#a9512a", top: "#fbf7ef", topShade: "#c7cbe2", skirt: "#e0492c", skirtShade: "#a82d24", shoe: "#a44b2c", sock: "skin", hairStyle: "ponytail", skirtLength: 36 },
    x0: 170, ground: 1672, height: 186, dir: 1, speed: 136, period: 1.02, offset: 0.1,
  },
  {
    look: { ...SKIN, hair: "#2b4aa6", hairShade: "#1c2f78", top: "#f6f7fb", topShade: "#b7c4e2", skirt: "#2f4778", skirtShade: "#1f3159", shoe: "#1d2748", sock: "#f6f4f0", hairStyle: "bob", skirtLength: 33 },
    x0: 800, ground: 1712, height: 198, dir: -1, speed: 146, period: 1.04, offset: 0.55,
  },
  {
    look: { ...SKIN, hair: "#5a3a2c", hairShade: "#3b2420", top: "#9aa35f", topShade: "#6f7c4c", skirt: "#7fb7b4", skirtShade: "#568f95", shoe: "#b5502e", sock: "skin", hairStyle: "long", skirtLength: 7, headScale: 0.84 },
    x0: 1210, ground: 1812, height: 340, dir: -1, speed: 158, period: 1.24, offset: 0.3, stance: 0.62,
  },
];
