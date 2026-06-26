"use client";

import { useEffect, useState } from "react";
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

function LockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Zm-5 2a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Z" clipRule="evenodd" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ─── Password modal for joining private rooms ──────────────────────────────
function PasswordModal({ roomName, onConfirm, onCancel }: { roomName: string; onConfirm: (pw: string) => void; onCancel: () => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <LockIcon className="h-5 w-5 text-indigo-400" />
          <h2 className="text-base font-semibold">Private room</h2>
        </div>
        <p className="mb-4 text-sm text-gray-400"><span className="font-medium text-gray-200">#{roomName}</span> requires a password.</p>
        <div className="relative mb-4">
          <input
            autoFocus
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && pw) onConfirm(pw); if (e.key === "Escape") onCancel(); }}
            placeholder="Enter password"
            className="w-full rounded-lg bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
          />
          <button type="button" onClick={() => setShow((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            {show ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                <path d="M10.748 13.93l2.523 2.523a10.013 10.013 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
              </svg>
            )}
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={() => pw && onConfirm(pw)} disabled={!pw}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
            Join
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create room modal ─────────────────────────────────────────────────────
function CreateRoomModal({ onClose, onCreate }: { onClose: () => void; onCreate: (room: Room) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [maxMembers, setMaxMembers] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { data: session } = useSession();
  const userId: string = (session?.user as any)?.id ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`${SERVER}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          isPrivate,
          password: isPrivate ? password : undefined,
          maxMembers: maxMembers ? parseInt(maxMembers) : undefined,
          creatorId: userId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create room."); return; }
      onCreate(data);
    } catch {
      setError("Could not reach server.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">Create a room</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Room name <span className="text-red-400">*</span></label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. general, off-topic" maxLength={40}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
            <p className="mt-1 text-xs text-gray-600">Letters, numbers, hyphens only.</p>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Description <span className="text-gray-600">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this room for?" maxLength={200} rows={2}
              className="w-full resize-none rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          </div>

          {/* Max members */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Max members <span className="text-gray-600">(optional)</span></label>
            <input type="number" value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)}
              placeholder="Unlimited" min={2} max={500}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          </div>

          {/* Private toggle */}
          <div className="flex items-center justify-between rounded-xl bg-gray-800/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-200">Private room</p>
              <p className="text-xs text-gray-500">Requires a password to join</p>
            </div>
            <button type="button" onClick={() => { setIsPrivate((v) => !v); setPassword(""); }}
              className={`relative h-6 w-11 rounded-full transition-colors ${isPrivate ? "bg-indigo-600" : "bg-gray-700"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isPrivate ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* Password field — only when private */}
          {isPrivate && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Password <span className="text-red-400">*</span></label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set a room password" maxLength={100}
                  className="w-full rounded-lg bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPw ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                      <path d="M10.748 13.93l2.523 2.523a10.013 10.013 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-400 hover:bg-gray-800 transition-colors">
              Cancel
            </button>
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

// ─── Main lobby ────────────────────────────────────────────────────────────
export default function LobbyPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [dms, setDMs] = useState<DMRoom[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [authRoom, setAuthRoom] = useState<Room | null>(null);
  const [authError, setAuthError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Room | null>(null);
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
    } catch { /* server may still be starting */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "authenticated" && userId) fetchAll();
  }, [status, userId]);

  function handleRoomClick(room: Room) {
    const isCreator = room.creatorId === userId;
    if (room.isPrivate && !isCreator && !isAdmin) {
      setAuthRoom(room);
      setAuthError("");
    } else {
      router.push(`/room/${room.name}`);
    }
  }

  async function joinPrivateRoom(password: string) {
    if (!authRoom) return;
    const res = await fetch(`${SERVER}/api/rooms/${authRoom.name}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const { ok } = await res.json();
    if (ok) {
      // Store verified password in sessionStorage so the room page can pass it to the socket
      sessionStorage.setItem(`room-pw:${authRoom.name}`, password);
      router.push(`/room/${authRoom.name}`);
    } else {
      setAuthError("Incorrect password.");
    }
  }

  async function openDM(otherUser: User) {
    setShowNewDM(false);
    setDmSearch("");
    try {
      const res = await fetch(`${SERVER}/api/dm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId1: userId, userId2: otherUser.id }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/room/${data.name}`);
    } catch {
      setError("Could not start DM.");
    }
  }

  async function deleteRoom(room: Room) {
    setConfirmDelete(null);
    setDeletingId(room.id);
    try {
      const res = await fetch(`${SERVER}/api/rooms/${room.name}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setRooms((prev) => prev.filter((r) => r.id !== room.id));
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to delete room.");
      }
    } catch {
      setError("Could not reach server.");
    } finally {
      setDeletingId(null);
    }
  }

  function dmPartnerName(dm: DMRoom): string {
    const otherId = dm.participant1Id === userId ? dm.participant2Id : dm.participant1Id;
    return users.find((u) => u.id === otherId)?.username ?? otherId;
  }

  if (status === "loading") {
    return <main className="flex min-h-screen items-center justify-center"><span className="text-gray-500">Loading…</span></main>;
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {username}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Pick a room or message someone</p>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
            Sign out
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Rooms */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-medium text-gray-300">Rooms</span>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              New room
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-gray-500">Loading…</div>
          ) : rooms.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">No rooms yet — create one above.</div>
          ) : (
            <ul>
              {rooms.map((room, i) => (
                <li key={room.id} className={`flex items-center ${i < rooms.length - 1 ? "border-b border-gray-800/60" : ""}`}>
                  <button onClick={() => handleRoomClick(room)}
                    className="flex flex-1 items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors text-left min-w-0">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${room.isPrivate ? "bg-amber-500/20 text-amber-400" : "bg-indigo-500/20 text-indigo-400"}`}>
                      {room.isPrivate ? <LockIcon className="h-4 w-4" /> : "#"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-100">{room.name}</span>
                        {room.isPrivate && <span className="text-xs text-amber-500/80">private</span>}
                        {room.creatorId === userId && <span className="text-xs text-indigo-400">owner</span>}
                        {isAdmin && room.creatorId !== userId && <span className="text-xs text-amber-400">admin</span>}
                        {room.maxMembers && <span className="text-xs text-gray-600">cap {room.maxMembers}</span>}
                      </div>
                      {room.description && <p className="truncate text-xs text-gray-500 mt-0.5">{room.description}</p>}
                    </div>
                    <span className="ml-auto shrink-0 text-xs text-gray-500">{room._count.messages}</span>
                  </button>
                  {(room.creatorId === userId || isAdmin) && (
                    <button onClick={() => setConfirmDelete(room)} disabled={deletingId === room.id}
                      className="mr-3 rounded-lg p-1.5 text-gray-600 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 transition-colors" title="Delete room">
                      {deletingId === room.id ? <SpinnerIcon /> : <TrashIcon />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Direct Messages */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-medium text-gray-300">Direct Messages</span>
            <button onClick={() => { setShowNewDM((v) => !v); setDmSearch(""); }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              New DM
            </button>
          </div>

          {showNewDM && (
            <div className="border-b border-gray-800 bg-gray-950/50">
              <div className="px-3 py-2">
                <input autoFocus value={dmSearch} onChange={(e) => setDmSearch(e.target.value)}
                  placeholder="Search users…"
                  className="w-full rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {(() => {
                  const filtered = users.filter((u) => u.username.toLowerCase().includes(dmSearch.toLowerCase()));
                  if (users.length === 0) return <p className="px-4 py-3 text-sm text-gray-500">No other users yet.</p>;
                  if (filtered.length === 0) return <p className="px-4 py-3 text-sm text-gray-500">No users match "{dmSearch}".</p>;
                  return filtered.map((u) => (
                    <button key={u.id} onClick={() => openDM(u)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left border-b border-gray-800/40 last:border-0">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300">
                        {u.username[0].toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-200">{u.username}</span>
                    </button>
                  ));
                })()}
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-gray-500">Loading…</div>
          ) : dms.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">No DMs yet — start one above.</div>
          ) : (
            <ul>
              {dms.map((dm, i) => (
                <li key={dm.id} className={i < dms.length - 1 ? "border-b border-gray-800/60" : ""}>
                  <button onClick={() => router.push(`/room/${dm.name}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors text-left">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-400">
                      {dmPartnerName(dm)[0]?.toUpperCase()}
                    </span>
                    <span className="font-medium text-gray-100">{dmPartnerName(dm)}</span>
                    <span className="ml-auto text-xs text-gray-500">{dm._count.messages} messages</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreate={(room) => { setRooms((prev) => [{ ...room, _count: { messages: 0 } }, ...prev]); router.push(`/room/${room.name}`); }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${confirmDelete.name}"?`}
          message="All messages will be permanently deleted and everyone in the room will be removed. This cannot be undone."
          confirmLabel="Delete room"
          onConfirm={() => deleteRoom(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {authRoom && (
        <PasswordModal
          roomName={authRoom.name}
          onConfirm={joinPrivateRoom}
          onCancel={() => { setAuthRoom(null); setAuthError(""); }}
        />
      )}
      {authError && <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-red-900/80 px-4 py-2 text-sm text-red-200">{authError}</p>}
    </main>
  );
}
