"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import NotificationBell from "./NotificationBell";
import { Wordmark } from "./Wordmark";
import { useTheme } from "./ThemeProvider";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

type IconProps = { className?: string };
// `match` lists extra path prefixes that should keep this entry highlighted —
// Training Grounds owns both /arena and /learn, which switch via a tab header.
const NAV: { href: string; label: string; match?: string[]; Icon: (p: IconProps) => ReactNode }[] = [
  { href: "/home", label: "Home", Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" /></svg>
  ) },
  { href: "/lobby", label: "Common Grounds", Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path fillRule="evenodd" d="M10 3c-4.31 0-8 2.69-8 6 0 1.56.83 2.98 2.17 4.04L3 17l3.86-1.6c.98.38 2.05.6 3.14.6 4.31 0 8-2.69 8-6s-3.69-6-8-6Z" clipRule="evenodd" /></svg>
  ) },
  { href: "/compete", label: "Battle Grounds", Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h4.017l-1.75 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 14.25 8h-4.017l1.75-6.093Z" /></svg>
  ) },
  { href: "/rapid", label: "Rapid Fire", Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path fillRule="evenodd" d="M10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V1.75A.75.75 0 0 1 10 1ZM5.05 3.05a.75.75 0 0 1 1.06 0l1.062 1.06A.75.75 0 1 1 6.11 5.173L5.05 4.11a.75.75 0 0 1 0-1.06Zm9.9 0a.75.75 0 0 1 0 1.06l-1.06 1.062a.75.75 0 0 1-1.062-1.061l1.061-1.06a.75.75 0 0 1 1.06 0ZM10 6a4 4 0 0 0-3.446 6.032l.311.51a.75.75 0 0 1-1.28.782l-.312-.51A5.5 5.5 0 1 1 15.5 11.5a5.47 5.47 0 0 1-.773 2.814l-.311.51a.75.75 0 1 1-1.28-.782l.31-.51A4 4 0 0 0 10 6Zm-2 11.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>
  ) },
  { href: "/arena", label: "Training Grounds", match: ["/learn"], Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path d="M15.5 3H14V2a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v1H4.5A1.5 1.5 0 0 0 3 4.5v1A2.5 2.5 0 0 0 5.5 8h.28A4.01 4.01 0 0 0 9 10.9V13H7a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.1A4.01 4.01 0 0 0 14.22 8h.28A2.5 2.5 0 0 0 17 5.5v-1A1.5 1.5 0 0 0 15.5 3ZM5.5 6.5A.5.5 0 0 1 5 6V5h1v1.5h-.5Zm10 0H15V5h1v1a.5.5 0 0 1-.5.5ZM6 16h8a1 1 0 0 1 1 1H5a1 1 0 0 1 1-1Z" /></svg>
  ) },
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
    fetch(`${SERVER}/api/users/${userId}/profile`).then(r => r.json())
      .then(d => setAvatarUrl(d.avatarUrl ?? null)).catch(() => {});
  }, [userId]);

  // Poll the unread badge. Re-runs on navigation so opening a thread, which
  // marks it read, clears the badge without waiting for the next tick.
  useEffect(() => {
    if (!userId) return;
    const load = () => fetch(`${SERVER}/api/dm/unread-count?userId=${userId}`)
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
      {/* Desktop left rail */}
      <aside className="hidden md:flex md:flex-col w-52 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pt-safe">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-gray-200 dark:border-gray-800">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-brand-green"><path d="M10 1.5 3 4v5c0 4 3 7.5 7 9.5 4-2 7-5.5 7-9.5V4l-7-2.5Z" /></svg>
          <Wordmark className="text-sm" />
          <div className="ml-auto">{userId && <NotificationBell userId={userId} username={username} />}</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {NAV.map(({ href, label, match, Icon }) => {
            const active = isActive(href, match);
            return (
              <button key={href} onClick={() => router.push(href)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-brand-green/15 text-brand-green" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"}`}>
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-gray-200 dark:border-gray-800 p-2 pb-safe space-y-1">
          <button onClick={() => router.push("/messages")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive("/messages") ? "bg-brand-green/15 text-brand-green" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"}`}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0"><path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914Z" /><path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.141 2.841 2.705 2.939.238.015.477.023.716.029v3.027a.75.75 0 0 0 1.28.53l3.012-3.012c.494-.046.986-.102 1.474-.167C19.033 14.438 20 13.162 20 11.72V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0 0 14 6Z" /></svg>
            Messages
            {dmUnread > 0 && (
              <span className="ml-auto rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{dmUnread > 99 ? "99+" : dmUnread}</span>
            )}
          </button>
          <button onClick={() => router.push("/dashboard")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <Avatar size="h-7 w-7" />
            <span className="truncate">{username}</span>
          </button>
          <button onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            {theme === "dark" ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0"><path d="M10 2a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 10 2Zm4.95 2.05a.75.75 0 0 1 0 1.06l-.7.7a.75.75 0 1 1-1.06-1.06l.7-.7a.75.75 0 0 1 1.06 0ZM18 10a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1A.75.75 0 0 1 18 10ZM5.05 5.05a.75.75 0 0 1-1.06 0l-.7-.7a.75.75 0 0 1 1.06-1.06l.7.7a.75.75 0 0 1 0 1.06Zm-1.3 4.95a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1a.75.75 0 0 1 .75.75ZM10 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.66 8.6a.75.75 0 0 1 1.06 1.06l-.7.7a.75.75 0 0 1-1.06-1.06l.7-.7Zm-11.32 0 .7.7a.75.75 0 0 1-1.06 1.06l-.7-.7a.75.75 0 0 1 1.06-1.06ZM10 16.25a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1a.75.75 0 0 1 .75-.75Z" /></svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0"><path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" /></svg>
            )}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0"><path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" /><path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.068a.75.75 0 1 0-1.064-1.056l-2.5 2.53a.75.75 0 0 0 0 1.056l2.5 2.53a.75.75 0 1 0 1.064-1.056L8.704 10.75H18.25A.75.75 0 0 0 19 10Z" clipRule="evenodd" /></svg>
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
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914Z" /><path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.141 2.841 2.705 2.939.238.015.477.023.716.029v3.027a.75.75 0 0 0 1.28.53l3.012-3.012c.494-.046.986-.102 1.474-.167C19.033 14.438 20 13.162 20 11.72V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0 0 14 6Z" /></svg>
              {dmUnread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold text-white">{dmUnread > 9 ? "9+" : dmUnread}</span>
              )}
            </button>
          </div>
        </div>

        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden flex shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pb-safe">
          {NAV.map(({ href, label, match, Icon }) => {
            const active = isActive(href, match);
            return (
              <button key={href} onClick={() => router.push(href)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${active ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500"}`}>
                <Icon className="h-5 w-5" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
