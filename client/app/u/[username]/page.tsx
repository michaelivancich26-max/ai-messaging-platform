"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MedalsPanel, MedalShowcase, RubricAverages, type Medal, type ClaimAverages } from "@/components/MedalsPanel";
import type { CredScore } from "@/lib/types";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface ProfileData {
  id: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  elo: number;
  stats: {
    debateCount: number; messageCount: number; arenaMatchCount: number;
    arenaWins: number; arenaLosses: number; arenaBonus: number;
    dailyStreak: number; longestStreak: number;
  };
  claimAverages: ClaimAverages;
  medals: Medal[];
  featuredMedals: string[];
  cred?: CredScore;
}

interface MatchItem {
  roomName: string;
  topic: string;
  opponentName: string;
  won: boolean;
  eloAfter: number;
  eloDelta: number;
  verdict: string;
  completedAt: string | null;
  challengerId: string;
  challengedId: string;
}

function StatCard({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-white dark:bg-gray-900 p-4 ring-1 ring-gray-200 dark:ring-gray-800">
      <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</span>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {sub && <span className="text-[10px] text-gray-500 dark:text-gray-400">{sub}</span>}
    </div>
  );
}

function VeritasSummary({ cred, arenaBonus }: { cred: CredScore; arenaBonus: number }) {
  const accuracy = cred.total > 0 ? Math.round((cred.supported / cred.total) * 100) : null;
  const displayScore = (cred.total >= 3 ? cred.score : 0) + arenaBonus;
  const rated = cred.total >= 3 || arenaBonus !== 0;
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800 p-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Grounds Score</p>
      <div className="flex items-end gap-3">
        <span className="text-4xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{rated ? displayScore.toFixed(1) : "—"}</span>
        {accuracy !== null && cred.total >= 3 && <span className="mb-1 text-sm text-gray-500">{accuracy}% accuracy</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-700/30"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{cred.supported} supported</span>
        <span className="flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-900/30 px-2.5 py-1 text-xs text-red-600 dark:text-red-400 ring-1 ring-red-700/30"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{cred.refuted} refuted</span>
        <span className="flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-xs text-gray-500 ring-1 ring-gray-300/30 dark:ring-gray-700/30"><span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />{cred.contested} contested</span>
      </div>
    </div>
  );
}

export default function PublicProfilePage() {
  const { data: session } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const params = useParams();
  const username = String(params.username ?? "");
  const myId: string = (session?.user as any)?.id ?? "";

  const [data, setData] = useState<ProfileData | null>(null);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) return;
    setLoading(true); setNotFound(false);
    fetch(`${SERVER}/api/users/by-name/${encodeURIComponent(username)}/profile`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: ProfileData) => { setData(d); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [username]);

  const profileId = data?.id;
  useEffect(() => {
    if (!profileId) { setMatches([]); return; }
    fetch(`${SERVER}/api/users/${profileId}/matches`)
      .then(r => (r.ok ? r.json() : []))
      .then((m: MatchItem[]) => setMatches(Array.isArray(m) ? m : []))
      .catch(() => setMatches([]));
  }, [profileId]);

  // A viewer who wasn't in the match opens it read-only (spectator); participants see their own result.
  function openMatch(m: MatchItem) {
    const isParticipant = myId === m.challengerId || myId === m.challengedId;
    router.push(`/room/${m.roomName}${isParticipant ? "" : "?spectate=1"}`);
  }

  const isMe = data?.id === myId;
  const memberSince = data?.createdAt
    ? new Date(data.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="flex flex-1 min-w-0 flex-col">
        {/* Top bar */}
        <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 pt-safe">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Profile</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">

            {loading ? (
              <div className="py-20 text-center text-sm text-gray-500">Loading…</div>
            ) : notFound || !data ? (
              <div className="py-20 text-center">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">User not found</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">No player named "{username}".</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800 p-5">
                  <div className="flex items-start gap-5">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full ring-2 ring-gray-300 dark:ring-gray-700">
                      {data.avatarUrl
                        ? <img src={data.avatarUrl} alt={data.username} className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-800 text-2xl font-bold text-gray-600 dark:text-gray-400">{data.username[0]?.toUpperCase()}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.username}</h1>
                        <span className="rounded-full bg-indigo-100 dark:bg-indigo-950/50 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-800/50">⚡{data.elo}</span>
                        {isMe && (
                          <button onClick={() => router.push("/dashboard")} className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">Edit on dashboard →</button>
                        )}
                      </div>
                      {memberSince && <p className="mt-0.5 text-xs text-gray-500">Member since {memberSince}</p>}
                      {data.bio && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{data.bio}</p>}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard value={data.stats.debateCount} label="Debates joined" />
                  <StatCard value={data.stats.arenaMatchCount} label="Bot matches" />
                  <StatCard value={`${data.stats.arenaWins}W ${data.stats.arenaLosses}L`} label="Bot record" />
                  <StatCard value={`${data.stats.dailyStreak}🔥`} label="Day streak" sub={data.stats.longestStreak ? `best ${data.stats.longestStreak}` : undefined} />
                </div>

                {/* Match history — completed 1v1 competitive matches */}
                {matches.length > 0 && (
                  <div className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800 p-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Match history</p>
                    <div className="space-y-2">
                      {matches.map((m) => (
                        <button key={m.roomName} onClick={() => openMatch(m)}
                          className="flex w-full items-center gap-3 rounded-xl bg-gray-50/40 dark:bg-gray-950/40 ring-1 ring-gray-200 dark:ring-gray-800 px-3 py-2.5 text-left hover:ring-gray-300 dark:hover:ring-gray-700 transition-colors">
                          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.won ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>{m.won ? "Win" : "Loss"}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-gray-800 dark:text-gray-200">vs {m.opponentName}</p>
                            <p className="truncate text-[11px] text-gray-500">{m.topic}</p>
                          </div>
                          <span className={`shrink-0 text-xs font-semibold tabular-nums ${m.eloDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{m.eloDelta >= 0 ? "+" : ""}{m.eloDelta}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Veritas */}
                {data.cred && <VeritasSummary cred={data.cred} arenaBonus={data.stats.arenaBonus} />}

                {/* Featured medals */}
                <MedalShowcase medals={data.medals} featuredIds={data.featuredMedals} emptyHint={`${data.username} hasn't earned any medals yet.`} />

                {/* All medals */}
                {data.medals.length > 0 && <MedalsPanel medals={data.medals} />}

                {/* Rubric averages */}
                {data.claimAverages && <RubricAverages avg={data.claimAverages} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
