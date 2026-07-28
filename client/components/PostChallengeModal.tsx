"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import ClaimPicker, { type PickedClaim } from "@/components/ClaimPicker";
import { useFocusTrap } from "@/lib/useFocusTrap";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export type WinCondition =
  | { type: "exchanges"; limit: number }
  | { type: "time"; minutes: number }
  | { type: "proposition"; threshold: number };

export const WC_LABEL: Record<string, (wc: any) => string> = {
  exchanges: (wc) => `${wc.limit} exchanges`,
  time: (wc) => `${wc.minutes} min`,
  proposition: (wc) => `Prop ≥${wc.threshold}%`,
};

// One-line explanation of how each win condition actually resolves — surfaced in
// the post modal so the rules are legible before you commit.
const WC_HELP: Record<string, string> = {
  exchanges: "Ends after this many back-and-forth exchanges, then the AI judge reads the full transcript and picks the stronger case.",
  time: "You each have this long to argue. When the clock runs out, the AI judge decides the winner from the transcript.",
  proposition: "A live persuasion bar moves as claims land and get scored. The first side to push it past this threshold wins.",
};

// ── Proposition win-condition picker ─────────────────────────────────────────
// Previews the very bar it configures, exactly as it renders mid-match: the
// winner (emerald) has to push the proposition bar to `threshold`, the loser
// (rose) holds the rest, and a needle marks the win line. Dragging the slider
// moves the score just as it would move live. Kept as one component so every
// place a proposition win condition is chosen shows the same real bar.
function PropositionThresholdPicker({ threshold, onChange }: { threshold: number; onChange: (v: number) => void }) {
  const loser = 100 - threshold;
  // Winner (emerald) on the left, loser (rose) on the right — the same first-side
  // orientation as the Live match cards. The split is the win line: raising the
  // slider grows the winner's green rightward as their score would climb live.
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
        <span className="text-emerald-700 dark:text-emerald-400">Winner</span>
        <span className="text-gray-500 dark:text-gray-400">win at {threshold}%</span>
        <span className="text-rose-700 dark:text-rose-400">Loser</span>
      </div>
      <div className="relative h-3.5 overflow-hidden rounded-full bg-gray-100 shadow-inner dark:bg-gray-800">
        <div className="absolute inset-y-0 left-0 bg-emerald-500 transition-[width] duration-150" style={{ width: `${threshold}%` }} />
        <div className="absolute inset-y-0 right-0 bg-rose-500 transition-[width] duration-150" style={{ width: `${loser}%` }} />
        {/* Win line — the split the winner has to push the bar past to take it. */}
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90 shadow dark:bg-gray-950/80 transition-[left] duration-150" style={{ left: `${threshold}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-bold tabular-nums">
        <span className="text-emerald-700 dark:text-emerald-300">{threshold}%</span>
        <span className="text-rose-700 dark:text-rose-300">{loser}%</span>
      </div>
      <input
        type="range" min={50} max={90} step={5} value={threshold}
        onChange={e => onChange(+e.target.value)}
        aria-label={`Win threshold ${threshold} percent`}
        className="mt-2 h-11 w-full accent-emerald-600"
      />
    </div>
  );
}

// ── Post Challenge Modal ──────────────────────────────────────────────────────

export default function PostChallengeModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id ?? "";
  const [picked, setPicked] = useState<PickedClaim | null>(null);
  const [stance, setStance] = useState<"affirmative" | "negative">("affirmative");
  const [wcType, setWcType] = useState<"exchanges" | "time" | "proposition">("exchanges");
  const [limit, setLimit] = useState(10);
  const [minutes, setMinutes] = useState(10);
  const [threshold, setThreshold] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const wc: WinCondition =
    wcType === "exchanges" ? { type: "exchanges", limit } :
    wcType === "time" ? { type: "time", minutes } :
    { type: "proposition", threshold };

  async function submit() {
    if (!picked) return;
    setLoading(true);
    setError("");
    try {
      const res = await api(`${SERVER}/api/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Curated picks send the ID only — the server resolves the text, so
        // "from the library" can't be spoofed by sending matching text.
        body: JSON.stringify(picked.propositionId
          ? { userId, propositionId: picked.propositionId, stance, winCondition: wc }
          : { userId, claim: picked.text, stance, winCondition: wc }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't post that challenge.");
        return;
      }
      onPosted();
      onClose();
    } catch {
      setError("Couldn't post that challenge.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="post-challenge-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-elevated animate-fadeInUp" onClick={e => e.stopPropagation()}>
        <h2 id="post-challenge-title" className="font-display text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-4">Post a Challenge</h2>

        {/* Claim — library first, own claim behind a disclosure. */}
        <ClaimPicker value={picked} onChange={setPicked} />

        {/* Stance */}
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-4 mb-1.5">You are arguing</label>
        <div className="flex gap-2">
          {(["affirmative", "negative"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStance(s)}
              aria-pressed={stance === s}
              className={`min-h-11 flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                stance === s
                  ? s === "affirmative"
                    ? "border-emerald-500 bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                    : "border-rose-500 bg-rose-100 dark:border-rose-600 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"
                  : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              {s === "affirmative" ? "FOR this claim" : "AGAINST this claim"}
            </button>
          ))}
        </div>

        {/* Win condition */}
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-4 mb-1.5">Win condition</label>
        <div className="flex gap-2 mb-3">
          {(["exchanges", "time", "proposition"] as const).map(t => (
            <button
              key={t}
              onClick={() => setWcType(t)}
              aria-pressed={wcType === t}
              className={`min-h-11 flex-1 rounded-lg border py-2 text-xs font-semibold capitalize transition-colors ${
                wcType === t ? "border-brand-green bg-brand-green/10 text-brand-green-ink dark:text-brand-green" : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {wcType === "exchanges" && (
          <div className="flex items-center gap-3">
            <input type="range" min={4} max={20} value={limit} onChange={e => setLimit(+e.target.value)}
              aria-label={`Exchanges: ${limit}`} className="h-11 flex-1 accent-brand-green" />
            <span className="w-20 text-right text-xs text-gray-700 dark:text-gray-300">{limit} exchanges</span>
          </div>
        )}
        {wcType === "time" && (
          <div className="flex items-center gap-3">
            <input type="range" min={3} max={30} value={minutes} onChange={e => setMinutes(+e.target.value)}
              aria-label={`Minutes: ${minutes}`} className="h-11 flex-1 accent-brand-green" />
            <span className="w-20 text-right text-xs text-gray-700 dark:text-gray-300">{minutes} minutes</span>
          </div>
        )}
        {wcType === "proposition" && (
          <PropositionThresholdPicker threshold={threshold} onChange={setThreshold} />
        )}

        {/* How it resolves + what's at stake */}
        <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-[11px] leading-relaxed text-gray-600 dark:bg-gray-800/60 dark:text-gray-400">
          {WC_HELP[wcType]} A win raises your ELO and drops your opponent&rsquo;s — by more when you beat a higher-rated debater.
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || !picked}
            className="min-h-11 flex-1 rounded-xl bg-orange-700 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-40 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            {loading ? "Posting…" : "Post Challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}
