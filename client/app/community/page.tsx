"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Zap, Trophy, Medal, Search, MessagesSquare, Radio } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface LbRow { id: string; username: string; elo: number; wins: number; losses: number; battleMatches: number }
interface Found { id: string; username: string; avatarUrl: string | null }

function rankStyle(rank: number) {
  if (rank === 1) return { ring: "ring-amber-300 dark:ring-amber-500/40", text: "text-amber-600 dark:text-amber-400", Icon: Trophy };
  if (rank === 2) return { ring: "ring-gray-300 dark:ring-gray-600", text: "text-gray-500 dark:text-gray-300", Icon: Medal };
  if (rank === 3) return { ring: "ring-orange-300 dark:ring-orange-500/40", text: "text-orange-600 dark:text-orange-400", Icon: Medal };
  return { ring: "ring-transparent", text: "text-gray-500 dark:text-gray-400", Icon: null };
}

function Initial({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`flex items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-700 ring-1 ring-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 ${className}`}>
      {name[0]?.toUpperCase()}
    </span>
  );
}

export default function CommunityPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const myId: string = (session?.user as any)?.id ?? "";

  const [board, setBoard] = useState<LbRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api(`${SERVER}/api/leaderboard`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => setBoard(Array.isArray(d) ? d : []))
      .catch(() => setBoard([]));
  }, []);

  // Debounced username search. A monotonic request id guards against out-of-order
  // responses overwriting the results for a newer query.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestReq = useRef(0);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    const myReq = ++latestReq.current;          // invalidates any older in-flight request
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(() => {
      api(`${SERVER}/api/users/search?q=${encodeURIComponent(q)}${myId ? `&excludeId=${myId}` : ""}`)
        .then(r => (r.ok ? r.json() : []))
        .then(d => { if (myReq === latestReq.current) setResults(Array.isArray(d) ? d : []); })
        .catch(() => { if (myReq === latestReq.current) setResults([]); })
        .finally(() => { if (myReq === latestReq.current) setSearching(false); });
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, myId]);

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 md:py-8">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Community</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:text-3xl">Find your people</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            Search for other debaters, see who&rsquo;s leading the ranks, and jump into the rooms where the arguments are happening.
          </p>
        </header>

        {/* Player search */}
        <section>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search debaters by username…"
              aria-label="Search debaters by username"
              className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 shadow-card outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/50"
            />
          </div>
          {query.trim() && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900">
              {searching && results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No debaters found for &ldquo;{query.trim()}&rdquo;.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {results.map(u => (
                    <li key={u.id}>
                      <button onClick={() => router.push(`/u/${encodeURIComponent(u.username)}`)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60">
                        {u.avatarUrl
                          ? <img src={u.avatarUrl} alt={u.username} className="h-9 w-9 rounded-full object-cover ring-1 ring-gray-300 dark:ring-gray-700" />
                          : <Initial name={u.username} className="h-9 w-9" />}
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.username}</span>
                        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">View profile →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Quick destinations */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button onClick={() => router.push("/lobby")}
            className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-indigo-600 dark:bg-gray-800 dark:text-indigo-400"><MessagesSquare className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">Common Grounds</span>
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">Join open debate rooms</span>
            </span>
          </button>
          <button onClick={() => router.push("/watch")}
            className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-red-600 dark:bg-gray-800 dark:text-red-400"><Radio className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">Watch live</span>
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">Spectate matches in progress</span>
            </span>
          </button>
        </section>

        {/* Leaderboard */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <Trophy className="h-4 w-4 text-amber-500" aria-hidden /> Top debaters
          </h2>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900">
            {board === null ? (
              <div className="space-y-px">
                {[0, 1, 2, 3, 4].map(i => <div key={i} className="shimmer-track h-14 bg-gray-50 dark:bg-gray-900" />)}
              </div>
            ) : board.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No ranked debaters yet — be the first to climb the board.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {board.map((u, i) => {
                  const rank = i + 1;
                  const rs = rankStyle(rank);
                  return (
                    <li key={u.id}>
                      <button onClick={() => router.push(`/u/${encodeURIComponent(u.username)}`)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60">
                        <span className={`flex h-6 w-8 shrink-0 items-center justify-center text-sm font-bold tabular-nums ${rs.text}`}>
                          {rs.Icon ? <rs.Icon className="h-4 w-4" /> : rank}
                        </span>
                        <Initial name={u.username} className={`h-9 w-9 ring-2 ${rs.ring}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{u.username}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">{u.wins}W · {u.losses}L</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
                          <Zap className="h-3.5 w-3.5 text-orange-500" aria-hidden />{u.elo}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">Ranked by Battle Grounds ELO · top 25</p>
        </section>
      </div>
    </div>
  );
}
