"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// ─── Password Modal ─────────────────────────────────────────────────────────
function PasswordModal({ roomName, onConfirm, onCancel, error }: { roomName: string; onConfirm: (pw: string) => void; onCancel: () => void; error: string }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-indigo-400">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Zm-5 2a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Z" clipRule="evenodd" />
          </svg>
          <h2 className="text-base font-semibold">Private room</h2>
        </div>
        <p className="mb-4 text-sm text-gray-400"><span className="font-medium text-gray-200">#{roomName}</span> requires a password.</p>
        <div className="relative mb-1">
          <input autoFocus type={show ? "text" : "password"} value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && pw) onConfirm(pw); if (e.key === "Escape") onCancel(); }}
            placeholder="Enter password"
            className="w-full rounded-lg bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          <button type="button" onClick={() => setShow(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              {show ? <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /> : <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06L3.28 2.22Z" clipRule="evenodd" />}
            </svg>
          </button>
        </div>
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={() => pw && onConfirm(pw)} disabled={!pw} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">Join</button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Room Modal ──────────────────────────────────────────────────────
function CreateRoomModal({ userId, onClose, onCreate }: { userId: string; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [maxMembers, setMaxMembers] = useState("");
  const [aiPersona, setAiPersona] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true); setError("");
    try {
      const res = await fetch(`${SERVER}/api/rooms`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, isPrivate, password: isPrivate ? password : undefined, maxMembers: maxMembers ? parseInt(maxMembers) : undefined, creatorId: userId, aiPersona: aiPersona.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create room."); return; }
      onCreate(data.name);
    } catch { setError("Could not reach server."); } finally { setCreating(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">Create a room</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Room name <span className="text-red-400">*</span></label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. general" maxLength={40}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Description <span className="text-gray-600">(optional)</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this room for?" maxLength={200} rows={2}
              className="w-full resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Max members <span className="text-gray-600">(optional)</span></label>
            <input type="number" value={maxMembers} onChange={e => setMaxMembers(e.target.value)} placeholder="Unlimited" min={2} max={500}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-gray-800/60 px-4 py-3">
            <div><p className="text-sm font-medium text-gray-200">Private</p><p className="text-xs text-gray-500">Requires a password</p></div>
            <button type="button" onClick={() => { setIsPrivate(v => !v); setPassword(""); }}
              className={`relative h-6 w-11 rounded-full transition-colors ${isPrivate ? "bg-indigo-600" : "bg-gray-700"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isPrivate ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          {isPrivate && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Password <span className="text-red-400">*</span></label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Set a password" maxLength={100}
                  className="w-full rounded-lg bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    {showPw ? <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /> : <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06L3.28 2.22Z" clipRule="evenodd" />}
                  </svg>
                </button>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400 shrink-0">
                <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
              </svg>
              <span className="text-xs font-medium text-gray-300">AI moderator persona <span className="text-gray-600">(optional)</span></span>
            </div>
            <textarea value={aiPersona} onChange={e => setAiPersona(e.target.value)} maxLength={500} rows={2}
              placeholder={"e.g. A sarcastic but fair debate coach who quotes philosophers when correcting mistakes."}
              className="w-full resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-amber-500" />
            <p className="mt-1.5 text-[10px] text-gray-600">Give the AI a character. It will adopt this voice when flagging errors in your room. You can change this later in room settings.</p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" disabled={!name.trim() || (isPrivate && !password) || creating}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
              {creating ? "Creating…" : "Create room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Browse Rooms Panel ──────────────────────────────────────────────────────
interface BrowseRoom {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  creatorId: string | null;
  joined: boolean;
  _count: { messages: number; members: number };
}

function BrowseRooms({ userId, onJoined, onCreateClick }: { userId: string; onJoined: () => void; onCreateClick: () => void }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<BrowseRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [authRoom, setAuthRoom] = useState<BrowseRoom | null>(null);
  const [authError, setAuthError] = useState("");
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${SERVER}/api/rooms/browse?userId=${userId}`)
      .then(r => r.json())
      .then(data => { setRooms(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function joinRoom(room: BrowseRoom) {
    if (room.isPrivate) { setAuthRoom(room); setAuthError(""); return; }
    setJoining(room.id);
    await fetch(`${SERVER}/api/rooms/${room.name}/join`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setJoining(null);
    load();
    onJoined();
    router.push(`/room/${room.name}`);
  }

  async function joinPrivate(password: string) {
    if (!authRoom) return;
    const res = await fetch(`${SERVER}/api/rooms/${authRoom.name}/auth`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, userId }),
    });
    const { ok } = await res.json();
    if (ok) {
      sessionStorage.setItem(`room-pw:${authRoom.name}`, password);
      setAuthRoom(null);
      load();
      onJoined();
      router.push(`/room/${authRoom.name}`);
    } else {
      setAuthError("Incorrect password.");
    }
  }

  const filtered = rooms.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.description?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-1 flex-col min-w-0">
      {/* Header */}
      <div className="flex h-14 items-center gap-4 border-b border-gray-800 px-6">
        <h1 className="text-sm font-semibold text-gray-100">Browse Rooms</h1>
        <div className="ml-auto flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rooms…"
            className="w-52 rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          <button onClick={onCreateClick}
            className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors">
            + Create room
          </button>
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-600">No rooms found.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(room => (
              <div key={room.id} className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 text-xs font-bold ${room.isPrivate ? "text-amber-500" : "text-gray-500"}`}>
                    {room.isPrivate ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Zm-5 2a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Z" clipRule="evenodd" />
                      </svg>
                    ) : "#"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-100">{room.name}</p>
                    {room.description && <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{room.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-600">
                  <span>{room._count.members} member{room._count.members !== 1 ? "s" : ""}</span>
                  <span>{room._count.messages} message{room._count.messages !== 1 ? "s" : ""}</span>
                </div>
                <button
                  onClick={() => room.joined ? router.push(`/room/${room.name}`) : joinRoom(room)}
                  disabled={joining === room.id}
                  className={`w-full rounded-xl py-1.5 text-xs font-semibold transition-colors ${
                    room.joined
                      ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      : "bg-indigo-600 text-white hover:bg-indigo-500"
                  } disabled:opacity-40`}>
                  {joining === room.id ? "Joining…" : room.joined ? "Open" : room.isPrivate ? "Join (private)" : "Join"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {authRoom && (
        <PasswordModal roomName={authRoom.name} error={authError}
          onConfirm={joinPrivate} onCancel={() => { setAuthRoom(null); setAuthError(""); }} />
      )}
    </div>
  );
}

// ─── Main Lobby ─────────────────────────────────────────────────────────────
export default function LobbyPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();

  const [view, setView] = useState<"home" | "browse">("home");
  const [showCreate, setShowCreate] = useState(false);
  const [sidebarKey, setSidebarKey] = useState(0);

  const username = (session?.user as any)?.username ?? session?.user?.name ?? "user";
  const userId: string = (session?.user as any)?.id ?? "";

  if (status === "loading") return (
    <main className="flex h-screen items-center justify-center bg-gray-950"><span className="text-gray-500">Loading…</span></main>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
      <Sidebar key={sidebarKey} onBrowseClick={() => setView("browse")} />

      {view === "browse" ? (
        <BrowseRooms
          userId={userId}
          onJoined={() => setSidebarKey(k => k + 1)}
          onCreateClick={() => { setView("home"); setShowCreate(true); }}
        />
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-600/20 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10 text-indigo-400">
              <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 0 0-1.032-.211 50.89 50.89 0 0 0-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 0 0 2.433 3.984L7.28 21.53A.75.75 0 0 1 6 21v-4.03a48.527 48.527 0 0 1-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979Z" />
              <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 0 0 1.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0 0 15.75 7.5Z" />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-100">Welcome back, {username}</h1>
          <p className="mb-8 text-sm text-gray-500">Join a room or start a DM from the sidebar.</p>
          <div className="flex gap-3">
            <button onClick={() => setView("browse")}
              className="rounded-xl border border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-300 hover:bg-gray-800 transition-colors">
              Browse rooms
            </button>
            <button onClick={() => setShowCreate(true)}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
              + Create a room
            </button>
          </div>
        </main>
      )}

      {showCreate && (
        <CreateRoomModal userId={userId} onClose={() => setShowCreate(false)}
          onCreate={(name) => { setSidebarKey(k => k + 1); router.push(`/room/${name}`); }} />
      )}
    </div>
  );
}
