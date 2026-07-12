"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import NotificationBell from "./NotificationBell";
import GavelsPill from "./GavelsPill";
import DMPanel from "./DMPanel";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

type IconProps = { className?: string };
const NAV: { href: string; label: string; Icon: (p: IconProps) => ReactNode }[] = [
  { href: "/home", label: "Home", Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" /></svg>
  ) },
  { href: "/lobby", label: "Debates", Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path fillRule="evenodd" d="M10 3c-4.31 0-8 2.69-8 6 0 1.56.83 2.98 2.17 4.04L3 17l3.86-1.6c.98.38 2.05.6 3.14.6 4.31 0 8-2.69 8-6s-3.69-6-8-6Z" clipRule="evenodd" /></svg>
  ) },
  { href: "/compete", label: "Compete", Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h4.017l-1.75 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 14.25 8h-4.017l1.75-6.093Z" /></svg>
  ) },
  { href: "/arena", label: "Arena", Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path d="M15.5 3H14V2a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v1H4.5A1.5 1.5 0 0 0 3 4.5v1A2.5 2.5 0 0 0 5.5 8h.28A4.01 4.01 0 0 0 9 10.9V13H7a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.1A4.01 4.01 0 0 0 14.22 8h.28A2.5 2.5 0 0 0 17 5.5v-1A1.5 1.5 0 0 0 15.5 3ZM5.5 6.5A.5.5 0 0 1 5 6V5h1v1.5h-.5Zm10 0H15V5h1v1a.5.5 0 0 1-.5.5ZM6 16h8a1 1 0 0 1 1 1H5a1 1 0 0 1 1-1Z" /></svg>
  ) },
  { href: "/learn", label: "Learn", Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path d="M10.394 2.08a1 1 0 0 0-.788 0l-7 3a1 1 0 0 0 0 1.84L5.25 8.051a.999.999 0 0 1 .356-.257l4-1.714a1 1 0 1 1 .788 1.838L7.667 9.088l1.94.831a1 1 0 0 0 .787 0l7-3a1 1 0 0 0 0-1.838l-7-3ZM3.31 9.397 5 10.12v4.102a8.969 8.969 0 0 0-1.05-.174 1 1 0 0 1-.89-.89 11.115 11.115 0 0 1 .25-3.762ZM9.3 16.573A9.026 9.026 0 0 0 7 14.935v-3.957l1.818.78a3 3 0 0 0 2.364 0l5.508-2.361a11.026 11.026 0 0 1 .25 3.762 1 1 0 0 1-.89.89 8.968 8.968 0 0 0-5.75 2.524 1 1 0 0 1-1.4 0ZM6 18a1 1 0 0 0 1-1v-2.065a8.935 8.935 0 0 0-2-.712V17a1 1 0 0 0 1 1Z" /></svg>
  ) },
  { href: "/bets", label: "Bets", Icon: ({ className }) => (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.75a.75.75 0 0 0-1.5 0v.316a3 3 0 0 0-.727.198c-.782.33-1.523 1.008-1.523 2.036 0 .953.626 1.573 1.28 1.933.585.323 1.322.501 1.906.644l.048.012c.657.164 1.08.281 1.351.431.213.118.24.209.24.284 0 .073-.026.16-.24.28-.212.12-.573.222-1.135.222-.669 0-1.09-.219-1.32-.462a.75.75 0 0 0-1.088 1.031A3.11 3.11 0 0 0 9.25 13.4v.348a.75.75 0 0 0 1.5 0v-.316a3 3 0 0 0 .727-.198c.782-.33 1.523-1.008 1.523-2.036 0-.953-.626-1.573-1.28-1.933-.585-.323-1.322-.501-1.906-.644l-.048-.012c-.657-.164-1.08-.281-1.351-.431-.213-.118-.24-.209-.24-.284 0-.073.026-.16.24-.28.212-.12.573-.222 1.135-.222.669 0 1.09.219 1.32.462a.75.75 0 0 0 1.088-1.031A3.11 3.11 0 0 0 10.75 6.6v-.35Z" clipRule="evenodd" /></svg>
  ) },
];

// Persistent unified navigation shell — a left rail on desktop, a bottom tab bar on mobile —
// wrapping every top-level section (Home, Debates, Compete, Arena, Learn, Bets).
export default function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showDM, setShowDM] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/users/${userId}/profile`).then(r => r.json())
      .then(d => setAvatarUrl(d.avatarUrl ?? null)).catch(() => {});
  }, [userId]);

  const isActive = (href: string) => href === "/home" ? pathname === "/home" : pathname.startsWith(href);

  const Avatar = ({ size }: { size: string }) => avatarUrl
    ? <img src={avatarUrl} alt={username} className={`${size} rounded-full object-cover ring-1 ring-gray-700`} />
    : <span className={`${size} flex items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300 ring-1 ring-gray-600`}>{username[0]?.toUpperCase()}</span>;

  return (
    <div className="flex h-full">
      {/* Desktop left rail */}
      <aside className="hidden md:flex md:flex-col w-52 shrink-0 border-r border-gray-800 bg-gray-900 pt-safe">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-gray-800">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-indigo-400"><path d="M10 1.5 3 4v5c0 4 3 7.5 7 9.5 4-2 7-5.5 7-9.5V4l-7-2.5Z" /></svg>
          <span className="text-sm font-bold tracking-tight text-gray-100">Veritas</span>
          <div className="ml-auto">{userId && <NotificationBell userId={userId} username={username} />}</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <button key={href} onClick={() => router.push(href)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-indigo-600/15 text-indigo-300" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"}`}>
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-gray-800 p-2 pb-safe space-y-1">
          <div className="px-1 pb-1"><GavelsPill /></div>
          <button onClick={() => setShowDM(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0"><path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914Z" /><path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.141 2.841 2.705 2.939.238.015.477.023.716.029v3.027a.75.75 0 0 0 1.28.53l3.012-3.012c.494-.046.986-.102 1.474-.167C19.033 14.438 20 13.162 20 11.72V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0 0 14 6Z" /></svg>
            Messages
          </button>
          <button onClick={() => router.push("/dashboard")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors">
            <Avatar size="h-7 w-7" />
            <span className="truncate">{username}</span>
          </button>
          <button onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0"><path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" /><path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.068a.75.75 0 1 0-1.064-1.056l-2.5 2.53a.75.75 0 0 0 0 1.056l2.5 2.53a.75.75 0 1 0 1.064-1.056L8.704 10.75H18.25A.75.75 0 0 0 19 10Z" clipRule="evenodd" /></svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 h-12 shrink-0 border-b border-gray-800 bg-gray-900 px-4 pt-safe">
          <span className="text-sm font-bold tracking-tight text-gray-100">Veritas</span>
          <div className="ml-auto flex items-center gap-2">
            <GavelsPill compact />
            {userId && <NotificationBell userId={userId} username={username} />}
            <button onClick={() => setShowDM(true)} className="text-gray-400 hover:text-gray-200" aria-label="Messages">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914Z" /><path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.141 2.841 2.705 2.939.238.015.477.023.716.029v3.027a.75.75 0 0 0 1.28.53l3.012-3.012c.494-.046.986-.102 1.474-.167C19.033 14.438 20 13.162 20 11.72V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0 0 14 6Z" /></svg>
            </button>
          </div>
        </div>

        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden flex shrink-0 border-t border-gray-800 bg-gray-900 pb-safe">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <button key={href} onClick={() => router.push(href)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${active ? "text-indigo-400" : "text-gray-500"}`}>
                <Icon className="h-5 w-5" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {showDM && userId && <DMPanel userId={userId} onClose={() => setShowDM(false)} />}
    </div>
  );
}
