"use client";

import { useCallback, useEffect, useState } from "react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
import { api } from "@/lib/api";

type Stance = "agree" | "disagree";

// The four-point choice, same ramp as the deck so a position means the same
// thing before and after a debate. Filled ends use -700 so white clears AA.
const CHOICES: { stance: Stance; confidence: number; label: string; cls: string }[] = [
  { stance: "disagree", confidence: 2, label: "Strongly disagree", cls: "bg-rose-700 text-white hover:bg-rose-600 border-rose-700" },
  { stance: "disagree", confidence: 1, label: "Disagree", cls: "border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-950/40" },
  { stance: "agree", confidence: 1, label: "Agree", cls: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-950/40" },
  { stance: "agree", confidence: 2, label: "Strongly agree", cls: "bg-emerald-700 text-white hover:bg-emerald-600 border-emerald-700" },
];

interface Aftermath {
  proposition: { id: string; text: string } | null;
  before?: { stance: string; confidence: number | null } | null;
  answered?: boolean;
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
  // A failed WRITE is not a held position. Without this the component would tell
  // someone their mind didn't move when the save simply failed — dropping the
  // one thing this prompt exists to capture.
  const [saveError, setSaveError] = useState(false);

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
    setSaveError(false);
    try {
      // The dedicated endpoint derives the proposition from the round and is
      // idempotent per room, so it — not the generic deck write — is what a
      // post-debate answer goes through.
      const r = await api(`${SERVER}/api/rapid/aftermath/${encodeURIComponent(roomName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stance, confidence }),
      });
      if (!r.ok) { setSaveError(true); return; }        // real failure — keep the buttons, let them retry
      const res = await r.json().catch(() => ({}));
      setOutcome(res?.changed ? "changed" : "held");    // authoritative, from the server
    } catch {
      setSaveError(true);
    } finally {
      setSubmitting(false);
    }
  }, [data, roomName, submitting]);

  // Nothing to ask (non-rapid round, no proposition, already answered, or
  // dismissed).
  if (dismissed || !data || !data.proposition) return null;

  if (outcome) {
    const changed = outcome === "changed";
    return (
      <div className={`mt-4 animate-popIn rounded-2xl border p-5 text-center shadow-card ${changed
        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30"
        : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}>
        <div className={`mx-auto mb-2.5 grid h-11 w-11 place-items-center rounded-full ${changed
          ? "bg-brand-green/15 text-brand-green-ink dark:text-brand-green"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
          {changed ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-6 w-6"><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-6 w-6"><path strokeLinecap="round" strokeLinejoin="round" d="M5 9h14M5 15h14" /></svg>
          )}
        </div>
        <p className="font-display text-base font-bold text-gray-900 dark:text-gray-100">
          {changed ? "You changed your mind — logged." : "You held your position."}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-gray-600 dark:text-gray-400">
          {changed
            ? "Changing your mind on the evidence is the point — it counts for you, not against."
            : "That's fine — most debates sharpen a view rather than flip it."}
        </p>
      </div>
    );
  }

  const before = data.before && data.before.stance !== "skip"
    ? `${data.before.stance}/${data.before.confidence}` : null;

  return (
    <div className="mt-4 animate-fadeInUp rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
      <p className="text-center font-display text-base font-bold text-gray-900 dark:text-gray-100">
        Did that move you?
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-center text-sm text-gray-600 dark:text-gray-400">
        Where do you stand now on &mdash;
      </p>
      <p className="mx-auto mt-1 max-w-md text-center text-base font-semibold leading-snug text-balance text-gray-900 dark:text-gray-100">
        &ldquo;{data.proposition.text}&rdquo;
      </p>
      {saveError && (
        <p className="mt-2 text-center text-xs font-semibold text-rose-700 dark:text-rose-400">
          Couldn&rsquo;t save that — tap your answer again.
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CHOICES.map((c) => {
          const wasThis = before === `${c.stance}/${c.confidence}`;
          return (
            <button
              key={c.label}
              disabled={submitting}
              onClick={() => submit(c.stance, c.confidence)}
              className={`relative rounded-xl border px-3 py-3 text-sm font-semibold leading-tight transition-all duration-150 active:scale-[0.97] disabled:opacity-50 motion-reduce:active:scale-100 ${c.cls}`}
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
