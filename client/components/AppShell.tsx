"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import NotificationBell from "./NotificationBell";
import { Wordmark } from "./Wordmark";
import { useTheme } from "./ThemeProvider";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";
import { signOutEverywhere } from "@/lib/session";
import { BOTS, type Bot } from "@/lib/bots";
import {
  Home, Swords, Trophy, Zap, MessagesSquare, GraduationCap, BookOpen,
  Puzzle, Dumbbell, Star, ChevronRight, Radio, Globe, Settings, MessageSquare,
  Users, Sun, Moon, Shield, LogOut, Sparkles, Layers, type LucideIcon,
} from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// ─── Navigation model ────────────────────────────────────────────────────────
// The rail mirrors chess.com's structure (Play/Learn/Practice/Watch/Community)
// but with Grounds' own names. Grouped items reveal a "sidestepped" flyout of
// children on hover/focus; leaves navigate directly. `match` lists path prefixes
// that keep an item highlighted (a live match room counts as Debate, etc.).

interface Child { href: string; label: string; blurb: string; Icon: LucideIcon; live?: boolean }
interface NavItem {
  id: string;
  href: string;         // where the label itself navigates (the primary child)
  label: string;
  short: string;        // mobile tab label
  Icon: LucideIcon;
  match?: string[];
  live?: boolean;       // show the "live" ping on the rail item
  children?: Child[];
  bots?: boolean;       // Practice: children are the arena opponents, rendered specially
}

const DEBATE_CHILDREN: Child[] = [
  { href: "/rapid", label: "Rapid Fire", blurb: "Match a stranger who disagrees", Icon: Zap, live: true },
  { href: "/lobby", label: "Common Grounds", blurb: "Open debate rooms", Icon: MessagesSquare },
  { href: "/compete", label: "Battle Grounds", blurb: "Ranked 1v1, AI judged", Icon: Trophy },
  { href: "/arena", label: "Arena", blurb: "Practice against AI opponents", Icon: Dumbbell },
];

const LEARN_CHILDREN: Child[] = [
  { href: "/learn", label: "Lessons", blurb: "The debate academy", Icon: BookOpen },
  { href: "/learn/puzzles", label: "Puzzles", blurb: "Spot the logical flaw", Icon: Puzzle },
];

const NAV: NavItem[] = [
  { id: "home", href: "/home", label: "Home", short: "Home", Icon: Home },
  { id: "debate", href: "/debate", label: "Debate", short: "Debate", Icon: Swords, live: true,
    match: ["/debate", "/rapid", "/lobby", "/compete", "/deck", "/room"], children: DEBATE_CHILDREN },
  { id: "learn", href: "/learn", label: "Learn", short: "Learn", Icon: GraduationCap,
    match: ["/learn"], children: LEARN_CHILDREN },
  { id: "practice", href: "/arena", label: "Practice", short: "Practice", Icon: Dumbbell,
    match: ["/arena"], bots: true },
  { id: "watch", href: "/watch", label: "Watch", short: "Watch", Icon: Radio, match: ["/watch"] },
  { id: "community", href: "/community", label: "Community", short: "Social", Icon: Globe, match: ["/community"] },
];

// The opponent to nudge toward next — scaled to how many bot matches you've won.
// A newcomer meets a Novice; a veteran meets a Grandmaster. Deterministic so the
// flyout is stable across renders.
function recommendedBot(arenaWins: number): Bot {
  const tier = arenaWins < 2 ? 1 : arenaWins < 5 ? 2 : arenaWins < 9 ? 3 : arenaWins < 14 ? 4 : 5;
  return BOTS.find(b => b.tier === tier) ?? BOTS[0];
}

// Tracks the active breakpoint so the notification bell mounts in EXACTLY ONE
// place (rail on desktop, top bar on mobile). Rendering both — even with one
// CSS-hidden — double-runs the bell's fetch/socket/title effects and desyncs the
// unread count. `null` until measured; treated as desktop-first to avoid a flash.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

// ─── Shell ───────────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";
  const isAdmin: boolean = (session?.user as any)?.isAdmin ?? false;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [arenaWins, setArenaWins] = useState(0);
  const [dmUnread, setDmUnread] = useState(0);
  const [friendReq, setFriendReq] = useState(0);
  const { theme, toggle: toggleTheme } = useTheme();
  const isDesktop = useIsDesktop();

  // Desktop flyout: which group is open, with a small close delay so moving the
  // cursor from the rail item into the flyout doesn't dismiss it.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const openNow = (id: string) => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpenGroup(id); };
  const scheduleClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpenGroup(null), 140); };
  const closeFlyout = (id: string) => { setOpenGroup(null); triggerRefs.current[id]?.focus(); };

  // Settings popover (theme / profile / sign out) and its outside-click close.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!userId) return;
    api(`${SERVER}/api/users/${userId}/profile`).then(r => r.json())
      .then(d => { setAvatarUrl(d.avatarUrl ?? null); setArenaWins(d?.stats?.arenaWins ?? 0); })
      .catch(() => {});
  }, [userId]);

  // Poll the DM-unread and incoming-friend-request badges; re-run on navigation so
  // reading a thread / opening /friends clears them promptly.
  useEffect(() => {
    if (!userId) return;
    const load = () => {
      api(`${SERVER}/api/dm/unread-count?userId=${userId}`)
        .then(r => r.json()).then(d => setDmUnread(d?.unread ?? 0)).catch(() => {});
      api(`${SERVER}/api/friends/summary?userId=${userId}`)
        .then(r => r.json()).then(d => setFriendReq(d?.incoming ?? 0)).catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [userId, pathname]);

  // Live-refresh the friend-request badge when the other side acts.
  useEffect(() => {
    if (!userId) return;
    const s = getSocket();
    const on = () => api(`${SERVER}/api/friends/summary?userId=${userId}`)
      .then(r => r.json()).then(d => setFriendReq(d?.incoming ?? 0)).catch(() => {});
    s.on("friendsUpdate", on);
    return () => { s.off("friendsUpdate", on); };
  }, [userId]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => { if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSettingsOpen(false); settingsBtnRef.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [settingsOpen]);

  // Close the desktop flyout on route change.
  useEffect(() => { setOpenGroup(null); }, [pathname]);

  const isActive = (item: NavItem) => item.id === "home"
    ? pathname === "/home"
    : [item.href, ...(item.match ?? [])].some(p => pathname.startsWith(p));

  const go = (href: string) => { setOpenGroup(null); router.push(href); };

  const onMessages = pathname.startsWith("/messages");
  const onFriends = pathname.startsWith("/friends");

  const Avatar = ({ size }: { size: string }) => avatarUrl
    ? <img src={avatarUrl} alt={username} className={`${size} rounded-full object-cover ring-1 ring-gray-300 dark:ring-gray-700`} />
    : <span className={`${size} flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300 ring-1 ring-gray-300 dark:ring-gray-600`}>{username[0]?.toUpperCase()}</span>;

  const rec = recommendedBot(arenaWins);

  // ── A group's flyout contents (desktop) or sheet contents (mobile) ──────────
  const flyoutBody = (item: NavItem, onPick: (href: string) => void) => {
    if (item.bots) {
      return (
        <>
          <button onClick={() => onPick(`/arena?challenge=${rec.id}`)}
            className="group flex w-full items-start gap-3 rounded-lg p-2.5 text-left ring-1 ring-orange-200 bg-orange-50 hover:bg-orange-100 dark:ring-orange-900/50 dark:bg-orange-950/30 dark:hover:bg-orange-950/50 transition-colors">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-900/60">
              <Star className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{rec.name}</span>
                <span className="rounded-full bg-orange-600/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">Recommended</span>
              </span>
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{rec.title} · Tier {rec.tier} {rec.tierName}</span>
            </span>
          </button>
          <p className="px-1 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">All opponents</p>
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {BOTS.map(b => (
              <button key={b.id} onClick={() => onPick(`/arena?challenge=${b.id}`)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gray-100 text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{b.tier}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-200">{b.name}</span>
                  <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{b.title}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1 border-t border-gray-200 pt-1 dark:border-gray-800">
            <button onClick={() => onPick("/arena")}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium text-brand-green-ink hover:bg-gray-100 dark:text-brand-green dark:hover:bg-gray-800 transition-colors">
              Open Practice Arena <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      );
    }
    return (
      <div className="space-y-0.5">
        {item.children!.map(c => (
          <button key={c.href} onClick={() => onPick(c.href)}
            className="group flex w-full items-start gap-3 rounded-lg p-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-600 group-hover:text-brand-green-ink dark:bg-gray-800 dark:text-gray-300 dark:group-hover:text-brand-green transition-colors">
              <c.Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.label}</span>
                {c.live && (
                  <span aria-hidden className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{c.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    );
  };

  // Shared style for the bottom-row utility icon buttons (settings/DMs/friends).
  const utilBtn = (active?: boolean) =>
    `relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${active
      ? "bg-brand-green/15 text-brand-green-ink dark:bg-brand-green/20 dark:text-brand-green"
      : "text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"}`;

  return (
    <div className="flex h-full">
      {/* Keyboard users can jump past the navigation straight to the page content. */}
      <a href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-brand-green-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-elevated">
        Skip to content
      </a>

      {/* ── Desktop left rail ──────────────────────────────────────────────── */}
      <aside className="relative z-30 hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white pt-safe dark:border-gray-800 dark:bg-gray-900 md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4 dark:border-gray-800">
          <button onClick={() => go("/home")} className="flex items-center gap-2 transition-opacity hover:opacity-80" aria-label="Grounds for Debate — Home">
            <Shield className="h-5 w-5 text-brand-green" />
            <Wordmark className="text-base" />
          </button>
        </div>

        <nav aria-label="Primary" className="flex-1 px-2 py-3 space-y-1">
          {NAV.map(item => {
            const active = isActive(item);
            const isGroup = !!item.children || !!item.bots;
            const open = openGroup === item.id;
            return (
              <div key={item.id} className="relative"
                onMouseEnter={() => isGroup && openNow(item.id)}
                onMouseLeave={() => isGroup && scheduleClose()}
                onBlur={(e) => { if (isGroup && !e.currentTarget.contains(e.relatedTarget as Node)) scheduleClose(); }}>
                <button
                  ref={(el) => { triggerRefs.current[item.id] = el; }}
                  onClick={() => go(item.href)}
                  onFocus={() => isGroup && openNow(item.id)}
                  onKeyDown={(e) => {
                    if (isGroup && (e.key === "ArrowRight" || e.key === "ArrowDown")) { e.preventDefault(); openNow(item.id); }
                    if (e.key === "Escape") setOpenGroup(null);
                  }}
                  aria-current={active ? "page" : undefined}
                  aria-expanded={isGroup ? open : undefined}
                  className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active
                    ? "bg-brand-green/15 font-semibold text-brand-green-ink dark:bg-brand-green/20 dark:text-brand-green"
                    : "font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"}`}>
                  {active && <span aria-hidden className="absolute left-0 top-1/2 h-5 w-1 -translate-x-0.5 -translate-y-1/2 rounded-r-full bg-brand-green" />}
                  <item.Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.live && !active && (
                    <span aria-hidden className="relative flex h-2 w-2" title="Live now">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-60 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                    </span>
                  )}
                  {isGroup && <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />}
                </button>

                {isGroup && open && (
                  <div
                    onMouseEnter={() => openNow(item.id)}
                    onMouseLeave={scheduleClose}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeFlyout(item.id); } }}
                    role="group" aria-label={item.label}
                    className="absolute left-full top-0 z-50 ml-1.5 w-72 animate-fadeIn rounded-xl border border-gray-200 bg-white p-1.5 shadow-elevated dark:border-gray-800 dark:bg-gray-900">
                    <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{item.label}</p>
                    {flyoutBody(item, go)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom block — username + settings · DMs · notifications · friends */}
        <div className="border-t border-gray-200 p-2 pb-safe dark:border-gray-800">
          <button onClick={() => go("/dashboard")}
            className="mb-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800">
            <Avatar size="h-9 w-9" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{username || "You"}</span>
              <span className="block text-[11px] text-gray-500 dark:text-gray-400">View profile</span>
            </span>
          </button>

          <div className="flex items-center justify-between px-0.5">
            {/* Settings */}
            <div className="relative" ref={settingsRef}>
              <button ref={settingsBtnRef} onClick={() => setSettingsOpen(v => !v)} aria-haspopup="menu" aria-expanded={settingsOpen}
                title="Settings" className={utilBtn(settingsOpen)}>
                <Settings className="h-5 w-5" />
              </button>
              {settingsOpen && (
                <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-gray-200 bg-white p-1 shadow-elevated dark:border-gray-800 dark:bg-gray-900">
                  <button role="menuitem" onClick={() => { toggleTheme(); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </button>
                  <button role="menuitem" onClick={() => { setSettingsOpen(false); go("/dashboard"); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
                    <Settings className="h-4 w-4" />
                    Edit profile
                  </button>
                  <button role="menuitem" onClick={() => { setSettingsOpen(false); go("/beliefs"); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
                    <Layers className="h-4 w-4" />
                    Belief Map
                  </button>
                  <button role="menuitem" onClick={() => { setSettingsOpen(false); go("/pro"); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/40 transition-colors">
                    <Sparkles className="h-4 w-4" />
                    Grounds Pro
                  </button>
                  {isAdmin && (
                    <button role="menuitem" onClick={() => { setSettingsOpen(false); go("/admin/pro"); }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
                      <Shield className="h-4 w-4" />
                      Admin
                    </button>
                  )}
                  <div className="my-1 border-t border-gray-200 dark:border-gray-800" />
                  <button role="menuitem" onClick={() => signOutEverywhere()}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors">
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>

            {/* Direct messages */}
            <button onClick={() => go("/messages")} title="Messages" aria-current={onMessages ? "page" : undefined}
              aria-label={dmUnread > 0 ? `Messages, ${dmUnread} unread` : "Messages"} className={utilBtn(onMessages)}>
              <MessageSquare className="h-5 w-5" />
              {dmUnread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{dmUnread > 9 ? "9+" : dmUnread}</span>
              )}
            </button>

            {/* Notifications — mounted here on desktop only (see useIsDesktop) */}
            {userId && isDesktop !== false && <NotificationBell userId={userId} username={username} openUp />}

            {/* Friends */}
            <button onClick={() => go("/friends")} title="Friends" aria-current={onFriends ? "page" : undefined}
              aria-label={friendReq > 0 ? `Friends, ${friendReq} pending request${friendReq === 1 ? "" : "s"}` : "Friends"} className={utilBtn(onFriends)}>
              <Users className="h-5 w-5" />
              {friendReq > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{friendReq > 9 ? "9+" : friendReq}</span>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column ────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 pt-safe dark:border-gray-800 dark:bg-gray-900 md:hidden">
          <button onClick={() => go("/home")} className="flex items-center gap-1.5" aria-label="Home">
            <Shield className="h-5 w-5 text-brand-green" />
            <Wordmark className="text-sm" />
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {/* Notifications — mounted here on mobile only */}
            {userId && isDesktop === false && <NotificationBell userId={userId} username={username} alignRight />}
            <button onClick={() => go("/messages")} className="relative text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200" aria-label="Messages">
              <MessageSquare className="h-5 w-5" />
              {dmUnread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{dmUnread > 9 ? "9+" : dmUnread}</span>
              )}
            </button>
            <button onClick={() => go("/friends")} className="relative text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label={friendReq > 0 ? `Friends, ${friendReq} pending` : "Friends"}>
              <Users className="h-5 w-5" />
              {friendReq > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{friendReq > 9 ? "9+" : friendReq}</span>
              )}
            </button>
            <button onClick={() => go("/dashboard")} aria-label="Your profile"><Avatar size="h-7 w-7" /></button>
          </div>
        </div>

        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-hidden focus:outline-none">{children}</main>

        {/* Mobile bottom tab bar. Every tab navigates to its page; grouped items go
            to their landing/hub page (Debate→/debate, Learn→/learn, Practice→/arena). */}
        <nav aria-label="Primary" className="flex shrink-0 border-t border-gray-200 bg-white pb-safe dark:border-gray-800 dark:bg-gray-900 md:hidden">
          {NAV.map(item => {
            const active = isActive(item);
            return (
              <button key={item.id}
                onClick={() => go(item.href)}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${active ? "font-semibold text-brand-green-ink dark:text-brand-green" : "font-medium text-gray-500 dark:text-gray-400"}`}>
                {active && <span aria-hidden className="absolute top-0 h-0.5 w-7 rounded-b-full bg-brand-green" />}
                <span className="relative">
                  <item.Icon className="h-5 w-5" />
                  {item.live && !active && <span aria-hidden className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />}
                </span>
                {item.short}
              </button>
            );
          })}
        </nav>
      </div>

    </div>
  );
}
