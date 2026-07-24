"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import type { ChatMessage } from "@/lib/types";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Partner { id: string; username: string; avatarUrl?: string | null }

function stamp(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// A DM conversation. Deliberately plain: no channels, claims, proposition bar,
// or room chrome — the socket layer is the room's, the surface is not.
export default function DMThread({ userId, username, partnerUsername }: { userId: string; username: string; partnerUsername: string }) {
  const router = useRouter();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [roomDbId, setRoomDbId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);   // transient (rate-limit) banner
  const bottomRef = useRef<HTMLDivElement>(null);
  const roomNameRef = useRef<string | null>(null);

  // Resolve the partner username to a DM room (creating it on first contact).
  useEffect(() => {
    let active = true;
    setMessages([]);
    setPartner(null);
    setRoomName(null);
    setRoomDbId(null);
    setError(null);
    api(`${SERVER}/api/dm/with/${encodeURIComponent(partnerUsername)}?userId=${userId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error ?? "Could not open conversation");
        return d;
      })
      .then((d) => {
        if (!active) return;
        setPartner(d.partner);
        setRoomName(d.roomName);
        setRoomDbId(d.roomId);
        roomNameRef.current = d.roomName;
      })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [partnerUsername, userId]);

  const markRead = useCallback(() => {
    const rn = roomNameRef.current;
    if (!rn) return;
    api(`${SERVER}/api/dm/read`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, roomName: rn }),
    }).catch(() => {});
  }, [userId]);

  // Join the room and stream messages.
  useEffect(() => {
    if (!roomName || !roomDbId || !username) return;
    const socket = getSocket();

    const join = () => socket.emit("joinRoom", { roomId: roomName, roomName });
    join();
    socket.on("connect", join);

    const onHistory = (h: ChatMessage[]) => {
      // The socket stays joined to every DM opened this session, so history for
      // a conversation we've navigated away from can still land here.
      if (h.length && h[0].roomId !== roomDbId) return;
      setMessages(h);
      markRead();
    };
    const onMessage = (msg: ChatMessage) => {
      if (msg.roomId !== roomDbId) return;
      setMessages((prev) => {
        // Replace our optimistic echo rather than duplicating it.
        const tempIdx = prev.findIndex((m) => m.id.startsWith("temp-") && m.content === msg.content && m.userId === msg.userId);
        if (tempIdx !== -1) { const next = [...prev]; next[tempIdx] = msg; return next; }
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (msg.userId !== userId) markRead();
    };
    const onError = (e: { message: string }) => setError(e.message);
    // The server dropped an over-limit event and will send no echo. For a dropped
    // send, roll back the optimistic bubble so it doesn't look delivered, and show a
    // transient notice (not the full-screen error).
    const onRateLimited = ({ event }: { event: string }) => {
      if (event === "sendMessage") {
        setMessages((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) if (prev[i].id.startsWith("temp-")) return prev.filter((_, j) => j !== i);
          return prev;
        });
      }
      setNotice("You're sending too fast — that message wasn't sent.");
      setTimeout(() => setNotice(null), 4000);
    };

    socket.on("history", onHistory);
    socket.on("message", onMessage);
    socket.on("error", onError);
    socket.on("rateLimited", onRateLimited);
    return () => {
      socket.off("connect", join);
      socket.off("history", onHistory);
      socket.off("message", onMessage);
      socket.off("error", onError);
      socket.off("rateLimited", onRateLimited);
    };
  }, [roomName, roomDbId, userId, username, markRead]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  function send() {
    const content = draft.trim();
    if (!content || !roomName) return;
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId, content, type: "human", senderType: "HUMAN",
      createdAt: new Date().toISOString(), roomId: roomDbId ?? "", userId,
      user: { username },
    } as ChatMessage]);
    setDraft("");
    getSocket().emit("sendMessage", { roomId: roomName, userId, username, content });
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center animate-fadeIn">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
        <button onClick={() => router.push("/messages")}
          className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50">
          Back to Messages
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-4 py-3 pt-safe">
        <button onClick={() => router.push("/messages")} className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 md:hidden" aria-label="Back to messages">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
        </button>
        {partner && (
          <button onClick={() => router.push(`/u/${partner.username}`)} className="flex items-center gap-2.5 text-left">
            {partner.avatarUrl
              ? <img src={partner.avatarUrl} alt={partner.username} className="h-8 w-8 shrink-0 rounded-full object-cover" />
              : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-green/15 text-sm font-bold text-brand-green-ink dark:text-brand-green">{partner.username[0]?.toUpperCase()}</span>}
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{partner.username}</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-600 dark:text-gray-400">
            No messages yet. Say something to {partner?.username ?? "them"}.
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => {
              const mine = m.userId === userId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${mine
                    ? "rounded-tr-sm bg-orange-700 text-white shadow-sm"
                    : "rounded-tl-sm bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"}`}>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>
                    <p className={`mt-0.5 text-[11px] ${mine ? "text-orange-100" : "text-gray-500 dark:text-gray-400"}`}>{stamp(m.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 p-3 pb-safe">
        {notice && (
          <p role="status" className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{notice}</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder={partner ? `Message ${partner.username}…` : "Message…"}
            className="max-h-32 flex-1 resize-none rounded-xl bg-gray-100 dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-brand-green"
          />
          <button onClick={send} disabled={!draft.trim() || !roomName}
            className="shrink-0 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-40">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
