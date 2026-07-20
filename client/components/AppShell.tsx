"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import NotificationBell from "./NotificationBell";
import { Wordmark } from "./Wordmark";
import { useTheme } from "./ThemeProvider";
import { api } from "@/lib/api";
import { signOutEverywhere } from "@/lib/session";
import { Home, Users, Swords, Layers, Zap, GraduationCap, MessageSquare, LogOut, Sun, Moon, type LucideIcon } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// `match` lists extra path prefixes that should keep this entry highlighted —
// Training Grounds owns both /arena and /learn, which switch via a tab header.
const NAV: { href: string; label: string; short: string; match?: string[]; Icon: LucideIcon }[] = [
  { href: "/home", label: "Home", short: "Home", Icon: Home },
  { href: "/lobby", label: "Common Grounds", short: "Common", Icon: Users },
  { href: "/compete", label: "Battle Grounds", short: "Battle", Icon: Swords },
  // Sits directly above Rapid Fire because it feeds it — your positions here are
  // what pairing matches on.
  { href: "/deck", label: "Where You Stand", short: "Stand", Icon: Layers },
  { href: "/rapid", label: "Rapid Fire", short: "Rapid", Icon: Zap },
  { href: "/arena", label: "Training Grounds", short: "Train", match: ["/learn"], Icon: GraduationCap },
];

// Persistent unified navigation shell — a left rail on desktop, a bottom tab bar on mobile —
// wrapping every top-level section (Home, Common Grounds, Battle Grounds, Training Grounds).
export default function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [dmUnread, setDmUnread] = useState(0);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    if (!userId) return;
    api(`${SERVER}/api/users/${userId}/profile`).then(r => r.json())
      .then(d => setAvatarUrl(d.avatarUrl ?? null)).catch(() => {});
  }, [userId]);

  // Poll the unread badge. Re-runs on navigation so opening a thread, which
  // marks it read, clears the badge without waiting for the next tick.
  useEffect(() => {
    if (!userId) return;
    const load = () => api(`${SERVER}/api/dm/unread-count?userId=${userId}`)
      .then(r => r.json()).then(d => setDmUnread(d?.unread ?? 0)).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [userId, pathname]);

  const isActive = (href: string, match?: string[]) => href === "/home"
    ? pathname === "/home"
    : [href, ...(match ?? [])].some((p) => pathname.startsWith(p));

  const Avatar = ({ size }: { size: string }) => avatarUrl
    ? <img src={avatarUrl} alt={username} className={`${size} rounded-full object-cover ring-1 ring-gray-300 dark:ring-gray-700`} />
    : <span className={`${size} flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300 ring-1 ring-gray-300 dark:ring-gray-600`}>{username[0]?.toUpperCase()}</span>;

  return (
    <div className="flex h-full">
      {/* Keyboard users can jump past the navigation straight to the page content. */}
      <a href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-brand-green focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-elevated">
        Skip to content
      </a>
      {/* Desktop left rail */}
      <aside className="hidden md:flex md:flex-col w-52 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pt-safe">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-gray-200 dark:border-gray-800">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-brand-green"><path d="M10 1.5 3 4v5c0 4 3 7.5 7 9.5 4-2 7-5.5 7-9.5V4l-7-2.5Z" /></svg>
          <Wordmark className="text-sm" />
          <div className="ml-auto">{userId && <NotificationBell userId={userId} username={username} />}</div>
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {NAV.map(({ href, label, match, Icon }) => {
            const active = isActive(href, match);
            return (
              <button key={href} onClick={() => router.push(href)} aria-current={active ? "page" : undefined}
                className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-brand-green/15 font-semibold text-brand-green-ink dark:bg-brand-green/20 dark:text-brand-green" : "font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"}`}>
                {active && <span aria-hidden className="absolute left-0 top-1/2 h-5 w-1 -translate-x-0.5 -translate-y-1/2 rounded-r-full bg-brand-green" />}
                <Icon className="h-5 w-5 shrink-0" />
                {label}
                {href === "/rapid" && !active && (
                  <span aria-hidden className="relative ml-auto flex h-2 w-2" title="Live now">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-gray-200 dark:border-gray-800 p-2 pb-safe space-y-1">
          <button onClick={() => router.push("/messages")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive("/messages") ? "bg-brand-green/15 text-brand-green-ink dark:text-brand-green" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"}`}>
            <MessageSquare className="h-5 w-5 shrink-0" />
            Messages
            {dmUnread > 0 && (
              <span className="ml-auto rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{dmUnread > 99 ? "99+" : dmUnread}</span>
            )}
          </button>
          <button onClick={() => router.push("/dashboard")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <Avatar size="h-7 w-7" />
            <span className="truncate">{username}</span>
          </button>
          <button onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            {theme === "dark" ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button onClick={() => signOutEverywhere()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <LogOut className="h-5 w-5 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 h-12 shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 pt-safe">
          <Wordmark className="text-sm" />
          <div className="ml-auto flex items-center gap-2">
            {userId && <NotificationBell userId={userId} username={username} />}
            <button onClick={() => router.push("/messages")} className="relative text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" aria-label="Messages">
              <MessageSquare className="h-5 w-5" />
              {dmUnread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{dmUnread > 9 ? "9+" : dmUnread}</span>
              )}
            </button>
          </div>
        </div>

        <main id="main-content" tabIndex={-1} className="flex-1 min-h-0 overflow-hidden focus:outline-none">{children}</main>

        {/* Mobile bottom tab bar */}
        <nav aria-label="Primary" className="md:hidden flex shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pb-safe">
          {NAV.map(({ href, short, match, Icon }) => {
            const active = isActive(href, match);
            return (
              <button key={href} onClick={() => router.push(href)} aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${active ? "font-semibold text-brand-green-ink dark:text-brand-green" : "font-medium text-gray-500 dark:text-gray-400"}`}>
                {active && <span aria-hidden className="absolute top-0 h-0.5 w-7 rounded-b-full bg-brand-green" />}
                <Icon className="h-5 w-5" />
                {short}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
