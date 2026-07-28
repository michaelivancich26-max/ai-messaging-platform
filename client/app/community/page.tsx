"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ProBadge } from "@/components/ProBadge";
import { Trophy, Medal, Search, MessagesSquare, Radio, Zap, Scale, GraduationCap, Flame, RefreshCw, Megaphone, type LucideIcon } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface BoardMeta { key: string; label: string; unit: string; blurb: string }
interface Row { id: string; username: string; isPro: boolean; value: number; detail: string; rank: number }
interface BoardData { board: string; label: string; unit: string; blurb: string; total: number; rows: Row[]; me: Row | null }
interface Found { id: string; username: string; avatarUrl: string | null }

// Icons are per board rather than generic, so the chips are scannable at a
// glance instead of seven identical trophies.
const ICON: Record<string, LucideIcon> = {
  battle: Trophy, rapid: Zap, arena: GraduationCap,
  grounds: Scale, openmind: RefreshCw, persuader: Megaphone, streak: Flame,
};

// Empty-state copy per board: what you'd have to do to appear on it.
const HOW_TO_JOIN: Record<string, string> = {
  battle: "Win a ranked 1v1 in Battle Grounds.",
  rapid: "Finish a Rapid Fire round.",
  arena: "Win a ranked practice match in Training Grounds.",
  grounds: "Make three claims that get checked in a debate.",
  openmind: "Revise a position after arguing it — the deck asks you afterwards.",
  persuader: "Change an opponent's mind in a debate.",
  streak: "Show up two days running.",
};

function rankStyle(rank: number) {
  if (rank === 1) return { ring: "ring-amber-300 dark:ring-amber-500/40", text: "text-amber-600 dark:text-amber-400", Icon: Trophy };
  if (rank === 2) return { ring: "ring-gray-300 dark:ring-gray-600", text: "text-gray-500 dark:text-gray-300", Icon: Medal };
  if (rank === 3) return { ring: "ring-orange-300 dark:ring-orange-500/40", text: "text-orange-600 dark:text-orange-400", Icon: Medal };
  return { ring: "ring-transparent", text: "text-gray-500 dark:text-gray-400", Icon: null };
}

// ELO and counts are whole numbers; the Grounds Score carries one decimal.
const fmt = (v: number, unit: string) => unit === "pts" ? v.toFixed(1) : String(Math.round(v));

// "1 minds" reads as a bug. pts and elo are already unit names, not plurals.
const unitLabel = (v: number, unit: string) =>
  Math.round(v) === 1 && unit.endsWith("s") && unit !== "pts" ? unit.slice(0, -1) : unit;

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

  const [boards, setBoards] = useState<BoardMeta[] | null>(null);
  const [active, setActive] = useState("battle");
  // Boards already fetched, so flipping back to one is instant rather than a
  // second spinner over data that hasn't changed.
  const [cache, setCache] = useState<Record<string, BoardData>>({});
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api(`${SERVER}/api/leaderboards`).then(r => (r.ok ? r.json() : []))
      .then(d => setBoards(Array.isArray(d) ? d : [])).catch(() => setBoards([]));
  }, []);

  const load = useCallback((key: string) => {
    if (cache[key]) return;
    setLoading(true);
    api(`${SERVER}/api/leaderboards/${key}?limit=25`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCache(c => ({ ...c, [key]: d })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cache]);

  useEffect(() => { load(active); }, [active, load]);

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

  const data = cache[active];
  const meShown = !!data?.me && data.rows.some(r => r.id === data.me!.id);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 md:py-8">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Community</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:text-3xl">Find your people</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            Search for other debaters, see who&rsquo;s leading every board, and jump into the rooms where the arguments are happening.
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
              className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 shadow-card outline-none transition-colors placeholder:text-gray-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-400 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/50"
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
                        className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60">
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

        {/* ── Leaderboards ──────────────────────────────────────────────────
             Every ladder the site keeps, in one place. Ratings sat on three
             separate pages and the character boards existed only as rows in a
             table nobody could see. */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <Trophy className="h-4 w-4 text-amber-500" aria-hidden /> Leaderboards
          </h2>

          {/* Board picker. Scrolls sideways on a phone rather than wrapping into
              a three-row block above the table. */}
          <div className="-mx-4 mb-3 overflow-x-auto px-4 pb-1 scrollbar-none">
            <div className="flex w-max gap-2" role="tablist" aria-label="Leaderboards">
              {(boards ?? []).map(b => {
                const Icon = ICON[b.key] ?? Trophy;
                const on = active === b.key;
                return (
                  <button key={b.key} role="tab" aria-selected={on} onClick={() => setActive(b.key)}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${on
                      ? "bg-indigo-600 text-white shadow-card"
                      : "border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60"}`}>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {b.label}
                  </button>
                );
              })}
              {boards === null && [0, 1, 2, 3].map(i => (
                <div key={i} className="shimmer-track h-11 w-32 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          </div>

          {data?.blurb && (
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{data.blurb}</p>
          )}

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900">
            {!data && loading ? (
              <div className="space-y-px">
                {[0, 1, 2, 3, 4].map(i => <div key={i} className="shimmer-track h-14 bg-gray-50 dark:bg-gray-900" />)}
              </div>
            ) : !data ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Couldn&rsquo;t load that board.</p>
            ) : data.rows.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Nobody&rsquo;s on this board yet</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-gray-600 dark:text-gray-400">
                  {HOW_TO_JOIN[active] ?? "Play a match to appear here."} You&rsquo;d be first.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.rows.map(u => (
                  <BoardRow key={u.id} u={u} unit={data.unit} me={u.id === myId}
                    onOpen={() => router.push(`/u/${encodeURIComponent(u.username)}`)} />
                ))}
                {/* Your own standing, when you're on the board but past the cut. */}
                {data.me && !meShown && (
                  <BoardRow u={data.me} unit={data.unit} me separated
                    onOpen={() => router.push(`/u/${encodeURIComponent(data.me!.username)}`)} />
                )}
              </ul>
            )}
          </div>

          <p className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-gray-500 dark:text-gray-400">
            <span>{data ? `${data.total} ranked · top 25 shown` : " "}</span>
            {data && !data.me && data.rows.length > 0 && (
              <span>You&rsquo;re not on this one yet — {HOW_TO_JOIN[active]?.toLowerCase()}</span>
            )}
          </p>
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
      </div>
    </div>
  );
}

function BoardRow({ u, unit, me, separated, onOpen }: {
  u: Row; unit: string; me?: boolean; separated?: boolean; onOpen: () => void;
}) {
  const rs = rankStyle(u.rank);
  return (
    <li className={`${separated ? "border-t-4 border-gray-100 dark:border-gray-800" : ""} ${me ? "bg-indigo-50/70 dark:bg-indigo-950/25" : ""}`}>
      <button onClick={onOpen}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60">
        <span className={`flex h-6 w-8 shrink-0 items-center justify-center text-sm font-bold tabular-nums ${rs.text}`}>
          {/* The medal is decorative, so the position still has to be spoken. */}
          {rs.Icon ? <><span className="sr-only">{u.rank}</span><rs.Icon className="h-4 w-4" aria-hidden /></> : u.rank}
        </span>
        <Initial name={u.username} className={`h-9 w-9 shrink-0 ring-2 ${rs.ring}`} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{u.username}</span>
            {u.isPro && <ProBadge inline />}
            {me && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">you</span>}
          </span>
          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{u.detail}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmt(u.value, unit)}</span>
          <span className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{unitLabel(u.value, unit)}</span>
        </span>
      </button>
    </li>
  );
}
