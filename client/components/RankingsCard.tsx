import { Trophy, Dumbbell, type LucideIcon } from "lucide-react";

export interface Rank { rank: number; total: number }

function RankRow({ Icon, label, sub, elo, rank, hint, accent }: {
  Icon: LucideIcon; label: string; sub: string; elo: number;
  rank: Rank | null; hint: string; accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/40">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${accent}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{sub}</p>
      </div>
      <div className="shrink-0 text-right">
        {rank ? (
          <>
            <p className="font-display text-lg font-bold leading-none tabular-nums text-gray-900 dark:text-white">#{rank.rank}</p>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">of {rank.total} · {elo} ELO</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Unranked</p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{hint}</p>
          </>
        )}
      </div>
    </div>
  );
}

// Where the user sits on the two rating ladders. `null` rank means they're not on
// the board yet (no ranked matches). Shared by the dashboard and public profile.
export function RankingsCard({ elo, arenaElo, competitiveRank, arenaRank }: {
  elo: number; arenaElo: number;
  competitiveRank: Rank | null; arenaRank: Rank | null;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Rankings</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <RankRow Icon={Trophy} label="Battle Grounds" sub="Ranked 1v1" elo={elo} rank={competitiveRank}
          hint="Win a ranked 1v1 to rank"
          accent="bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" />
        <RankRow Icon={Dumbbell} label="Arena" sub="vs AI opponents" elo={arenaElo} rank={arenaRank}
          hint="Beat a ranked bot to rank"
          accent="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" />
      </div>
    </div>
  );
}
