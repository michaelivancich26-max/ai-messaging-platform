// The Veritas Grove — a hand-crafted pixel-art fairy wonderland.
//
// Static scenery is baked once into two offscreen canvases:
//   drawWorldTo(ctx)   — ground, water, paths, plaza, trunks, buildings
//   drawCanopies(ctx)  — tree crowns, drawn OVER characters for depth
// drawAmbient(...) paints animated fireflies, pulsing glows, water shimmer
// and a soft vignette in screen space every frame.

export const TILE = 16;
export const WORLD_W = 1600;
export const WORLD_H = 1200;
export const SPAWN = { x: 800, y: 706 };

export interface Building {
  id: string;
  name: string;
  sub: string;
  route: string;
  x: number; y: number; w: number; h: number;   // visual bounds
  door: { x: number; y: number };               // interaction point (outside solid)
  label: { x: number; y: number };              // floating name position
}

export const BUILDINGS: Building[] = [
  { id: "debates", name: "Convention Center", sub: "Debates", route: "/lobby",   x: 150,  y: 178, w: 360, h: 234, door: { x: 330,  y: 436 },  label: { x: 330,  y: 166 } },
  { id: "compete", name: "The Coliseum",      sub: "Compete", route: "/compete", x: 1025, y: 160, w: 370, h: 280, door: { x: 1210, y: 460 },  label: { x: 1210, y: 148 } },
  { id: "arena",   name: "Computer Lab",      sub: "Arena",   route: "/arena",   x: 210,  y: 770, w: 280, h: 232, door: { x: 364,  y: 1014 }, label: { x: 350,  y: 756 } },
  { id: "learn",   name: "The Library",       sub: "Learn",   route: "/learn",   x: 1090, y: 800, w: 300, h: 206, door: { x: 1240, y: 1016 }, label: { x: 1240, y: 786 } },
];

// ── Scenery data ──────────────────────────────────────────────────────────────
const BLOSSOMS: [number, number][] = [
  [80, 140], [340, 100], [580, 120], [760, 80], [950, 130], [1470, 110],
  [1530, 340], [1560, 560], [1520, 760],
  [60, 480], [90, 640], [60, 860],
  [150, 1120], [320, 1160], [540, 1170], [980, 1170], [1180, 1160], [1420, 1130],
  [560, 520], [1060, 520], [545, 800],
];
const WILLOWS: [number, number][] = [[620, 930], [985, 935], [180, 620], [1445, 620]];
const MUSHROOM_CLUSTERS: [number, number][] = [[525, 435], [1245, 525], [1440, 880], [655, 1155]];
const MUSHROOM_RING = { x: 95, y: 105, r: 36, n: 8 };
const CRYSTALS: [number, number][] = [[1475, 1095], [1425, 1155]];
const ROCKS: [number, number][] = [[245, 560], [1330, 690], [880, 175], [415, 1008]];
const LANTERNS: [number, number][] = [
  [477, 505], [1062, 522], [630, 840], [968, 845],
  [770, 905], [830, 905], [600, 1162], [990, 1162],
  [296, 392], [364, 392], [1160, 450], [1260, 450],
  [332, 986], [396, 986], [1206, 988], [1274, 988],
];
const FLOWER_PATCHES: [number, number][] = [
  [700, 300], [880, 320], [420, 640], [1170, 640], [250, 300], [1300, 560],
  [640, 1060], [960, 1060], [120, 980], [1500, 940], [900, 480], [700, 480],
];

// Paths as quadratic segments [ax,ay, cx,cy, bx,by]
const PATHS: [number, number, number, number, number, number][] = [
  [672, 560, 470, 470, 330, 442],       // plaza → Convention Center
  [920, 548, 1060, 492, 1210, 466],     // plaza → Coliseum
  [700, 745, 590, 830, 556, 930],       // plaza → Lab (leg 1)
  [556, 930, 520, 1040, 366, 1018],     // → Lab door (leg 2)
  [900, 740, 1010, 840, 1046, 935],     // plaza → Library (leg 1)
  [1046, 935, 1084, 1050, 1236, 1020],  // → Library door (leg 2)
  [430, 1090, 600, 1148, 795, 1130],    // scenic south (west)
  [795, 1130, 990, 1148, 1150, 1088],   // scenic south (east)
  [800, 792, 800, 850, 800, 900],       // plaza → lake overlook
];

const LAKE = { x: 800, y: 1000, rx: 210, ry: 85 };
const STREAM: [number, number][] = [[800, 1085], [790, 1140], [805, 1200]];
const BRIDGE = { x: 758, y: 1112, w: 70, h: 36 };
const TRUNK = { x: 780, y: 554, w: 40, h: 100 };   // Great Tree trunk (solid)

// ── Collision ─────────────────────────────────────────────────────────────────
const SOLID: { x: number; y: number; w: number; h: number }[] = [];
{
  const M = 6; // avatar-radius margin baked in
  const add = (x: number, y: number, w: number, h: number) => SOLID.push({ x: x - M, y: y - M, w: w + 2 * M, h: h + 2 * M });
  add(150, 200, 360, 212);   // CC solid
  add(210, 770, 280, 234);   // Lab solid
  add(1090, 800, 300, 208);  // Library solid
  add(TRUNK.x, TRUNK.y, TRUNK.w, TRUNK.h);
  for (const [x, y] of [...BLOSSOMS, ...WILLOWS]) add(x - 5, y - 12, 10, 14);
  for (const [x, y] of CRYSTALS) add(x - 14, y - 8, 28, 18);
  for (const [x, y] of ROCKS) add(x - 9, y - 5, 18, 11);
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function isBlocked(x: number, y: number): boolean {
  if (x < 8 || y < 8 || x > WORLD_W - 8 || y > WORLD_H - 8) return true;
  for (const r of SOLID) {
    if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
  }
  // Coliseum (elliptical)
  const ex = (x - 1210) / 197, ey = (y - 300) / 142;
  if (ex * ex + ey * ey < 1) return true;
  // Lake
  const lx = (x - LAKE.x) / (LAKE.rx + 8), ly = (y - LAKE.y) / (LAKE.ry + 8);
  if (lx * lx + ly * ly < 1) return true;
  // Stream (walkable on the bridge)
  const onBridge = x > BRIDGE.x - 4 && x < BRIDGE.x + BRIDGE.w + 4 && y > BRIDGE.y - 6 && y < BRIDGE.y + BRIDGE.h + 6;
  if (!onBridge) {
    for (let i = 0; i < STREAM.length - 1; i++) {
      if (distToSeg(x, y, STREAM[i][0], STREAM[i][1], STREAM[i + 1][0], STREAM[i + 1][1]) < 19) return true;
    }
  }
  return false;
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
function rnd(x: number, y: number, seed = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
}
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: string) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
}
function ell(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, c: string) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function sampleQuad(seg: [number, number, number, number, number, number], steps: number): [number, number][] {
  const [ax, ay, cx, cy, bx, by] = seg;
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]);
  }
  return out;
}

// ── Ground / nature ───────────────────────────────────────────────────────────
function drawGround(ctx: CanvasRenderingContext2D) {
  const G = ["#3a7d44", "#357a41", "#40864b", "#38814a"];
  for (let ty = 0; ty < WORLD_H / TILE; ty++) {
    for (let tx = 0; tx < WORLD_W / TILE; tx++) {
      px(ctx, tx * TILE, ty * TILE, TILE, TILE, G[Math.floor(rnd(tx, ty) * 4)]);
      // low-frequency meadow tinting
      const m = rnd(Math.floor(tx / 6), Math.floor(ty / 6), 9);
      if (m > 0.74) px(ctx, tx * TILE, ty * TILE, TILE, TILE, "rgba(255,246,180,0.06)");
      else if (m < 0.18) px(ctx, tx * TILE, ty * TILE, TILE, TILE, "rgba(30,50,110,0.07)");
      // scatter detail
      const d = rnd(tx, ty, 3);
      const bx = tx * TILE, by = ty * TILE;
      if (d > 0.955) { px(ctx, bx + 5, by + 6, 2, 3, "#2f6b3a"); px(ctx, bx + 9, by + 9, 2, 3, "#2f6b3a"); }
      else if (d > 0.93) { px(ctx, bx + 7, by + 7, 2, 2, ["#ffd9ec", "#fff3b0", "#cdb4f7", "#ffffff"][Math.floor(rnd(tx, ty, 7) * 4)]); px(ctx, bx + 7, by + 9, 1, 2, "#2f6b3a"); }
      else if (d > 0.915) px(ctx, bx + 6, by + 8, 3, 1, "#8fd9a0");
    }
  }
}

function drawFlowerPatch(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const cols = ["#ff9ecb", "#fff3b0", "#c39bff", "#ffb46b", "#ffffff"];
  for (let i = 0; i < 7; i++) {
    const fx = x + Math.floor(rnd(i, x) * 30) - 15;
    const fy = y + Math.floor(rnd(x, i) * 20) - 10;
    px(ctx, fx, fy + 2, 1, 3, "#2f6b3a");
    px(ctx, fx - 1, fy, 3, 2, cols[Math.floor(rnd(fx, fy) * 5)]);
    px(ctx, fx, fy, 1, 1, "#f5d24a");
  }
}

function drawTulipMeadow(ctx: CanvasRenderingContext2D) {
  const cols = ["#e85d8a", "#f5b83d", "#b473e8", "#e8574a"];
  for (let y = 1044; y < 1132; y += 13) {
    for (let x = 185; x < 420; x += 12) {
      if (rnd(x, y, 5) < 0.35) continue;
      const c = cols[Math.floor(rnd(x, y, 6) * 4)];
      const j = Math.floor(rnd(y, x) * 5) - 2;
      px(ctx, x + j, y + 3, 1, 4, "#2f6b3a");
      px(ctx, x + j - 1, y, 3, 3, c);
      px(ctx, x + j - 1, y, 1, 1, shade(c, 1.3));
    }
  }
}

function drawWater(ctx: CanvasRenderingContext2D) {
  // Lake
  ell(ctx, LAKE.x, LAKE.y + 3, LAKE.rx + 6, LAKE.ry + 6, "#274e35");     // grassy bank shadow
  ell(ctx, LAKE.x, LAKE.y, LAKE.rx + 4, LAKE.ry + 4, "#8a7a5f");         // sandy rim
  ell(ctx, LAKE.x, LAKE.y, LAKE.rx, LAKE.ry, "#2f6f9e");
  ell(ctx, LAKE.x - 14, LAKE.y - 8, LAKE.rx * 0.72, LAKE.ry * 0.66, "#3a86ba");
  ell(ctx, LAKE.x - 26, LAKE.y - 14, LAKE.rx * 0.42, LAKE.ry * 0.38, "#4d9fd0");
  // static ripples
  for (let i = 0; i < 9; i++) {
    const a = rnd(i, 4) * Math.PI * 2;
    const rr = 0.35 + rnd(i, 5) * 0.5;
    px(ctx, Math.round(LAKE.x + Math.cos(a) * LAKE.rx * rr), Math.round(LAKE.y + Math.sin(a) * LAKE.ry * rr), 10, 1, "rgba(255,255,255,0.22)");
  }
  // lily pads + lotus
  const pads: [number, number][] = [[716, 986], [864, 1032], [782, 962], [902, 986]];
  for (const [lx, ly] of pads) {
    ell(ctx, lx, ly, 9, 5, "#3f9d5c");
    ell(ctx, lx - 2, ly - 1, 5, 3, "#57b974");
    px(ctx, lx + 3, ly - 1, 4, 2, "#2f6f9e");
  }
  px(ctx, 780, 957, 3, 3, "#ffb7d9"); px(ctx, 779, 959, 5, 1, "#ff9ecb");
  px(ctx, 862, 1028, 3, 3, "#ffd9ec");

  // Stream
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, ay] = STREAM[i], [bx, by] = STREAM[i + 1];
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const sx2 = ax + (bx - ax) * t, sy2 = ay + (by - ay) * t;
      disc(ctx, sx2, sy2, 15, "#8a7a5f");
    }
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const sx2 = ax + (bx - ax) * t, sy2 = ay + (by - ay) * t;
      disc(ctx, sx2, sy2, 11, "#3a86ba");
    }
  }
  px(ctx, 792, 1105, 8, 1, "rgba(255,255,255,0.25)");
  px(ctx, 788, 1160, 8, 1, "rgba(255,255,255,0.25)");
}

function drawPaths(ctx: CanvasRenderingContext2D) {
  const all = PATHS.map(p => sampleQuad(p, Math.ceil(Math.hypot(p[4] - p[0], p[5] - p[1]) / 5)));
  for (const pts of all) for (const [x, y] of pts) disc(ctx, x, y, 15, "#8a7a5f");
  for (const pts of all) for (const [x, y] of pts) disc(ctx, x, y, 12, "#d9cba9");
  // cobbles
  for (const pts of all) {
    for (let i = 0; i < pts.length; i += 3) {
      const [x, y] = pts[i];
      const j = rnd(x, y) * 10 - 5;
      ell(ctx, x + j, y + (rnd(y, x) * 8 - 4), 4, 2.6, rnd(x, y, 2) > 0.5 ? "#c6b590" : "#e2d6b4");
    }
  }
}

function drawBridge(ctx: CanvasRenderingContext2D) {
  const { x, y, w, h } = BRIDGE;
  px(ctx, x - 3, y - 4, w + 6, 4, "#6e4f30");          // north rail
  px(ctx, x - 3, y + h, w + 6, 4, "#6e4f30");          // south rail
  px(ctx, x - 3, y - 6, 4, h + 12, "#7d5a38"); px(ctx, x + w - 1, y - 6, 4, h + 12, "#7d5a38"); // posts
  for (let i = 0; i < w; i += 7) {
    px(ctx, x + i, y, 6, h, i % 14 === 0 ? "#a8794f" : "#b78757");
    px(ctx, x + i, y, 6, 2, "#c99a66");
  }
  px(ctx, x - 3, y - 4, w + 6, 1, "#8f6a42");
}

function drawPlaza(ctx: CanvasRenderingContext2D) {
  disc(ctx, 800, 640, 154, "#8f8272");
  disc(ctx, 800, 640, 148, "#d6c9ab");
  ctx.strokeStyle = "#bfae8e"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(800, 640, 120, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(800, 640, 70, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 90; i++) {
    const a = rnd(i, 1) * Math.PI * 2, r = rnd(i, 2) * 140;
    ell(ctx, 800 + Math.cos(a) * r, 640 + Math.sin(a) * r, 3.4, 2.2, rnd(i, 3) > 0.5 ? "#c9bb98" : "#e0d4b6");
  }
  // petals drifting on the stones
  for (let i = 0; i < 26; i++) {
    const a = rnd(i, 11) * Math.PI * 2, r = 30 + rnd(i, 12) * 115;
    px(ctx, Math.round(800 + Math.cos(a) * r), Math.round(640 + Math.sin(a) * r), 2, 2, rnd(i, 13) > 0.5 ? "#f7c6e3" : "#eda9d2");
  }
}

// ── Flora ─────────────────────────────────────────────────────────────────────
function drawBlossomTrunk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ell(ctx, x, y + 2, 12, 4, "rgba(20,30,20,0.30)");
  px(ctx, x - 4, y - 14, 8, 16, "#7a5238");
  px(ctx, x - 1, y - 12, 2, 12, "#5d3d29");
  px(ctx, x - 7, y - 2, 4, 4, "#7a5238"); px(ctx, x + 3, y - 2, 4, 4, "#7a5238");
}
function drawBlossomCanopy(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ell(ctx, x, y - 12, 17, 7, "#c96fae");
  disc(ctx, x - 12, y - 20, 13, "#e88bc4");
  disc(ctx, x + 12, y - 20, 13, "#e184bd");
  disc(ctx, x, y - 28, 16, "#ef9ed0");
  disc(ctx, x - 5, y - 33, 9, "#f9c9e6");
  for (let i = 0; i < 7; i++) {
    px(ctx, Math.round(x - 14 + rnd(i, x) * 28), Math.round(y - 36 + rnd(x, i) * 20), 2, 2, "#fff0f8");
  }
  px(ctx, x + 8, y - 4, 2, 2, "#f7c6e3"); px(ctx, x - 11, y - 1, 2, 2, "#f7c6e3"); // falling petals
}
function drawWillowTrunk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ell(ctx, x, y + 2, 13, 4, "rgba(20,30,20,0.30)");
  px(ctx, x - 4, y - 18, 8, 20, "#6e5a3a");
  px(ctx, x - 1, y - 16, 2, 16, "#54432b");
}
function drawWillowCanopy(ctx: CanvasRenderingContext2D, x: number, y: number) {
  disc(ctx, x, y - 30, 19, "#3f9d74");
  disc(ctx, x - 10, y - 24, 12, "#57b98a");
  disc(ctx, x + 11, y - 25, 11, "#4aa87e");
  disc(ctx, x - 2, y - 37, 10, "#6fcf9e");
  for (let i = -3; i <= 3; i++) {
    const sx2 = x + i * 6;
    px(ctx, sx2, y - 24, 1, 14 + Math.floor(rnd(i, x) * 8), "#4fae82");
  }
}
function drawMushroom(ctx: CanvasRenderingContext2D, x: number, y: number, big: boolean, cool: boolean) {
  const capC = cool ? "#5fe8dc" : "#ff6fa5";
  const capHi = cool ? "#b8fff8" : "#ffb1cf";
  const s = big ? 1.5 : 1;
  ell(ctx, x, y + 1, 6 * s, 2, "rgba(20,30,20,0.3)");
  px(ctx, Math.round(x - 1.5 * s), Math.round(y - 4 * s), Math.round(3 * s), Math.round(5 * s), "#f2e8da");
  ell(ctx, x, y - 4 * s, 5.5 * s, 3.4 * s, capC);
  ell(ctx, x - s, y - 5 * s, 3 * s, 1.6 * s, capHi);
  px(ctx, Math.round(x - 3 * s), Math.round(y - 5 * s), 1, 1, "#ffffff");
  px(ctx, Math.round(x + 2 * s), Math.round(y - 4 * s), 1, 1, "#ffffff");
}
function drawCrystals(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ell(ctx, x, y + 4, 16, 5, "rgba(20,30,40,0.35)");
  px(ctx, x - 12, y - 6, 8, 10, "#4fc6d8");
  px(ctx, x - 10, y - 12, 4, 8, "#7fe8f4");
  px(ctx, x - 1, y - 16, 6, 20, "#69e6f2");
  px(ctx, x + 1, y - 16, 2, 14, "#c6f9ff");
  px(ctx, x + 8, y - 8, 6, 12, "#4fc6d8");
  px(ctx, x + 9, y - 8, 2, 8, "#a8f4fb");
}
function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ell(ctx, x, y + 3, 10, 3.4, "rgba(20,30,20,0.3)");
  ell(ctx, x, y - 1, 9, 6, "#8a8f98");
  ell(ctx, x - 3, y - 3, 5, 3.4, "#a7adb8");
  px(ctx, x + 2, y, 4, 2, "#6f747d");
  px(ctx, x - 6, y + 2, 3, 1, "#5da06e"); // moss
}
function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, x - 1, y - 14, 3, 14, "#4a3a2a");
  px(ctx, x - 4, y - 20, 9, 7, "#5d4a34");
  px(ctx, x - 3, y - 19, 7, 5, "#ffdf8e");
  px(ctx, x - 2, y - 18, 2, 2, "#fff7d6");
  px(ctx, x - 5, y - 21, 11, 2, "#3a2d20");
  ell(ctx, x + 0.5, y + 1, 5, 2, "rgba(20,30,20,0.3)");
}

// ── The Great Tree ────────────────────────────────────────────────────────────
function drawGreatTrunk(ctx: CanvasRenderingContext2D) {
  ell(ctx, 800, 656, 30, 8, "rgba(20,30,20,0.35)");
  px(ctx, 786, 556, 28, 14, "#6b4a36");
  px(ctx, 788, 570, 26, 20, "#6b4a36");
  px(ctx, 790, 590, 22, 30, "#6b4a36");
  px(ctx, 786, 618, 30, 22, "#6b4a36");
  px(ctx, 776, 634, 12, 10, "#6b4a36"); px(ctx, 812, 634, 16, 10, "#6b4a36");   // roots
  px(ctx, 795, 566, 3, 70, "#54382a"); px(ctx, 805, 574, 2, 60, "#54382a");     // bark
  px(ctx, 791, 600, 2, 26, "#7d5a42");
  // glowing runes
  px(ctx, 796, 596, 3, 3, "#7ff0e8"); px(ctx, 804, 584, 2, 2, "#9ff5ee"); px(ctx, 799, 616, 2, 2, "#7ff0e8");
}
function drawGreatCanopy(ctx: CanvasRenderingContext2D) {
  ell(ctx, 800, 524, 96, 26, "#a05f9d");
  disc(ctx, 760, 470, 46, "#e88bc4");
  disc(ctx, 842, 472, 44, "#de7fbc");
  disc(ctx, 800, 436, 50, "#ef9ed0");
  disc(ctx, 742, 502, 32, "#c887d6");
  disc(ctx, 860, 502, 30, "#c887d6");
  disc(ctx, 800, 490, 58, "#e88bc4");
  disc(ctx, 776, 436, 20, "#f9c9e6");
  disc(ctx, 826, 428, 15, "#f9c9e6");
  for (let i = 0; i < 34; i++) {
    const a = rnd(i, 21) * Math.PI * 2, r = rnd(i, 22) * 80;
    px(ctx, Math.round(800 + Math.cos(a) * r), Math.round(468 + Math.sin(a) * r * 0.7), 2, 2, "#fff0f8");
  }
  // hanging light strands
  for (const hx of [756, 788, 818, 848]) {
    const len = 10 + Math.floor(rnd(hx, 1) * 8);
    px(ctx, hx, 522, 1, len, "#d9b3e8");
    px(ctx, hx - 1, 522 + len, 3, 3, "#fff2a8");
  }
}

// ── Buildings ─────────────────────────────────────────────────────────────────
function drawConventionCenter(ctx: CanvasRenderingContext2D) {
  // towers
  for (const tx of [152, 468]) {
    px(ctx, tx, 238, 40, 170, "#6a76e8");
    px(ctx, tx, 238, 6, 170, "#7f8af2");
    px(ctx, tx, 398, 40, 10, "#4a55b8");
    // cone roof
    px(ctx, tx + 16, 190, 8, 6, "#8a5fe8"); px(ctx, tx + 11, 196, 18, 8, "#8a5fe8");
    px(ctx, tx + 6, 204, 28, 8, "#7d4fdc"); px(ctx, tx + 1, 212, 38, 10, "#7048d0");
    px(ctx, tx - 3, 222, 46, 16, "#6340c0");
    px(ctx, tx + 16, 190, 4, 40, "rgba(255,255,255,0.18)");
    px(ctx, tx + 19, 178, 2, 12, "#4a3a2a"); px(ctx, tx + 21, 180, 9, 5, "#ffd76e"); // pennant
    // tower window
    px(ctx, tx + 14, 280, 12, 22, "#2c2768"); px(ctx, tx + 16, 283, 8, 16, "#ffe9a8");
  }
  // main hall
  px(ctx, 170, 258, 320, 150, "#5f6bd8");
  px(ctx, 170, 258, 320, 4, "#7f8af2");
  px(ctx, 170, 388, 320, 20, "#4a55b8");
  for (let yy = 276; yy < 384; yy += 14) px(ctx, 176, yy, 308, 1, "rgba(0,0,0,0.10)");
  // roof
  px(ctx, 162, 222, 336, 36, "#4c46c9");
  px(ctx, 162, 222, 336, 4, "#8a84f4");
  px(ctx, 162, 252, 336, 6, "#3a35a0");
  // string lights on the eave
  for (let i = 0; i < 23; i++) px(ctx, 170 + i * 14, 259, 3, 3, i % 2 ? "#ffd9a0" : "#ffb3d9");
  // arched windows
  for (const wx of [205, 255, 395, 445]) {
    px(ctx, wx + 6, 288, 14, 6, "#2c2768"); px(ctx, wx + 2, 294, 22, 6, "#2c2768");
    px(ctx, wx, 300, 26, 54, "#2c2768");
    px(ctx, wx + 8, 292, 10, 4, "#ffe9a8"); px(ctx, wx + 4, 296, 18, 4, "#ffe9a8");
    px(ctx, wx + 3, 300, 20, 50, "#ffe9a8");
    px(ctx, wx + 12, 296, 2, 54, "#2c2768"); px(ctx, wx + 3, 322, 20, 2, "#2c2768");
    px(ctx, wx + 3, 350, 20, 4, "#c9a86a");
    ell(ctx, wx + 13, 414, 20, 5, "rgba(255,225,150,0.14)");
  }
  // banners
  px(ctx, 236, 268, 14, 38, "#8f7ff5"); px(ctx, 236, 300, 14, 6, "#6f5fd5"); px(ctx, 240, 278, 6, 6, "#ffd76e");
  px(ctx, 410, 268, 14, 38, "#8f7ff5"); px(ctx, 410, 300, 14, 6, "#6f5fd5"); px(ctx, 414, 278, 6, 6, "#ffd76e");
  // grand door
  px(ctx, 312, 320, 36, 12, "#2c2768"); px(ctx, 318, 314, 24, 6, "#2c2768");
  px(ctx, 306, 332, 48, 76, "#2c2768");
  px(ctx, 312, 336, 36, 72, "#7a4a2f");
  px(ctx, 329, 336, 2, 72, "#4a2c1a");
  px(ctx, 322, 368, 3, 5, "#eec95c"); px(ctx, 336, 368, 3, 5, "#eec95c");
  px(ctx, 298, 408, 64, 8, "#b09a72");                              // steps
  ell(ctx, 330, 424, 30, 6, "rgba(255,225,150,0.13)");
}

function drawColiseum(ctx: CanvasRenderingContext2D) {
  ell(ctx, 1210, 316, 188, 128, "rgba(20,16,40,0.30)");
  ell(ctx, 1210, 300, 185, 130, "#7c3aed");
  ell(ctx, 1210, 284, 178, 118, "#9d6ff0");
  ell(ctx, 1210, 276, 152, 96, "#5b21b6");
  ell(ctx, 1210, 272, 132, 80, "#6d31c9");
  ell(ctx, 1210, 268, 112, 66, "#7f45db");
  ell(ctx, 1210, 266, 92, 52, "#caa96b");   // arena sand
  ell(ctx, 1210, 264, 60, 32, "#dbbc80");
  px(ctx, 1206, 246, 8, 8, "#b8935a");      // center mark
  // arched niches along the lower band
  const arch: [number, number][] = [[1080, 384], [1123, 404], [1166, 416], [1210, 420], [1254, 416], [1297, 404], [1340, 384]];
  for (const [ax, ay] of arch) {
    px(ctx, ax - 6, ay - 14, 12, 14, "#3b1470");
    px(ctx, ax - 4, ay - 16, 8, 4, "#3b1470");
    px(ctx, ax - 6, ay - 15, 12, 2, "rgba(255,255,255,0.10)");
  }
  // grand entrance
  px(ctx, 1192, 400, 36, 34, "#2a0e52");
  px(ctx, 1198, 394, 24, 8, "#2a0e52");
  px(ctx, 1190, 398, 2, 36, "#e7c45c"); px(ctx, 1228, 398, 2, 36, "#e7c45c");
  px(ctx, 1196, 392, 28, 2, "#e7c45c");
  px(ctx, 1186, 434, 48, 8, "#b09a72");
  // banners on the rim
  for (const [bx2, by2] of [[1090, 206], [1210, 172], [1330, 206]] as [number, number][]) {
    px(ctx, bx2, by2 - 18, 2, 18, "#3a2d20");
    px(ctx, bx2 + 2, by2 - 17, 10, 4, "#e7c45c"); px(ctx, bx2 + 2, by2 - 13, 7, 3, "#e7c45c");
    px(ctx, bx2 + 2, by2 - 9, 10, 4, "#c3b5f7");
  }
  ell(ctx, 1210, 452, 30, 6, "rgba(255,225,150,0.12)");
}

function drawLab(ctx: CanvasRenderingContext2D) {
  // body
  px(ctx, 210, 842, 280, 158, "#d99a37");
  px(ctx, 210, 842, 280, 4, "#f0b959");
  px(ctx, 210, 986, 280, 14, "#a86f1f");
  for (let yy = 860; yy < 982; yy += 13) px(ctx, 216, yy, 268, 1, "rgba(0,0,0,0.08)");
  // dome (left)
  ctx.fillStyle = "#f5b84a";
  ctx.beginPath(); ctx.arc(282, 844, 68, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#c98a2e";
  ctx.beginPath(); ctx.arc(282, 844, 68, Math.PI * 1.62, Math.PI * 1.95); ctx.lineTo(282, 844); ctx.fill();
  px(ctx, 214, 836, 140, 10, "#a86f1f");
  // dome slit + telescope
  px(ctx, 274, 782, 16, 60, "#274b6d");
  px(ctx, 277, 786, 10, 52, "#3ad4e8");
  px(ctx, 300, 766, 10, 8, "#7a7f8c"); px(ctx, 308, 758, 10, 8, "#7a7f8c"); px(ctx, 316, 750, 12, 9, "#8f95a3");
  px(ctx, 326, 752, 3, 5, "#bfe9ff");
  // antenna + dish (right roof)
  px(ctx, 370, 830, 120, 12, "#8a5c17");
  px(ctx, 438, 772, 4, 58, "#9aa3ad");
  px(ctx, 430, 786, 20, 3, "#9aa3ad"); px(ctx, 434, 776, 12, 3, "#9aa3ad");
  px(ctx, 437, 766, 6, 6, "#ff5d5d");
  ell(ctx, 402, 812, 12, 8, "#cfd6dd"); px(ctx, 400, 812, 4, 10, "#8f95a3");
  // windows
  for (const [wx, wy] of [[380, 872], [430, 872], [380, 922], [430, 922]] as [number, number][]) {
    px(ctx, wx - 2, wy - 2, 30, 26, "#78350f");
    px(ctx, wx, wy, 26, 22, "#aef3ff");
    px(ctx, wx, wy, 26, 8, "rgba(255,255,255,0.35)");
    px(ctx, wx + 12, wy, 2, 22, "#78350f");
  }
  // pipes + crystal power cell
  px(ctx, 480, 860, 6, 120, "#8f95a3"); px(ctx, 474, 900, 6, 4, "#8f95a3");
  drawCrystals(ctx, 470, 1012);
  px(ctx, 464, 996, 20, 3, "#556"); // cable
  // south door
  px(ctx, 336, 952, 40, 12, "#78350f");
  px(ctx, 340, 958, 32, 44, "#78350f");
  px(ctx, 344, 962, 24, 40, "#3a2408");
  px(ctx, 352, 962, 8, 34, "#5eead4"); // glowing tech door panel
  px(ctx, 346, 980, 3, 4, "#eec95c");
  px(ctx, 330, 1000, 52, 8, "#b09a72");
  ell(ctx, 364, 1016, 26, 5, "rgba(140,240,240,0.14)");
}

function drawLibrary(ctx: CanvasRenderingContext2D) {
  // body
  px(ctx, 1090, 842, 300, 160, "#1aa695");
  px(ctx, 1090, 842, 300, 4, "#3ec7b4");
  px(ctx, 1090, 988, 300, 14, "#0e7a6e");
  for (let yy = 860; yy < 984; yy += 13) px(ctx, 1096, yy, 288, 1, "rgba(0,0,0,0.08)");
  // gabled roof
  px(ctx, 1082, 806, 316, 40, "#0e7a6e");
  px(ctx, 1082, 806, 316, 5, "#2aa393");
  px(ctx, 1082, 840, 316, 6, "#0a5a51");
  for (let i = 0; i < 20; i++) px(ctx, 1092 + i * 16, 812 + (i % 2) * 4, 6, 3, "#5da06e"); // mossy shingles
  // turret (right)
  px(ctx, 1352, 790, 34, 212, "#159c8e");
  px(ctx, 1344, 762, 50, 30, "#0e7a6e");
  px(ctx, 1352, 754, 34, 10, "#0a5a51");
  px(ctx, 1360, 800, 18, 24, "#0b5a52"); px(ctx, 1363, 803, 12, 18, "#ffd9a0");
  // rose window
  disc(ctx, 1160, 900, 25, "#0b5a52");
  disc(ctx, 1160, 900, 20, "#ffd9a0");
  px(ctx, 1159, 880, 2, 40, "#0b5a52"); px(ctx, 1140, 899, 40, 2, "#0b5a52");
  px(ctx, 1147, 887, 26, 2, "#0b5a52"); px(ctx, 1147, 911, 26, 2, "#0b5a52");
  disc(ctx, 1160, 900, 4, "#f5a623");
  // arched windows
  for (const wx of [1220, 1290]) {
    px(ctx, wx + 3, 884, 14, 5, "#0b5a52");
    px(ctx, wx, 889, 20, 40, "#0b5a52");
    px(ctx, wx + 5, 887, 10, 4, "#ffd9a0"); px(ctx, wx + 2, 891, 16, 36, "#ffd9a0");
    px(ctx, wx + 9, 889, 2, 40, "#0b5a52");
  }
  // ivy
  for (let i = 0; i < 16; i++) {
    px(ctx, 1094 + Math.floor(rnd(i, 8) * 40), 846 + Math.floor(rnd(8, i) * 70), 3, 3, "#3f9d5c");
  }
  // floating books
  px(ctx, 1310, 788, 9, 5, "#e8e2d2"); px(ctx, 1310, 788, 2, 5, "#c0392b");
  px(ctx, 1326, 778, 8, 5, "#e8e2d2"); px(ctx, 1326, 778, 2, 5, "#3d7ad9");
  px(ctx, 1298, 774, 8, 4, "#e8e2d2"); px(ctx, 1298, 774, 2, 4, "#33a860");
  // hanging book sign
  px(ctx, 1196, 930, 2, 10, "#4a3a2a");
  px(ctx, 1188, 940, 18, 12, "#7a4a2f"); px(ctx, 1190, 942, 14, 8, "#e8e2d2"); px(ctx, 1196, 942, 2, 8, "#c0392b");
  // south door
  px(ctx, 1216, 950, 48, 12, "#0b5a52");
  px(ctx, 1222, 944, 36, 8, "#0b5a52");
  px(ctx, 1220, 958, 40, 44, "#0b5a52");
  px(ctx, 1224, 962, 32, 40, "#6e4f30");
  px(ctx, 1239, 962, 2, 40, "#4a3320");
  px(ctx, 1230, 980, 3, 5, "#eec95c"); px(ctx, 1246, 980, 3, 5, "#eec95c");
  px(ctx, 1210, 1002, 60, 8, "#b09a72");
  ell(ctx, 1240, 1018, 28, 5, "rgba(255,217,160,0.15)");
}

// ── Public: static world ──────────────────────────────────────────────────────
export function drawWorldTo(ctx: CanvasRenderingContext2D) {
  drawGround(ctx);
  drawTulipMeadow(ctx);
  for (const [x, y] of FLOWER_PATCHES) drawFlowerPatch(ctx, x, y);
  drawPlaza(ctx);
  drawWater(ctx);
  drawPaths(ctx);
  drawBridge(ctx);
  for (const [x, y] of ROCKS) drawRock(ctx, x, y);
  // mushroom ring
  for (let i = 0; i < MUSHROOM_RING.n; i++) {
    const a = (i / MUSHROOM_RING.n) * Math.PI * 2;
    drawMushroom(ctx, MUSHROOM_RING.x + Math.cos(a) * MUSHROOM_RING.r, MUSHROOM_RING.y + Math.sin(a) * MUSHROOM_RING.r * 0.7, false, i % 2 === 0);
  }
  for (const [x, y] of MUSHROOM_CLUSTERS) {
    drawMushroom(ctx, x, y, true, true);
    drawMushroom(ctx, x - 12, y + 6, false, false);
    drawMushroom(ctx, x + 11, y + 5, false, true);
  }
  for (const [x, y] of CRYSTALS) drawCrystals(ctx, x, y);
  for (const [x, y] of LANTERNS) drawLantern(ctx, x, y);
  drawGreatTrunk(ctx);
  for (const [x, y] of BLOSSOMS) drawBlossomTrunk(ctx, x, y);
  for (const [x, y] of WILLOWS) drawWillowTrunk(ctx, x, y);
  drawConventionCenter(ctx);
  drawColiseum(ctx);
  drawLab(ctx);
  drawLibrary(ctx);
}

// Tree crowns — drawn OVER characters so you can walk behind trees.
export function drawCanopies(ctx: CanvasRenderingContext2D) {
  drawGreatCanopy(ctx);
  for (const [x, y] of BLOSSOMS) drawBlossomCanopy(ctx, x, y);
  for (const [x, y] of WILLOWS) drawWillowCanopy(ctx, x, y);
}

// ── Ambient animation ─────────────────────────────────────────────────────────
interface Glow { x: number; y: number; r: number; c: "warm" | "cool" | "pink"; ph: number }
const GLOWS: Glow[] = [
  { x: 800, y: 470, r: 100, c: "pink", ph: 0 },
  { x: MUSHROOM_RING.x, y: MUSHROOM_RING.y, r: 44, c: "cool", ph: 1 },
  ...MUSHROOM_CLUSTERS.map(([x, y], i) => ({ x, y, r: 28, c: "cool" as const, ph: i * 1.3 })),
  ...CRYSTALS.map(([x, y], i) => ({ x, y: y - 6, r: 34, c: "cool" as const, ph: 2 + i })),
  ...LANTERNS.map(([x, y], i) => ({ x, y: y - 16, r: 20, c: "warm" as const, ph: i * 0.7 })),
  { x: 440, y: 768, r: 14, c: "warm", ph: 5 },
];

const FIREFLIES: [number, number][] = [];
for (let i = 0; i < 36; i++) FIREFLIES.push([90 + ((i * 971) % 1420), 90 + ((i * 577) % 1020)]);

let glowSprites: Record<string, HTMLCanvasElement> | null = null;
let vignette: HTMLCanvasElement | null = null;

function ensureSprites() {
  if (glowSprites) return;
  const make = (rgb: string) => {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},0.85)`);
    gr.addColorStop(0.5, `rgba(${rgb},0.28)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };
  glowSprites = {
    warm: make("255,222,140"),
    cool: make("120,240,230"),
    pink: make("250,170,220"),
  };
  vignette = document.createElement("canvas");
  vignette.width = 320; vignette.height = 200;
  const v = vignette.getContext("2d")!;
  const vg = v.createRadialGradient(160, 100, 60, 160, 100, 210);
  vg.addColorStop(0, "rgba(24,16,48,0)");
  vg.addColorStop(1, "rgba(24,16,48,0.36)");
  v.fillStyle = vg; v.fillRect(0, 0, 320, 200);
}

export function drawAmbient(
  ctx: CanvasRenderingContext2D,
  camX: number, camY: number, t: number,
  cssW: number, cssH: number, scale: number,
) {
  ensureSprites();
  const spr = glowSprites!;
  const toX = (wx: number) => (wx - camX) * scale;
  const toY = (wy: number) => (wy - camY) * scale;
  const visW = cssW / scale, visH = cssH / scale;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // pulsing scenery glows
  for (const g of GLOWS) {
    if (g.x + g.r < camX || g.x - g.r > camX + visW || g.y + g.r < camY || g.y - g.r > camY + visH) continue;
    ctx.globalAlpha = 0.13 + 0.07 * Math.sin(t * 0.0016 + g.ph);
    const d = g.r * 2 * scale;
    ctx.drawImage(spr[g.c], toX(g.x) - d / 2, toY(g.y) - d / 2, d, d);
  }

  // fireflies
  for (let i = 0; i < FIREFLIES.length; i++) {
    const [bx, by] = FIREFLIES[i];
    const fx = bx + Math.sin(t * 0.00037 * (1 + (i % 3)) + i * 1.7) * 18;
    const fy = by + Math.cos(t * 0.00031 + i * 2.3) * 13;
    if (fx < camX - 20 || fx > camX + visW + 20 || fy < camY - 20 || fy > camY + visH + 20) continue;
    const a = 0.3 + 0.3 * Math.sin(t * 0.002 + i * 1.1);
    if (a <= 0.05) continue;
    ctx.globalAlpha = a;
    const d = 11 * scale;
    ctx.drawImage(spr.warm, toX(fx) - d / 2, toY(fy) - d / 2, d, d);
    ctx.globalAlpha = Math.min(1, a + 0.3);
    ctx.fillStyle = "#fff8cf";
    ctx.fillRect(toX(fx) - scale * 0.75, toY(fy) - scale * 0.75, scale * 1.5, scale * 1.5);
  }

  ctx.globalCompositeOperation = "source-over";

  // drifting water sparkles on the lake
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 10; i++) {
    const wx = LAKE.x - 150 + i * 33 + Math.sin(t * 0.0009 + i * 1.9) * 20;
    const wy = LAKE.y - 40 + ((i * 53) % 70);
    const dx2 = (wx - LAKE.x) / LAKE.rx, dy2 = (wy - LAKE.y) / LAKE.ry;
    if (dx2 * dx2 + dy2 * dy2 > 0.82) continue;
    if (wx < camX || wx > camX + visW || wy < camY || wy > camY + visH) continue;
    ctx.fillRect(toX(wx), toY(wy), 7 * scale, scale);
  }

  // vignette
  ctx.globalAlpha = 1;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(vignette!, 0, 0, cssW, cssH);
  ctx.imageSmoothingEnabled = prev;
  ctx.restore();
  ctx.globalAlpha = 1;
}
