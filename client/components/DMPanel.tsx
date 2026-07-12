"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface DMEntry { name: string; participant1Id: string; participant2Id: string; }
interface UserResult { id: string; username: string; avatarUrl?: string | null; }

// Slide-up messages panel: lists existing DMs and searches for people to start one.
export default function DMPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const router = useRouter();
  const [dms, setDms] = useState<DMEntry[]>([]);
  const [dmUsers, setDmUsers] = useState<UserResult[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${SERVER}/api/lobby?userId=${userId}`)
      .then(r => r.json())
      .then(d => { setDms(d.dms ?? []); setDmUsers(d.users ?? []); })
      .catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [userId]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${SERVER}/api/users/search?q=${encodeURIComponent(search.trim())}&excludeId=${userId}`)
        .then(r => r.json()).then(setResults).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [search, userId]);

  async function openDM(targetId: string) {
    setOpening(targetId);
    try {
      const res = await fetch(`${SERVER}/api/dm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId1: userId, userId2: targetId }),
      });
      const data = await res.json();
      onClose();
      router.push(`/room/${data.name}`);
    } finally { setOpening(null); }
  }

  function partnerOf(dm: DMEntry) {
    const otherId = dm.participant1Id === userId ? dm.participant2Id : dm.participant1Id;
    return dmUsers.find(u => u.id === otherId);
  }

  const showSearch = search.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-gray-700 bg-gray-900 shadow-xl flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-100">Messages</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
          <div className="relative">
            <svg viewBox="0 0 20 20" fill="currentColor" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600 pointer-events-none">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search people…"
              className="w-full rounded-lg bg-gray-800 pl-8 pr-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {showSearch ? (
            results.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-600">No users found</p>
            ) : results.map(u => (
              <button key={u.id} onClick={() => openDM(u.id)} disabled={opening === u.id}
                className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left">
                {u.avatarUrl
                  ? <img src={u.avatarUrl} alt={u.username} className="h-8 w-8 rounded-full object-cover shrink-0" />
                  : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-400">{u.username[0].toUpperCase()}</span>
                }
                <span className="text-sm text-gray-200">{u.username}</span>
                {opening === u.id && <span className="ml-auto text-xs text-gray-600">Opening…</span>}
              </button>
            ))
          ) : dms.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-600">No conversations yet. Search for a user to start one.</p>
          ) : dms.map(dm => {
            const partner = partnerOf(dm);
            if (!partner) return null;
            return (
              <button key={dm.name} onClick={() => { onClose(); router.push(`/room/${dm.name}`); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left">
                {partner.avatarUrl
                  ? <img src={partner.avatarUrl} alt={partner.username} className="h-8 w-8 rounded-full object-cover shrink-0" />
                  : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-400">{partner.username[0].toUpperCase()}</span>
                }
                <span className="text-sm text-gray-200">{partner.username}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
