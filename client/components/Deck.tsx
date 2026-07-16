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
// without a legend.
const CHOICES: { key: string; stance: Stance; confidence: number; label: string; cls: string }[] = [
  {
    key: "1", stance: "disagree", confidence: 2, label: "Strongly disagree",
    cls: "bg-rose-600 text-white hover:bg-rose-500 border-rose-600",
  },
  {
    key: "2", stance: "disagree", confidence: 1, label: "Disagree",
    cls: "border-rose-500/40 text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40",
  },
  {
    key: "3", stance: "agree", confidence: 1, label: "Agree",
    cls: "border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40",
  },
  {
    key: "4", stance: "agree", confidence: 2, label: "Strongly agree",
    cls: "bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-600",
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
      const d = await r.json();
      const fresh: Card[] = d?.cards ?? [];
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
    } catch { /* leave what's on screen */ }
    finally { fetching.current = false; setLoading(false); }
  }, [userId]);

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

  if (loading) {
    return <div className="py-24 text-center text-sm text-gray-500 dark:text-gray-400">Dealing the deck…</div>;
  }

  if (done || !card) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {positioned ? "That's the whole deck" : "Nothing to show yet"}
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600 dark:text-gray-400">
          {positioned
            ? `You've taken a side on ${positioned} ${positioned === 1 ? "claim" : "claims"}. New ones land as they're written.`
            : "No claims are live yet. Generate some and approve them, and the deck fills up."}
        </p>
        {ready && (
          <Link href="/rapid"
            className="mt-6 inline-block rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-500">
            Find someone who disagrees →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-8">
      {/* Progress — the gate is a matching requirement, so it's stated as one. */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {positioned} {positioned === 1 ? "position" : "positions"}
          </span>
          {ready ? (
            <Link href="/rapid" className="font-semibold text-orange-600 transition-colors hover:text-orange-500 dark:text-orange-400">
              Ready to queue →
            </Link>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">
              {remaining} more to unlock Rapid
            </span>
          )}
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-orange-500 transition-[width] duration-300"
            style={{ width: `${Math.min(100, (positioned / Math.max(1, gate)) * 100)}%` }}
          />
        </div>
      </div>

      {/* The claim. `key` restarts the entry animation on every card. */}
      <div
        key={card.id}
        className="animate-fadeIn rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          {labels[card.categoryId] ?? card.categoryId}
        </p>
        <p className="mt-4 text-xl font-semibold leading-snug text-gray-900 dark:text-gray-100">
          {card.text}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CHOICES.map(c => (
          <button
            key={c.key}
            onClick={() => answer(c.stance, c.confidence)}
            className={`rounded-xl border px-3 py-3 text-xs font-semibold transition-colors ${c.cls}`}
          >
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
