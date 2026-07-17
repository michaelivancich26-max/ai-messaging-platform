"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export interface Conversation {
  roomName: string;
  partner: { id: string; username: string; avatarUrl?: string | null };
  lastMessage: { content: string; createdAt: string; mine: boolean } | null;
  lastActivity: string;
  unread: number;
}

interface UserResult { id: string; username: string; avatarUrl?: string | null }

function Avatar({ user, className = "h-9 w-9" }: { user: { username: string; avatarUrl?: string | null }; className?: string }) {
  return user.avatarUrl
    ? <img src={user.avatarUrl} alt={user.username} className={`${className} shrink-0 rounded-full object-cover`} />
    : <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-brand-green/15 text-sm font-bold text-brand-green-ink dark:text-brand-green`}>{user.username[0]?.toUpperCase()}</span>;
}

function ConvoSkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="shimmer-track h-9 w-9 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="shimmer-track h-3 w-24 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="shimmer-track h-2.5 w-40 max-w-full rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ConversationList({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!userId) return;
    api(`${SERVER}/api/dm/conversations?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => { setConvos(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  // Refresh counts when the open conversation changes — the thread marks itself read.
  useEffect(() => { load(); }, [pathname, load]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      api(`${SERVER}/api/users/search?q=${encodeURIComponent(search.trim())}&excludeId=${userId}`)
        .then((r) => r.json()).then((d) => setResults(Array.isArray(d) ? d : [])).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [search, userId]);

  const open = (username: string) => { setSearch(""); router.push(`/messages/${encodeURIComponent(username)}`); };
  const activeUser = decodeURIComponent(pathname.split("/messages/")[1] ?? "").toLowerCase();
  const searching = search.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <h1 className="font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Messages</h1>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <div className="relative">
          <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
          </svg>
          <input ref={inputRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…"
            className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 py-2 pl-8 pr-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-brand-green" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {searching ? (
          results.length === 0
            ? <p className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">No users found</p>
            : results.map((u) => (
              <button key={u.id} onClick={() => open(u.username)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800">
                <Avatar user={u} className="h-8 w-8" />
                <span className="text-sm text-gray-800 dark:text-gray-200">{u.username}</span>
              </button>
            ))
        ) : loading ? (
          <div className="animate-fadeIn">
            {[0, 1, 2, 3, 4].map((i) => <ConvoSkeletonRow key={i} />)}
          </div>
        ) : convos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center animate-fadeIn">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902.848.137 1.705.248 2.57.331v3.443a.75.75 0 0 0 1.28.53l3.58-3.579a.78.78 0 0 1 .527-.224 41.202 41.202 0 0 0 5.183-.501c1.437-.232 2.43-1.49 2.43-2.902V5.426c0-1.412-.993-2.67-2.43-2.902A41.289 41.289 0 0 0 10 2Z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="font-display text-sm font-bold text-gray-900 dark:text-white">No conversations yet</p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Search for someone above to start one.</p>
            </div>
          </div>
        ) : convos.map((c) => {
          const active = c.partner.username.toLowerCase() === activeUser;
          return (
            <button key={c.roomName} onClick={() => open(c.partner.username)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${active ? "bg-brand-green/10 dark:bg-brand-green/15" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
              <Avatar user={c.partner} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`truncate text-sm ${c.unread > 0 ? "font-bold text-gray-900 dark:text-gray-100" : "font-medium text-gray-800 dark:text-gray-200"}`}>{c.partner.username}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-gray-500 dark:text-gray-400">{timeAgo(c.lastActivity)}</span>
                </div>
                <p className={`truncate text-xs ${c.unread > 0 ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-400"}`}>
                  {c.lastMessage ? `${c.lastMessage.mine ? "You: " : ""}${c.lastMessage.content}` : "No messages yet"}
                </p>
              </div>
              {c.unread > 0 && (
                <span className="shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{c.unread > 99 ? "99+" : c.unread}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
