"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Room {
  id: string;
  name: string;
  createdAt: string;
  _count: { messages: number };
}

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export default function LobbyPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  const username = (session?.user as any)?.username ?? session?.user?.name ?? "user";

  async function fetchRooms() {
    try {
      const res = await fetch(`${SERVER}/api/rooms`);
      const data = await res.json();
      setRooms(data);
    } catch {
      // server may still be starting
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "authenticated") fetchRooms();
  }, [status]);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`${SERVER}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) { setError("Failed to create room."); return; }
      const room = await res.json();
      router.push(`/room/${room.name}`);
    } catch {
      setError("Could not reach server.");
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading") {
    return <main className="flex min-h-screen items-center justify-center"><span className="text-gray-500">Loading…</span></main>;
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {username}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Pick a room or create a new one</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Room list */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-medium text-gray-300">Rooms</span>
            <button
              onClick={() => { setShowCreate((v) => !v); setError(""); setNewName(""); }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              New room
            </button>
          </div>

          {showCreate && (
            <form onSubmit={createRoom} className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-950/50">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="room-name"
                maxLength={40}
                className="flex-1 rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={!newName.trim() || creating}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </form>
          )}

          {error && <p className="px-4 py-2 text-xs text-red-400">{error}</p>}

          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500">Loading rooms…</div>
          ) : rooms.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">No rooms yet — create one above.</div>
          ) : (
            <ul>
              {rooms.map((room, i) => (
                <li key={room.id}>
                  <button
                    onClick={() => router.push(`/room/${room.name}`)}
                    className={`flex w-full items-center justify-between px-4 py-3 hover:bg-gray-800 transition-colors text-left ${i < rooms.length - 1 ? "border-b border-gray-800/60" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-bold text-indigo-400">
                        #
                      </span>
                      <span className="font-medium text-gray-100">{room.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{room._count.messages} messages</span>
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
