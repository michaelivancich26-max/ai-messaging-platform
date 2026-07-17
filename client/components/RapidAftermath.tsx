"use client";

import { useCallback, useEffect, useState } from "react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
import { api } from "@/lib/api";

type Stance = "agree" | "disagree";

// The four-point choice, same ramp as the deck so a position means the same
// thing before and after a debate.
const CHOICES: { stance: Stance; confidence: number; label: string; cls: string }[] = [
  { stance: "disagree", confidence: 2, label: "Strongly disagree", cls: "bg-rose-600 text-white hover:bg-rose-500 border-rose-600" },
  { stance: "disagree", confidence: 1, label: "Disagree", cls: "border-rose-500/40 text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40" },
  { stance: "agree", confidence: 1, label: "Agree", cls: "border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40" },
  { stance: "agree", confidence: 2, label: "Strongly agree", cls: "bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-600" },
];

interface Aftermath {
  proposition: { id: string; text: string } | null;
  before?: { stance: string; confidence: number | null } | null;
}

// The closing beat of the loop: deck -> match -> "did that move you?" -> deck.
// Whether a debate actually changed a mind is the one thing this product exists
// to measure, and this is the only place a post-debate BeliefChange gets
// written. Shown once a rapid round has ended.
export default function RapidAftermath({ roomName }: { roomName: string }) {
  const [data, setData] = useState<Aftermath | null>(null);
  const [outcome, setOutcome] = useState<null | "held" | "changed">(null);
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let live = true;
    api(`${SERVER}/api/rapid/aftermath/${encodeURIComponent(roomName)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setData({ proposition: null }); });
    return () => { live = false; };
  }, [roomName]);

  const submit = useCallback(async (stance: Stance, confidence: number) => {
    if (!data?.proposition || submitting) return;
    setSubmitting(true);
    try {
      const r = await api(`${SERVER}/api/deck/position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // correction:false — a post-debate answer IS a potential change of mind,
        // and the whole point is to log it when it moves.
        body: JSON.stringify({ propositionId: data.proposition.id, stance, confidence, roomName, correction: false }),
      });
      const res = await r.json().catch(() => ({}));
      setOutcome(res?.changed ? "changed" : "held");
    } catch {
      setOutcome("held");   // the position still saved optimistically often enough; never block the user here
    } finally {
      setSubmitting(false);
    }
  }, [data, roomName, submitting]);

  // Nothing to ask (non-rapid round, no recorded proposition, or dismissed).
  if (dismissed || !data || !data.proposition) return null;

  if (outcome) {
    return (
      <div className="mt-4 rounded-xl border border-gray-200 bg-white/60 p-4 text-center dark:border-gray-800 dark:bg-gray-900/60">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {outcome === "changed" ? "You changed your mind — logged." : "You held your position."}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {outcome === "changed"
            ? "Changing your mind on the evidence is the point — it counts for you, not against."
            : "That's fine — most debates sharpen a view rather than flip it."}
        </p>
      </div>
    );
  }

  const before = data.before && data.before.stance !== "skip"
    ? `${data.before.stance}/${data.before.confidence}` : null;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white/60 p-4 dark:border-gray-800 dark:bg-gray-900/60">
      <p className="text-center text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Did that move you?
      </p>
      <p className="mx-auto mt-2 max-w-md text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
        &ldquo;{data.proposition.text}&rdquo;
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CHOICES.map((c) => {
          const wasThis = before === `${c.stance}/${c.confidence}`;
          return (
            <button
              key={c.label}
              disabled={submitting}
              onClick={() => submit(c.stance, c.confidence)}
              className={`relative rounded-xl border px-3 py-3 text-xs font-semibold transition-colors disabled:opacity-50 ${c.cls}`}
            >
              {c.label}
              {wasThis && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white dark:bg-gray-100 dark:text-gray-900">
                  before
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="mx-auto mt-3 block text-xs font-semibold text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Skip
      </button>
    </div>
  );
}
