"use client";

import { useState } from "react";
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

  const style = {
    reliable: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    mixed:    "bg-amber-500/20  text-amber-300  border-amber-500/30",
    disputed: "bg-red-500/20    text-red-300    border-red-500/30",
  }[tier];

  const label = {
    reliable: `✓ ${accuracy}%`,
    mixed:    `~ ${accuracy}%`,
    disputed: `✗ ${accuracy}%`,
  }[tier];

  return (
    <span className="relative inline-block">
      <span
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium cursor-default ${style}`}
      >
        {label}
      </span>
      {hovered && (
        <span className="absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-200 shadow-xl ring-1 ring-gray-700">
          <span className="block font-semibold text-gray-100 mb-1">Credibility</span>
          <span className="block text-emerald-400">✓ {supported} supported</span>
          <span className="block text-red-400">✗ {refuted} refuted</span>
          <span className="block text-amber-400">~ {contested} contested</span>
        </span>
      )}
    </span>
  );
}
