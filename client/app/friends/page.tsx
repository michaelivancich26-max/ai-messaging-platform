"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { Users, Search, UserPlus, Check, X, Clock, MessageSquare } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Person { id: string; username: string; avatarUrl: string | null; online?: boolean }
interface Incoming extends Person { requestId: string; createdAt: string }
interface FriendsData { friends: Person[]; incoming: Incoming[]; outgoing: Person[] }
interface Found { id: string; username: string; avatarUrl: string | null }

function Avatar({ p, online }: { p: { username: string; avatarUrl: string | null }; online?: boolean }) {
  return (
    <span className="relative shrink-0">
      {p.avatarUrl
        ? <img src={p.avatarUrl} alt={p.username} className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-300 dark:ring-gray-700" />
        : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-700 ring-1 ring-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600">{p.username[0]?.toUpperCase()}</span>}
      {online !== undefined && (
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-gray-950 ${online ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`} title={online ? "Online" : "Offline"} />
      )}
    </span>
  );
}

export default function FriendsPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const myId: string = (session?.user as any)?.id ?? "";

  const [data, setData] = useState<FriendsData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(() => {
    api(`${SERVER}/api/friends`).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setData({ friends: d.friends ?? [], incoming: d.incoming ?? [], outgoing: d.outgoing ?? [] }); })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live-refresh when the other side acts (request/accept/remove).
  useEffect(() => {
    const s = getSocket();
    const on = () => load();
    s.on("friendsUpdate", on);
    return () => { s.off("friendsUpdate", on); };
  }, [load]);

  // Debounced username search with an out-of-order-response guard.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestReq = useRef(0);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    const myReq = ++latestReq.current;
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

  const act = async (path: string, body: object) => {
    setNotice(null);
    try {
      const r = await api(`${SERVER}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setNotice(d?.error ?? "Something went wrong.");
      load();
    } catch { setNotice("Network error — try again."); }
  };

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  // Ids already connected in some way — so search results show the right action.
  const relatedIds = new Map<string, "friends" | "outgoing" | "incoming">();
  data?.friends.forEach(p => relatedIds.set(p.id, "friends"));
  data?.outgoing.forEach(p => relatedIds.set(p.id, "outgoing"));
  data?.incoming.forEach(p => relatedIds.set(p.id, "incoming"));

  const incoming = data?.incoming ?? [];
  const friends = data?.friends ?? [];
  const outgoing = data?.outgoing ?? [];

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:py-8">
        <header>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand-green-ink dark:text-brand-green">
            <Users className="h-4 w-4" aria-hidden /> Friends
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:text-3xl">Your circle</h1>
        </header>

        {notice && (
          <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
            {notice}
          </div>
        )}

        {/* Add friends */}
        <section>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Add a friend by username…" aria-label="Search debaters by username"
              className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 shadow-card outline-none transition-colors placeholder:text-gray-400 focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500" />
          </div>
          {query.trim() && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900">
              {searching && results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No debaters found for &ldquo;{query.trim()}&rdquo;.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {results.map(u => {
                    const rel = relatedIds.get(u.id);
                    return (
                      <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                        <button onClick={() => router.push(`/u/${encodeURIComponent(u.username)}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Avatar p={u} />
                          <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{u.username}</span>
                        </button>
                        {rel === "friends" ? (
                          <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">Friends</span>
                        ) : rel === "outgoing" ? (
                          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">Requested</span>
                        ) : (
                          <button onClick={() => act("/api/friends/request", { targetId: u.id })}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-green-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90">
                            <UserPlus className="h-4 w-4" />{rel === "incoming" ? "Accept" : "Add"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Incoming requests */}
        {incoming.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Requests · {incoming.length}</h2>
            <ul className="space-y-2">
              {incoming.map(p => (
                <li key={p.requestId} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-card dark:border-gray-800 dark:bg-gray-900">
                  <button onClick={() => router.push(`/u/${encodeURIComponent(p.username)}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar p={p} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{p.username}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">wants to be friends</span>
                    </span>
                  </button>
                  <button onClick={() => act("/api/friends/respond", { requestId: p.requestId, accept: true })}
                    aria-label={`Accept ${p.username}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-green-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90">
                    <Check className="h-4 w-4" /> Accept
                  </button>
                  <button onClick={() => act("/api/friends/respond", { requestId: p.requestId, accept: false })}
                    aria-label={`Decline ${p.username}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-300 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Friends */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Friends · {friends.length}</h2>
          {friends.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white/50 px-4 py-10 text-center dark:border-gray-700 dark:bg-gray-900/30">
              <Users className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">No friends yet — search above to add someone.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {friends.map(p => (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-card dark:border-gray-800 dark:bg-gray-900">
                  <button onClick={() => router.push(`/u/${encodeURIComponent(p.username)}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar p={p} online={p.online} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{p.username}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{p.online ? "Online" : "Offline"}</span>
                    </span>
                  </button>
                  <button onClick={() => router.push(`/messages/${encodeURIComponent(p.username)}`)}
                    aria-label={`Message ${p.username}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-300 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                    <MessageSquare className="h-4 w-4" />
                  </button>
                  <button onClick={() => act("/api/friends/remove", { targetId: p.id })}
                    aria-label={`Remove ${p.username}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-300 text-gray-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Sent (pending outgoing) */}
        {outgoing.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Sent · {outgoing.length}</h2>
            <ul className="space-y-2">
              {outgoing.map(p => (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-card dark:border-gray-800 dark:bg-gray-900">
                  <button onClick={() => router.push(`/u/${encodeURIComponent(p.username)}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar p={p} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{p.username}</span>
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Clock className="h-3 w-3" /> Pending</span>
                    </span>
                  </button>
                  <button onClick={() => act("/api/friends/remove", { targetId: p.id })}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
