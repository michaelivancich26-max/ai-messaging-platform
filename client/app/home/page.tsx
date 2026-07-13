"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LiveMatches from "@/components/LiveMatches";
import { GavelIcon } from "@/components/GavelsPill";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

interface Position {
  roomName: string; side: "A" | "B"; label: string;
  shares: number; cost: number; value: number; status: "open" | "settled"; won: boolean | null;
}

const MODES: { href: string; label: string; blurb: string; accent: string; icon: React.ReactNode }[] = [
  { href: "/lobby", label: "Common Grounds", blurb: "Join live rooms", accent: "text-indigo-600 dark:text-indigo-400",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6"><path fillRule="evenodd" d="M10 3c-4.31 0-8 2.69-8 6 0 1.56.83 2.98 2.17 4.04L3 17l3.86-1.6c.98.38 2.05.6 3.14.6 4.31 0 8-2.69 8-6s-3.69-6-8-6Z" clipRule="evenodd" /></svg> },
  { href: "/compete", label: "Battle Grounds", blurb: "1v1, AI judged", accent: "text-violet-600 dark:text-violet-400",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6"><path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h4.017l-1.75 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 14.25 8h-4.017l1.75-6.093Z" /></svg> },
  { href: "/arena", label: "Training Grounds", blurb: "Beat the bots", accent: "text-amber-600 dark:text-amber-400",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6"><path d="M15.5 3H14V2a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v1H4.5A1.5 1.5 0 0 0 3 4.5v1A2.5 2.5 0 0 0 5.5 8h.28A4.01 4.01 0 0 0 9 10.9V13H7a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.1A4.01 4.01 0 0 0 14.22 8h.28A2.5 2.5 0 0 0 17 5.5v-1A1.5 1.5 0 0 0 15.5 3ZM5.5 6.5A.5.5 0 0 1 5 6V5h1v1.5h-.5Zm10 0H15V5h1v1a.5.5 0 0 1-.5.5Z" /></svg> },
  { href: "/learn", label: "Learn", blurb: "Debate theory", accent: "text-teal-600 dark:text-teal-400",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6"><path d="M10.394 2.08a1 1 0 0 0-.788 0l-7 3a1 1 0 0 0 0 1.84L5.25 8.051a.999.999 0 0 1 .356-.257l4-1.714a1 1 0 1 1 .788 1.838L7.667 9.088l1.94.831a1 1 0 0 0 .787 0l7-3a1 1 0 0 0 0-1.838l-7-3ZM3.31 9.397 5 10.12v4.102a8.969 8.969 0 0 0-1.05-.174 1 1 0 0 1-.89-.89 11.115 11.115 0 0 1 .25-3.762ZM9.3 16.573A9.026 9.026 0 0 0 7 14.935v-3.957l1.818.78a3 3 0 0 0 2.364 0l5.508-2.361a11.026 11.026 0 0 1 .25 3.762 1 1 0 0 1-.89.89 8.968 8.968 0 0 0-5.75 2.524 1 1 0 0 1-1.4 0Z" /></svg> },
];

export default function HomePage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";
  const userId: string = (session?.user as any)?.id ?? "";
  const [openBets, setOpenBets] = useState<Position[]>([]);

  useEffect(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/wallet?userId=${userId}`).then(r => r.json())
      .then(d => setOpenBets((d?.positions ?? []).filter((p: Position) => p.status === "open")))
      .catch(() => {});
  }, [userId]);

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-600 text-sm">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8 space-y-8">

        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Welcome back{username ? `, ${username}` : ""}</h1>
          <p className="mt-0.5 text-sm text-gray-500">Watch live debates and back who you think wins.</p>
        </div>

        {/* Live now — bet the board */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">Live now</h2>
            <span className="text-xs text-gray-500 dark:text-gray-600">— bet the board</span>
          </div>
          <LiveMatches variant="grid" />
        </section>

        {/* Your open bets */}
        {openBets.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <GavelIcon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> Your open bets
            </h2>
            <div className="space-y-2">
              {openBets.map((p, i) => {
                const pnl = p.value - p.cost;
                return (
                  <button key={i} onClick={() => router.push(`/room/${p.roomName}?spectate=1`)}
                    className="flex w-full items-center gap-3 rounded-xl bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800 px-4 py-3 text-left hover:ring-gray-300 dark:hover:ring-gray-700 transition-colors">
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${p.side === "A" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300"}`}>{p.label}</span>
                    <span className="text-xs text-gray-500">{p.shares.toFixed(0)} shares</span>
                    <span className="ml-auto text-sm font-semibold text-gray-800 dark:text-gray-200">{money(p.value)}</span>
                    <span className={`text-xs font-semibold ${pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{pnl >= 0 ? "+" : ""}{money(pnl)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Play */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Play</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MODES.map(m => (
              <button key={m.href} onClick={() => router.push(m.href)}
                className="flex flex-col items-start gap-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4 text-left transition-colors hover:border-gray-300 dark:hover:border-gray-700 hover:bg-white dark:hover:bg-gray-900">
                <span className={m.accent}>{m.icon}</span>
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.label}</div>
                  <div className="text-xs text-gray-500">{m.blurb}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
