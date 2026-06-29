"use client";

import { useState, useEffect } from "react";
import type { UserPositionEntry, CredScore, DebateTurnState } from "@/lib/types";
import { STANCE_PALETTE, NEUTRAL_PALETTE } from "@/lib/stances";

interface Props {
  proposition: string;
  stances: string[];
  positions: Record<string, UserPositionEntry>;
  myPosition: string | null;
  credibilityScores: Record<string, CredScore>;
  debateTurn?: DebateTurnState | null;
  isOwner?: boolean;
  isAdmin?: boolean;
  isOpinionated?: boolean;
  stanceCooldown?: number;
  myLastSwitchedAt?: number | null;
  onSetPosition: (pos: string) => void;
  onSetDebateMode?: (mode: "open" | "structured") => void;
}

export default function DebateHeader({ proposition, stances, positions, myPosition, credibilityScores, debateTurn, isOwner, isAdmin, isOpinionated, stanceCooldown, myLastSwitchedAt, onSetPosition, onSetDebateMode }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  const stanceScores: Record<string, number> = {};
  const stanceCounts: Record<string, number> = {};
  let total = 0;
  for (const entry of Object.values(positions)) {
    const cred = credibilityScores[entry.userId];
    const pts = cred ? Math.max(0, cred.supported * 2 - cred.refuted * 3) : 1;
    stanceScores[entry.position] = (stanceScores[entry.position] ?? 0) + pts;
    stanceCounts[entry.position] = (stanceCounts[entry.position] ?? 0) + 1;
    total += pts;
  }

  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  useEffect(() => {
    if (!stanceCooldown || !myLastSwitchedAt) { setCooldownRemaining(0); return; }
    function tick() {
      const rem = Math.max(0, stanceCooldown! - (Date.now() - myLastSwitchedAt!) / 1000);
      setCooldownRemaining(Math.ceil(rem));
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [stanceCooldown, myLastSwitchedAt]);

  // Always render the bar — gray track when no positions yet, colored when there are
  const scoreBar = (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-800">
      {total > 0 && stances.map((stance, i) => {
        const pct = ((stanceScores[stance] ?? 0) / total) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={stance}
            className={`${STANCE_PALETTE[i % STANCE_PALETTE.length].bar} transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        );
      })}
    </div>
  );

  return (
    <div className="border-b border-gray-800 bg-gray-900/60 shrink-0">

      {/* ── Collapsed strip (mobile only) ── */}
      <div className={`md:hidden ${collapsed ? "block" : "hidden"} px-4 py-2 space-y-1.5`}>
        <div className="flex items-center gap-2">
          <p className="flex-1 truncate text-xs text-gray-300">{proposition}</p>
          <button
            onClick={() => setCollapsed(false)}
            className="shrink-0 rounded-full p-1 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Expand debate header"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        {scoreBar}
      </div>

      {/* ── Expanded view (always on desktop, toggled on mobile) ── */}
      <div className={`${collapsed ? "hidden md:block" : "block"} px-4 py-3`}>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Proposition</p>
          {isOpinionated && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                <path fillRule="evenodd" d="M1 8.74c0 .983.713 1.825 1.69 1.943L3 10.698V13.5a.5.5 0 0 0 .724.447L8 11.82l4.276 2.127A.5.5 0 0 0 13 13.5v-2.802l.31-.016A2 2 0 0 0 15 8.74V5a3 3 0 0 0-3-3H4a3 3 0 0 0-3 3v3.74Z" clipRule="evenodd" />
              </svg>
              Opinions · No Veritas Impact
            </span>
          )}
          <button
            onClick={() => setCollapsed(true)}
            className="md:hidden ml-auto shrink-0 rounded-full p-1 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Collapse debate header"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M11.78 9.78a.75.75 0 0 1-1.06 0L8 7.06 5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <p className="text-sm font-medium text-gray-100 leading-snug mb-3 line-clamp-2">{proposition}</p>

        {/* Score bar — always visible, gray when no data */}
        <div className="mb-3">
          {scoreBar}
          {total > 0 && (
            <div className="flex gap-3 mt-1 flex-wrap">
              {stances.map((stance, i) => {
                const pct = total > 0 ? Math.round(((stanceScores[stance] ?? 0) / total) * 100) : 0;
                if (pct === 0 && !stanceCounts[stance]) return null;
                const pal = STANCE_PALETTE[i % STANCE_PALETTE.length];
                return (
                  <span key={stance} className="text-[10px] font-semibold">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${pal.dot} mr-1`} />
                    <span className="text-gray-400">{stance} {pct}%</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Position picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-gray-600 shrink-0">Your stance:</span>
          {cooldownRemaining > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-gray-800 px-2 py-0.5 text-[9px] font-semibold text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
              </svg>
              {cooldownRemaining}s
            </span>
          )}
          {stances.map((stance, i) => {
            const pal = STANCE_PALETTE[i % STANCE_PALETTE.length];
            const isActive = myPosition === stance;
            const count = stanceCounts[stance] ?? 0;
            const locked = cooldownRemaining > 0 && !isActive;
            return (
              <button
                key={stance}
                onClick={() => !locked && onSetPosition(stance)}
                disabled={locked}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isActive ? pal.btn_active : pal.btn_inactive}`}
              >
                {isActive && <span className={`h-1.5 w-1.5 rounded-full ${pal.dot} opacity-80`} />}
                {stance}
                {count > 0 && <span className="opacity-60">·{count}</span>}
              </button>
            );
          })}
          {(() => {
            const isActive = myPosition === "NEUTRAL";
            const count = stanceCounts["NEUTRAL"] ?? 0;
            const locked = cooldownRemaining > 0 && !isActive;
            return (
              <button
                onClick={() => !locked && onSetPosition("NEUTRAL")}
                disabled={locked}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isActive ? NEUTRAL_PALETTE.btn_active : NEUTRAL_PALETTE.btn_inactive}`}
              >
                {isActive && <span className={`h-1.5 w-1.5 rounded-full ${NEUTRAL_PALETTE.dot} opacity-80`} />}
                Neutral
                {count > 0 && <span className="opacity-60">·{count}</span>}
              </button>
            );
          })()}

          {(isOwner || isAdmin) && onSetDebateMode && (
            <button
              onClick={() => onSetDebateMode(debateTurn?.mode === "structured" ? "open" : "structured")}
              className={`ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all ${
                debateTurn?.mode === "structured"
                  ? "border-indigo-500 bg-indigo-600/20 text-indigo-300"
                  : "border-gray-700 text-gray-500 hover:border-indigo-600/40 hover:text-indigo-400"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.575a.75.75 0 0 1-1.12.814L8 11.232l-3.136 2.762a.75.75 0 0 1-1.12-.814l.853-3.576-2.79-2.39a.75.75 0 0 1 .427-1.316l3.663-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
              </svg>
              {debateTurn?.mode === "structured" ? "Structured on" : "Structure"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
