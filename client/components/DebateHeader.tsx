"use client";

import type { DebatePosition, UserPositionEntry, CredScore } from "@/lib/types";

interface Props {
  proposition: string;
  positions: Record<string, UserPositionEntry>;
  myPosition: DebatePosition | null;
  credibilityScores: Record<string, CredScore>;
  onSetPosition: (pos: DebatePosition) => void;
}

function computeDebateScore(
  positions: Record<string, UserPositionEntry>,
  credibilityScores: Record<string, CredScore>
): { forScore: number; againstScore: number } {
  let forScore = 0;
  let againstScore = 0;
  for (const entry of Object.values(positions)) {
    const cred = credibilityScores[entry.userId];
    const pts = cred ? Math.max(0, cred.supported * 2 - cred.refuted * 3) : 0;
    if (entry.position === "FOR") forScore += pts;
    else if (entry.position === "AGAINST") againstScore += pts;
  }
  return { forScore, againstScore };
}

const POSITION_CONFIG: Record<DebatePosition, { label: string; active: string; inactive: string; dot: string }> = {
  FOR:     { label: "For",     active: "bg-emerald-600 text-white border-emerald-500",   inactive: "border-emerald-700/40 text-emerald-500 hover:bg-emerald-900/20", dot: "bg-emerald-500" },
  AGAINST: { label: "Against", active: "bg-red-600 text-white border-red-500",           inactive: "border-red-700/40 text-red-500 hover:bg-red-900/20",            dot: "bg-red-500"     },
  NEUTRAL: { label: "Neutral", active: "bg-gray-600 text-white border-gray-500",         inactive: "border-gray-700/40 text-gray-500 hover:bg-gray-800",            dot: "bg-gray-500"    },
};

export default function DebateHeader({ proposition, positions, myPosition, credibilityScores, onSetPosition }: Props) {
  const { forScore, againstScore } = computeDebateScore(positions, credibilityScores);
  const total = forScore + againstScore;
  const forPct  = total > 0 ? Math.round((forScore  / total) * 100) : 50;
  const againstPct = 100 - forPct;

  const forCount     = Object.values(positions).filter(p => p.position === "FOR").length;
  const againstCount = Object.values(positions).filter(p => p.position === "AGAINST").length;

  return (
    <div className="border-b border-gray-800 bg-gray-900/60 px-4 py-3 shrink-0">
      {/* Proposition */}
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Proposition</p>
      <p className="text-sm font-medium text-gray-100 leading-snug mb-3 line-clamp-2">{proposition}</p>

      {/* Score bar */}
      {total > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span className="text-emerald-400 font-semibold">FOR {forPct}%</span>
            <span className="text-red-400 font-semibold">{againstPct}% AGAINST</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-800">
            <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${forPct}%` }} />
            <div className="bg-red-500 transition-all duration-500" style={{ width: `${againstPct}%` }} />
          </div>
        </div>
      )}

      {/* Position picker */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-600 shrink-0">Your stance:</span>
        {(["FOR", "AGAINST", "NEUTRAL"] as DebatePosition[]).map(pos => {
          const cfg = POSITION_CONFIG[pos];
          const isActive = myPosition === pos;
          const count = pos === "FOR" ? forCount : pos === "AGAINST" ? againstCount : null;
          return (
            <button
              key={pos}
              onClick={() => onSetPosition(pos)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all ${isActive ? cfg.active : cfg.inactive}`}
            >
              {isActive && <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} opacity-80`} />}
              {cfg.label}
              {count !== null && <span className="opacity-60">·{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
