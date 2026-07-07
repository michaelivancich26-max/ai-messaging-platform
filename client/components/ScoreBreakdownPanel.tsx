"use client";

import { useEffect, useState } from "react";
import type { ScoredClaim, ClaimStatus, CredScore, UserPositionEntry } from "@/lib/types";
import { STANCE_PALETTE, NEUTRAL_PALETTE } from "@/lib/stances";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

const STATUS_STYLE: Record<ClaimStatus, { pill: string; label: string }> = {
  PENDING:   { pill: "bg-gray-700 text-gray-400",              label: "Pending"   },
  SUPPORTED: { pill: "bg-emerald-500/20 text-emerald-300",     label: "Supported" },
  REFUTED:   { pill: "bg-red-500/20 text-red-300",             label: "Refuted"   },
  CONTESTED: { pill: "bg-amber-500/20 text-amber-300",         label: "Contested" },
};

interface Props {
  open: boolean;
  onClose: () => void;
  roomName: string;
  positions: Record<string, UserPositionEntry>;
  credibilityScores: Record<string, CredScore>;
  stances: string[];
}

function ScoreBar({ value, max = 10, color }: { value: number; max?: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-5 text-right text-[10px] tabular-nums text-gray-500">{value}</span>
    </div>
  );
}

export default function ScoreBreakdownPanel({ open, onClose, roomName, positions, credibilityScores, stances }: Props) {
  const [claims, setClaims] = useState<ScoredClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ClaimStatus | "ALL">("ALL");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${SERVER}/api/rooms/${roomName}/claims`)
      .then(r => r.json())
      .then(data => { setClaims(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open, roomName]);

  if (!open) return null;

  // Proposition bar breakdown
  const stanceScores: Record<string, number> = {};
  let barTotal = 0;
  const participants = Object.values(positions).filter(e => e.position !== "NEUTRAL");
  for (const entry of participants) {
    const cred = credibilityScores[entry.userId];
    const pts = cred ? Math.max(0, cred.supported * 2 - cred.refuted * 3) : 1;
    stanceScores[entry.position] = (stanceScores[entry.position] ?? 0) + pts;
    barTotal += pts;
  }

  const filtered = filter === "ALL" ? claims : claims.filter(c => c.status === filter);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="ml-auto flex h-full w-full max-w-md flex-col bg-gray-950 shadow-2xl border-l border-gray-800 overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-3 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-indigo-400 shrink-0">
            <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 16.5 0 8.25 8.25 0 0 1-16.5 0Zm8.25-3.75a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3a.75.75 0 0 1 .75-.75Zm0 7.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
          </svg>
          <span className="font-semibold text-sm text-gray-100 flex-1">Score Details</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Proposition bar formula ── */}
          <section className="border-b border-gray-800 px-4 py-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Proposition Bar</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Each participant holding a stance contributes a <span className="text-gray-200 font-medium">credibility weight</span> to their side of the bar. The bar width for each stance is proportional to the total weight on that side.
            </p>
            <div className="rounded-lg bg-gray-900 px-3 py-2.5 text-xs font-mono text-indigo-300 leading-relaxed">
              weight = max(0, supported_claims × 2 − refuted_claims × 3)<br />
              <span className="text-gray-500">// new participants with no claims default to 1</span>
            </div>

            {barTotal > 0 && (
              <div className="space-y-2 pt-1">
                {stances.map((stance, i) => {
                  const pal = STANCE_PALETTE[i % STANCE_PALETTE.length];
                  const pts = stanceScores[stance] ?? 0;
                  const pct = Math.round((pts / barTotal) * 100);
                  return (
                    <div key={stance} className="flex items-center gap-2 text-xs">
                      <span className="w-24 truncate font-medium text-gray-200">{stance}</span>
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full ${pal.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right tabular-nums text-gray-400">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Claim score formula ── */}
          <section className="border-b border-gray-800 px-4 py-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Claim Score Formula (0 – 100)</p>
            <div className="rounded-lg bg-gray-900 px-3 py-2.5 text-xs font-mono text-indigo-300 leading-relaxed space-y-0.5">
              <div>score = (accuracy×35 + relevance×25 + evidence×20</div>
              <div className="pl-9">+ logic×15 + impact×5) ÷ 10</div>
            </div>
            <div className="space-y-2 text-xs text-gray-400">
              {[
                { label: "Accuracy",  weight: 35, desc: "SUPPORTED = 10 pts · CONTESTED = 5 pts · REFUTED = 0 pts",  color: "bg-emerald-500" },
                { label: "Relevance", weight: 25, desc: "How directly this addresses the proposition",                color: "bg-indigo-500"  },
                { label: "Evidence",  weight: 20, desc: "Backed by data, studies, or expert consensus",              color: "bg-violet-500"  },
                { label: "Logic",     weight: 15, desc: "Reasoning free of fallacies and logically valid",           color: "bg-sky-500"     },
                { label: "Impact",    weight:  5, desc: "Significance to the debate outcome",                        color: "bg-amber-500"   },
              ].map(({ label, weight, desc, color }) => (
                <div key={label} className="flex gap-3">
                  <div className="flex items-center gap-1.5 w-28 shrink-0">
                    <div className={`h-2 w-2 rounded-full ${color} shrink-0`} />
                    <span className="text-gray-200 font-medium">{label}</span>
                    <span className="ml-auto text-gray-500 tabular-nums">{weight}%</span>
                  </div>
                  <span className="text-gray-500 leading-tight">{desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Claims list ── */}
          <section className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex-1">All Claims</p>
              <select
                value={filter}
                onChange={e => setFilter(e.target.value as ClaimStatus | "ALL")}
                className="rounded bg-gray-800 border border-gray-700 px-2 py-0.5 text-xs text-gray-300 outline-none"
              >
                <option value="ALL">All</option>
                <option value="SUPPORTED">Supported</option>
                <option value="REFUTED">Refuted</option>
                <option value="CONTESTED">Contested</option>
              </select>
            </div>

            {loading ? (
              <p className="text-xs text-gray-600 py-4 text-center">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-gray-600 py-4 text-center">No evaluated claims yet.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map(claim => {
                  const s = STATUS_STYLE[claim.status];
                  const hasScore = claim.score != null;
                  return (
                    <div key={claim.id} className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 space-y-2">
                      {/* Top row */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-200 leading-relaxed line-clamp-2">{claim.text}</p>
                          {claim.claimantName && (
                            <p className="mt-0.5 text-[10px] text-gray-600">@{claim.claimantName}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.pill}`}>{s.label}</span>
                          {hasScore && (
                            <span className="text-sm font-bold text-gray-100 tabular-nums">{Math.round(claim.score!)}<span className="text-[10px] font-normal text-gray-600">/100</span></span>
                          )}
                        </div>
                      </div>

                      {/* Reasoning */}
                      {claim.reasoning && (
                        <p className="text-[11px] text-gray-500 italic leading-relaxed">{claim.reasoning}</p>
                      )}

                      {/* Dimension bars */}
                      {(claim.relevance != null || claim.evidence != null || claim.logic != null || claim.impact != null) && (
                        <div className="space-y-1 pt-1 border-t border-gray-800">
                          {claim.relevance != null && <div className="flex items-center gap-2 text-[10px] text-gray-600"><span className="w-14">Relevance</span><ScoreBar value={Math.round(claim.relevance * 10)} color="bg-indigo-500/60" /></div>}
                          {claim.evidence  != null && <div className="flex items-center gap-2 text-[10px] text-gray-600"><span className="w-14">Evidence</span><ScoreBar value={claim.evidence}  color="bg-violet-500/60" /></div>}
                          {claim.logic     != null && <div className="flex items-center gap-2 text-[10px] text-gray-600"><span className="w-14">Logic</span><ScoreBar value={claim.logic}     color="bg-sky-500/60" /></div>}
                          {claim.impact    != null && <div className="flex items-center gap-2 text-[10px] text-gray-600"><span className="w-14">Impact</span><ScoreBar value={claim.impact}    color="bg-amber-500/60" /></div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
