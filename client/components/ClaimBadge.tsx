"use client";

import { useState } from "react";
import type { ClaimInfo } from "@/lib/types";

interface Props {
  claim: ClaimInfo;
  canChallenge: boolean;
  onChallenge: (claimId: string) => void;
}

const VERDICT_STYLES = {
  PENDING:   { pill: "bg-gray-200/60 dark:bg-gray-700/60 text-gray-600 dark:text-gray-400 border-gray-300/40 dark:border-gray-600/40",  icon: "⏳", label: "Checking…" },
  SUPPORTED: { pill: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", icon: "✓", label: "Supported" },
  REFUTED:   { pill: "bg-red-500/20    text-red-700 dark:text-red-300    border-red-500/30",        icon: "✗", label: "Refuted"   },
  CONTESTED: { pill: "bg-amber-500/20  text-amber-700 dark:text-amber-300  border-amber-500/30",      icon: "~", label: "Contested" },
};

export default function ClaimBadge({ claim, canChallenge, onChallenge }: Props) {
  const [expanded, setExpanded] = useState(false);
  const s = VERDICT_STYLES[claim.status];

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => claim.reasoning && setExpanded(v => !v)}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${s.pill} ${claim.reasoning ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
        >
          <span>{s.icon}</span>
          <span>{s.label}</span>
          {claim.status !== "PENDING" && claim.reasoning && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className={`h-3 w-3 opacity-60 transition-transform ${expanded ? "rotate-180" : ""}`}>
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {claim.status !== "PENDING" && claim.score != null && (
          <span className="rounded-full border border-gray-300 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/50 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:text-gray-400 tabular-nums">
            {Math.round(claim.score)}<span className="font-normal text-gray-500 dark:text-gray-600">/100</span>
          </span>
        )}
        {claim.status !== "PENDING" && canChallenge && (
          <button
            onClick={() => onChallenge(claim.id)}
            className="rounded-full border border-gray-300 dark:border-gray-700 px-2 py-0.5 text-[10px] text-gray-500 hover:border-gray-300 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Challenge{claim.challengeCount > 0 ? ` · ${claim.challengeCount}` : ""}
          </button>
        )}
      </div>

      {expanded && claim.reasoning && (
        <p className="ml-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed max-w-sm">{claim.reasoning}</p>
      )}
    </div>
  );
}
