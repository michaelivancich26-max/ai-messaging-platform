"use client";

import { useEffect, useState } from "react";
import type { CredScore } from "@/lib/types";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface UserProfile {
  id: string;
  username: string;
  bio?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  cred?: CredScore | null;
}

interface Props {
  userId: string;
  onClose: () => void;
}

function ScoreBar({ cred }: { cred: CredScore }) {
  const accuracy = cred.total > 0 ? Math.round((cred.supported / cred.total) * 100) : null;
  const rating = cred.total >= 3 ? Math.min(100, Math.round((cred.score / (cred.total * 2)) * 100)) : null;

  // Unified credibility tier scale — same colors as the Grounds Score panel on
  // the dashboard and public profile. Thresholds (80 / 50) are data.
  const tier =
    cred.total < 3              ? { label: "Unrated",  color: "text-gray-600 dark:text-gray-400",       bg: "bg-gray-100 dark:bg-gray-800",          ring: "ring-gray-300/60 dark:ring-gray-700/60" } :
    accuracy !== null && accuracy >= 80 ? { label: "Credible",  color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-950/40", ring: "ring-emerald-600/40" } :
    accuracy !== null && accuracy >= 50 ? { label: "Mixed",     color: "text-amber-700 dark:text-amber-300",     bg: "bg-amber-100 dark:bg-amber-950/40",     ring: "ring-amber-600/40"  } :
                                          { label: "Disputed",  color: "text-red-700 dark:text-red-400",         bg: "bg-red-100 dark:bg-red-950/40",         ring: "ring-red-600/40"     };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Grounds Score</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${tier.bg} ${tier.color} ${tier.ring}`}>
          {tier.label}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <span className="font-display text-3xl font-bold tabular-nums text-gray-900 dark:text-white">
          {cred.total < 3 ? "—" : cred.score.toFixed(1)}
        </span>
        {rating !== null && (
          <span className="mb-0.5 text-xs text-gray-500 dark:text-gray-400">{rating}% relevance-weighted rating</span>
        )}
      </div>

      {accuracy !== null && cred.total >= 1 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span className="text-emerald-700 dark:text-emerald-400">{accuracy}% accuracy</span>
            <span>{cred.total} claim{cred.total !== 1 ? "s" : ""}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex">
            <div className="bg-emerald-500 transition-all" style={{ width: `${accuracy}%` }} />
            <div className="bg-red-500 transition-all" style={{ width: `${cred.total > 0 ? Math.round((cred.refuted / cred.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <span className="flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-600/30">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{cred.supported} supported
        </span>
        <span className="flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400 ring-1 ring-red-600/30">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{cred.refuted} refuted
        </span>
        <span className="flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-400 ring-1 ring-gray-300/40 dark:ring-gray-700/40">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />{cred.contested} contested
        </span>
      </div>
    </div>
  );
}

export default function UserProfileModal({ userId, onClose }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`${SERVER}/api/users/${userId}/profile`)
      .then(r => r.json())
      .then(data => { setProfile(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm mx-4 rounded-2xl border border-gray-200 bg-white shadow-elevated dark:border-gray-800 dark:bg-gray-900 overflow-hidden animate-fadeIn"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
          </svg>
        </button>

        {loading ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="shimmer-track h-16 w-16 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800"><div className="animate-shimmer h-full w-full" /></div>
              <div className="flex-1 space-y-2">
                <div className="shimmer-track h-4 w-28 rounded bg-gray-100 dark:bg-gray-800"><div className="animate-shimmer h-full w-full" /></div>
                <div className="shimmer-track h-3 w-36 rounded bg-gray-100 dark:bg-gray-800"><div className="animate-shimmer h-full w-full" /></div>
              </div>
            </div>
            <div className="shimmer-track h-28 rounded-xl bg-gray-100 dark:bg-gray-800"><div className="animate-shimmer h-full w-full" /></div>
          </div>
        ) : !profile || (profile as any).error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 dark:bg-gray-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-gray-400 dark:text-gray-500"><path d="M15.5 15.5 19 19" /><circle cx="10.5" cy="10.5" r="7" /><path d="M8 10.5h5" /></svg>
            </div>
            <p className="mt-4 font-display text-sm font-bold text-gray-900 dark:text-white">User not found</p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Avatar + username */}
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-gray-300 dark:ring-gray-700">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt={profile.username} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-800 text-xl font-bold text-gray-600 dark:text-gray-400">
                    {profile.username[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-display text-base font-bold tracking-tight text-gray-900 dark:text-white truncate">{profile.username}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </p>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{profile.bio}</p>
            )}

            {/* Grounds Score */}
            {profile.cred && <ScoreBar cred={profile.cred} />}
            {!profile.cred && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40 px-4 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                No credibility data yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
