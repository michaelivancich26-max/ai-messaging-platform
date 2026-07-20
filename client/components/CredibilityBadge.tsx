"use client";

import { useState } from "react";
import { Check, X } from "@/lib/icons";
import type { CredScore } from "@/lib/types";

interface Props {
  score: CredScore;
}

export default function CredibilityBadge({ score }: Props) {
  const [hovered, setHovered] = useState(false);
  const { supported, refuted, contested, total } = score;

  if (total < 3) return null;

  const accuracy = total > 0 ? Math.round((supported / total) * 100) : 0;
  const tier =
    accuracy >= 80 ? "reliable"
    : accuracy >= 50 ? "mixed"
    : "disputed";

  // Unified credibility tier scale — same colors as the Grounds Score panel.
  const style = {
    reliable: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    mixed:    "bg-amber-500/20  text-amber-700 dark:text-amber-300  border-amber-500/30",
    disputed: "bg-red-500/20    text-red-700 dark:text-red-400    border-red-500/30",
  }[tier];

  return (
    <span className="relative inline-block">
      <span
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums cursor-default ${style}`}
      >
        {tier === "reliable" && <Check className="h-3 w-3 shrink-0" aria-hidden />}
        {tier === "mixed" && <span aria-hidden>~</span>}
        {tier === "disputed" && <X className="h-3 w-3 shrink-0" aria-hidden />}
        {`${accuracy}%`}
      </span>
      {hovered && (
        <span className="absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 shadow-elevated dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          <span className="block font-semibold text-gray-900 dark:text-gray-100 mb-1">Credibility</span>
          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5 shrink-0" aria-hidden /><span>{supported} supported</span></span>
          <span className="flex items-center gap-1 text-red-700 dark:text-red-400"><X className="h-3.5 w-3.5 shrink-0" aria-hidden /><span>{refuted} refuted</span></span>
          <span className="block text-amber-700 dark:text-amber-400">~ {contested} contested</span>
        </span>
      )}
    </span>
  );
}
