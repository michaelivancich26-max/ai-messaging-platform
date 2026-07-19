"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import type { AppNotification } from "@/lib/types";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Props {
  userId: string;
  username: string;
  collapsed?: boolean;
}

export default function NotificationBell({ userId, username, collapsed }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = notifs.filter(n => !n.read && !n.resolved).length;

  // Update browser tab title with unread count
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Grounds for Debate` : "Grounds for Debate";
  }, [unread]);

  // Fetch on mount
  useEffect(() => {
    if (!userId) return;
    api(`${SERVER}/api/notifications?userId=${userId}`)
      .then(r => r.json())
      .then((data: AppNotification[]) => Array.isArray(data) && setNotifs(data))
      .catch(() => {});
  }, [userId]);

  // Real-time socket updates
  useEffect(() => {
    if (!userId || !username) return;
    const socket = getSocket();
    function onNotification(n: AppNotification) {
      setNotifs(prev => [n, ...prev.filter(x => x.id !== n.id)]);
    }
    function onInviteAccepted({ roomName, isDM }: { roomName: string; isDM: boolean }) {
      // DMs live at /messages/<username>, and the Open DM button has already
      // navigated there — the raw dm-<id>-<id> room name is not a URL.
      if (isDM) return;
      router.push(`/room/${roomName}`);
    }
    socket.on("notification", onNotification);
    socket.on("inviteAccepted", onInviteAccepted);
    return () => {
      socket.off("notification", onNotification);
      socket.off("inviteAccepted", onInviteAccepted);
    };
  }, [userId, username, router]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggleOpen() {
    if (!open && unread > 0) {
      // Mark as read
      api(`${SERVER}/api/notifications/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).then(() => setNotifs(prev => prev.map(n => ({ ...n, read: true })))).catch(() => {});
    }
    setOpen(v => !v);
  }

  function respondInvite(notifId: string, accepted: boolean) {
    const socket = getSocket();
    socket.emit("respondInvite", { notifId, accepted });
    setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, resolved: true, accepted, read: true } : n));
  }

  function goToMention(notif: AppNotification) {
    if (!notif.roomName || notif.roomName.startsWith("dm:")) return;
    router.push(`/room/${notif.roomName}`);
    setOpen(false);
  }

  const pending = notifs.filter(n => n.type === "invite" && !n.resolved);
  const teamInvites = notifs.filter(n => n.type === "team_invite");
  const mentions = notifs.filter(n => n.type === "mention");
  const resolvedInvites = notifs.filter(n => n.type === "invite" && n.resolved);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggleOpen}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          open ? "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"
        }`}
        title="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path fillRule="evenodd" d="M4 8a6 6 0 1 1 12 0c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 1-.515.403l-.138.028A4.5 4.5 0 0 1 10 18a4.5 4.5 0 0 1-4.09-4.335l-.138-.028a.75.75 0 0 1-.515-.403A11.947 11.947 0 0 1 4 8Zm6 10a3 3 0 0 1-2.83-2h5.66A3 3 0 0 1 10 18Z" clipRule="evenodd" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute z-50 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl ${
          collapsed ? "left-12 top-0" : "left-0 top-10"
        } w-80`}>
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Notifications</span>
            {notifs.length > 0 && (
              <button
                onClick={() => {
                  // Persist the clear so dismissed notifications don't reappear on
                  // refresh. Unresolved invites are kept — they still need a response.
                  api(`${SERVER}/api/notifications`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId }),
                  }).catch(() => {});
                  setNotifs(prev => prev.filter(n => n.type === "invite" && !n.resolved));
                }}
                className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifs.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">No notifications yet</p>
            )}

            {/* Pending invites */}
            {pending.length > 0 && (
              <div className="border-b border-gray-200/60 dark:border-gray-800/60">
                {pending.map(n => {
                  const isDM = n.roomName?.startsWith("dm:");
                  const displayRoom = isDM ? `DM from ${n.fromUsername}` : `#${n.roomName}`;
                  return (
                    <div key={n.id} className={`px-4 py-3 ${!n.read ? "bg-indigo-100 dark:bg-indigo-950/20" : ""}`}>
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-indigo-600 dark:text-indigo-400">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
                          </svg>
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-800 dark:text-gray-200">
                            <span className="font-semibold">{n.fromUsername}</span>
                            {isDM ? " wants to message you" : ` invited you to ${displayRoom}`}
                          </p>
                          <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">{new Date(n.createdAt).toLocaleString()}</p>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => {
                                respondInvite(n.id, true);
                                // Fall back to the list if the sender is unknown — the raw
                                // dm-<id>-<id> room name is not a URL we can navigate to.
                                if (isDM) { router.push(n.fromUsername ? `/messages/${encodeURIComponent(n.fromUsername)}` : "/messages"); setOpen(false); }
                              }}
                              className="rounded-full bg-indigo-600 px-3 py-0.5 text-[11px] font-semibold text-white hover:bg-indigo-500 transition-colors"
                            >
                              {isDM ? "Open DM" : "Accept"}
                            </button>
                            {!isDM && (
                              <button
                                onClick={() => respondInvite(n.id, false)}
                                className="rounded-full border border-gray-300 dark:border-gray-700 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                              >
                                Decline
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Team invites — resolved from the Compete → Team Matches tab */}
            {teamInvites.map(n => (
              <div
                key={n.id}
                onClick={() => { router.push("/compete"); setOpen(false); }}
                className={`cursor-pointer px-4 py-3 hover:bg-gray-100/60 dark:hover:bg-gray-800/60 transition-colors ${!n.read ? "bg-indigo-100 dark:bg-indigo-950/20" : ""}`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-violet-600 dark:text-violet-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M5.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1 13.5a4.5 4.5 0 0 1 9 0 .5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5ZM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM11.5 8.5a3.5 3.5 0 0 1 3.5 3.5.5.5 0 0 1-.5.5h-3.05a5.47 5.47 0 0 0-.9-3.86c.27-.09.56-.14.85-.14Z" />
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 dark:text-gray-200">
                      <span className="font-semibold">{n.fromUsername}</span>
                      {" invited you to their debate team"}
                    </p>
                    {n.content && <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">"{n.content}"</p>}
                    <p className="mt-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400">Open Battle Grounds → Team Matches →</p>
                  </div>
                </div>
              </div>
            ))}

            {/* Mentions */}
            {mentions.map(n => (
              <div
                key={n.id}
                onClick={() => goToMention(n)}
                className={`cursor-pointer px-4 py-3 hover:bg-gray-100/60 dark:hover:bg-gray-800/60 transition-colors ${!n.read ? "bg-indigo-100 dark:bg-indigo-950/20" : ""}`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-violet-600 dark:text-violet-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M10.5 3.5a2.5 2.5 0 1 0-5 0V4H4v1h8V4h-1.5v-.5ZM4 14a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4Z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 dark:text-gray-200">
                      <span className="font-semibold">{n.fromUsername}</span>
                      {" mentioned you in "}
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">#{n.roomName}</span>
                    </p>
                    {n.content && (
                      <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">"{n.content}"</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-gray-500 dark:text-gray-400 mt-1">
                    <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            ))}

            {/* Resolved invites */}
            {resolvedInvites.map(n => {
              const isDM = n.roomName?.startsWith("dm:");
              return (
                <div key={n.id} className="px-4 py-2.5 opacity-50">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {isDM ? "DM invite" : `Invite to #${n.roomName}`}
                    {" · "}
                    <span className={n.accepted ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}>
                      {n.accepted ? "Accepted" : "Declined"}
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
