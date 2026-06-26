"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Room {
  id: string;
  name: string;
  createdAt: string;
  creatorId: string | null;
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

export default function LobbyPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [dms, setDMs] = useState<DMRoom[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const username = (session?.user as any)?.username ?? session?.user?.name ?? "user";
  const userId: string = (session?.user as any)?.id ?? "";
  const isAdmin: boolean = (session?.user as any)?.isAdmin ?? false;

  async function fetchAll() {
    try {
      const [roomsRes, dmsRes, usersRes] = await Promise.all([
        fetch(`${SERVER}/api/rooms`),
        fetch(`${SERVER}/api/dm?userId=${userId}`),
        fetch(`${SERVER}/api/users?excludeId=${userId}`),
      ]);
      setRooms(await roomsRes.json());
      setDMs(await dmsRes.json());
      setUsers(await usersRes.json());
    } catch {
      // server may still be starting
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "authenticated" && userId) fetchAll();
  }, [status, userId]);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`${SERVER}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), creatorId: userId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create room."); return; }
      router.push(`/room/${data.name}`);
    } catch {
      setError("Could not reach server.");
    } finally {
      setCreating(false);
    }
  }

  async function openDM(otherUser: User) {
    setShowNewDM(false);
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
    if (!confirm(`Delete "${room.name}" and all its messages? This cannot be undone.`)) return;
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
            <button onClick={() => { setShowCreate((v) => !v); setError(""); setNewName(""); }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              New room
            </button>
          </div>

          {showCreate && (
            <form onSubmit={createRoom} className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-950/50">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="room-name" maxLength={40}
                className="flex-1 rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
              <button type="submit" disabled={!newName.trim() || creating}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
                {creating ? "Creating…" : "Create"}
              </button>
            </form>
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-gray-500">Loading…</div>
          ) : rooms.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">No rooms yet — create one above.</div>
          ) : (
            <ul>
              {rooms.map((room, i) => (
                <li key={room.id} className={`flex items-center ${i < rooms.length - 1 ? "border-b border-gray-800/60" : ""}`}>
                  <button onClick={() => router.push(`/room/${room.name}`)}
                    className="flex flex-1 items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors text-left">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-bold text-indigo-400">#</span>
                    <div>
                      <span className="font-medium text-gray-100">{room.name}</span>
                      {room.creatorId === userId && <span className="ml-2 text-xs text-indigo-400">owner</span>}
                      {isAdmin && room.creatorId !== userId && <span className="ml-2 text-xs text-amber-400">admin</span>}
                    </div>
                    <span className="ml-auto text-xs text-gray-500">{room._count.messages} messages</span>
                  </button>
                  {(room.creatorId === userId || isAdmin) && (
                    <button onClick={() => deleteRoom(room)} disabled={deletingId === room.id}
                      className="mr-3 rounded-lg p-1.5 text-gray-600 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40 transition-colors" title="Delete room">
                      {deletingId === room.id ? (
                        <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                        </svg>
                      )}
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
            <button onClick={() => setShowNewDM((v) => !v)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              New DM
            </button>
          </div>

          {showNewDM && (
            <div className="border-b border-gray-800 bg-gray-950/50 max-h-48 overflow-y-auto">
              {users.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">No other users yet.</p>
              ) : users.map((u) => (
                <button key={u.id} onClick={() => openDM(u)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left border-b border-gray-800/40 last:border-0">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300">
                    {u.username[0].toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-200">{u.username}</span>
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-gray-500">Loading…</div>
          ) : dms.length === 0 && !showNewDM ? (
            <div className="py-10 text-center text-sm text-gray-500">No messages yet — start one above.</div>
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
    </main>
  );
}
