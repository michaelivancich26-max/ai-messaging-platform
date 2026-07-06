"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface ProfileSnap {
  avatarUrl: string | null;
  bio: string | null;
  credScore: number | null;
  credTotal: number;
  arenaBonus: number;
  debateCount: number;
  arenaWins: number;
  arenaLosses: number;
}

export default function HomePage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";
  const userId: string = (session?.user as any)?.id ?? "";
  const [profile, setProfile] = useState<ProfileSnap | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/users/${userId}/profile`)
      .then(r => r.json())
      .then(d => setProfile({
        avatarUrl: d.avatarUrl ?? null,
        bio: d.bio ?? null,
        credScore: d.cred?.total >= 3 ? d.cred.score : null,
        credTotal: d.cred?.total ?? 0,
        arenaBonus: d.stats?.arenaBonus ?? 0,
        debateCount: d.stats?.debateCount ?? 0,
        arenaWins: d.stats?.arenaWins ?? 0,
        arenaLosses: d.stats?.arenaLosses ?? 0,
      }))
      .catch(() => {});
  }, [userId]);

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-950 text-gray-600 text-sm">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col bg-gray-950">

      {/* Profile header */}
      <div className="shrink-0 border-b border-gray-800/60 pt-safe">
        {/* Top bar — brand + sign out */}
        <div className="flex items-center justify-between px-6 pt-3 pb-2">
          <span className="text-sm font-bold tracking-tight text-gray-400">Veritas</span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Profile strip */}
        <button
          onClick={() => router.push("/dashboard")}
          className="w-full flex items-center gap-4 px-6 pb-4 hover:bg-gray-900/40 transition-colors text-left"
        >
          {/* Avatar */}
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-gray-700 hover:ring-gray-500 transition-all">
            {profile?.avatarUrl
              ? <img src={profile.avatarUrl} alt={username} className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center bg-gray-800 text-lg font-bold text-gray-300">{username[0]?.toUpperCase()}</span>
            }
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-gray-100 truncate">{username}</p>
            {profile?.bio && (
              <p className="mt-0.5 text-xs text-gray-500 truncate">{profile.bio}</p>
            )}
            {/* Stats row */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {/* Veritas score */}
              {profile?.credScore !== null && profile?.credScore !== undefined ? (
                <span className="flex items-center gap-1 text-xs">
                  <span className="font-bold text-emerald-400">
                    {(profile.credScore + profile.arenaBonus).toFixed(1)}
                  </span>
                  <span className="text-gray-600">Veritas</span>
                </span>
              ) : (
                <span className="text-xs text-gray-600">Unrated</span>
              )}
              {profile && profile.debateCount > 0 && (
                <span className="text-xs text-gray-600">
                  {profile.debateCount} {profile.debateCount === 1 ? "debate" : "debates"}
                </span>
              )}
              {profile && (profile.arenaWins + profile.arenaLosses) > 0 && (
                <span className="flex items-center gap-1 text-xs">
                  <span className="font-semibold text-emerald-400">{profile.arenaWins}W</span>
                  <span className="text-gray-700">/</span>
                  <span className="font-semibold text-red-400">{profile.arenaLosses}L</span>
                  <span className="text-gray-600">arena</span>
                </span>
              )}
            </div>
          </div>

          {/* Chevron hint */}
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 shrink-0 text-gray-700">
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Split panel */}
      <div className="flex flex-1 flex-col md:flex-row overflow-y-auto md:overflow-hidden">

        {/* ── Debates ── */}
        <button
          onClick={() => router.push("/lobby")}
          className="group relative flex shrink-0 md:flex-1 flex-col items-center justify-center gap-6 border-b border-gray-800 p-8 text-left transition-colors hover:bg-indigo-950/20 focus:outline-none md:border-b-0 md:border-r"
        >
          <div className="flex flex-col items-center gap-5 max-w-xs">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-950 ring-1 ring-indigo-900/60 transition-all group-hover:ring-indigo-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-indigo-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">Debates</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Join live debates, challenge other users, and let Veritas AI fact-check claims in real time.
              </p>
            </div>
            <ul className="space-y-1.5 self-start text-xs text-gray-600">
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-indigo-500" />Live rooms with real participants</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-indigo-500" />AI fact-checking and claim scoring</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-indigo-500" />Fishbowl, private, and public formats</li>
            </ul>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors group-hover:bg-indigo-500">
              Enter Debates
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          {/* subtle gradient edge */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-indigo-900/40 to-transparent hidden md:block" />
        </button>

        {/* ── Compete ── */}
        <button
          onClick={() => router.push("/compete")}
          className="group relative flex shrink-0 md:flex-1 flex-col items-center justify-center gap-6 border-b border-gray-800 p-8 text-left transition-colors hover:bg-violet-950/10 focus:outline-none md:border-b-0 md:border-r"
        >
          <div className="flex flex-col items-center gap-5 max-w-xs">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-950/60 ring-1 ring-violet-900/60 transition-all group-hover:ring-violet-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-violet-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">Compete</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Post a claim, dare someone to debate you, and climb the ELO leaderboard.
              </p>
            </div>
            <ul className="space-y-1.5 self-start text-xs text-gray-600">
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-violet-500" />Challenge board — post your claim</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-violet-500" />1v1 human debates, AI judged</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-violet-500" />ELO rating and leaderboard</li>
            </ul>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors group-hover:bg-violet-500">
              Enter Compete
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </button>

        {/* ── Arena ── */}
        <button
          onClick={() => router.push("/arena")}
          className="group relative flex shrink-0 md:flex-1 flex-col items-center justify-center gap-6 border-b border-gray-800 p-8 text-left transition-colors hover:bg-amber-950/10 focus:outline-none md:border-b-0 md:border-r"
        >
          <div className="flex flex-col items-center gap-5 max-w-xs">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-950/60 ring-1 ring-amber-900/60 transition-all group-hover:ring-amber-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-amber-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">Arena</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Challenge AI debate bots at five difficulty levels, from fumbling novice to tournament-level grandmaster.
              </p>
            </div>
            <ul className="space-y-1.5 self-start text-xs text-gray-600">
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-amber-500" />10 opponents across 5 tiers</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-amber-500" />Instant private 1-on-1 matches</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-amber-500" />Debate any topic you choose</li>
            </ul>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors group-hover:bg-amber-500">
              Enter Arena
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </button>

        {/* ── Learn ── */}
        <button
          onClick={() => router.push("/learn")}
          className="group relative flex shrink-0 md:flex-1 flex-col items-center justify-center gap-6 p-8 text-left transition-colors hover:bg-teal-950/10 focus:outline-none"
        >
          <div className="flex flex-col items-center gap-5 max-w-xs">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-950/60 ring-1 ring-teal-900/60 transition-all group-hover:ring-teal-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-teal-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">Learn</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Master debate theory — fallacies, argument structures, tactics, and rebuttal techniques.
              </p>
            </div>
            <ul className="space-y-1.5 self-start text-xs text-gray-600">
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-teal-500" />4 series, 19 lessons with quizzes</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-teal-500" />Fallacies, structures, tactics, rebuttals</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-teal-500" />Practice each concept in the Arena</li>
            </ul>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors group-hover:bg-teal-500">
              Enter Learn
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </button>
      </div>

      {/* Bottom bar */}
      <div className="flex shrink-0 items-center justify-center border-t border-gray-800/60 py-2.5 pb-safe">
        <p className="text-[10px] text-gray-700">Tap your profile above to open Dashboard</p>
      </div>
    </div>
  );
}
