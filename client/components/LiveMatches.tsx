"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Zap } from "@/lib/icons";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
const pct = (p: number) => `${Math.round(p * 100)}%`;

export interface LiveMatch {
  type: "1v1" | "team";
  roomName: string;
  topic: string;
  teamSize: number;
  sideAStance: "affirmative" | "negative";
  sideBStance: "affirmative" | "negative";
  sideA: { username: string; elo: number }[];
  sideB: { username: string; elo: number }[];
  participantIds: string[];
  viewers: number;
  startedAt: string;
  priceA: number;
  priceB: number;
  labelA: string | null;
  labelB: string | null;
}

export function useLiveMatches(pollMs = 8000) {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    api(`${SERVER}/api/live-matches`)
      .then(r => r.json())
      .then(d => { setMatches(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);
  return { matches, loading, reload: load };
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600 ring-1 ring-red-200 dark:bg-red-950/60 dark:text-red-400 dark:ring-red-900/60">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
      </span>
      Live
    </span>
  );
}

function Side({ players, stance }: { players: { username: string; elo: number }[]; stance: "affirmative" | "negative" }) {
  const color = stance === "affirmative" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400";
  return (
    <div className="min-w-0 flex-1">
      <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{stance === "affirmative" ? "For" : "Against"}</span>
      <div className="mt-0.5 space-y-0.5">
        {players.map((p, i) => (
          <p key={i} className="truncate text-xs text-gray-800 dark:text-gray-200">{p.username} <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 dark:text-gray-400"><Zap className="inline-block h-3 w-3 shrink-0" aria-hidden="true" />{p.elo}</span></p>
        ))}
      </div>
    </div>
  );
}

function MatchCard({ m, onWatch, compact, myId }: { m: LiveMatch; onWatch: () => void; compact?: boolean; myId: string }) {
  const hasBar = m.labelA != null && m.labelB != null;
  const isParticipant = !!myId && m.participantIds.includes(myId);

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 ${compact ? "w-72 shrink-0" : ""}`}>
      <div className="flex items-center gap-2">
        <LiveDot />
        <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {m.type === "team" ? `${m.teamSize}v${m.teamSize}` : "1v1"}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M8 3C4.5 3 1.7 5.1 1 8c.7 2.9 3.5 5 7 5s6.3-2.1 7-5c-.7-2.9-3.5-5-7-5Zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm0-1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" /></svg>
          {m.viewers}
        </span>
      </div>

      <p className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100 line-clamp-2">&ldquo;{m.topic}&rdquo;</p>

      <div className="flex items-center gap-2">
        <Side players={m.sideA} stance={m.sideAStance} />
        <span className="shrink-0 text-[10px] font-bold text-gray-400 dark:text-gray-500">VS</span>
        <Side players={m.sideB} stance={m.sideBStance} />
      </div>

      {hasBar && (
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div className="bg-emerald-500 transition-all duration-500" style={{ width: pct(m.priceA) }} />
            <div className="bg-rose-500 transition-all duration-500" style={{ width: pct(m.priceB) }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">{m.labelA} · {pct(m.priceA)}</span>
            <span className="font-semibold text-rose-700 dark:text-rose-300">{pct(m.priceB)} · {m.labelB}</span>
          </div>
        </div>
      )}

      <button onClick={onWatch}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 active:scale-[0.98] motion-reduce:active:scale-100">
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M4.5 3.5v9l7-4.5-7-4.5Z" /></svg>
        {isParticipant ? "Back to your match" : "Watch live"}
      </button>
    </div>
  );
}

function MatchSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-card dark:border-gray-800 dark:bg-gray-900 ${compact ? "w-72 shrink-0" : ""}`}>
      <div className="flex items-center gap-2">
        <div className="shimmer-track h-4 w-12 rounded-full bg-gray-100 dark:bg-gray-800" />
        <div className="shimmer-track h-4 w-10 rounded-full bg-gray-100 dark:bg-gray-800" />
      </div>
      <div className="shimmer-track h-4 w-full rounded bg-gray-100 dark:bg-gray-800" />
      <div className="shimmer-track h-3.5 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
      <div className="flex gap-2">
        <div className="shimmer-track h-8 flex-1 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="shimmer-track h-8 flex-1 rounded bg-gray-100 dark:bg-gray-800" />
      </div>
      <div className="shimmer-track h-9 w-full rounded-xl bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}

export default function LiveMatches({ variant = "grid" }: { variant?: "grid" | "strip" }) {
  const router = useRouter();
  const { data: session } = useSession();
  const myId: string = (session?.user as any)?.id ?? "";
  const { matches, loading } = useLiveMatches();
  const watch = (m: LiveMatch) => router.push(`/room/${m.roomName}${m.participantIds.includes(myId) ? "" : "?spectate=1"}`);

  if (variant === "strip") {
    if (loading || matches.length === 0) return null;
    return (
      <div className="border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="mb-3 flex items-center gap-2">
          <LiveDot />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Live Now</span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">{matches.length} match{matches.length === 1 ? "" : "es"}</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mr-6 pr-6 scrollbar-none">
          {matches.map(m => <MatchCard key={m.roomName} m={m} onWatch={() => watch(m)} compact myId={myId} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => <MatchSkeleton key={i} />)}
        </div>
      ) : matches.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center animate-fadeIn">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
          </div>
          <div>
            <p className="font-display text-base font-semibold text-gray-900 dark:text-white">No live matches right now</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">When players start ranked 1v1 or team matches, they&rsquo;ll appear here to watch.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map(m => <MatchCard key={m.roomName} m={m} onWatch={() => watch(m)} myId={myId} />)}
        </div>
      )}
    </div>
  );
}
