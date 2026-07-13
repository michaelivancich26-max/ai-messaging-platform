"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function GavelIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M3 2.75A.75.75 0 0 1 3.75 2h8.5a.75.75 0 0 1 .53 1.28l-3.1 3.1 3.1 3.1a.75.75 0 0 1-.53 1.28h-8.5A.75.75 0 0 1 3 11.25V2.75Z" />
      <path d="M7.25 12.5h1.5V15h-1.5z" />
    </svg>
  );
}

// Persistent Gavels balance chip that links to the betting hub and updates live.
export default function GavelsPill({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id ?? "";
  const [gavels, setGavels] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/wallet?userId=${userId}`).then((r) => r.json()).then((d) => {
      if (typeof d?.gavels === "number") setGavels(d.gavels);
    }).catch(() => {});
    const socket = getSocket();
    const onGavels = (d: { gavels: number }) => setGavels(d.gavels);
    socket.on("gavelsUpdate", onGavels);
    return () => { socket.off("gavelsUpdate", onGavels); };
  }, [userId]);

  if (!userId) return null;

  return (
    <button
      onClick={() => router.push("/bets")}
      title="Betting Grounds"
      className={`flex items-center gap-1.5 rounded-full bg-amber-500/10 font-semibold text-amber-700 dark:text-amber-300 ring-1 ring-amber-700/40 transition-colors hover:bg-amber-500/20 ${compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"}`}
    >
      <GavelIcon />
      {gavels == null ? "…" : money(gavels)}
      {!compact && <span className="text-amber-500/70">Gavels</span>}
    </button>
  );
}
