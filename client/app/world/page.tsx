"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import {
  drawCharacter, defaultAppearance, normalizeAppearance,
  SKIN, HAIR_COLOR, SHIRT, PANTS, HAIR_STYLE_COUNT, HATS,
  type Appearance, type Dir,
} from "@/lib/avatar";
import { BUILDINGS, WORLD_W, WORLD_H, SPAWN, isBlocked, drawWorldTo, drawCanopies, drawAmbient } from "@/lib/worldMap";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
const SCALE = 4;             // screen px per world px
const CELL = SCALE / 2;      // screen px per sprite cell (32x48 grid on a 16x24 world footprint)
const SPEED = 120;           // world px / second
const MOVE_EMIT_MS = 90;
const DOOR_DIST = 38;
const WATCH_DIST = 42;
const MM_W = 176, MM_H = 132;

interface Other { x: number; y: number; tx: number; ty: number; dir: Dir; anim: number; app: Appearance; username: string }
type Prompt =
  | { kind: "enter"; label: string; sub: string; route: string }
  | { kind: "watch"; label: string; sub: string; room: string }
  | null;

// ── Character customizer ──────────────────────────────────────────────────────
function Customizer({ app, onChange, onClose, onSave }: {
  app: Appearance; onChange: (a: Appearance) => void; onClose: () => void; onSave: () => void;
}) {
  const pv = useRef<HTMLCanvasElement>(null);
  const [dir, setDir] = useState<Dir>("down");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = pv.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    let raf = 0; const t0 = performance.now();
    const loop = (t: number) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      const frame = Math.floor((t - t0) / 150) % 4;
      drawCharacter(ctx, 4, 4, 4, app, dir, frame);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [app, dir]);

  const cycle = (key: keyof Appearance, n: number, d: number) =>
    onChange({ ...app, [key]: ((app[key] + d) % n + n) % n });

  const Row = ({ label, k, n, swatches }: { label: string; k: keyof Appearance; n: number; swatches?: string[] }) => (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-gray-400">{label}</span>
      <button onClick={() => cycle(k, n, -1)} className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700">‹</button>
      <div className="flex-1 text-center text-xs text-gray-200">
        {swatches
          ? <span className="inline-block h-4 w-4 rounded-full ring-1 ring-white/30 align-middle" style={{ background: swatches[app[k]] }} />
          : (k === "hat" ? HATS[app[k]] : `${app[k] + 1}`)}
      </div>
      <button onClick={() => cycle(k, n, 1)} className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700">›</button>
    </div>
  );

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 ring-1 ring-gray-700 p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Customize your character</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl bg-emerald-950 p-2 ring-1 ring-emerald-800/50">
              <canvas ref={pv} width={144} height={204} style={{ imageRendering: "pixelated" }} />
            </div>
            <div className="flex gap-1">
              {(["down", "left", "right", "up"] as Dir[]).map(d => (
                <button key={d} onClick={() => setDir(d)}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${dir === d ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400"}`}>
                  {d[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-2.5">
            <Row label="Skin" k="skin" n={SKIN.length} swatches={SKIN} />
            <Row label="Hair" k="hair" n={HAIR_STYLE_COUNT} />
            <Row label="Hair color" k="hairColor" n={HAIR_COLOR.length} swatches={HAIR_COLOR} />
            <Row label="Shirt" k="shirt" n={SHIRT.length} swatches={SHIRT} />
            <Row label="Pants" k="pants" n={PANTS.length} swatches={PANTS} />
            <Row label="Hat" k="hat" n={HATS.length} />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-700 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-800">Cancel</button>
          <button onClick={async () => { setSaving(true); await onSave(); setSaving(false); }}
            className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40" disabled={saving}>
            {saving ? "Saving…" : "Save look"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── World page ────────────────────────────────────────────────────────────────
export default function WorldPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";

  const [prompt, setPrompt] = useState<Prompt>(null);
  const [count, setCount] = useState(1);
  const [hint, setHint] = useState(true);
  const [customize, setCustomize] = useState(false);
  const [appearance, setAppearance] = useState<Appearance | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const fgRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const meRef = useRef({ x: SPAWN.x, y: SPAWN.y, dir: "down" as Dir, anim: 0, moving: false });
  const appRef = useRef<Appearance | null>(null);
  const othersRef = useRef<Map<string, Other>>(new Map());
  const keysRef = useRef<Set<string>>(new Set());
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const camRef = useRef({ x: 0, y: 0 });
  const promptRef = useRef<Prompt>(null);
  const liveRef = useRef<Map<string, string>>(new Map());

  // Bake the static world + canopy overlay + minimap once
  useEffect(() => {
    const bg = document.createElement("canvas");
    bg.width = WORLD_W; bg.height = WORLD_H;
    const bctx = bg.getContext("2d");
    if (bctx) drawWorldTo(bctx);
    bgRef.current = bg;

    const fg = document.createElement("canvas");
    fg.width = WORLD_W; fg.height = WORLD_H;
    const fctx = fg.getContext("2d");
    if (fctx) drawCanopies(fctx);
    fgRef.current = fg;

    const mini = document.createElement("canvas");
    mini.width = MM_W; mini.height = MM_H;
    const mctx = mini.getContext("2d");
    if (mctx) {
      mctx.imageSmoothingEnabled = true;
      mctx.drawImage(bg, 0, 0, MM_W, MM_H);
      mctx.drawImage(fg, 0, 0, MM_W, MM_H);
    }
    miniRef.current = mini;
  }, []);

  // Load my saved appearance (or a default from my name)
  useEffect(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/users/${userId}/profile`).then(r => r.json()).then(d => {
      const a = normalizeAppearance(d.worldAppearance, username || userId);
      setAppearance(a); appRef.current = a;
    }).catch(() => { const a = defaultAppearance(username || userId); setAppearance(a); appRef.current = a; });
  }, [userId, username]);

  // Poll live matches → who is watchable
  useEffect(() => {
    if (!userId) return;
    const load = () => fetch(`${SERVER}/api/live-matches`).then(r => r.json()).then((d: any[]) => {
      const map = new Map<string, string>();
      if (Array.isArray(d)) for (const m of d) for (const id of m.participantIds ?? []) map.set(id, m.roomName);
      liveRef.current = map;
    }).catch(() => {});
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [userId]);

  // Socket — join the world, track others (all via refs; canvas reads them)
  useEffect(() => {
    if (status !== "authenticated" || !userId || !appearance) return;
    const socket = getSocket({ id: userId, username });

    const addOther = (p: any) => {
      if (p.userId === userId) return;
      const app = normalizeAppearance(p.appearance, p.username || p.userId);
      othersRef.current.set(p.userId, { x: p.x, y: p.y, tx: p.x, ty: p.y, dir: (p.dir ?? "down") as Dir, anim: 0, app, username: p.username });
      setCount(othersRef.current.size + 1);
    };

    socket.on("world:roster", (list: any[]) => {
      othersRef.current = new Map();
      for (const p of list) if (p.userId !== userId) addOther(p);
      setCount(othersRef.current.size + 1);
    });
    socket.on("world:playerJoined", addOther);
    socket.on("world:playerMoved", ({ userId: uid, x, y, dir }: any) => {
      const o = othersRef.current.get(uid); if (o) { o.tx = x; o.ty = y; if (dir) o.dir = dir; }
    });
    socket.on("world:playerAppearance", ({ userId: uid, appearance: ap }: any) => {
      const o = othersRef.current.get(uid); if (o) o.app = normalizeAppearance(ap, o.username);
    });
    socket.on("world:playerLeft", ({ userId: uid }: any) => {
      if (othersRef.current.delete(uid)) setCount(othersRef.current.size + 1);
    });

    socket.emit("world:join", { x: meRef.current.x, y: meRef.current.y, dir: meRef.current.dir, appearance });

    return () => {
      socket.emit("world:leave");
      socket.off("world:roster"); socket.off("world:playerJoined"); socket.off("world:playerMoved");
      socket.off("world:playerAppearance"); socket.off("world:playerLeft");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId, username, !!appearance]);

  const act = useCallback((p: Prompt) => {
    if (!p) return;
    if (p.kind === "enter") router.push(p.route);
    else router.push(`/room/${p.room}?spectate=1`);
  }, [router]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { keysRef.current.add(k); targetRef.current = null; setHint(false); }
      if ((k === "e" || k === "enter") && promptRef.current) act(promptRef.current);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [act]);

  const onCanvasClick = useCallback((e: React.MouseEvent) => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const wx = camRef.current.x + (e.clientX - rect.left) / SCALE;
    const wy = camRef.current.y + (e.clientY - rect.top) / SCALE;
    targetRef.current = { x: Math.max(8, Math.min(WORLD_W - 8, wx)), y: Math.max(8, Math.min(WORLD_H - 8, wy)) };
    keysRef.current.clear(); setHint(false);
  }, []);

  // Resize
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const resize = () => {
      const box = c.parentElement; if (!box) return;
      const cssW = box.clientWidth, cssH = box.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
      c.style.width = cssW + "px"; c.style.height = cssH + "px";
      const ctx = c.getContext("2d");
      if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false; }
      sizeRef.current = { w: cssW, h: cssH };
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Main loop
  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    const socket = getSocket({ id: userId, username });
    let raf = 0, last = performance.now(), lastEmit = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const c = canvasRef.current, bg = bgRef.current, fg = fgRef.current, ctx = c?.getContext("2d");
      const me = meRef.current;

      // ── Move me ──
      let vx = 0, vy = 0; const K = keysRef.current;
      if (K.has("w") || K.has("arrowup")) vy -= 1;
      if (K.has("s") || K.has("arrowdown")) vy += 1;
      if (K.has("a") || K.has("arrowleft")) vx -= 1;
      if (K.has("d") || K.has("arrowright")) vx += 1;
      if (vx || vy) { const l = Math.hypot(vx, vy); vx /= l; vy /= l; }
      else if (targetRef.current) {
        const tx = targetRef.current.x - me.x, ty = targetRef.current.y - me.y, d = Math.hypot(tx, ty);
        if (d < 2) targetRef.current = null; else { vx = tx / d; vy = ty / d; }
      }
      me.moving = !!(vx || vy);
      if (me.moving) {
        if (Math.abs(vx) > Math.abs(vy)) me.dir = vx < 0 ? "left" : "right";
        else me.dir = vy < 0 ? "up" : "down";
        const nx = me.x + vx * SPEED * dt, ny = me.y + vy * SPEED * dt;
        if (!isBlocked(nx, me.y)) me.x = nx;
        if (!isBlocked(me.x, ny)) me.y = ny;
        me.anim += dt;
      } else me.anim = 0;

      // ── Camera ──
      const { w: cssW, h: cssH } = sizeRef.current;
      const visW = cssW / SCALE, visH = cssH / SCALE;
      const camX = Math.max(0, Math.min(WORLD_W - visW, me.x - visW / 2));
      const camY = Math.max(0, Math.min(WORLD_H - visH, me.y - visH / 2));
      camRef.current = { x: camX, y: camY };

      // ── Render ──
      if (ctx && c && bg && fg) {
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bg, camX, camY, visW, visH, 0, 0, cssW, cssH);

        // characters — advance & lerp others, painter-sort by y
        const drawList: { y: number; fn: () => void }[] = [];
        for (const [uid, o] of othersRef.current) {
          const dx = o.tx - o.x, dy = o.ty - o.y, dist = Math.hypot(dx, dy);
          const moving = dist > 0.6;
          if (moving) { const k = Math.min(1, dt * 12); o.x += dx * k; o.y += dy * k; o.anim += dt; } else o.anim = 0;
          const sx = (o.x - camX) * SCALE, sy = (o.y - camY) * SCALE;
          if (sx < -90 || sx > cssW + 90 || sy < -120 || sy > cssH + 120) continue;
          const frame = moving ? Math.floor(o.anim * 8) % 4 : 0;
          const live = liveRef.current.has(uid);
          drawList.push({ y: o.y, fn: () => paintChar(ctx, sx, sy, o.app, o.dir, frame, o.username, live) });
        }
        {
          const sx = (me.x - camX) * SCALE, sy = (me.y - camY) * SCALE;
          const frame = me.moving ? Math.floor(me.anim * 8) % 4 : 0;
          const app = appRef.current;
          if (app) drawList.push({ y: me.y, fn: () => paintChar(ctx, sx, sy, app, me.dir, frame, "You", false, true) });
        }
        drawList.sort((a, b) => a.y - b.y);
        for (const d of drawList) d.fn();

        // canopy overlay — walk behind trees
        ctx.drawImage(fg, camX, camY, visW, visH, 0, 0, cssW, cssH);

        // fireflies, glows, water sparkle, vignette
        drawAmbient(ctx, camX, camY, now, cssW, cssH, SCALE);

        // building name plates
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "bold 12px ui-sans-serif, system-ui";
        for (const b of BUILDINGS) {
          const lx = (b.label.x - camX) * SCALE, ly = (b.label.y - camY) * SCALE;
          if (lx < -160 || lx > cssW + 160 || ly < -40 || ly > cssH + 40) continue;
          const tw = ctx.measureText(b.name).width;
          ctx.fillStyle = "rgba(12,10,26,0.72)";
          ctx.fillRect(lx - tw / 2 - 8, ly - 10, tw + 16, 20);
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.fillText(b.name, lx, ly);
        }

        // minimap
        const mini = miniRef.current;
        if (mini) {
          const mx = cssW - MM_W - 12, my = cssH - MM_H - 12;
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = "rgba(10,8,22,0.72)";
          ctx.fillRect(mx - 3, my - 3, MM_W + 6, MM_H + 6);
          ctx.drawImage(mini, mx, my);
          ctx.strokeStyle = "rgba(255,255,255,0.45)";
          ctx.lineWidth = 1;
          ctx.strokeRect(mx + (camX / WORLD_W) * MM_W, my + (camY / WORLD_H) * MM_H, (visW / WORLD_W) * MM_W, (visH / WORLD_H) * MM_H);
          for (const [uid, o] of othersRef.current) {
            ctx.fillStyle = liveRef.current.has(uid) ? "#ef4444" : "#f4f4f5";
            ctx.fillRect(mx + (o.x / WORLD_W) * MM_W - 1, my + (o.y / WORLD_H) * MM_H - 1, 2, 2);
          }
          ctx.fillStyle = "#a5b4fc";
          ctx.fillRect(mx + (me.x / WORLD_W) * MM_W - 1.5, my + (me.y / WORLD_H) * MM_H - 1.5, 3, 3);
          ctx.globalAlpha = 1;
        }
      }

      // ── Emit my position (throttled) ──
      if (now - lastEmit > MOVE_EMIT_MS && me.moving) {
        socket.emit("world:move", { x: Math.round(me.x), y: Math.round(me.y), dir: me.dir }); lastEmit = now;
      }

      // ── Prompt ──
      let next: Prompt = null, best = Infinity;
      for (const b of BUILDINGS) {
        const d = Math.hypot(b.door.x - me.x, b.door.y - me.y);
        if (d < DOOR_DIST && d < best) { best = d; next = { kind: "enter", label: b.name, sub: b.sub, route: b.route }; }
      }
      for (const [uid, o] of othersRef.current) {
        const room = liveRef.current.get(uid); if (!room) continue;
        const d = Math.hypot(o.x - me.x, o.y - me.y);
        if (d < WATCH_DIST && d < best) { best = d; next = { kind: "watch", label: o.username, sub: "Watch live debate", room }; }
      }
      const a = promptRef.current;
      const changed = (!a && next) || (a && !next) || (a && next && (a.kind !== next.kind || a.label !== next.label || (a as any).route !== (next as any).route || (a as any).room !== (next as any).room));
      if (changed) { promptRef.current = next; setPrompt(next); }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId, username]);

  async function saveAppearance() {
    const a = appRef.current; if (!a || !userId) { setCustomize(false); return; }
    getSocket({ id: userId, username }).emit("world:appearance", { appearance: a });
    await fetch(`${SERVER}/api/users/${userId}/profile`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ worldAppearance: a }),
    }).catch(() => {});
    setCustomize(false);
  }

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-emerald-950 text-emerald-200/70 text-sm">Entering the grove…</div>;
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0d2b1e] select-none">
      <canvas ref={canvasRef} onClick={onCanvasClick} className="absolute inset-0 h-full w-full cursor-pointer" style={{ imageRendering: "pixelated" }} />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 p-4 pt-safe">
        <button onClick={() => router.push("/home")} className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-black/45 px-3 py-2 text-xs font-semibold text-gray-200 backdrop-blur hover:bg-black/60">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
          Home
        </button>
        <div className="rounded-xl bg-black/45 px-3 py-2 text-xs text-gray-300 backdrop-blur"><span className="font-semibold text-emerald-400">{count}</span> in the grove</div>
        <button onClick={() => setCustomize(true)} className="pointer-events-auto ml-auto flex items-center gap-1.5 rounded-xl bg-indigo-600/90 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-indigo-500">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M8 1a3.5 3.5 0 0 0-3.5 3.5c0 .9.34 1.72.9 2.35C3.4 7.9 2 9.9 2 12.5V14h12v-1.5c0-2.6-1.4-4.6-3.4-5.65.56-.63.9-1.45.9-2.35A3.5 3.5 0 0 0 8 1Z" /></svg>
          Customize
        </button>
      </div>

      {hint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-4">
          <div className="rounded-xl bg-black/50 px-4 py-2 text-center text-xs text-gray-300 backdrop-blur">
            <span className="hidden sm:inline">Move with <b className="text-white">WASD</b> / arrows — or click to walk. </span>
            <span className="sm:hidden">Tap to walk. </span>
            Walk to a building to enter, or to a <span className="text-red-400">●live</span> debater to watch.
          </div>
        </div>
      )}

      {prompt && (
        <div className="absolute inset-x-0 bottom-8 flex justify-center px-4">
          <button onClick={() => act(prompt)}
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-5 py-3 text-left shadow-xl backdrop-blur transition-transform hover:scale-[1.02] ${prompt.kind === "watch" ? "bg-red-600/90 hover:bg-red-500" : "bg-indigo-600/90 hover:bg-indigo-500"}`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white">
              {prompt.kind === "watch"
                ? <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4"><path d="M4.5 3.5v9l7-4.5-7-4.5Z" /></svg>
                : <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4"><path d="M8 1.5 2 5v9h4v-5h4v5h4V5L8 1.5Z" /></svg>}
            </span>
            <span>
              <span className="block text-sm font-bold text-white">{prompt.kind === "watch" ? `Watch ${prompt.label}` : `Enter ${prompt.label}`}</span>
              <span className="block text-[11px] text-white/70">{prompt.sub} · <b>E</b> or tap</span>
            </span>
          </button>
        </div>
      )}

      {customize && appearance && (
        <Customizer app={appearance} onChange={(a) => { setAppearance(a); appRef.current = a; }} onClose={() => setCustomize(false)} onSave={saveAppearance} />
      )}
    </div>
  );
}

// Draw a character sprite + floating name/badge in screen space.
// (screenX, screenY) = the character's feet position on screen.
function paintChar(
  ctx: CanvasRenderingContext2D, screenX: number, screenY: number,
  app: Appearance, dir: Dir, frame: number, name: string, live: boolean, isMe = false,
) {
  const sx = screenX - 16 * CELL, sy = screenY - 46 * CELL;
  drawCharacter(ctx, sx, sy, CELL, app, dir, frame);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.font = "bold 11px ui-sans-serif, system-ui";
  const ly = sy - 6;
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.strokeText(name, screenX, ly);
  ctx.fillStyle = isMe ? "#a5b4fc" : "#f3f4f6"; ctx.fillText(name, screenX, ly);
  if (live) {
    ctx.beginPath(); ctx.fillStyle = "#ef4444";
    ctx.arc(screenX - ctx.measureText(name).width / 2 - 6, ly - 4, 3, 0, Math.PI * 2); ctx.fill();
  }
}
