"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BOTS, BOT_COLORS, type Bot } from "@/lib/bots";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface RecentMatch {
  name: string;
  botId: string;
}

function StarMini({ tier, color }: { tier: number; color: Bot["color"] }) {
  const c = BOT_COLORS[color];
  return (
    <span className="flex items-center gap-px">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 8 8" fill="currentColor" className={`h-2 w-2 ${i <= tier ? c.star : "text-gray-700"}`}>
          <path d="M4 .5 5 3h2.5L5.5 4.5l.75 2.5L4 5.5 1.75 7l.75-2.5L.5 3H3Z" />
        </svg>
      ))}
    </span>
  );
}

interface Props {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function ArenaSidebar({ mobileOpen, onMobileClose }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [challenging] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/users/${userId}/profile`)
      .then(r => r.json())
      .then(d => setAvatarUrl(d.avatarUrl ?? null))
      .catch(() => {});
    fetch(`${SERVER}/api/lobby?userId=${userId}`)
      .then(r => r.json())
      .then(data => {
        const arenaRooms: RecentMatch[] = (data.rooms ?? [])
          .filter((r: { name: string }) => r.name.startsWith("arena-"))
          .slice(0, 5)
          .map((r: { name: string }) => {
            const parts = r.name.split("-");
            return { name: r.name, botId: parts[1] ?? "rex" };
          });
        setRecentMatches(arenaRooms);
      })
      .catch(() => {});
  }, [userId]);

  function challenge(bot: Bot) {
    router.push(`/arena?challenge=${bot.id}`);
  }

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onMobileClose} />
      )}
      <aside className={`
        flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-900 h-full
        fixed inset-y-0 left-0 z-40 transition-transform duration-300
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        md:relative md:translate-x-0 md:z-auto
      `}>

        {/* Header */}
        <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-gray-800 px-3 pt-safe">
          <button
            onClick={() => router.push("/home")}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
            title="Back to Hub"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
              <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            <span className="text-xs">Hub</span>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Training Grounds</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-amber-500">
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
            </svg>
          </div>
        </div>

        {/* Bot list */}
        <nav className="flex-1 overflow-y-auto py-2">
          <div className="px-3 pb-1 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Opponents</p>
          </div>
          {BOTS.map((bot) => {
            const c = BOT_COLORS[bot.color];
            return (
              <div key={bot.id} className="flex items-center gap-2 px-2 py-1 group">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ${c.ring} bg-gray-900/60`}>
                  <span className={`text-[10px] font-bold ${c.text}`}>{bot.name[0]}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-xs font-medium text-gray-300 truncate">{bot.name}</span>
                  <StarMini tier={bot.tier} color={bot.color} />
                </div>
                <button
                  onClick={() => challenge(bot)}
                  disabled={!!challenging}
                  title={`Challenge ${bot.name}`}
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 ${c.btn}`}
                >
                  {challenging === bot.id ? "…" : "Go"}
                </button>
              </div>
            );
          })}

          {/* Recent matches */}
          {recentMatches.length > 0 && (
            <>
              <div className="mx-3 my-2 border-t border-gray-800" />
              <div className="px-3 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Recent matches</p>
              </div>
              {recentMatches.map((m) => {
                const bot = BOTS.find(b => b.id === m.botId);
                const c = bot ? BOT_COLORS[bot.color] : BOT_COLORS.sky;
                return (
                  <button
                    key={m.name}
                    onClick={() => router.push(`/room/${m.name}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-gray-800 transition-colors"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
                    <span className="truncate text-xs text-gray-500">vs {bot?.name ?? m.botId}</span>
                  </button>
                );
              })}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-800 px-2 pt-2 pb-safe space-y-0.5">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
          >
            {avatarUrl
              ? <img src={avatarUrl} alt={username} className="h-7 w-7 rounded-full object-cover shrink-0 ring-1 ring-gray-700" />
              : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300 ring-1 ring-gray-600">{username[0]?.toUpperCase()}</span>
            }
            <span className="truncate text-sm font-medium">{username}</span>
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.068a.75.75 0 1 0-1.064-1.056l-2.5 2.53a.75.75 0 0 0 0 1.056l2.5 2.53a.75.75 0 1 0 1.064-1.056L8.704 10.75H18.25A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
