"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

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
}

export function useLiveMatches(pollMs = 8000) {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    fetch(`${SERVER}/api/live-matches`)
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
    <span className="flex items-center gap-1 rounded-full bg-red-950/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400 ring-1 ring-red-800/50">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
      </span>
      Live
    </span>
  );
}

function Side({ players, stance }: { players: { username: string; elo: number }[]; stance: "affirmative" | "negative" }) {
  const color = stance === "affirmative" ? "text-emerald-400" : "text-red-400";
  return (
    <div className="min-w-0 flex-1">
      <span className={`text-[9px] font-bold uppercase tracking-wider ${color}`}>{stance === "affirmative" ? "For" : "Against"}</span>
      <div className="mt-0.5 space-y-0.5">
        {players.map((p, i) => (
          <p key={i} className="truncate text-xs text-gray-200">{p.username} <span className="text-[10px] text-gray-600">⚡{p.elo}</span></p>
        ))}
      </div>
    </div>
  );
}

function MatchCard({ m, onWatch, compact }: { m: LiveMatch; onWatch: () => void; compact?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900/70 p-4 transition-colors hover:border-gray-700 ${compact ? "w-72 shrink-0" : ""}`}>
      <div className="flex items-center gap-2">
        <LiveDot />
        <span className="rounded-full bg-violet-950/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-violet-800/50">
          {m.type === "team" ? `${m.teamSize}v${m.teamSize}` : "1v1"}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-500">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M8 3C4.5 3 1.7 5.1 1 8c.7 2.9 3.5 5 7 5s6.3-2.1 7-5c-.7-2.9-3.5-5-7-5Zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm0-1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" /></svg>
          {m.viewers}
        </span>
      </div>

      <p className="text-sm font-medium leading-snug text-gray-100 line-clamp-2">&ldquo;{m.topic}&rdquo;</p>

      <div className="flex items-center gap-2">
        <Side players={m.sideA} stance={m.sideAStance} />
        <span className="shrink-0 text-[10px] font-bold text-gray-600">VS</span>
        <Side players={m.sideB} stance={m.sideBStance} />
      </div>

      <button
        onClick={onWatch}
        className="flex items-center justify-center gap-1.5 rounded-xl bg-red-600/90 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M4.5 3.5v9l7-4.5-7-4.5Z" /></svg>
        Watch live
      </button>
    </div>
  );
}

export default function LiveMatches({ variant = "grid" }: { variant?: "grid" | "strip" }) {
  const router = useRouter();
  const { matches, loading } = useLiveMatches();
  const watch = (m: LiveMatch) => router.push(`/room/${m.roomName}?spectate=1`);

  if (variant === "strip") {
    if (loading || matches.length === 0) return null;
    return (
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="mb-3 flex items-center gap-2">
          <LiveDot />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Live Now</span>
          <span className="text-[10px] text-gray-600">{matches.length} match{matches.length === 1 ? "" : "es"}</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mr-6 pr-6 scrollbar-none">
          {matches.map(m => <MatchCard key={m.roomName} m={m} onWatch={() => watch(m)} compact />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      {loading ? (
        <p className="py-16 text-center text-sm text-gray-600">Loading…</p>
      ) : matches.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm font-medium text-gray-400">No live matches right now</p>
          <p className="mt-1 text-xs text-gray-600">When players start ranked 1v1 or team matches, they'll appear here to watch.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map(m => <MatchCard key={m.roomName} m={m} onWatch={() => watch(m)} />)}
        </div>
      )}
    </div>
  );
}
