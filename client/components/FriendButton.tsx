"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { UserPlus, UserCheck, Clock, Check, MessageSquare } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

type Status = "loading" | "none" | "outgoing" | "incoming" | "friends";

// Contextual add/accept/remove control for a single other user, e.g. on a public
// profile. Derives the current relationship from /api/friends and stays live via
// the "friendsUpdate" socket nudge. Every action keys off targetId — sending a
// request to someone who already requested you auto-accepts on the server.
export default function FriendButton({ targetId, targetUsername, className = "" }: {
  targetId: string; targetUsername: string; className?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api(`${SERVER}/api/friends`).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d) { setStatus("none"); return; }
      if (d.friends?.some((p: any) => p.id === targetId)) setStatus("friends");
      else if (d.outgoing?.some((p: any) => p.id === targetId)) setStatus("outgoing");
      else if (d.incoming?.some((p: any) => p.id === targetId)) setStatus("incoming");
      else setStatus("none");
    }).catch(() => setStatus("none"));
  }, [targetId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const s = getSocket();
    const on = () => load();
    s.on("friendsUpdate", on);
    return () => { s.off("friendsUpdate", on); };
  }, [load]);

  const act = async (path: string, body: object) => {
    setBusy(true); setErr(null);
    try {
      const r = await api(`${SERVER}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d?.error ?? "Something went wrong.");
      load();
    } catch { setErr("Network error."); }
    finally { setBusy(false); }
  };

  if (status === "loading") return null;

  const base = "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {status === "none" && (
        <button disabled={busy} onClick={() => act("/api/friends/request", { targetId })}
          className={`${base} bg-brand-green-ink text-white hover:opacity-90`}>
          <UserPlus className="h-4 w-4" /> Add friend
        </button>
      )}
      {status === "outgoing" && (
        <button disabled={busy} onClick={() => act("/api/friends/remove", { targetId })}
          title="Cancel request"
          className={`${base} border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800`}>
          <Clock className="h-4 w-4" /> Requested
        </button>
      )}
      {status === "incoming" && (
        <button disabled={busy} onClick={() => act("/api/friends/request", { targetId })}
          className={`${base} bg-brand-green-ink text-white hover:opacity-90`}>
          <UserCheck className="h-4 w-4" /> Accept request
        </button>
      )}
      {status === "friends" && (
        <>
          <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300`}>
            <Check className="h-4 w-4" /> Friends
          </span>
          <button onClick={() => router.push(`/messages/${encodeURIComponent(targetUsername)}`)}
            className={`${base} border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800`}>
            <MessageSquare className="h-4 w-4" /> Message
          </button>
        </>
      )}
      {err && <span className="text-xs text-red-600 dark:text-red-400">{err}</span>}
    </div>
  );
}
