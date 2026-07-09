// Composable flat-vector avatar engine.
//
// A character is a head-and-shoulders "bust" drawn as clean SVG shapes inside a
// soft circular backdrop: backdrop → shoulders/shirt → neck → hair(back) →
// ears → head → face → hair(front) → hat. Each layer is chosen by an index into
// a palette/style list, so cosmetics (new hair, hats, accessories) are added by
// extending these lists and the per-layer shape code — the Appearance shape
// stays stable, so saved configs keep working across restyles.
//
// avatarSVG(app, uid) returns the inner markup for a `viewBox="0 0 100 100"`
// SVG; AvatarSprite wraps it. `uid` namespaces the gradient/clip ids so many
// avatars can render on one page without id collisions.

export interface Appearance {
  skin: number;
  hair: number;       // hair STYLE index
  hairColor: number;
  shirt: number;
  pants: number;      // retained for data compatibility; not shown on the bust
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

// ── Color helpers ───────────────────────────────────────────────────────────
function hx(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function shade(hex: string, f: number): string {
  const [r, g, b] = hx(hex);
  return toHex(r * f, g * f, b * f);
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hx(a), [r2, g2, b2] = hx(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// ── Shape primitives ────────────────────────────────────────────────────────
const P = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = "") =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;

// Shared fringe used by several hair styles (bangs sweeping across the forehead).
const FRINGE = "M31,35 C32,25 42,22 50,22 C58,22 68,25 69,35 C65,28 57,26 50,27 C43,26 35,28 31,35 Z";

// ── Hair ────────────────────────────────────────────────────────────────────
function hairShapes(style: number, hair: string, hairHi: string, hairSh: string): { back: string; front: string } {
  if (style === 5) return { back: "", front: "" };                 // bald
  if (style === 3) {                                                // buzz — thin rim hugging the scalp
    return {
      back: E(50, 40.3, 18.6, 19.8, hair) + P("M36,27 Q50,21 64,27 Q52,24 36,27", hairHi, 'opacity="0.5"'),
      front: "",
    };
  }

  // Helmet behind the head; the head ellipse is drawn on top and trims it to a
  // clean hairline rim around the crown and temples.
  const back: string[] = [E(50, 39, 19.6, 20.6, hair), P("M37,26 Q50,20 63,26 Q52,23 37,26", hairHi, 'opacity="0.5"')];
  const front: string[] = [];

  if (style === 0) {                                                // short
    front.push(P(FRINGE, hair), P("M34,30 Q42,26 50,27 Q46,29 40,32 Z", hairHi, 'opacity="0.4"'));
  } else if (style === 1) {                                         // spiky
    front.push(
      P("M30,28 L33,14 L39,25 L45,12 L50,24 L55,12 L61,25 L67,14 L70,28 C58,24 42,24 30,28 Z", hair),
      P("M45,12 L50,24 L48,17 Z", hairHi, 'opacity="0.5"'),
    );
  } else if (style === 2) {                                         // long
    back.push(
      P("M31,38 C27,51 28,64 32,73 L40,73 C37,60 36,49 38,40 Z", hairSh),
      P("M69,38 C73,51 72,64 68,73 L60,73 C63,60 64,49 62,40 Z", hair),
    );
    front.push(P(FRINGE, hair));
  } else if (style === 4) {                                         // ponytail
    back.push(
      P("M62,24 C74,26 82,40 79,55 C77,63 71,66 68,62 C74,52 73,39 64,31 Z", hairSh),
      E(63, 28, 3, 2.4, hairHi),
    );
    front.push(P(FRINGE, hair));
  }
  return { back: back.join(""), front: front.join("") };
}

// ── Hats (cosmetic slot) ──────────────────────────────────────────────────────
function hatShapes(hat: number): string {
  const name = HATS[hat];
  if (name === "Cap") {
    const c = "#d94f3d", dk = shade(c, 0.8);
    return (
      P("M31,30 C31,18 40,13.5 50,13.5 C60,13.5 69,18 69,30 C60,25 40,25 31,30 Z", c) +
      P("M29,30 C40,26.5 60,26.5 71,30 C74,31.5 73,35 68,35 C58,32 42,32 32,35 C27,35 26,31.5 29,30 Z", dk) +
      E(50, 14.6, 1.5, 1.5, dk)
    );
  }
  if (name === "Beanie") {
    const c = "#3d7ad9", dk = shade(c, 0.8), hi = shade(c, 1.25);
    return (
      P("M30,32 C30,18 40,13 50,13 C60,13 70,18 70,32 C58,28 42,28 30,32 Z", c) +
      P("M29,31 Q50,27 71,31 L71,35 Q50,31 29,35 Z", dk) +
      E(50, 12, 2.6, 2.6, hi)
    );
  }
  if (name === "Wizard") {
    const c = "#5b3fd6", dk = shade(c, 0.75);
    return (
      P("M50,2 L63,30 C58,27 42,27 37,30 Z", c) +
      P("M50,2 L50,28 C46,28 40,29 37,30 Z", dk) +
      E(50, 30, 24, 5, dk) +
      P("M52,10 L53.2,13 L56,14 L53.2,15 L52,18 L50.8,15 L48,14 L50.8,13 Z", "#ffe17a")
    );
  }
  if (name === "Crown") {
    const gold = "#eec95c", dk = "#c9a53e";
    return (
      P("M32,30 L34,20 L41,26 L50,17 L59,26 L66,20 L68,30 Z", gold) +
      P("M32,29 L68,29 L68,32 Q50,35 32,32 Z", dk) +
      E(50, 27, 1.7, 1.7, "#e0475c") + E(41, 26.5, 1.2, 1.2, "#3d7ad9") + E(59, 26.5, 1.2, 1.2, "#33a860")
    );
  }
  if (name === "Headband") {
    const c = "#33a860";
    return P("M30,30 Q50,26 70,30 L70,34 Q50,30 30,34 Z", c) + P("M32,30 Q50,27 68,30", "none", `stroke="${shade(c, 1.3)}" stroke-width="0.8" opacity="0.6"`);
  }
  if (name === "Flower Crown") {
    const flower = (cx: number, cy: number, petal: string, core: string) =>
      E(cx - 2.4, cy, 1.7, 1.7, petal) + E(cx + 2.4, cy, 1.7, 1.7, petal) +
      E(cx, cy - 2.2, 1.7, 1.7, petal) + E(cx, cy + 2.2, 1.7, 1.7, petal) + E(cx, cy, 1.7, 1.7, core);
    return (
      P("M30,31 Q50,27 70,31 L70,33 Q50,29 30,33 Z", "#4e8f46") +
      flower(37, 29, "#ff9ecb", "#fff3b0") + flower(50, 26.5, "#c39bff", "#fff3b0") + flower(63, 29, "#ffd27a", "#fff3b0")
    );
  }
  if (name === "Halo") {
    return E(50, 12, 14, 4.6, "none", 'stroke="#ffe17a" stroke-width="2.6" opacity="0.95"') +
      E(50, 12, 14, 4.6, "none", 'stroke="#fff6c8" stroke-width="0.9" opacity="0.9"');
  }
  return "";
}

// ── Assembly ──────────────────────────────────────────────────────────────────
export function avatarSVG(app: Appearance, uid: string): string {
  const skin = SKIN[app.skin] ?? SKIN[0];
  const hair = HAIR_COLOR[app.hairColor] ?? HAIR_COLOR[0];
  const shirt = SHIRT[app.shirt] ?? SHIRT[0];

  const skinHi = shade(skin, 1.08), skinSh = shade(skin, 0.82);
  const hairHi = shade(hair, 1.2), hairSh = shade(hair, 0.76);
  const shirtHi = shade(shirt, 1.14), shirtSh = shade(shirt, 0.78);
  const bgTop = mix(shirt, "#1c2437", 0.72), bgBot = mix(shirt, "#0b0f1a", 0.8);
  const inkMouth = mix(skin, "#000000", 0.5);

  const { back: hairBack, front: hairFront } = hairShapes(app.hair, hair, hairHi, hairSh);

  const defs =
    `<defs>` +
    `<clipPath id="${uid}-clip"><circle cx="50" cy="50" r="50"/></clipPath>` +
    `<linearGradient id="${uid}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bgTop}"/><stop offset="1" stop-color="${bgBot}"/></linearGradient>` +
    `<linearGradient id="${uid}-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skinHi}"/><stop offset="1" stop-color="${skinSh}"/></linearGradient>` +
    `<linearGradient id="${uid}-shirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shirtHi}"/><stop offset="1" stop-color="${shirtSh}"/></linearGradient>` +
    `</defs>`;

  const shoulders =
    P("M12,100 L12,90 C12,78 30,70 50,70 C70,70 88,78 88,90 L88,100 Z", `url(#${uid}-shirt)`) +
    E(50, 70.5, 10.5, 3.6, shirtSh) +                                   // neckline shadow
    P("M20,74 Q50,70 80,74", "none", `stroke="${shirtHi}" stroke-width="1.2" opacity="0.35"`);

  const neck =
    P("M43,50 L57,50 L57,68 Q50,73 43,68 Z", shade(skin, 0.86)) +
    E(50, 52, 8, 3, shade(skin, 0.72), 'opacity="0.45"');               // under-chin shadow

  const ears = E(32.6, 43, 2.6, 3.6, shade(skin, 0.9)) + E(67.4, 43, 2.6, 3.6, shade(skin, 0.9));
  const head = E(50, 41, 17.5, 19.5, `url(#${uid}-skin)`);

  const face =
    // eyes
    E(43, 43, 2, 2.6, "#2a2333") + E(57, 43, 2, 2.6, "#2a2333") +
    E(42.3, 42.2, 0.7, 0.7, "#ffffff") + E(56.3, 42.2, 0.7, 0.7, "#ffffff") +
    // brows
    P("M40.4,38.4 Q43,37.2 45.6,38.2", "none", `stroke="${hairSh}" stroke-width="1.3" stroke-linecap="round" fill="none"`) +
    P("M54.4,38.2 Q57,37.2 59.6,38.4", "none", `stroke="${hairSh}" stroke-width="1.3" stroke-linecap="round" fill="none"`) +
    // nose + mouth
    P("M50,44.5 Q51.4,47.4 49.4,48", "none", `stroke="${skinSh}" stroke-width="1.1" stroke-linecap="round" fill="none" opacity="0.7"`) +
    P("M45.5,51.4 Q50,54.6 54.5,51.4", "none", `stroke="${inkMouth}" stroke-width="1.6" stroke-linecap="round" fill="none"`) +
    // cheeks
    E(40, 48, 3, 1.8, "#ff8aa0", 'opacity="0.16"') + E(60, 48, 3, 1.8, "#ff8aa0", 'opacity="0.16"');

  const body =
    `<g clip-path="url(#${uid}-clip)">` +
    P("M0,0 H100 V100 H0 Z", `url(#${uid}-bg)`) +
    shoulders + neck + hairBack + ears + head + face + hairFront + hatShapes(app.hat) +
    `</g>` +
    // crisp rim to seat the bust in the UI
    `<circle cx="50" cy="50" r="49.3" fill="none" stroke="#000000" stroke-opacity="0.18" stroke-width="1.4"/>`;

  return defs + body;
}
