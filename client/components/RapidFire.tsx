"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Category { id: string; label: string; count: number }
interface MatchFound { roomName: string; topic: string; stance: string; opponent: string; minMessages: number }
interface NeedsDeck { positioned: number; gate: number }

const ANY = "__any__";

function elapsed(since: number): string {
  const s = Math.floor((Date.now() - since) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function initial(name: string): string {
  return (name?.[0] ?? "?").toUpperCase();
}

// Queue for a rapid round. You pick a category (or take anything); the server
// pairs you with whoever's waiting, picks the topic, and deals the sides.
export default function RapidFire({ userId, username }: { userId: string; username: string }) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string>(ANY);
  const [queued, setQueued] = useState(false);
  const [since, setSince] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const [found, setFound] = useState<MatchFound | null>(null);
  const [needsDeck, setNeedsDeck] = useState<NeedsDeck | null>(null);
  const queuedRef = useRef(false);

  useEffect(() => {
    api(`${SERVER}/api/topics`).then(r => r.json())
      .then(d => setCategories(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const loadWaiting = useCallback(() => {
    api(`${SERVER}/api/rapid/queue-size`).then(r => r.json())
      .then(d => setWaiting(d?.waiting ?? 0)).catch(() => {});
  }, []);

  useEffect(() => {
    loadWaiting();
    const id = setInterval(loadWaiting, 5000);
    return () => clearInterval(id);
  }, [loadWaiting]);

  // Tick the "waiting for 0:42" label.
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [since]);

  useEffect(() => {
    if (!userId || !username) return;
    const socket = getSocket();

    const onWaiting = () => { setQueued(true); queuedRef.current = true; setSince(Date.now()); };
    const onLeft = () => { setQueued(false); queuedRef.current = false; setSince(null); };
    const onFound = (m: MatchFound) => {
      setQueued(false); queuedRef.current = false; setSince(null);
      setFound(m);
      // Beat lets the pairing register before the room mounts and starts judging.
      setTimeout(() => router.push(`/room/${m.roomName}`), 1200);
    };

    // Turned away for want of positions: pairing needs a claim you've both
    // taken a side on, so there's nothing to match you on yet.
    const onNeedsDeck = (d: NeedsDeck) => {
      setQueued(false); queuedRef.current = false; setSince(null);
      setNeedsDeck(d);
    };

    socket.on("rapidQueueWaiting", onWaiting);
    socket.on("rapidQueueLeft", onLeft);
    socket.on("rapidMatchFound", onFound);
    socket.on("rapidNeedsDeck", onNeedsDeck);
    return () => {
      socket.off("rapidQueueWaiting", onWaiting);
      socket.off("rapidQueueLeft", onLeft);
      socket.off("rapidMatchFound", onFound);
      socket.off("rapidNeedsDeck", onNeedsDeck);
    };
  }, [userId, username, router]);

  // Leave the pool if the user navigates away while still queued.
  useEffect(() => () => {
    if (queuedRef.current) getSocket().emit("rapidQueueLeave");
  }, [userId, username]);

  // Purely-visual 3·2·1 that fills the 1200ms hand-off above. Never gates the
  // navigation — that stays on the socket handler's timer.
  const [countdown, setCountdown] = useState(3);
  useEffect(() => {
    if (!found) return;
    setCountdown(3);
    const id = setInterval(() => setCountdown(c => Math.max(1, c - 1)), 400);
    return () => clearInterval(id);
  }, [found]);

  function join() {
    getSocket().emit("rapidQueueJoin", { categoryId: selected === ANY ? null : selected });
    setQueued(true); queuedRef.current = true; setSince(Date.now());
  }

  function leave() {
    getSocket().emit("rapidQueueLeave");
    setQueued(false); queuedRef.current = false; setSince(null);
  }

  // Not enough of the deck answered to find anyone. Framed as the on-ramp it is
  // — you're close to the pool, not shut out of it.
  if (needsDeck) {
    const remaining = Math.max(0, needsDeck.gate - needsDeck.positioned);
    const pct = Math.min(100, (needsDeck.positioned / Math.max(1, needsDeck.gate)) * 100);
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7"><rect x="3" y="5" width="14" height="16" rx="2" /><path d="M7 3h12a2 2 0 0 1 2 2v12" /></svg>
        </div>
        <h3 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100">Almost in the pool</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600 dark:text-gray-400">
          We match you against someone who holds the opposite view on a specific claim —
          so we need a few more of your positions before we can find them.
        </p>
        <div className="mx-auto mt-6 max-w-xs">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold text-gray-700 dark:text-gray-200">{needsDeck.positioned} / {needsDeck.gate}</span>
            <span className="text-gray-500 dark:text-gray-400">{remaining} more</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div className="h-full rounded-full bg-orange-500 transition-[width] duration-300" style={{ width: `${Math.max(6, pct)}%` }} />
          </div>
        </div>
        <Link href="/deck"
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-orange-700 px-6 py-3.5 text-base font-semibold text-white shadow-glow transition-colors hover:bg-orange-600">
          Open the deck <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }

  if (found) {
    const isFor = found.stance === "affirmative";
    return (
      <div className="mx-auto flex max-w-md animate-popIn flex-col items-center gap-5 py-14 text-center">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-70 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
          </span>
          Match found
        </p>

        {/* You vs them */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-lg font-bold text-white shadow-glow">{initial(username)}</span>
            <span className="max-w-[5.5rem] truncate text-xs font-semibold text-gray-700 dark:text-gray-300">{username}</span>
          </div>
          <span className="font-display text-lg font-bold text-gray-400 dark:text-gray-500">vs</span>
          <div className="flex flex-col items-center gap-1.5">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-gray-600 to-gray-800 text-lg font-bold text-white">{initial(found.opponent)}</span>
            <span className="max-w-[5.5rem] truncate text-xs font-semibold text-gray-700 dark:text-gray-300">{found.opponent}</span>
          </div>
        </div>

        <p className="max-w-md font-display text-lg font-semibold leading-snug text-balance text-gray-900 dark:text-white">
          &ldquo;{found.topic}&rdquo;
        </p>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          You&rsquo;re arguing{" "}
          <span className={`rounded-lg px-2 py-0.5 font-bold ${isFor
            ? "bg-emerald-50 text-brand-green-ink dark:bg-emerald-950/40 dark:text-brand-green"
            : "bg-rose-50 text-brand-red-ink dark:bg-rose-950/40 dark:text-brand-red"}`}>
            {isFor ? "FOR" : "AGAINST"}
          </span>{" "}
          — the side you already hold.
        </p>

        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 tabular-nums">
          Entering the room in {countdown}
        </p>
      </div>
    );
  }

  if (queued) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-14 text-center">
        {/* Radar — the pool is being scanned. */}
        <div className="relative h-32 w-32">
          <div className="absolute inset-0 overflow-hidden rounded-full">
            {[0, 0.73, 1.46].map(d => (
              <span key={d} style={{ animationDelay: `${d}s` }}
                className="absolute inset-0 rounded-full border-2 border-orange-500/50 motion-safe:animate-radar" />
            ))}
          </div>
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-xl font-bold text-white shadow-glow motion-safe:animate-pulseGlow">
              {initial(username)}
            </span>
          </div>
        </div>

        <div>
          <p className="font-display text-xl font-bold text-gray-900 dark:text-gray-100">Finding someone who disagrees…</p>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
            {selected === ANY ? "Any topic" : categories.find(c => c.id === selected)?.label}
            {since && <> · <span className="tabular-nums">{elapsed(since)}</span></>}
          </p>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-orange-700 dark:text-orange-400 tabular-nums">{Math.max(1, waiting)}</span> {Math.max(1, waiting) === 1 ? "person" : "people"} warming up
        </p>

        <button onClick={leave}
          className="rounded-full border border-gray-300 px-5 py-2 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-8 md:py-10">
      <div className="text-center">
        <p className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V1.75A.75.75 0 0 1 10 1ZM5.05 3.05a.75.75 0 0 1 1.06 0l1.062 1.06A.75.75 0 1 1 6.11 5.173L5.05 4.11a.75.75 0 0 1 0-1.06Zm9.9 0a.75.75 0 0 1 0 1.06l-1.06 1.062a.75.75 0 0 1-1.062-1.061l1.061-1.06a.75.75 0 0 1 1.06 0ZM10 6a4 4 0 0 0-3.446 6.032l.311.51a.75.75 0 0 1-1.28.782l-.312-.51A5.5 5.5 0 1 1 15.5 11.5a5.47 5.47 0 0 1-.773 2.814l-.311.51a.75.75 0 1 1-1.28-.782l.31-.51A4 4 0 0 0 10 6Zm-2 11.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>
          Rapid Fire
        </p>
        <h3 className="mt-3 font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Argue it out, live.</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          We find someone who holds the opposite view on a claim you&rsquo;ve both taken a side on.
          You argue the side you actually hold — when you both agree to move on, whoever leads the
          proposition bar takes it.
        </p>

        {/* Live pool count */}
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs shadow-card dark:border-gray-800 dark:bg-gray-900">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-70 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
          </span>
          {waiting > 0
            ? <><span className="font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{waiting}</span> <span className="text-gray-500 dark:text-gray-400">{waiting === 1 ? "person" : "people"} in the queue</span></>
            : <span className="text-gray-500 dark:text-gray-400">Be the first in the queue</span>}
        </div>
      </div>

      {/* Stakes — the tension, not fine print. */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400" title="You can't bank a lead by walking away.">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-rose-500"><path d="M3 3a1 1 0 0 1 1-1h1v16H4a1 1 0 0 1-1-1V3Zm3 .5 8.5-1a1 1 0 0 1 1.1 1.2l-.8 4 .8 4a1 1 0 0 1-1.1 1.2L6 12V3.5Z" /></svg>
          Leaving forfeits
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400" title="Under 3 messages each and the round is void — no winner, no rating change.">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-gray-400"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-12.25a.75.75 0 0 0-1.5 0v4.5c0 .414.336.75.75.75h3a.75.75 0 0 0 0-1.5h-2.25v-3.75Z" clipRule="evenodd" /></svg>
          Under 3 messages voids
        </span>
      </div>

      <div className="mt-7">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Category</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSelected(ANY)}
            className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-all active:scale-[0.97] motion-reduce:active:scale-100 ${
              selected === ANY ? "bg-orange-700 text-white shadow-glow" : "border border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
            }`}>
            Any topic
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setSelected(c.id)}
              className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-all active:scale-[0.97] motion-reduce:active:scale-100 ${
                selected === c.id ? "bg-orange-700 text-white shadow-glow" : "border border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"
              }`}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-gray-500 dark:text-gray-400">
          &ldquo;Any topic&rdquo; matches fastest — a category only pairs you with someone who chose it or chose any.
        </p>
      </div>

      <button onClick={join}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-700 py-4 text-base font-semibold text-white shadow-glow transition-transform duration-150 hover:bg-orange-600 active:scale-[0.99] motion-reduce:active:scale-100">
        Find an opponent <span aria-hidden>→</span>
      </button>
    </div>
  );
}
