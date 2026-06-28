"use client";

import type { UserPositionEntry, CredScore, DebateTurnState } from "@/lib/types";
import { STANCE_PALETTE, NEUTRAL_PALETTE, getStancePalette } from "@/lib/stances";

interface Props {
  proposition: string;
  stances: string[];          // e.g. ["FOR","AGAINST"] or custom
  positions: Record<string, UserPositionEntry>;
  myPosition: string | null;
  credibilityScores: Record<string, CredScore>;
  debateTurn?: DebateTurnState | null;
  isOwner?: boolean;
  isAdmin?: boolean;
  onSetPosition: (pos: string) => void;
  onSetDebateMode?: (mode: "open" | "structured") => void;
}

export default function DebateHeader({ proposition, stances, positions, myPosition, credibilityScores, debateTurn, isOwner, isAdmin, onSetPosition, onSetDebateMode }: Props) {
  // Credibility-weighted score per stance
  const stanceScores: Record<string, number> = {};
  let total = 0;
  for (const entry of Object.values(positions)) {
    const cred = credibilityScores[entry.userId];
    const pts = cred ? Math.max(0, cred.supported * 2 - cred.refuted * 3) : 1;
    stanceScores[entry.position] = (stanceScores[entry.position] ?? 0) + pts;
    total += pts;
  }

  const stanceCounts: Record<string, number> = {};
  for (const entry of Object.values(positions)) {
    stanceCounts[entry.position] = (stanceCounts[entry.position] ?? 0) + 1;
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900/60 px-4 py-3 shrink-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Proposition</p>
      <p className="text-sm font-medium text-gray-100 leading-snug mb-3 line-clamp-2">{proposition}</p>

      {/* Multi-segment score bar */}
      {total > 0 && (
        <div className="mb-3">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-800">
            {stances.map((stance, i) => {
              const pct = total > 0 ? ((stanceScores[stance] ?? 0) / total) * 100 : 0;
              if (pct === 0) return null;
              const pal = STANCE_PALETTE[i % STANCE_PALETTE.length];
              return <div key={stance} className={`${pal.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />;
            })}
          </div>
          <div className="flex gap-3 mt-1 flex-wrap">
            {stances.map((stance, i) => {
              const pct = total > 0 ? Math.round(((stanceScores[stance] ?? 0) / total) * 100) : 0;
              if (pct === 0 && !stanceCounts[stance]) return null;
              const pal = STANCE_PALETTE[i % STANCE_PALETTE.length];
              return (
                <span key={stance} className={`text-[10px] font-semibold`} >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${pal.dot} mr-1`} />
                  <span className="text-gray-400">{stance} {pct}%</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Position picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-gray-600 shrink-0">Your stance:</span>
        {stances.map((stance, i) => {
          const pal = STANCE_PALETTE[i % STANCE_PALETTE.length];
          const isActive = myPosition === stance;
          const count = stanceCounts[stance] ?? 0;
          return (
            <button
              key={stance}
              onClick={() => onSetPosition(stance)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all ${isActive ? pal.btn_active : pal.btn_inactive}`}
            >
              {isActive && <span className={`h-1.5 w-1.5 rounded-full ${pal.dot} opacity-80`} />}
              {stance}
              {count > 0 && <span className="opacity-60">·{count}</span>}
            </button>
          );
        })}
        {/* Neutral is always available */}
        {(() => {
          const isActive = myPosition === "NEUTRAL";
          const count = stanceCounts["NEUTRAL"] ?? 0;
          return (
            <button
              onClick={() => onSetPosition("NEUTRAL")}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all ${isActive ? NEUTRAL_PALETTE.btn_active : NEUTRAL_PALETTE.btn_inactive}`}
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
  );
}
