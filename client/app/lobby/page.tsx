"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import ConfirmModal from "@/components/ConfirmModal";

interface Room {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  creatorId: string | null;
  isPrivate: boolean;
  maxMembers: number | null;
  _count: { messages: number };
}

interface DMRoom {
  id: string;
  name: string;
  participant1Id: string;
  participant2Id: string;
  _count: { messages: number };
}

interface User {
  id: string;
  username: string;
}

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// ─── Icons ─────────────────────────────────────────────────────────────────
function LockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Zm-5 2a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Password Modal ─────────────────────────────────────────────────────────
function PasswordModal({ roomName, onConfirm, onCancel, error }: { roomName: string; onConfirm: (pw: string) => void; onCancel: () => void; error: string }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <LockIcon className="h-5 w-5 text-indigo-400" />
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
              {show
                ? <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                : <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06L3.28 2.22Z" clipRule="evenodd" />
              }
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
function CreateRoomModal({ userId, onClose, onCreate }: { userId: string; onClose: () => void; onCreate: (room: Room) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [maxMembers, setMaxMembers] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true); setError("");
    try {
      const res = await fetch(`${SERVER}/api/rooms`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, isPrivate, password: isPrivate ? password : undefined, maxMembers: maxMembers ? parseInt(maxMembers) : undefined, creatorId: userId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create room."); return; }
      onCreate(data);
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

// ─── Main Lobby ─────────────────────────────────────────────────────────────
export default function LobbyPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [dms, setDMs] = useState<DMRoom[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Section open state
  const [roomsOpen, setRoomsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);
  const [dmSearch, setDmSearch] = useState("");
  const [showNewDM, setShowNewDM] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [authRoom, setAuthRoom] = useState<Room | null>(null);
  const [authError, setAuthError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Room | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const username = (session?.user as any)?.username ?? session?.user?.name ?? "user";
  const userId: string = (session?.user as any)?.id ?? "";
  const isAdmin: boolean = (session?.user as any)?.isAdmin ?? false;

  async function fetchAll() {
    try {
      const res = await fetch(`${SERVER}/api/lobby?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.rooms)) setRooms(data.rooms);
        if (Array.isArray(data.dms)) setDMs(data.dms);
        if (Array.isArray(data.users)) setUsers(data.users);
      }
    } catch { } finally { setLoading(false); }
  }

  useEffect(() => {
    if (status === "authenticated" && userId) fetchAll();
  }, [status, userId]);

  function handleRoomClick(room: Room) {
    if (room.isPrivate && room.creatorId !== userId && !isAdmin) {
      setAuthRoom(room); setAuthError("");
    } else {
      router.push(`/room/${room.name}`);
    }
  }

  async function joinPrivateRoom(password: string) {
    if (!authRoom) return;
    const res = await fetch(`${SERVER}/api/rooms/${authRoom.name}/auth`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const { ok } = await res.json();
    if (ok) { sessionStorage.setItem(`room-pw:${authRoom.name}`, password); router.push(`/room/${authRoom.name}`); }
    else setAuthError("Incorrect password.");
  }

  async function openDM(u: User) {
    setShowNewDM(false); setDmSearch("");
    const res = await fetch(`${SERVER}/api/dm`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId1: userId, userId2: u.id }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/room/${data.name}`);
  }

  async function deleteRoom(room: Room) {
    setConfirmDelete(null); setDeletingId(room.id);
    try {
      const res = await fetch(`${SERVER}/api/rooms/${room.name}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) setRooms(prev => prev.filter(r => r.id !== room.id));
      else { const d = await res.json(); setError(d.error ?? "Failed to delete."); }
    } catch { setError("Could not reach server."); } finally { setDeletingId(null); }
  }

  function dmPartnerName(dm: DMRoom) {
    const otherId = dm.participant1Id === userId ? dm.participant2Id : dm.participant1Id;
    return users.find(u => u.id === otherId)?.username ?? "Unknown";
  }

  if (status === "loading") return (
    <main className="flex h-screen items-center justify-center"><span className="text-gray-500">Loading…</span></main>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">

      {/* ── Sidebar ── */}
      <aside className={`flex flex-col border-r border-gray-800 bg-gray-900 transition-all duration-300 ${collapsed ? "w-14" : "w-64"} shrink-0`}>

        {/* Header */}
        <div className="flex h-14 items-center gap-3 border-b border-gray-800 px-3">
          <button onClick={() => setCollapsed(v => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
            </svg>
          </button>
          {!collapsed && <span className="truncate text-sm font-semibold text-gray-100">Messaging</span>}
        </div>

        {/* Scrollable nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">

          {/* ── Rooms section ── */}
          <div className="mb-1">
            {collapsed ? (
              <button onClick={() => { setCollapsed(false); setRoomsOpen(true); }}
                className="flex w-full items-center justify-center py-2 text-gray-500 hover:text-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Zm3.293 1.293a1 1 0 0 1 1.414 0l3 3a1 1 0 0 1 0 1.414l-3 3a1 1 0 0 1-1.414-1.414L7.586 10 5.293 7.707a1 1 0 0 1 0-1.414Z" clipRule="evenodd" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center px-3 py-1">
                <button onClick={() => setRoomsOpen(v => !v)}
                  className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                    className={`h-3 w-3 transition-transform ${roomsOpen ? "rotate-90" : ""}`}>
                    <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06L7.28 11.78a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                  Rooms
                </button>
                <button onClick={() => setShowCreate(true)}
                  className="ml-auto rounded p-0.5 text-gray-600 hover:text-indigo-400 transition-colors" title="New room">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                  </svg>
                </button>
              </div>
            )}

            {!collapsed && roomsOpen && (
              <ul className="mt-0.5">
                {loading ? (
                  <li className="px-3 py-2 text-xs text-gray-600">Loading…</li>
                ) : rooms.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-gray-600">No rooms yet</li>
                ) : rooms.map(room => (
                  <li key={room.id} className="group flex items-center">
                    <button onClick={() => handleRoomClick(room)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-gray-800 transition-colors text-left">
                      <span className={`shrink-0 text-xs font-bold ${room.isPrivate ? "text-amber-500" : "text-gray-500"}`}>
                        {room.isPrivate ? <LockIcon /> : "#"}
                      </span>
                      <span className="truncate text-sm text-gray-300 group-hover:text-gray-100">{room.name}</span>
                      {room.creatorId === userId && <span className="ml-auto shrink-0 text-[10px] text-indigo-400">you</span>}
                    </button>
                    {(room.creatorId === userId || isAdmin) && (
                      <button onClick={() => setConfirmDelete(room)} disabled={deletingId === room.id}
                        className="mr-1 hidden rounded p-1 text-gray-700 hover:text-red-400 group-hover:block transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── DMs section ── */}
          <div className="mt-2">
            {collapsed ? (
              <button onClick={() => { setCollapsed(false); setDmsOpen(true); }}
                className="flex w-full items-center justify-center py-2 text-gray-500 hover:text-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914Z" />
                  <path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.141 2.841 2.705 2.939.238.015.477.023.716.029v3.027a.75.75 0 0 0 1.28.53l3.012-3.012c.494-.046.986-.102 1.474-.167C19.033 14.438 20 13.162 20 11.72V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0 0 14 6Z" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center px-3 py-1">
                <button onClick={() => setDmsOpen(v => !v)}
                  className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                    className={`h-3 w-3 transition-transform ${dmsOpen ? "rotate-90" : ""}`}>
                    <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06L7.28 11.78a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                  Direct Messages
                </button>
                <button onClick={() => setShowNewDM(v => !v)}
                  className="ml-auto rounded p-0.5 text-gray-600 hover:text-indigo-400 transition-colors" title="New DM">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                  </svg>
                </button>
              </div>
            )}

            {!collapsed && dmsOpen && (
              <>
                {showNewDM && (
                  <div className="px-2 pb-1 pt-1">
                    <input autoFocus value={dmSearch} onChange={e => setDmSearch(e.target.value)}
                      placeholder="Search users…"
                      className="w-full rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
                    <ul className="mt-1 max-h-36 overflow-y-auto">
                      {users
                        .filter(u => u.username.toLowerCase().includes(dmSearch.toLowerCase()))
                        .map(u => (
                          <li key={u.id}>
                            <button onClick={() => openDM(u)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-800 transition-colors text-left">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300">
                                {u.username[0].toUpperCase()}
                              </span>
                              <span className="text-xs text-gray-200">{u.username}</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                <ul className="mt-0.5">
                  {loading ? (
                    <li className="px-3 py-2 text-xs text-gray-600">Loading…</li>
                  ) : dms.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-gray-600">No DMs yet</li>
                  ) : dms.map(dm => (
                    <li key={dm.id}>
                      <button onClick={() => router.push(`/room/${dm.name}`)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-gray-800 transition-colors text-left">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-400">
                          {dmPartnerName(dm)[0]?.toUpperCase()}
                        </span>
                        <span className="truncate text-sm text-gray-300">{dmPartnerName(dm)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </nav>

        {/* Sign out */}
        <div className="border-t border-gray-800 p-2">
          <button onClick={() => signOut({ callbackUrl: "/" })}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors ${collapsed ? "justify-center" : ""}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.068a.75.75 0 1 0-1.064-1.056l-2.5 2.53a.75.75 0 0 0 0 1.056l2.5 2.53a.75.75 0 1 0 1.064-1.056L8.704 10.75H18.25A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span className="text-sm">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        {error && <p className="mb-4 text-xs text-red-400">{error}</p>}
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-600/20 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10 text-indigo-400">
            <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 0 0-1.032-.211 50.89 50.89 0 0 0-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 0 0 2.433 3.984L7.28 21.53A.75.75 0 0 1 6 21v-4.03a48.527 48.527 0 0 1-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979Z" />
            <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 0 0 1.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0 0 15.75 7.5Z" />
          </svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-100">Welcome back, {username}</h1>
        <p className="mb-8 text-sm text-gray-500">Pick a room or DM from the sidebar to start chatting.</p>
        <button onClick={() => { setCollapsed(false); setShowCreate(true); }}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
          + Create a room
        </button>
      </main>

      {/* ── Modals ── */}
      {showCreate && <CreateRoomModal userId={userId} onClose={() => setShowCreate(false)}
        onCreate={(room) => { setRooms(prev => [{ ...room, _count: { messages: 0 } }, ...prev]); router.push(`/room/${room.name}`); }} />}

      {confirmDelete && <ConfirmModal
        title={`Delete "${confirmDelete.name}"?`}
        message="All messages will be permanently deleted and everyone will be removed. This cannot be undone."
        confirmLabel="Delete room"
        onConfirm={() => deleteRoom(confirmDelete)}
        onCancel={() => setConfirmDelete(null)} />}

      {authRoom && <PasswordModal roomName={authRoom.name} error={authError}
        onConfirm={joinPrivateRoom} onCancel={() => { setAuthRoom(null); setAuthError(""); }} />}
    </div>
  );
}
