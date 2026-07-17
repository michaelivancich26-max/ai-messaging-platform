"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Card { id: string; text: string; categoryId: string }
interface Category { id: string; label: string }

type Stance = "agree" | "disagree" | "skip";

// One tap gives a side AND how firmly it's held, which is the whole point:
// the match needs both, and asking twice would cost more friction than the
// answer is worth. Filled = strongly held, outline = held — the ramp reads
// without a legend. Filled ends use the -700 shades so white labels clear AA.
const CHOICES: { key: string; stance: Stance; confidence: number; label: string; cls: string }[] = [
  {
    key: "1", stance: "disagree", confidence: 2, label: "Strongly disagree",
    cls: "bg-rose-700 text-white hover:bg-rose-600 border-rose-700",
  },
  {
    key: "2", stance: "disagree", confidence: 1, label: "Disagree",
    cls: "border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-950/40",
  },
  {
    key: "3", stance: "agree", confidence: 1, label: "Agree",
    cls: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-950/40",
  },
  {
    key: "4", stance: "agree", confidence: 2, label: "Strongly agree",
    cls: "bg-emerald-700 text-white hover:bg-emerald-600 border-emerald-700",
  },
];

// Refill this far from the end so the deck never visibly stalls mid-session.
const PREFETCH_AT = 4;

export default function Deck({ userId }: { userId: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [i, setI] = useState(0);
  const [positioned, setPositioned] = useState(0);
  const [gate, setGate] = useState(10);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  // A failed request is NOT an empty deck. Without this, a 500 or an expired
  // session parses to { cards: undefined } -> [] and renders "no claims are
  // live" — telling someone their deck is empty when the request simply broke.
  const [error, setError] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const fetching = useRef(false);
  // Furthest card reached. Anything behind it has already been answered, so
  // re-answering it is a correction rather than a change of mind.
  const furthest = useRef(0);

  useEffect(() => {
    api(`${SERVER}/api/topics`).then(r => r.json())
      .then((d: Category[]) => setLabels(Object.fromEntries((d ?? []).map(c => [c.id, c.label]))))
      .catch(() => {});
  }, []);

  const load = useCallback(async (replace: boolean) => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const r = await api(`${SERVER}/api/deck?userId=${encodeURIComponent(userId)}&limit=20`);
      // A non-ok response is a broken request, not an empty deck. Surface it as
      // an error and leave whatever's on screen; never let it read as "done".
      if (!r.ok) { setError(true); return; }
      const d = await r.json();
      const fresh: Card[] = d?.cards ?? [];
      setError(false);
      setPositioned(d?.positioned ?? 0);
      setGate(d?.gate ?? 10);
      if (replace) {
        setCards(fresh);
        setI(0);
        if (!fresh.length) setDone(true);
      } else {
        // The server excludes anything already answered, so a refill can't
        // duplicate what's on screen — but it CAN return rows already sitting
        // unanswered in the local queue, since those aren't answered yet.
        setCards(prev => {
          const have = new Set(prev.map(c => c.id));
          return [...prev, ...fresh.filter(c => !have.has(c.id))];
        });
      }
    } catch {
      setError(true);   // network failure — same: not an empty deck
    }
    finally { fetching.current = false; setLoading(false); }
  }, [userId]);

  const retry = useCallback(() => {
    setError(false); setLoading(true); load(true);
  }, [load]);

  useEffect(() => { load(true); }, [load]);

  const answer = useCallback(async (stance: Stance, confidence: number | null) => {
    const card = cards[i];
    if (!card) return;
    const correction = i < furthest.current;

    // Advance immediately — a deck that waits on the network between cards
    // isn't a deck. The write is idempotent, so a failure loses one position
    // rather than corrupting anything.
    setI(n => { furthest.current = Math.max(furthest.current, n + 1); return n + 1; });
    if (stance !== "skip" && !correction) setPositioned(n => n + 1);

    try {
      const r = await api(`${SERVER}/api/deck/position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, propositionId: card.id, stance, confidence, correction }),
      });
      const d = await r.json();
      if (typeof d?.positioned === "number") setPositioned(d.positioned);
    } catch { /* the optimistic count reconciles on next load */ }
  }, [cards, i, userId]);

  // Re-show the previous card so a mistap can be fixed. The re-answer is sent
  // as a correction, so it overwrites the position without logging a change of
  // mind that never happened.
  const back = useCallback(() => setI(n => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (!loading && !done && i >= cards.length - PREFETCH_AT) load(false);
  }, [i, cards.length, loading, done, load]);

  // Only "done" once a refill has actually come back empty. Latching on
  // i >= cards.length alone declares the deck finished while a prefetch is
  // still in flight — you'd hit the end of the batch, see "that's the whole
  // deck", and the cards arriving a moment later could never un-say it.
  useEffect(() => {
    if (loading || fetching.current) return;
    if (cards.length && i >= cards.length) setDone(true);
  }, [i, cards.length, loading]);

  // A refill that brings new cards un-latches it.
  useEffect(() => {
    if (i < cards.length) setDone(false);
  }, [i, cards.length]);

  const card = cards[i];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card) return;
      if (e.key === "Backspace" && i > 0) { e.preventDefault(); back(); return; }
      if (e.key === "s" || e.key === "S") { answer("skip", null); return; }
      const choice = CHOICES.find(c => c.key === e.key);
      if (choice) answer(choice.stance, choice.confidence);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, answer, back, i]);

  const remaining = Math.max(0, gate - positioned);
  const ready = remaining === 0;
  const pct = Math.min(100, (positioned / Math.max(1, gate)) * 100);

  if (loading) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800" />
        <div className="shimmer-track h-56 rounded-3xl border border-gray-200 bg-white shadow-elevated dark:border-gray-800 dark:bg-gray-900" />
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">Dealing the deck…</p>
      </div>
    );
  }

  // Distinct from the empty state, and only when there's nothing already on
  // screen to keep interacting with — a refill failing mid-session shouldn't
  // yank the current card away.
  if (error && !card) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <h3 className="font-display text-xl font-bold text-gray-900 dark:text-gray-100">Couldn&rsquo;t load the deck</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600 dark:text-gray-400">
          Something went wrong reaching the server — this isn&rsquo;t an empty deck.
        </p>
        <button onClick={retry}
          className="mt-6 rounded-2xl bg-orange-700 px-5 py-3 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600">
          Try again
        </button>
      </div>
    );
  }

  if (done || !card) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-7 w-7"><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" /></svg>
        </div>
        <h3 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100">
          {positioned ? "That's the whole deck" : "Nothing to show yet"}
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600 dark:text-gray-400">
          {positioned
            ? `You've taken a side on ${positioned} ${positioned === 1 ? "claim" : "claims"}. New ones land as they're written.`
            : "No claims are live yet. Generate some and approve them, and the deck fills up."}
        </p>
        {ready && (
          <Link href="/rapid"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-orange-700 px-6 py-3.5 text-base font-semibold text-white shadow-glow transition-colors hover:bg-orange-600">
            Find someone who disagrees <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-8">
      {/* Progress — the gate is a matching requirement, so it's stated as one. */}
      <div className="mb-7">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {positioned} {positioned === 1 ? "position" : "positions"}
          </span>
          {ready ? (
            <Link href="/rapid" className="font-semibold text-orange-700 transition-colors hover:text-orange-600 dark:text-orange-400">
              Ready to queue <span aria-hidden>→</span>
            </Link>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">
              {remaining} more to unlock Rapid
            </span>
          )}
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${ready ? "bg-brand-green" : "bg-orange-500"}`}
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
      </div>

      {/* The claim, sitting on a subtle stack so it reads as one card of a deck. */}
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 translate-y-2 scale-[0.97] rounded-3xl border border-gray-200 bg-white/70 dark:border-gray-800 dark:bg-gray-900/60" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 translate-y-4 scale-[0.94] rounded-3xl border border-gray-200 bg-white/50 dark:border-gray-800 dark:bg-gray-900/40" />
        {/* `key` restarts the entry animation on every card. */}
        <div
          key={card.id}
          className="animate-fadeInUp rounded-3xl border border-gray-200 bg-white p-7 shadow-elevated dark:border-gray-800 dark:bg-gray-900 md:p-9"
        >
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {labels[card.categoryId] ?? card.categoryId}
          </span>
          <p className="mt-5 font-display text-2xl font-semibold leading-snug text-balance text-gray-900 dark:text-white md:text-[28px]">
            {card.text}
          </p>
        </div>
      </div>

      {/* Four-point ramp: strong ends filled, mild middle outlined. */}
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {CHOICES.map(c => (
          <button
            key={c.key}
            onClick={() => answer(c.stance, c.confidence)}
            className={`relative rounded-xl border px-3 py-4 text-sm font-semibold leading-tight transition-all duration-150 active:scale-[0.97] motion-reduce:active:scale-100 ${c.cls}`}
          >
            <span aria-hidden className="absolute left-2 top-1.5 hidden text-[10px] font-bold opacity-40 sm:block">{c.key}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={back}
          disabled={i === 0}
          className="text-xs font-semibold text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-0 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Back
        </button>
        <button
          onClick={() => answer("skip", null)}
          className="text-xs font-semibold text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        >
          No opinion — skip
        </button>
      </div>

      <p className="mt-6 hidden text-center text-[11px] text-gray-500 dark:text-gray-400 sm:block">
        <kbd className="rounded border border-gray-300 px-1 dark:border-gray-700">1</kbd>–
        <kbd className="rounded border border-gray-300 px-1 dark:border-gray-700">4</kbd> to answer ·{" "}
        <kbd className="rounded border border-gray-300 px-1 dark:border-gray-700">S</kbd> to skip ·{" "}
        <kbd className="rounded border border-gray-300 px-1 dark:border-gray-700">⌫</kbd> to go back
      </p>
    </div>
  );
}
