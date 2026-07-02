"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ArenaSidebar from "@/components/ArenaSidebar";
import { BOTS, BOT_COLORS, botWinRate, type Bot } from "@/lib/bots";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// ─── Bot Avatar ──────────────────────────────────────────────────────────────

function BotIcon({ id, size }: { id: string; size: number }) {
  const s = size;
  const icons: Record<string, React.ReactNode> = {
    rex: (
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm3.5-9.5c0 .828-.672 1.5-1.5 1.5s-1.5-.672-1.5-1.5.672-1.5 1.5-1.5 1.5.672 1.5 1.5zm-5 0c0 .828-.672 1.5-1.5 1.5S7.5 11.328 7.5 10.5 8.172 9 9 9s1.5.672 1.5 1.5zm6.25 4.5H7.25C7.664 16.596 9.726 18 12 18s4.336-1.404 4.75-3z"/>
      </svg>
    ),
    cass: (
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M12 3L1 9l4 2.18V17h2v-4.82l2 1.09V17c0 2.21 3.134 4 7 4s7-1.79 7-4v-3.73l2-1.09L23 9 12 3zM6.087 15.683C5.422 14.989 5 14.027 5 13v-1.95l7 3.82 7-3.82V13c0 2.21-3.134 4-7 4a8.76 8.76 0 0 1-5.913-1.317z"/>
      </svg>
    ),
    morgan: (
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M12 3C6.477 3 2 7.477 2 13c0 3.478 1.793 6.539 4.5 8.321V22h11v-.679C20.207 19.539 22 16.478 22 13c0-5.523-4.477-10-10-10zm4 15H8v-1l1-1v-3.5l-1-.5V11h8v1.5l-1 .5V16l1 1v1zm-4-9c-1.105 0-2-.895-2-2s.895-2 2-2 2 .895 2 2-.895 2-2 2z"/>
      </svg>
    ),
    vera: (
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-14a6 6 0 1 0 0 12A6 6 0 0 0 12 6zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
      </svg>
    ),
    atlas: (
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
      </svg>
    ),
  };
  return <>{icons[id] ?? icons.cass}</>;
}

function BotAvatar({ bot, large = false }: { bot: Bot; large?: boolean }) {
  const c = BOT_COLORS[bot.color];
  const dim = large ? "h-20 w-20" : "h-14 w-14";
  const iconSize = large ? 36 : 26;
  return (
    <div className={`${dim} rounded-2xl flex items-center justify-center ring-2 ${c.ring} bg-gray-900`}>
      <span className={c.text}>
        <BotIcon id={bot.id} size={iconSize} />
      </span>
    </div>
  );
}

// ─── Star Rating ─────────────────────────────────────────────────────────────

function StarRow({ tier, color }: { tier: number; color: Bot["color"] }) {
  const c = BOT_COLORS[color];
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${i <= tier ? c.star : "text-gray-700"}`}>
          <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
        </svg>
      ))}
    </div>
  );
}

// ─── Bot Card ────────────────────────────────────────────────────────────────

function BotCard({ bot }: { bot: Bot }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [challenging, setChallenging] = useState(false);
  const [error, setError] = useState("");
  const userId: string = (session?.user as any)?.id ?? "";
  const c = BOT_COLORS[bot.color];
  const winRate = botWinRate(bot);

  async function challenge() {
    if (!userId || challenging) return;
    setChallenging(true);
    setError("");
    try {
      const res = await fetch(`${SERVER}/api/bot-rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, botId: bot.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to start match."); setChallenging(false); return; }
      router.push(`/room/${data.name}`);
    } catch {
      setError("Network error. Try again.");
      setChallenging(false);
    }
  }

  return (
    <div className={`flex flex-col rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden transition-all duration-200 hover:border-gray-700 hover:shadow-lg hover:shadow-black/30`}>
      {/* Avatar area */}
      <div className={`flex flex-col items-center gap-3 bg-gradient-to-b ${c.gradient} px-4 py-7`}>
        <BotAvatar bot={bot} large />
        <div className="text-center">
          <h3 className="text-lg font-bold text-white leading-tight">{bot.name}</h3>
          <p className={`text-xs font-medium ${c.text}`}>"{bot.title}"</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Tier */}
        <div className="mb-3 flex items-center justify-between">
          <StarRow tier={bot.tier} color={bot.color} />
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${c.subtext}`}>
            {bot.tierName}
          </span>
        </div>

        {/* Bio */}
        <p className="flex-1 text-xs leading-relaxed text-gray-500">{bot.bio}</p>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-2 border-t border-gray-800 pt-3 text-[10px]">
          <span className="font-semibold text-emerald-400">{bot.wins.toLocaleString()}W</span>
          <span className="text-gray-600">·</span>
          <span className="font-semibold text-red-400">{bot.losses.toLocaleString()}L</span>
          <span className="ml-auto text-gray-600">{winRate}% win rate</span>
        </div>

        {/* Challenge button */}
        {error && <p className="mt-2 text-[10px] text-red-400">{error}</p>}
        <button
          onClick={challenge}
          disabled={challenging || !userId}
          className={`mt-3 w-full rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 ${c.btn}`}
        >
          {challenging ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Starting…
            </span>
          ) : "Challenge"}
        </button>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ArenaPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  return (
    <div className="flex h-full">
      <ArenaSidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      <main className="flex flex-1 flex-col overflow-y-auto bg-gray-950">

        {/* Mobile top bar */}
        <div className="flex min-h-12 shrink-0 items-center border-b border-gray-800 px-4 md:hidden pt-safe">
          <button onClick={() => setMobileSidebarOpen(true)} className="rounded p-1.5 text-gray-400 hover:bg-gray-800">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" /></svg>
          </button>
          <span className="ml-3 text-sm font-semibold text-amber-400">Arena</span>
        </div>

        {/* Hero */}
        <div className="relative shrink-0 border-b border-gray-800 bg-gradient-to-b from-gray-900 via-gray-900/90 to-gray-950 px-6 py-14 text-center">
          {/* decorative glow */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-64 w-96 -translate-x-1/2 rounded-full bg-indigo-500/5 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-xl">
            <div className="mb-5 flex justify-center">
              <div className="rounded-2xl bg-indigo-950 p-4 ring-1 ring-indigo-900/60">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10 text-indigo-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Debate Arena</h1>
            <p className="mt-3 text-base text-gray-400">
              Choose your opponent. Each bot has a unique debating style and difficulty level.
              Send the first message to open any topic — your opponent will respond.
            </p>
            <div className="mt-5 flex items-center justify-center gap-4 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                All bots powered by Claude Haiku
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                1-on-1 private match
              </span>
            </div>
          </div>
        </div>

        {/* Bot grid */}
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Choose your opponent</h2>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <span className="flex h-3 w-3 items-center justify-center">★</span>
              <span>= difficulty</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {BOTS.map((bot) => (
              <BotCard key={bot.id} bot={bot} />
            ))}
          </div>

          {/* Footer note */}
          <p className="mt-10 text-center text-[11px] text-gray-700">
            Bot rooms are private and only visible to you. Win rates are illustrative.
          </p>
        </div>
      </main>
    </div>
  );
}
