"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// ── World geometry ────────────────────────────────────────────────────────────
const WORLD_W = 2000;
const WORLD_H = 1400;
const AVATAR_R = 16;
const SPEED = 300;            // px per second
const MOVE_EMIT_MS = 90;      // throttle for broadcasting my position
const DOOR_DIST = 64;         // how close to a door to prompt "Enter"
const WATCH_DIST = 78;        // how close to a live player to prompt "Watch"
const SPAWN = { x: 1000, y: 700 };

type Theme = "indigo" | "violet" | "amber" | "teal";

interface Building {
  id: string;
  name: string;
  sub: string;
  route: string;
  theme: Theme;
  x: number; y: number; w: number; h: number;
  door: { x: number; y: number };  // point in front of the entrance
  icon: React.ReactNode;
}

const THEME: Record<Theme, { wall: string; roof: string; glow: string; door: string; text: string; ring: string; badge: string }> = {
  indigo: { wall: "from-indigo-900/80 to-indigo-950", roof: "bg-indigo-700", glow: "shadow-indigo-900/40", door: "bg-indigo-400", text: "text-indigo-300", ring: "ring-indigo-700/50", badge: "bg-indigo-600" },
  violet: { wall: "from-violet-900/80 to-violet-950", roof: "bg-violet-700", glow: "shadow-violet-900/40", door: "bg-violet-400", text: "text-violet-300", ring: "ring-violet-700/50", badge: "bg-violet-600" },
  amber:  { wall: "from-amber-900/70 to-amber-950",   roof: "bg-amber-600",  glow: "shadow-amber-900/40",  door: "bg-amber-400",  text: "text-amber-300",  ring: "ring-amber-700/50",  badge: "bg-amber-600" },
  teal:   { wall: "from-teal-900/70 to-teal-950",     roof: "bg-teal-600",   glow: "shadow-teal-900/40",   door: "bg-teal-400",   text: "text-teal-300",   ring: "ring-teal-700/50",   badge: "bg-teal-600" },
};

const BUILDINGS: Building[] = [
  {
    id: "debates", name: "Convention Center", sub: "Debates", route: "/lobby", theme: "indigo",
    x: 160, y: 180, w: 440, h: 300, door: { x: 380, y: 512 },
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />,
  },
  {
    id: "compete", name: "The Coliseum", sub: "Compete", route: "/compete", theme: "violet",
    x: 1400, y: 180, w: 440, h: 320, door: { x: 1620, y: 532 },
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />,
  },
  {
    id: "arena", name: "Computer Lab", sub: "Arena", route: "/arena", theme: "amber",
    x: 160, y: 920, w: 440, h: 300, door: { x: 380, y: 888 },
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />,
  },
  {
    id: "learn", name: "The Library", sub: "Learn", route: "/learn", theme: "teal",
    x: 1400, y: 920, w: 440, h: 300, door: { x: 1620, y: 888 },
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />,
  },
];

interface Player { userId: string; username: string; x: number; y: number; avatar: string | null }
type Prompt =
  | { kind: "enter"; label: string; sub: string; route: string }
  | { kind: "watch"; label: string; sub: string; room: string }
  | null;

function avatarColor(name: string): string {
  const colors = ["bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500", "bg-teal-500", "bg-cyan-500", "bg-sky-500", "bg-indigo-500", "bg-violet-500", "bg-fuchsia-500", "bg-pink-500"];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

// Expand a building rect by the avatar radius and test whether (px,py) collides.
function hitsBuilding(px: number, py: number): boolean {
  for (const b of BUILDINGS) {
    if (px > b.x - AVATAR_R && px < b.x + b.w + AVATAR_R && py > b.y - AVATAR_R && py < b.y + b.h + AVATAR_R) return true;
  }
  return false;
}

export default function WorldPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";

  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [hint, setHint] = useState(true);

  // Refs driven by the animation loop (avoid per-frame React re-renders)
  const meRef = useRef({ ...SPAWN });
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const camRef = useRef({ x: 0, y: 0 });
  const promptRef = useRef<Prompt>(null);
  const liveRef = useRef<Map<string, string>>(new Map());       // userId -> roomName (live matches)
  const playersRef = useRef<Map<string, Player>>(new Map());    // mirror for the loop
  const avatarUrlRef = useRef<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const meElRef = useRef<HTMLDivElement>(null);

  // Fetch my avatar (best-effort) to show it to others
  useEffect(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/users/${userId}/profile`).then(r => r.json()).then(d => { avatarUrlRef.current = d.avatarUrl ?? null; }).catch(() => {});
  }, [userId]);

  // Poll live matches so we know who is watchable
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

  // Socket: join the world, track other players
  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    const socket = getSocket({ id: userId, username });

    const upsert = (p: Player) => {
      if (p.userId === userId) return;
      playersRef.current.set(p.userId, p);
      setPlayers(new Map(playersRef.current));
    };

    socket.on("world:roster", (list: Player[]) => {
      playersRef.current = new Map();
      for (const p of list) if (p.userId !== userId) playersRef.current.set(p.userId, p);
      setPlayers(new Map(playersRef.current));
    });
    socket.on("world:playerJoined", (p: Player) => upsert(p));
    socket.on("world:playerMoved", ({ userId: uid, x, y }: { userId: string; x: number; y: number }) => {
      const p = playersRef.current.get(uid);
      if (p) { p.x = x; p.y = y; setPlayers(new Map(playersRef.current)); }
    });
    socket.on("world:playerLeft", ({ userId: uid }: { userId: string }) => {
      if (playersRef.current.delete(uid)) setPlayers(new Map(playersRef.current));
    });

    socket.emit("world:join", { x: meRef.current.x, y: meRef.current.y, avatar: avatarUrlRef.current });

    return () => {
      socket.emit("world:leave");
      socket.off("world:roster");
      socket.off("world:playerJoined");
      socket.off("world:playerMoved");
      socket.off("world:playerLeft");
    };
  }, [status, userId, username]);

  // Input handlers
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        keysRef.current.add(k); targetRef.current = null; setHint(false);
      }
      if ((k === "e" || k === "enter") && promptRef.current) act(promptRef.current);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = useCallback((p: Prompt) => {
    if (!p) return;
    if (p.kind === "enter") router.push(p.route);
    else router.push(`/room/${p.room}?spectate=1`);
  }, [router]);

  // Tap / click the ground to walk there
  const onGroundClick = useCallback((e: React.MouseEvent) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const wx = e.clientX - rect.left - camRef.current.x;
    const wy = e.clientY - rect.top - camRef.current.y;
    targetRef.current = { x: Math.max(AVATAR_R, Math.min(WORLD_W - AVATAR_R, wx)), y: Math.max(AVATAR_R, Math.min(WORLD_H - AVATAR_R, wy)) };
    keysRef.current.clear();
    setHint(false);
  }, []);

  // Animation loop
  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let raf = 0; let last = performance.now(); let lastEmit = 0;
    const socket = getSocket({ id: userId, username });

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const me = meRef.current;

      // Velocity from keys, else move toward tap target
      let vx = 0, vy = 0;
      const K = keysRef.current;
      if (K.has("w") || K.has("arrowup")) vy -= 1;
      if (K.has("s") || K.has("arrowdown")) vy += 1;
      if (K.has("a") || K.has("arrowleft")) vx -= 1;
      if (K.has("d") || K.has("arrowright")) vx += 1;
      if (vx || vy) {
        const len = Math.hypot(vx, vy); vx /= len; vy /= len;
      } else if (targetRef.current) {
        const tx = targetRef.current.x - me.x, ty = targetRef.current.y - me.y;
        const d = Math.hypot(tx, ty);
        if (d < 3) { targetRef.current = null; } else { vx = tx / d; vy = ty / d; }
      }

      if (vx || vy) {
        const nx = me.x + vx * SPEED * dt;
        const ny = me.y + vy * SPEED * dt;
        const cx = Math.max(AVATAR_R, Math.min(WORLD_W - AVATAR_R, nx));
        const cy = Math.max(AVATAR_R, Math.min(WORLD_H - AVATAR_R, ny));
        if (!hitsBuilding(cx, me.y)) me.x = cx;         // axis-separated collision
        if (!hitsBuilding(me.x, cy)) me.y = cy;
      }

      // Camera — center on me, clamped to world bounds
      const vp = viewportRef.current;
      if (vp && worldRef.current && meElRef.current) {
        const vw = vp.clientWidth, vh = vp.clientHeight;
        const camX = Math.max(Math.min(0, vw / 2 - me.x), vw - WORLD_W);
        const camY = Math.max(Math.min(0, vh / 2 - me.y), vh - WORLD_H);
        camRef.current = { x: camX, y: camY };
        worldRef.current.style.transform = `translate(${camX}px, ${camY}px)`;
        meElRef.current.style.transform = `translate(${me.x - AVATAR_R}px, ${me.y - AVATAR_R}px)`;
      }

      // Broadcast my position (throttled)
      if (now - lastEmit > MOVE_EMIT_MS) { socket.emit("world:move", { x: Math.round(me.x), y: Math.round(me.y) }); lastEmit = now; }

      // Nearest interactable → prompt
      let next: Prompt = null;
      let best = Infinity;
      for (const b of BUILDINGS) {
        const d = Math.hypot(b.door.x - me.x, b.door.y - me.y);
        if (d < DOOR_DIST && d < best) { best = d; next = { kind: "enter", label: b.name, sub: b.sub, route: b.route }; }
      }
      for (const p of playersRef.current.values()) {
        const room = liveRef.current.get(p.userId);
        if (!room) continue;
        const d = Math.hypot(p.x - me.x, p.y - me.y);
        if (d < WATCH_DIST && d < best) { best = d; next = { kind: "watch", label: p.username, sub: "Watch live debate", room }; }
      }
      const a = promptRef.current, changed =
        (!a && next) || (a && !next) ||
        (a && next && (a.kind !== next.kind || (a as any).route !== (next as any).route || (a as any).room !== (next as any).room || a.label !== next.label));
      if (changed) { promptRef.current = next; setPrompt(next); }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId, username]);

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-emerald-950 text-emerald-200/70 text-sm">Loading the campus…</div>;
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-emerald-950 select-none">
      {/* Viewport */}
      <div ref={viewportRef} className="absolute inset-0 cursor-pointer" onClick={onGroundClick}>
        {/* World */}
        <div
          ref={worldRef}
          className="absolute left-0 top-0 will-change-transform"
          style={{
            width: WORLD_W, height: WORLD_H,
            backgroundColor: "#0f3d2e",
            backgroundImage:
              "radial-gradient(circle at 50% 45%, rgba(52,211,153,0.10), transparent 60%)," +
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "100% 100%, 48px 48px, 48px 48px",
          }}
        >
          {/* Central plaza */}
          <div className="absolute rounded-full ring-2 ring-emerald-700/30 bg-emerald-900/20"
            style={{ left: SPAWN.x - 190, top: SPAWN.y - 130, width: 380, height: 260 }} />
          <div className="absolute -translate-x-1/2 text-center" style={{ left: SPAWN.x, top: SPAWN.y - 34 }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-500/60">Veritas Campus</p>
          </div>

          {/* Buildings */}
          {BUILDINGS.map(b => {
            const t = THEME[b.theme];
            const doorSide = b.door.y > b.y + b.h ? "bottom" : "top";
            return (
              <div key={b.id} className="absolute" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
                <div className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-gradient-to-b ${t.wall} shadow-2xl ${t.glow} ring-1 ${t.ring}`}>
                  {/* Roof band */}
                  <div className={`flex items-center gap-2 px-4 py-2 ${t.roof}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5 text-white/90">{b.icon}</svg>
                    <span className="text-sm font-bold tracking-wide text-white">{b.name}</span>
                  </div>
                  {/* Facade */}
                  <div className="relative flex-1">
                    <div className="absolute inset-0 grid grid-cols-4 gap-3 p-5 opacity-40">
                      {Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-md bg-white/10" />)}
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-3 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${t.badge}`}>{b.sub}</span>
                    </div>
                  </div>
                </div>
                {/* Door marker */}
                <div className={`absolute h-3 w-16 -translate-x-1/2 rounded-full ${t.door} shadow-lg`}
                  style={{ left: b.w / 2, [doorSide === "bottom" ? "bottom" : "top"]: -6 } as any} />
              </div>
            );
          })}

          {/* Other players */}
          {[...players.values()].map(p => {
            const live = liveRef.current.has(p.userId);
            return (
              <div key={p.userId} className="absolute will-change-transform transition-transform duration-100 ease-linear"
                style={{ transform: `translate(${p.x - AVATAR_R}px, ${p.y - AVATAR_R}px)` }}>
                <div className="relative flex flex-col items-center">
                  <span className="mb-1 max-w-[90px] truncate rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-gray-100">
                    {live && <span className="mr-0.5 text-red-400">●</span>}{p.username}
                  </span>
                  <div className={`flex items-center justify-center rounded-full ring-2 ring-white/70 ${avatarColor(p.username)}`} style={{ width: AVATAR_R * 2, height: AVATAR_R * 2 }}>
                    {p.avatar ? <img src={p.avatar} alt="" className="h-full w-full rounded-full object-cover" /> : <span className="text-xs font-bold text-white">{p.username[0]?.toUpperCase()}</span>}
                  </div>
                  {live && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-red-500" />}
                </div>
              </div>
            );
          })}

          {/* Me */}
          <div ref={meElRef} className="absolute left-0 top-0 z-10 will-change-transform" style={{ transform: `translate(${SPAWN.x - AVATAR_R}px, ${SPAWN.y - AVATAR_R}px)` }}>
            <div className="relative flex flex-col items-center">
              <span className="mb-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">You</span>
              <div className="flex items-center justify-center rounded-full bg-indigo-500 ring-2 ring-white shadow-lg shadow-black/40" style={{ width: AVATAR_R * 2, height: AVATAR_R * 2 }}>
                {avatarUrlRef.current ? <img src={avatarUrlRef.current} alt="" className="h-full w-full rounded-full object-cover" /> : <span className="text-xs font-bold text-white">{username[0]?.toUpperCase()}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 p-4 pt-safe">
        <button onClick={() => router.push("/home")} className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-black/40 px-3 py-2 text-xs font-semibold text-gray-200 backdrop-blur hover:bg-black/60">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
          Home
        </button>
        <div className="rounded-xl bg-black/40 px-3 py-2 text-xs text-gray-300 backdrop-blur">
          <span className="font-semibold text-emerald-400">{players.size + 1}</span> on campus
        </div>
      </div>

      {/* Controls hint */}
      {hint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-4">
          <div className="rounded-xl bg-black/50 px-4 py-2 text-center text-xs text-gray-300 backdrop-blur">
            <span className="hidden sm:inline">Move with <b className="text-white">WASD</b> / arrows — or click to walk. </span>
            <span className="sm:hidden">Tap anywhere to walk. </span>
            Approach a building to enter, or a <span className="text-red-400">●live</span> debater to watch.
          </div>
        </div>
      )}

      {/* Interaction prompt */}
      {prompt && (
        <div className="absolute inset-x-0 bottom-8 flex justify-center px-4">
          <button
            onClick={() => act(prompt)}
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-5 py-3 text-left shadow-xl backdrop-blur transition-transform hover:scale-[1.02] ${
              prompt.kind === "watch" ? "bg-red-600/90 hover:bg-red-500" : "bg-indigo-600/90 hover:bg-indigo-500"
            }`}
          >
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
    </div>
  );
}
