"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import NotificationBell from "./NotificationBell";
import { Wordmark } from "./Wordmark";
import { api } from "@/lib/api";
import { signOutEverywhere } from "@/lib/session";

interface Room {
  id: string;
  name: string;
  isPrivate: boolean;
  proposition?: string | null;
  creatorId: string | null;
}

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Zm-5 2a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Z" clipRule="evenodd" />
    </svg>
  );
}

interface Props {
  activeRoomName?: string;
  onBrowseClick?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ activeRoomName, onBrowseClick, mobileOpen, onMobileClose }: Props) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(true);

  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";
  const isAdmin: boolean = (session?.user as any)?.isAdmin ?? false;
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    api(`${SERVER}/api/lobby?userId=${userId}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(data => {
        if (Array.isArray(data.rooms)) setRooms(data.rooms);
      })
      .catch(() => {
        // On error (network, rate-limit, etc.) keep whatever data is already in state
      });
    api(`${SERVER}/api/users/${userId}/profile`)
      .then(r => r.json())
      .then(data => setMyAvatarUrl(data.avatarUrl ?? null))
      .catch(() => {});
  }, [status, userId]);

  function handleRoomClick(room: Room) {
    if (room.isPrivate && room.creatorId !== userId && !isAdmin) {
      // Navigate to lobby which handles password modal
      router.push(`/lobby`);
    } else {
      router.push(`/room/${room.name}`);
    }
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onMobileClose} />
      )}
    <aside className={`
      flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 h-full
      fixed inset-y-0 left-0 z-40 transition-transform duration-300
      ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
      md:relative md:translate-x-0 md:z-auto
      ${collapsed ? "w-14" : "w-64"}
    `}>

      {/* Header */}
      <div className="flex min-h-14 items-center gap-2 border-b border-gray-200 dark:border-gray-800 px-3 pt-safe">
        <button onClick={() => setCollapsed(v => !v)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
          </svg>
        </button>
        {!collapsed && (
          <button onClick={() => router.push("/home")}
            className="flex-1 truncate text-left transition-opacity hover:opacity-80">
            <Wordmark className="text-sm" />
          </button>
        )}
        {userId && (
          <NotificationBell userId={userId} username={username} collapsed={collapsed} />
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">

        {/* Hub link */}
        <div className="px-2 pb-1">
          <button onClick={() => router.push("/home")}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 transition-colors ${collapsed ? "justify-center" : ""}`}
            title="Back to Hub">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
              <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span className="text-sm">Hub</span>}
          </button>
        </div>

        {/* Rooms */}
        <div className="mb-1">
          {collapsed ? (
            <button onClick={() => { setCollapsed(false); setRoomsOpen(true); }}
              className="flex w-full items-center justify-center py-2 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Zm3.293 1.293a1 1 0 0 1 1.414 0l3 3a1 1 0 0 1 0 1.414l-3 3a1 1 0 0 1-1.414-1.414L7.586 10 5.293 7.707a1 1 0 0 1 0-1.414Z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center px-3 py-1">
              <button onClick={() => setRoomsOpen(v => !v)}
                className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                  className={`h-3 w-3 transition-transform ${roomsOpen ? "rotate-90" : ""}`}>
                  <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06L7.28 11.78a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
                Common Grounds
              </button>
              <button onClick={() => onBrowseClick ? onBrowseClick() : router.push("/lobby")}
                className="ml-auto rounded p-0.5 text-gray-500 dark:text-gray-400 hover:text-orange-700 dark:hover:text-orange-400 transition-colors" title="Browse rooms">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
              </button>
            </div>
          )}

          {!collapsed && roomsOpen && (() => {
            // Hide match rooms — arena bot rooms (`arena-*`) and rapid/competitive
            // rooms (`comp-*`); they're joined memberships but not Common Grounds.
            const visibleRooms = rooms.filter(r => !r.name.startsWith("arena-") && !r.name.startsWith("comp-"));
            return (
            <ul className="mt-0.5">
              {visibleRooms.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">No rooms yet</li>
              ) : visibleRooms.map(room => (
                <li key={room.id}>
                  <button onClick={() => handleRoomClick(room)}
                    className={`flex w-full flex-col rounded-lg px-3 py-1.5 transition-colors text-left
                      ${activeRoomName === room.name ? "bg-brand-green/10 dark:bg-brand-green/15 text-brand-green-ink dark:text-brand-green" : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 ${room.name.startsWith("tr-") ? "text-brand-green-ink dark:text-brand-green" : activeRoomName === room.name ? "text-brand-green-ink dark:text-brand-green" : "text-gray-400 dark:text-gray-500"}`}>
                        {room.name.startsWith("tr-") ? (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
                            <path d="M11.174 1.052a.667.667 0 0 0-1.307 0l-.16.794a.667.667 0 0 1-.523.524l-.794.159a.667.667 0 0 0 0 1.308l.794.158a.667.667 0 0 1 .523.524l.16.794a.667.667 0 0 0 1.307 0l.158-.794a.667.667 0 0 1 .524-.524l.794-.158a.667.667 0 0 0 0-1.308l-.794-.16a.667.667 0 0 1-.524-.523l-.158-.794ZM4.633 3.789a.667.667 0 0 0-1.266 0l-.455 1.367a.667.667 0 0 1-.422.422l-1.367.455a.667.667 0 0 0 0 1.266l1.367.456a.667.667 0 0 1 .422.421l.455 1.367a.667.667 0 0 0 1.266 0l.456-1.367a.667.667 0 0 1 .421-.421l1.367-.456a.667.667 0 0 0 0-1.266l-1.367-.455a.667.667 0 0 1-.421-.422l-.456-1.367ZM9.3 9.122a.667.667 0 0 0-1.266 0l-.122.367a.667.667 0 0 1-.421.421l-.367.123a.667.667 0 0 0 0 1.265l.367.123a.667.667 0 0 1 .421.42l.122.368a.667.667 0 0 0 1.266 0l.122-.367a.667.667 0 0 1 .421-.421l.367-.123a.667.667 0 0 0 0-1.265l-.367-.123a.667.667 0 0 1-.421-.421l-.122-.367Z" />
                          </svg>
                        ) : room.isPrivate ? <LockIcon /> : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
                            <path fillRule="evenodd" d="M5.394 1.578a.667.667 0 0 1 1.212 0l1.328 3.196 3.407.495a.667.667 0 0 1 .37 1.137l-2.466 2.402.583 3.392a.667.667 0 0 1-.968.702L6 11.048l-2.86 1.854a.667.667 0 0 1-.967-.702l.582-3.392L.29 6.406a.667.667 0 0 1 .37-1.137l3.407-.495 1.327-3.196Z" clipRule="evenodd" />
                          </svg>
                        )}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {room.name.startsWith("tr-") && room.proposition ? room.proposition : room.name}
                      </span>
                    </div>
                    {!room.name.startsWith("tr-") && room.proposition && (
                      <p className="mt-0.5 truncate pl-5 text-[11px] text-gray-500 dark:text-gray-400 italic">{room.proposition}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            );
          })()}
        </div>

      </nav>

      {/* Profile + Sign out */}
      <div className="border-t border-gray-200 dark:border-gray-800 px-2 pt-2 pb-safe space-y-0.5">
        <button onClick={() => router.push("/dashboard")}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 transition-colors ${collapsed ? "justify-center" : ""}`}>
          {myAvatarUrl
            ? <img src={myAvatarUrl} alt={username} className="h-7 w-7 rounded-full object-cover shrink-0 ring-1 ring-gray-300 dark:ring-gray-700" />
            : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300 ring-1 ring-gray-300 dark:ring-gray-600">
                {username[0]?.toUpperCase()}
              </span>
          }
          {!collapsed && (
            <span className="truncate text-sm font-medium">{username}</span>
          )}
        </button>
        <button onClick={() => signOutEverywhere()}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors ${collapsed ? "justify-center" : ""}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
            <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.068a.75.75 0 1 0-1.064-1.056l-2.5 2.53a.75.75 0 0 0 0 1.056l2.5 2.53a.75.75 0 1 0 1.064-1.056L8.704 10.75H18.25A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
          </svg>
          {!collapsed && <span className="text-sm">Sign out</span>}
        </button>
      </div>
    </aside>
    </>
  );
}
