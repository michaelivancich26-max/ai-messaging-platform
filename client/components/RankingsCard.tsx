"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Trophy, Zap, GraduationCap, Scale, RefreshCw, Megaphone, Flame, type LucideIcon } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export interface Rank { rank: number; total: number }

export interface Standing {
  key: string; label: string; unit: string; blurb: string;
  rank: number | null; total: number | null; value: number | null; detail: string;
}

// Same icons and order as the Community boards, so the two read as one system.
const ICON: Record<string, LucideIcon> = {
  battle: Trophy, rapid: Zap, arena: GraduationCap,
  grounds: Scale, openmind: RefreshCw, persuader: Megaphone, streak: Flame,
};

const ACCENT: Record<string, string> = {
  battle: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  rapid: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  arena: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  grounds: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  openmind: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  persuader: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  streak: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
};

// What it takes to get on a board you're not on yet.
const HINT: Record<string, string> = {
  battle: "Win a ranked 1v1",
  rapid: "Finish a Rapid round",
  arena: "Beat a ranked bot",
  grounds: "Get three claims checked",
  openmind: "Change your mind after a debate",
  persuader: "Change an opponent's mind",
  streak: "Show up two days running",
};

const fmt = (v: number, unit: string) => unit === "pts" ? v.toFixed(1) : String(Math.round(v));
const unitLabel = (v: number, unit: string) =>
  Math.round(v) === 1 && unit.endsWith("s") && unit !== "pts" ? unit.slice(0, -1) : unit;

function Row({ s }: { s: Standing }) {
  const Icon = ICON[s.key] ?? Trophy;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/40">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ACCENT[s.key] ?? ACCENT.battle}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{s.label}</p>
        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
          {s.rank ? (s.detail || s.blurb) : HINT[s.key] ?? "Not ranked yet"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {s.rank && s.total ? (
          <>
            <p className="font-display text-lg font-bold leading-none tabular-nums text-gray-900 dark:text-white">#{s.rank}</p>
            <p className="mt-1 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
              of {s.total} · {fmt(s.value ?? 0, s.unit)} {unitLabel(s.value ?? 0, s.unit)}
            </p>
          </>
        ) : (
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Unranked</p>
        )}
      </div>
    </div>
  );
}

// Every board the site keeps, for one person. This was three ELO ladders read
// off the profile payload; the boards that measure argument quality and changed
// minds existed in Community but nowhere on a profile. Fetched from the boards'
// own SQL, so a profile can never quote a different position from the board.
export function RankingsCard({ userId }: { userId: string }) {
  const [standings, setStandings] = useState<Standing[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    api(`${SERVER}/api/users/${encodeURIComponent(userId)}/standings`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (live) setStandings(Array.isArray(d) ? d : []); })
      .catch(() => { if (live) setStandings([]); });
    return () => { live = false; };
  }, [userId]);

  const ranked = standings?.filter(s => s.rank) ?? [];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Standings</p>
        {standings && standings.length > 0 && (
          <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
            on {ranked.length} of {standings.length} boards
          </span>
        )}
      </div>
      {standings === null ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {[0, 1, 2, 3].map(i => <div key={i} className="shimmer-track h-[3.75rem] rounded-xl bg-gray-100 dark:bg-gray-800" />)}
        </div>
      ) : standings.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">Couldn&rsquo;t load standings.</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {/* Boards they're on first — an unranked row is the least interesting
              thing here, but still worth showing as something to aim at. */}
          {[...standings].sort((a, b) => Number(!!b.rank) - Number(!!a.rank)).map(s => <Row key={s.key} s={s} />)}
        </div>
      )}
    </div>
  );
}
