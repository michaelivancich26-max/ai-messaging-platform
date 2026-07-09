// Composable pixel-art avatar engine.
//
// A character is a stack of layered parts drawn on a canvas at a logical
// 16x24 grid: shadow → legs → torso → arms → head → face → hair → hat.
// Each layer is chosen by an index into a palette/style list, so cosmetics
// (new hair, hats, outfits, accessories) are added by extending these lists
// and the per-layer draw code — the Appearance shape stays stable.

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
export const SHIRT = ["#d94f3d", "#3d7ad9", "#33a860", "#e0a53d", "#8b3ddb", "#e6e6e6", "#2b2b2b", "#d93d8b", "#26bfae", "#f0a030"];
export const PANTS = ["#3a3f4b", "#5b4636", "#274b6d", "#1f6b3a", "#5a1f4a", "#151515", "#8a8f98"];
export const HAIR_STYLE_COUNT = 6;        // 0 short 1 spiky 2 long 3 buzz 4 ponytail 5 bald
export const HATS = ["None", "Cap", "Beanie", "Wizard", "Crown", "Headband"]; // cosmetic slot
export const HAT_COLOR = ["#d94f3d", "#3d7ad9", "#2b2b2b", "#8b3ddb", "#e0b93d", "#33a860"];

export type Dir = "down" | "up" | "left" | "right";

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

// darken a hex color by a factor for cheap shading
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

// Draw a character. (sx,sy) is the top-left screen pixel; s is pixels-per-cell.
// Grid is 16 wide × 24 tall. dir = facing; frame 0/1 for the walk cycle.
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, s: number,
  app: Appearance, dir: Dir, frame: number,
) {
  const skin = SKIN[app.skin] ?? SKIN[0];
  const skinSh = shade(skin, 0.82);
  const hairC = HAIR_COLOR[app.hairColor] ?? HAIR_COLOR[0];
  const hairSh = shade(hairC, 0.75);
  const shirt = SHIRT[app.shirt] ?? SHIRT[0];
  const shirtSh = shade(shirt, 0.8);
  const pants = PANTS[app.pants] ?? PANTS[0];
  const pantsSh = shade(pants, 0.78);
  const shoe = "#2a2320";

  const facingLeft = dir === "left";
  // R draws at grid coords; RX mirrors horizontally for the left-facing side view
  const R = (gx: number, gy: number, gw: number, gh: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(sx + gx * s), Math.round(sy + gy * s), Math.ceil(gw * s), Math.ceil(gh * s));
  };
  const RX = (gx: number, gy: number, gw: number, gh: number, c: string) =>
    R(facingLeft ? 16 - gx - gw : gx, gy, gw, gh, c);

  // ── Shadow ──
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(sx + 8 * s, sy + 23 * s, 5.5 * s, 1.8 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Legs (animated) ──
  const step = frame % 2;
  const lLift = step === 0 ? 1 : 0;
  const rLift = step === 1 ? 1 : 0;
  // left leg
  R(5, 17, 2, 5 - lLift, pants);
  R(5, 22 - lLift, 2, 1, shoe);
  // right leg
  R(9, 17, 2, 5 - rLift, pants);
  R(9, 22 - rLift, 2, 1, shoe);
  R(5, 17, 1, 4, pantsSh); // subtle inner shade
  R(9, 17, 1, 4, pantsSh);

  // ── Torso ──
  R(4, 11, 8, 6, shirt);
  R(4, 11, 8, 1, shirtSh);     // shoulder shade
  R(4, 11, 1, 6, shirtSh);

  // ── Arms ──
  const armSwing = step === 0 ? 0 : 1;
  if (dir === "left" || dir === "right") {
    // front arm swings; back arm hidden behind torso
    RX(11, 11 + armSwing, 2, 5, skin);
    RX(11, 15 + armSwing, 2, 1, skinSh);
  } else {
    R(3, 11 + armSwing, 1, 5, skin);
    R(12, 11 - armSwing, 1, 5, skin);
  }

  // ── Head ──
  R(4, 4, 8, 8, skin);
  R(4, 11, 8, 1, skinSh);      // neck shade
  if (dir === "left" || dir === "right") {
    RX(11, 6, 1, 3, skinSh);   // cheek shade toward back
    RX(4, 7, 1, 1, skin);      // ear hint
  }

  // ── Face ──
  const eye = "#26201c";
  if (dir === "down") {
    R(6, 8, 1, 2, eye); R(9, 8, 1, 2, eye);
    R(7, 10, 2, 1, shade(skin, 0.7)); // mouth
  } else if (dir === "left" || dir === "right") {
    RX(9, 8, 1, 2, eye);        // single visible eye toward front
    RX(11, 10, 1, 1, shade(skin, 0.7));
  } // up = back of head, no face

  // ── Hair ──
  drawHair(app.hair, dir, hairC, hairSh, R, RX);

  // ── Hat (cosmetic) ──
  if (app.hat > 0) drawHat(app.hat, dir, R, RX);
}

function drawHair(
  style: number, dir: Dir, c: string, sh: string,
  R: (x: number, y: number, w: number, h: number, col: string) => void,
  RX: (x: number, y: number, w: number, h: number, col: string) => void,
) {
  if (style === 5) return; // bald
  const back = dir === "up";
  // Base cap over the top of the head
  R(4, 3, 8, 3, c);
  R(4, 3, 8, 1, sh);
  if (style === 0) {          // short — fringe on the front
    if (!back) { R(4, 6, 8, 1, c); R(4, 5, 2, 1, c); R(10, 5, 2, 1, c); }
    else R(4, 6, 8, 2, c);
  } else if (style === 1) {   // spiky — tufts on top
    R(4, 2, 2, 1, c); R(7, 1, 2, 1, c); R(10, 2, 2, 1, c);
    if (back) R(4, 6, 8, 2, c);
  } else if (style === 2) {   // long — falls down the sides/back
    R(3, 4, 1, 9, c); R(12, 4, 1, 9, c);
    if (back) { R(4, 6, 8, 6, c); R(4, 11, 8, 1, sh); }
    else { R(4, 6, 2, 3, c); R(10, 6, 2, 3, c); }
  } else if (style === 3) {   // buzz — thin
    R(4, 3, 8, 2, c);
    if (back) R(4, 5, 8, 1, c);
  } else if (style === 4) {   // ponytail
    if (!back) { R(4, 6, 2, 2, c); R(10, 6, 2, 2, c); }
    R(7, 3, 2, 1, sh);
    R(11, 4, 2, 6, c);        // tail on the side
    R(11, 4, 1, 6, sh);
  }
}

function drawHat(
  hat: number, dir: Dir,
  R: (x: number, y: number, w: number, h: number, col: string) => void,
  RX: (x: number, y: number, w: number, h: number, col: string) => void,
) {
  const c = HAT_COLOR[(hat - 1) % HAT_COLOR.length];
  const dk = shade(c, 0.75);
  if (HATS[hat] === "Cap") {
    R(4, 2, 8, 2, c); R(4, 2, 8, 1, dk);
    if (dir === "down") R(4, 4, 6, 1, dk);        // brim front
    else if (dir === "left" || dir === "right") RX(2, 4, 3, 1, dk);
  } else if (HATS[hat] === "Beanie") {
    R(4, 1, 8, 3, c); R(4, 3, 8, 1, dk); R(7, 0, 2, 1, c);
  } else if (HATS[hat] === "Wizard") {
    R(7, -3, 2, 3, c); R(6, 0, 4, 1, c); R(5, 1, 6, 1, c); R(4, 2, 8, 1, dk);
    R(7, -3, 1, 6, "#f6d34a"); // star trim
  } else if (HATS[hat] === "Crown") {
    R(4, 1, 8, 2, "#e7b93a"); R(4, 0, 1, 1, "#e7b93a"); R(7, -1, 2, 2, "#e7b93a"); R(11, 0, 1, 1, "#e7b93a");
    R(6, 1, 1, 1, "#d94f3d"); R(9, 1, 1, 1, "#3d7ad9");
  } else if (HATS[hat] === "Headband") {
    R(4, 4, 8, 1, c); R(4, 4, 8, 1, c);
    if (dir === "down") { R(5, 4, 1, 1, dk); R(10, 4, 1, 1, dk); }
  }
}
