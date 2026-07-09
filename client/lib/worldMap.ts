// Static pixel-art world: geometry, collision, and a renderer that bakes the
// tiled ground + building structures into an offscreen canvas once.

export const TILE = 16;
export const WORLD_W = 896;
export const WORLD_H = 640;
export const SPAWN = { x: 448, y: 336 };

export type Theme = "indigo" | "violet" | "amber" | "teal";

export interface Building {
  id: string;
  name: string;
  sub: string;
  route: string;
  theme: Theme;
  x: number; y: number; w: number; h: number;
  front: "top" | "bottom";
  door: { x: number; y: number };   // interaction point, on the front, in the plaza
}

export const BUILDINGS: Building[] = [
  { id: "debates", name: "Convention Center", sub: "Debates", route: "/lobby",   theme: "indigo", x: 80,  y: 96,  w: 190, h: 132, front: "bottom", door: { x: 175, y: 246 } },
  { id: "compete", name: "The Coliseum",       sub: "Compete", route: "/compete", theme: "violet", x: 626, y: 96,  w: 190, h: 142, front: "bottom", door: { x: 721, y: 256 } },
  { id: "arena",   name: "Computer Lab",       sub: "Arena",   route: "/arena",   theme: "amber",  x: 80,  y: 402, w: 190, h: 132, front: "top",    door: { x: 175, y: 388 } },
  { id: "learn",   name: "The Library",        sub: "Learn",   route: "/learn",   theme: "teal",   x: 626, y: 402, w: 190, h: 132, front: "top",    door: { x: 721, y: 388 } },
];

const THEME: Record<Theme, { roof: string; roofDk: string; wall: string; wallLt: string; dark: string; door: string; glass: string }> = {
  indigo: { roof: "#4f46e5", roofDk: "#3730a3", wall: "#6366f1", wallLt: "#818cf8", dark: "#312e81", door: "#1e1b4b", glass: "#c7d2fe" },
  violet: { roof: "#7c3aed", roofDk: "#5b21b6", wall: "#8b5cf6", wallLt: "#a78bfa", dark: "#4c1d95", door: "#2e1065", glass: "#ddd6fe" },
  amber:  { roof: "#d97706", roofDk: "#92400e", wall: "#f59e0b", wallLt: "#fbbf24", dark: "#78350f", door: "#451a03", glass: "#fde68a" },
  teal:   { roof: "#0d9488", roofDk: "#115e59", wall: "#14b8a6", wallLt: "#2dd4bf", dark: "#134e4a", door: "#042f2e", glass: "#99f6e4" },
};

const AVR = 7; // collision radius (logical px) for the character feet

export function hitsBuilding(x: number, y: number): boolean {
  if (x < AVR || y < AVR || x > WORLD_W - AVR || y > WORLD_H - AVR) return true;
  for (const b of BUILDINGS) {
    // Only the lower ~2/3 (the walls) is solid, so the roof overhang isn't blocking
    const top = b.y + 26;
    if (x > b.x - AVR && x < b.x + b.w + AVR && y > top - AVR && y < b.y + b.h + AVR) return true;
  }
  return false;
}

// cheap deterministic hash → [0,1)
function rnd(x: number, y: number, seed = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
}

function drawBuilding(ctx: CanvasRenderingContext2D, b: Building) {
  const t = THEME[b.theme];
  const roofH = 30;
  const wallY = b.y + roofH;
  const wallH = b.h - roofH;

  // Wall
  px(ctx, b.x, wallY, b.w, wallH, t.wall);
  px(ctx, b.x, wallY, b.w, 3, t.wallLt);            // top highlight
  px(ctx, b.x, b.y + b.h - 4, b.w, 4, t.dark);      // base shadow
  // brick lines
  for (let yy = wallY + 10; yy < b.y + b.h - 6; yy += 12) px(ctx, b.x + 4, yy, b.w - 8, 1, "rgba(0,0,0,0.10)");

  // Roof overhang
  px(ctx, b.x - 8, b.y, b.w + 16, roofH, t.roof);
  px(ctx, b.x - 8, b.y + roofH - 5, b.w + 16, 5, t.roofDk);
  px(ctx, b.x - 8, b.y, b.w + 16, 3, "rgba(255,255,255,0.18)");
  // banner strip on the roof (name drawn as a DOM label in the page)
  px(ctx, b.x + b.w / 2 - 34, b.y + 8, 68, 14, t.dark);
  px(ctx, b.x + b.w / 2 - 34, b.y + 8, 68, 2, "rgba(255,255,255,0.15)");

  // Windows
  const winW = 26, winH = 22;
  const wy = wallY + 16;
  for (const wx of [b.x + 24, b.x + b.w - 24 - winW]) {
    px(ctx, wx - 2, wy - 2, winW + 4, winH + 4, t.dark);
    px(ctx, wx, wy, winW, winH, t.glass);
    px(ctx, wx, wy, winW, winH / 2, "rgba(255,255,255,0.35)");
    px(ctx, wx + winW / 2 - 1, wy, 2, winH, t.dark);
    px(ctx, wx, wy + winH / 2 - 1, winW, 2, t.dark);
  }

  // Door on the front (toward the plaza)
  const dw = 34, dh = 40;
  const dx = b.x + b.w / 2 - dw / 2;
  const dy = b.front === "bottom" ? b.y + b.h - dh : wallY + 4;
  px(ctx, dx - 3, dy - 3, dw + 6, dh + 3, t.dark);
  px(ctx, dx, dy, dw, dh, t.door);
  px(ctx, dx + 3, dy + 3, dw - 6, dh - 6, "rgba(255,255,255,0.06)");
  px(ctx, dx + dw - 10, dy + dh / 2, 3, 3, "#e7b93a"); // handle
  // welcome mat / step in front
  const my = b.front === "bottom" ? b.y + b.h : b.y + roofH + 4 - 6;
  px(ctx, dx - 4, b.front === "bottom" ? my : dy + dh, dw + 8, 6, "#6b4f32");
}

// Render the entire static world once into `ctx` (sized WORLD_W × WORLD_H).
export function drawWorldTo(ctx: CanvasRenderingContext2D) {
  // Grass base with per-tile variation
  for (let ty = 0; ty < WORLD_H / TILE; ty++) {
    for (let tx = 0; tx < WORLD_W / TILE; tx++) {
      const r = rnd(tx, ty);
      const g = r < 0.5 ? "#3a7d44" : r < 0.85 ? "#357a41" : "#40864b";
      px(ctx, tx * TILE, ty * TILE, TILE, TILE, g);
      // scattered detail
      const d = rnd(tx, ty, 3);
      if (d > 0.93) { px(ctx, tx * TILE + 5, ty * TILE + 6, 2, 2, "#2f6b3a"); px(ctx, tx * TILE + 8, ty * TILE + 9, 2, 2, "#2f6b3a"); }
      else if (d > 0.87) px(ctx, tx * TILE + 6, ty * TILE + 7, 3, 1, "#e8d04a"); // tiny flower
    }
  }

  // Plaza (stone) + paths to each door
  const cx = SPAWN.x, cy = SPAWN.y;
  const stone = "#9aa3ad", stoneDk = "#7c848d";
  ctx.fillStyle = stone;
  ctx.beginPath(); ctx.ellipse(cx, cy, 96, 70, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = stoneDk;
  ctx.beginPath(); ctx.ellipse(cx, cy, 96, 70, 0, 0, Math.PI * 2); ctx.stroke();
  for (const b of BUILDINGS) {
    // straight-ish dirt path from plaza toward the door
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = cx + (b.door.x - cx) * t;
      const y = cy + (b.door.y - cy) * t;
      px(ctx, Math.round(x - 9), Math.round(y - 9), 18, 18, "#b08a55");
      px(ctx, Math.round(x - 9), Math.round(y - 9), 18, 3, "#c49a63");
    }
  }
  // Plaza fountain
  px(ctx, cx - 12, cy - 12, 24, 24, "#7c848d");
  px(ctx, cx - 9, cy - 9, 18, 18, "#5aa9d6");
  px(ctx, cx - 9, cy - 9, 18, 6, "#7cc4e8");

  // A little pond for flavor
  ctx.fillStyle = "#2f80b8";
  ctx.beginPath(); ctx.ellipse(cx, cy + 210, 60, 34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3f9bd6";
  ctx.beginPath(); ctx.ellipse(cx - 10, cy + 202, 30, 14, 0, 0, Math.PI * 2); ctx.fill();

  // Buildings (draw top-row first so bottom-row overlaps correctly if needed)
  for (const b of BUILDINGS) drawBuilding(ctx, b);
}
