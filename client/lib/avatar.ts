// Composable pixel-art avatar engine (hi-res).
//
// A character is a stack of layered parts drawn on a 32x48 grid:
// shadow → legs → torso → arms → head → face → hair → hat.
// Each layer is chosen by an index into a palette/style list, so cosmetics
// (new hair, hats, outfits, accessories) are added by extending these lists
// and the per-layer draw code — the Appearance shape stays stable.
//
// Sprites are painted once per (appearance, direction, frame) into a small
// offscreen canvas at 1px cells, auto-outlined, cached, then scale-blitted.

export interface Appearance {
  skin: number;
  hair: number;       // hair STYLE index
  hairColor: number;
  shirt: number;
  pants: number;
  hat: number;        // cosmetic slot: 0 = none
}

export const SKIN = ["#f8d9b5", "#f0c090", "#d99a63", "#b06b3a", "#7a4a24", "#4a2f1a"];
export const HAIR_COLOR = ["#161616", "#3b2417", "#6b4423", "#a9741f", "#d7b45a", "#c0392b", "#e9e9e9", "#4a63d0", "#7b3fb0", "#2aa06b"];
export const SHIRT = ["#d94f3d", "#3d7ad9", "#33a860", "#e0a53d", "#8b5cf6", "#e6e6e6", "#2b2b2b", "#d93d8b", "#26bfae", "#f0a030"];
export const PANTS = ["#3a3f4b", "#5b4636", "#274b6d", "#1f6b3a", "#5a1f4a", "#151515", "#8a8f98"];
export const HAIR_STYLE_COUNT = 6;        // 0 short 1 spiky 2 long 3 buzz 4 ponytail 5 bald
// Cosmetic slot — new hats are APPENDED so saved indices stay valid.
export const HATS = ["None", "Cap", "Beanie", "Wizard", "Crown", "Headband", "Flower Crown", "Halo"];
export const HAT_COLOR = ["#d94f3d", "#3d7ad9", "#2b2b2b", "#8b3ddb", "#e0b93d", "#33a860"];

export const GRID_W = 32;
export const GRID_H = 48;
export const FEET_Y = 46;

export type Dir = "down" | "up" | "left" | "right";

const OUTLINE = "#221a2e";

export function defaultAppearance(seed: string): Appearance {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const pick = (n: number, salt: number) => Math.floor(h / Math.pow(7, salt)) % n;
  return {
    skin: pick(SKIN.length, 1),
    hair: pick(HAIR_STYLE_COUNT, 2),
    hairColor: pick(HAIR_COLOR.length, 3),
    shirt: pick(SHIRT.length, 4),
    pants: pick(PANTS.length, 5),
    hat: 0,
  };
}

export function normalizeAppearance(a: Partial<Appearance> | null | undefined, seed: string): Appearance {
  const def = defaultAppearance(seed);
  if (!a || typeof a !== "object") return def;
  const clamp = (v: any, n: number, d: number) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
  return {
    skin: clamp(a.skin, SKIN.length, def.skin),
    hair: clamp(a.hair, HAIR_STYLE_COUNT, def.hair),
    hairColor: clamp(a.hairColor, HAIR_COLOR.length, def.hairColor),
    shirt: clamp(a.shirt, SHIRT.length, def.shirt),
    pants: clamp(a.pants, PANTS.length, def.pants),
    hat: clamp(a.hat, HATS.length, 0),
  };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

interface Pal {
  skin: string; skinSh: string; skinHi: string;
  hair: string; hairSh: string; hairHi: string;
  shirt: string; shirtSh: string; shirtHi: string;
  pants: string; pantsSh: string;
  shoe: string; shoeSh: string;
  mouth: string;
}

function palette(a: Appearance): Pal {
  const skin = SKIN[a.skin] ?? SKIN[0];
  const hair = HAIR_COLOR[a.hairColor] ?? HAIR_COLOR[0];
  const shirt = SHIRT[a.shirt] ?? SHIRT[0];
  const pants = PANTS[a.pants] ?? PANTS[0];
  return {
    skin, skinSh: shade(skin, 0.84), skinHi: shade(skin, 1.12),
    hair, hairSh: shade(hair, 0.72), hairHi: shade(hair, 1.3),
    shirt, shirtSh: shade(shirt, 0.76), shirtHi: shade(shirt, 1.22),
    pants, pantsSh: shade(pants, 0.72),
    shoe: "#4a3729", shoeSh: "#33261c",
    mouth: shade(skin, 0.6),
  };
}

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

// ── Hair ──────────────────────────────────────────────────────────────────────
function paintHair(P: Px, C: Pal, style: number, dir: "down" | "right" | "up") {
  const c = C.hair, sh = C.hairSh, hi = C.hairHi;
  if (style === 5) { // bald — scalp shine
    if (dir !== "up") P(12, 5, 4, 1, C.skinHi);
    return;
  }
  if (style === 0) { // short
    if (dir === "down") {
      P(9, 2, 14, 4, c); P(9, 6, 14, 1, c);
      P(9, 7, 3, 1, c); P(14, 7, 2, 1, c); P(19, 7, 4, 1, c);
      P(8, 6, 1, 5, c); P(23, 6, 1, 5, c);
      P(11, 3, 5, 1, hi); P(9, 5, 14, 1, sh);
    } else if (dir === "right") {
      P(8, 2, 15, 4, c); P(8, 6, 4, 8, c); P(9, 14, 2, 3, sh);
      P(19, 6, 4, 2, c); P(12, 3, 6, 1, hi);
    } else {
      P(9, 2, 14, 5, c); P(9, 7, 14, 10, c);
      P(10, 17, 3, 1, c); P(15, 17, 2, 1, c); P(19, 17, 3, 1, c);
      P(12, 8, 1, 8, sh); P(18, 8, 1, 8, sh); P(11, 3, 6, 1, hi);
    }
  } else if (style === 1) { // spiky
    P(9, 3, 14, 3, c);
    P(10, 1, 3, 2, c); P(14, 0, 3, 3, c); P(18, 1, 3, 2, c); P(21, 2, 2, 1, c);
    P(15, 1, 1, 2, hi);
    if (dir === "down") {
      P(9, 6, 3, 1, c); P(15, 6, 2, 1, c); P(20, 6, 3, 1, c);
      P(8, 6, 1, 3, c); P(23, 6, 1, 3, c);
    } else if (dir === "right") {
      P(8, 5, 4, 6, c); P(7, 7, 2, 3, sh); P(19, 6, 4, 1, c);
    } else {
      P(9, 6, 14, 9, c); P(11, 15, 4, 1, c); P(17, 15, 4, 1, c); P(13, 7, 1, 7, sh);
    }
  } else if (style === 2) { // long
    if (dir === "down") {
      P(9, 2, 14, 4, c); P(9, 6, 14, 1, c);
      P(7, 6, 2, 15, c); P(23, 6, 2, 15, c);
      P(7, 20, 3, 4, sh); P(22, 20, 3, 4, sh);
      P(7, 8, 1, 5, hi); P(24, 8, 1, 5, hi); P(11, 3, 6, 1, hi);
    } else if (dir === "right") {
      P(8, 2, 14, 4, c); P(6, 5, 5, 21, c); P(6, 20, 4, 5, sh);
      P(19, 6, 4, 1, c); P(7, 7, 1, 8, hi); P(11, 3, 5, 1, hi);
    } else {
      P(8, 2, 16, 5, c); P(8, 6, 16, 21, c); P(8, 24, 16, 3, sh);
      P(11, 8, 1, 14, hi); P(20, 8, 1, 14, sh);
    }
  } else if (style === 3) { // buzz
    if (dir === "down") {
      P(9, 3, 14, 3, c); P(8, 7, 1, 4, sh); P(23, 7, 1, 4, sh); P(11, 4, 5, 1, hi);
    } else if (dir === "right") {
      P(8, 3, 15, 3, c); P(8, 6, 3, 8, sh);
    } else {
      P(9, 3, 14, 4, c); P(9, 7, 14, 7, c); P(12, 8, 1, 5, sh);
    }
  } else if (style === 4) { // ponytail
    if (dir === "down") {
      P(9, 2, 14, 4, c); P(9, 6, 14, 1, c);
      P(8, 6, 1, 4, c); P(23, 6, 1, 4, c);
      P(23, 1, 3, 2, c); P(24, 3, 1, 1, "#eec95c");
      P(24, 4, 3, 4, c); P(25, 8, 2, 5, c); P(25, 12, 2, 2, sh);
      P(11, 3, 5, 1, hi);
    } else if (dir === "right") {
      P(8, 2, 14, 4, c); P(19, 6, 4, 1, c);
      P(6, 5, 2, 2, "#eec95c");
      P(4, 6, 3, 4, c); P(3, 10, 3, 6, c); P(4, 16, 2, 4, sh);
      P(11, 3, 5, 1, hi);
    } else {
      P(9, 2, 14, 5, c); P(9, 7, 14, 4, c);
      P(14, 6, 4, 2, "#eec95c");
      P(13, 8, 6, 5, c); P(14, 13, 4, 6, c); P(15, 19, 3, 4, sh);
    }
  }
}

// ── Hats (cosmetic slot) ──────────────────────────────────────────────────────
function paintHat(P: Px, hat: number, dir: "down" | "right" | "up") {
  const name = HATS[hat];
  if (name === "Cap") {
    const c = "#d94f3d", dk = shade(c, 0.72), hi = shade(c, 1.2);
    P(9, 1, 14, 4, c); P(9, 1, 14, 1, hi); P(15, 0, 2, 1, dk);
    P(12, 2, 1, 2, dk); P(19, 2, 1, 2, dk);
    if (dir === "down") P(8, 5, 16, 2, dk);
    else if (dir === "right") { P(9, 5, 12, 1, dk); P(20, 4, 7, 2, dk); }
    else P(9, 5, 14, 1, dk);
  } else if (name === "Beanie") {
    const c = "#3d7ad9", dk = shade(c, 0.72);
    P(9, 1, 14, 5, c); P(9, 4, 14, 2, dk); P(13, 0, 6, 1, shade(c, 1.35));
  } else if (name === "Wizard") {
    const c = "#5b3fd6", dk = shade(c, 0.7), hi = shade(c, 1.3);
    P(6, 5, 20, 2, c); P(6, 6, 20, 1, dk);
    P(16, 0, 3, 1, hi); P(14, 1, 4, 1, c); P(13, 2, 5, 1, c); P(12, 3, 7, 1, c); P(11, 4, 9, 1, dk);
    P(13, 3, 1, 1, "#ffe17a"); P(17, 1, 1, 1, "#ffe17a");
  } else if (name === "Crown") {
    P(10, 1, 12, 3, "#eec95c");
    P(10, 0, 2, 1, "#eec95c"); P(15, 0, 2, 1, "#eec95c"); P(20, 0, 2, 1, "#eec95c");
    P(12, 2, 2, 1, "#e0475c"); P(17, 2, 2, 1, "#3d7ad9");
    P(10, 3, 12, 1, "#c9a53e");
  } else if (name === "Headband") {
    const c = "#33a860";
    P(9, 5, 14, 2, c);
    if (dir === "right") { P(6, 6, 3, 1, c); P(5, 7, 2, 2, shade(c, 0.75)); }
    else if (dir === "down") P(23, 5, 2, 2, shade(c, 0.75));
  } else if (name === "Flower Crown") {
    P(9, 4, 14, 2, "#4e8f46");
    P(10, 3, 2, 2, "#ff9ecb"); P(15, 2, 2, 2, "#fff3b0"); P(20, 3, 2, 2, "#c39bff");
    P(10, 3, 1, 1, "#ffffff"); P(15, 2, 1, 1, "#f5a623"); P(20, 3, 1, 1, "#ffffff");
  } else if (name === "Halo") {
    P(11, 0, 10, 1, "#ffe17a"); P(10, 0, 1, 1, "#fff7cc"); P(21, 0, 1, 1, "#fff7cc");
  }
}

// ── Poses ─────────────────────────────────────────────────────────────────────
function paintDown(P: Px, C: Pal, app: Appearance, f: number, back: boolean) {
  const bob = f === 1 || f === 3 ? 1 : 0;           // upper body bob (px down on passing frames = -1 up visually)
  const by = -bob;                                   // shift upper body up on frames 1,3
  const legL = f === 1 ? 1 : 0;                      // leg lifts
  const legR = f === 3 ? 1 : 0;
  const armL = f === 1 ? 1 : f === 3 ? -1 : 0;       // arm swing (y offset)
  const armR = -armL;

  // hips + legs
  P(10, 33, 12, 1, C.pantsSh);
  P(11, 34, 4, 8 - legL, C.pants); P(14, 34, 1, 8 - legL, C.pantsSh);
  P(17, 34, 4, 8 - legR, C.pants); P(17, 34, 1, 8 - legR, C.pantsSh);
  P(11, 37, 4, 1, C.pantsSh); P(17, 37, 4, 1, C.pantsSh);
  P(10, 42 - legL, 5, 3, C.shoe); P(10, 45 - legL, 5, 1, C.shoeSh);
  P(17, 42 - legR, 5, 3, C.shoe); P(17, 45 - legR, 5, 1, C.shoeSh);

  // torso
  P(11, 21 + by, 10, 1, C.shirtHi);
  P(10, 22 + by, 12, 9, C.shirt);
  P(10, 22 + by, 1, 9, C.shirtSh); P(21, 22 + by, 1, 9, C.shirtSh);
  P(13, 21 + by, 6, 1, C.shirtSh);
  if (!back) P(12, 23 + by, 3, 2, C.shirtHi);
  P(10, 30 + by, 12, 1, C.shirtSh);
  P(10, 31 + by, 12, 2, "#4a3b5c"); P(15, 31 + by, 2, 2, "#eec95c");

  // arms
  P(7, 22 + armL + by, 3, 4, C.shirt); P(7, 25 + armL + by, 3, 1, C.shirtSh);
  P(7, 26 + armL + by, 3, 4, C.skin); P(7, 30 + armL + by, 3, 2, C.skinSh);
  P(22, 22 + armR + by, 3, 4, C.shirt); P(22, 25 + armR + by, 3, 1, C.shirtSh);
  P(22, 26 + armR + by, 3, 4, C.skin); P(22, 30 + armR + by, 3, 2, C.skinSh);

  // head
  P(10, 4 + by, 12, 1, C.skin);
  P(9, 5 + by, 14, 13, C.skin);
  P(10, 18 + by, 12, 1, C.skinSh);
  P(8, 11 + by, 1, 3, C.skin); P(23, 11 + by, 1, 3, C.skin);
  P(9, 15 + by, 1, 3, C.skinSh); P(22, 15 + by, 1, 3, C.skinSh);
  P(14, 19 + by, 4, 2, C.skinSh);

  if (!back) {
    // face
    P(12, 9 + by, 3, 1, C.hairSh); P(17, 9 + by, 3, 1, C.hairSh);
    P(12, 11 + by, 3, 3, "#ffffff"); P(17, 11 + by, 3, 3, "#ffffff");
    P(13, 12 + by, 2, 2, "#2a2333"); P(18, 12 + by, 2, 2, "#2a2333");
    P(13, 12 + by, 1, 1, "#cfe8ff"); P(18, 12 + by, 1, 1, "#cfe8ff");
    P(15, 16 + by, 2, 1, C.mouth);
    P(10, 14 + by, 2, 1, "rgba(240,110,130,0.30)"); P(20, 14 + by, 2, 1, "rgba(240,110,130,0.30)");
  }
}

function paintSide(P: Px, C: Pal, app: Appearance, f: number) {
  const bob = f === 1 || f === 3 ? -1 : 0;
  const stride = [0, 2, 0, -2][f];
  const liftA = f === 1 ? 1 : 0;
  const liftB = f === 3 ? 1 : 0;
  const armDx = [0, 2, 0, -2][f];

  // far arm (behind torso)
  P(9, 23 + bob - Math.sign(armDx), 2, 6, C.shirtSh);
  P(9, 29 + bob - Math.sign(armDx), 2, 2, C.skinSh);

  // legs (back leg darker)
  P(11, 33, 10, 1, C.pantsSh);
  P(12 - stride, 34, 4, 8 - liftB, C.pantsSh);
  P(11 - stride, 42 - liftB, 5, 3, C.shoeSh); P(11 - stride, 45 - liftB, 5, 1, C.shoeSh);
  P(15 + stride, 34, 4, 8 - liftA, C.pants); P(15 + stride, 37, 4, 1, C.pantsSh);
  P(15 + stride, 42 - liftA, 6, 3, C.shoe); P(15 + stride, 45 - liftA, 6, 1, C.shoeSh);

  // torso
  P(12, 21 + bob, 8, 1, C.shirtHi);
  P(11, 22 + bob, 10, 9, C.shirt);
  P(11, 22 + bob, 1, 9, C.shirtSh);
  P(11, 30 + bob, 10, 1, C.shirtSh);
  P(11, 31 + bob, 10, 2, "#4a3b5c"); P(18, 31 + bob, 2, 2, "#eec95c");

  // head
  P(10, 4 + bob, 12, 1, C.skin);
  P(9, 5 + bob, 14, 13, C.skin);
  P(10, 18 + bob, 12, 1, C.skinSh);
  P(23, 13 + bob, 1, 2, C.skin);                 // nose
  P(23, 15 + bob, 1, 1, C.skinSh);
  P(13, 12 + bob, 2, 3, C.skinSh); P(14, 13 + bob, 1, 1, shade(C.skin, 0.7)); // ear
  P(14, 19 + bob, 4, 2, C.skinSh);

  // face (single eye toward front)
  P(18, 9 + bob, 3, 1, C.hairSh);
  P(18, 11 + bob, 3, 3, "#ffffff");
  P(19, 12 + bob, 2, 2, "#2a2333"); P(19, 12 + bob, 1, 1, "#cfe8ff");
  P(21, 16 + bob, 1, 1, C.mouth);
  P(19, 14 + bob, 2, 1, "rgba(240,110,130,0.28)");

  // near arm over torso
  P(14 + armDx, 22 + bob, 3, 5, C.shirt); P(14 + armDx, 26 + bob, 3, 1, C.shirtSh);
  P(14 + armDx, 27 + bob, 3, 4, C.skin); P(14 + armDx, 31 + bob, 3, 2, C.skinSh);
}

// ── Sprite building + cache ───────────────────────────────────────────────────
const spriteCache = new Map<string, HTMLCanvasElement>();

function buildSprite(app: Appearance, dir: "down" | "right" | "up", frame: number): HTMLCanvasElement {
  const body = document.createElement("canvas");
  body.width = GRID_W + 2; body.height = GRID_H + 2;
  const b = body.getContext("2d")!;
  const P: Px = (x, y, w, h, c) => { b.fillStyle = c; b.fillRect(x + 1, y + 1, w, h); };
  const C = palette(app);

  if (dir === "right") paintSide(P, C, app, frame);
  else paintDown(P, C, app, frame, dir === "up");
  paintHair(P, C, app.hair, dir);
  if (app.hat > 0) paintHat(P, app.hat, dir);

  // Auto-outline: stamp silhouette in 8 directions, tint, then draw body on top
  const out = document.createElement("canvas");
  out.width = body.width; out.height = body.height;
  const o = out.getContext("2d")!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    o.drawImage(body, dx, dy);
  }
  o.globalCompositeOperation = "source-in";
  o.fillStyle = OUTLINE;
  o.fillRect(0, 0, out.width, out.height);
  o.globalCompositeOperation = "source-over";
  o.drawImage(body, 0, 0);
  return out;
}

function getSprite(app: Appearance, dir: "down" | "right" | "up", frame: number): HTMLCanvasElement {
  const key = `${app.skin}.${app.hair}.${app.hairColor}.${app.shirt}.${app.pants}.${app.hat}.${dir}.${frame}`;
  let s = spriteCache.get(key);
  if (!s) {
    if (spriteCache.size > 480) spriteCache.clear();
    s = buildSprite(app, dir, frame);
    spriteCache.set(key, s);
  }
  return s;
}

// Draw a character. (sx,sy) is the top-left of the 32x48 grid in screen px;
// s is screen pixels per sprite cell. dir = facing; frame = walk frame (mod 4).
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, s: number,
  app: Appearance, dir: Dir, frame: number,
) {
  const f = ((frame % 4) + 4) % 4;

  // Shadow
  ctx.fillStyle = "rgba(18,14,36,0.30)";
  ctx.beginPath();
  ctx.ellipse(sx + 16 * s, sy + FEET_Y * s, 9 * s, 2.4 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  const spriteDir = dir === "left" ? "right" : dir;
  const spr = getSprite(app, spriteDir as "down" | "right" | "up", f);
  const w = (GRID_W + 2) * s, h = (GRID_H + 2) * s;
  const dx = sx - s, dy = sy - s;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (dir === "left") {
    ctx.save();
    ctx.translate(dx + w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(spr, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(spr, dx, dy, w, h);
  }
  ctx.imageSmoothingEnabled = prev;
}
