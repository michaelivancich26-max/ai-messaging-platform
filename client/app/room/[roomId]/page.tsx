"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import ChatWindow from "@/components/ChatWindow";
import MessageInput from "@/components/MessageInput";
import SettingsPanel from "@/components/SettingsPanel";
import FunctionsBar from "@/components/FunctionsBar";
import SummarizeModal from "@/components/SummarizeModal";
import VibeSearch from "@/components/VibeSearch";
import RoomDetails from "@/components/RoomDetails";
import Sidebar from "@/components/Sidebar";
import ChannelList, { type Channel } from "@/components/ChannelList";
import RoomGraph from "@/components/RoomGraph";
import { AIStreamingCard } from "@/components/AIInterjectionCard";
import type { ChatMessage } from "@/lib/types";
import type { Settings } from "@/components/SettingsPanel";
import { parseAIContent } from "@/lib/types";

interface RoomMeta {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  maxMembers: number | null;
  creatorId: string | null;
  aiPersona: string | null;
}

export type Annotation = { pronoun: string; referent: string };

const DEFAULT_SETTINGS: Settings = { factualCorrection: true, ambiguityResolution: true };

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [annotations, setAnnotations] = useState<Record<string, Annotation>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeModalOpen, setSummarizeModalOpen] = useState(false);
  const [vibeSearchOpen, setVibeSearchOpen] = useState(false);
  const [vibeSearching, setVibeSearching] = useState(false);
  const [vibeResultStatus, setVibeResultStatus] = useState<"idle" | "found" | "not_found">("idle");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [onlineMembers, setOnlineMembers] = useState<{ userId: string; username: string }[]>([]);
  const [roomMeta, setRoomMeta] = useState<RoomMeta | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [streamingMsgs, setStreamingMsgs] = useState<Map<string, { text: string; sarcasm: boolean }>>(new Map());
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [channelRefresh, setChannelRefresh] = useState(0);
  const [roomGraphOpen, setRoomGraphOpen] = useState(false);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "anon";
  const userId: string = (session?.user as any)?.id ?? "";
  const isAdmin: boolean = (session?.user as any)?.isAdmin ?? false;
  const isOwner = roomMeta?.creatorId === userId;
  const [dmPartner, setDmPartner] = useState<string | null>(null);

  const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

  useEffect(() => {
    if (status !== "authenticated" || !userId || !roomId) return;
    if (!roomId.startsWith("dm-")) return;
    fetch(`${SERVER}/api/dm?userId=${userId}`)
      .then((r) => r.json())
      .then((dms: Array<{ name: string; participant1Id: string; participant2Id: string }>) => {
        const dm = dms.find((d) => d.name === roomId);
        if (!dm) return;
        const otherId = dm.participant1Id === userId ? dm.participant2Id : dm.participant1Id;
        return fetch(`${SERVER}/api/users?excludeId=${userId}`)
          .then((r) => r.json())
          .then((users: Array<{ id: string; username: string }>) => {
            const other = users.find((u) => u.id === otherId);
            if (other) setDmPartner(other.username);
          });
      })
      .catch(() => {});
  }, [status, userId, roomId]);

  useEffect(() => {
    if (status !== "authenticated") return;

    console.log("[Room] status=authenticated userId=", userId, "username=", username);
    const socket = getSocket({ id: userId, username });
    console.log("[Room] socket id=", socket.id, "connected=", socket.connected);
    socket.on("connect", () => console.log("[Socket] connected"));
    socket.on("connect_error", (err) => console.error("[Socket] connect_error", err.message));
    socket.on("error", ({ message }: { message: string }) => alert(message));
    socket.on("roomDeleted", () => router.push("/lobby"));
    socket.on("kicked", () => { alert("You were kicked from this room."); router.push("/lobby"); });
    socket.on("channelsUpdated", () => setChannelRefresh(v => v + 1));
    socket.on("roomMembers", (members: { userId: string; username: string }[]) => setOnlineMembers(members));
    socket.on("roomMeta", (meta: RoomMeta) => setRoomMeta(meta));
    socket.on("aiStreamStart", ({ tempId, sarcasm }: { tempId: string; sarcasm: boolean }) => {
      setStreamingMsgs((prev) => new Map(prev).set(tempId, { text: "", sarcasm }));
    });
    socket.on("aiStreamChunk", ({ tempId, chunk }: { tempId: string; chunk: string }) => {
      setStreamingMsgs((prev) => {
        const entry = prev.get(tempId);
        if (!entry) return prev;
        return new Map(prev).set(tempId, { ...entry, text: entry.text + chunk });
      });
    });
    socket.on("aiStreamEnd", ({ tempId, message }: { tempId: string; message: ChatMessage }) => {
      setStreamingMsgs((prev) => { const next = new Map(prev); next.delete(tempId); return next; });
      setMessages((prev) => [...prev, message]);
    });

    socket.on("userTyping", ({ userId: uid, username: uname }: { userId: string; username: string }) => {
      setTypingUsers((prev) => new Map(prev).set(uid, uname));
    });
    socket.on("userStopTyping", ({ userId: uid }: { userId: string }) => {
      setTypingUsers((prev) => { const next = new Map(prev); next.delete(uid); return next; });
    });
    const roomPassword = sessionStorage.getItem(`room-pw:${roomId}`) ?? undefined;
    socket.emit("joinRoom", { roomId, roomName: roomId, password: roomPassword });

    socket.on("history", (history: ChatMessage[]) => {
      const restoredAnnotations: Record<string, { pronoun: string; referent: string }> = {};
      const visibleMessages: ChatMessage[] = [];

      for (const msg of history) {
        if (msg.type === "ai_interjection") {
          const payload = parseAIContent(msg.content);
          if (payload.type === "ambiguity") {
            const target = [...visibleMessages].reverse().find(
              (m) => m.type === "human" && m.content.toLowerCase().includes(payload.pronoun.toLowerCase())
            );
            if (target) restoredAnnotations[target.id] = { pronoun: payload.pronoun, referent: payload.referent };
            continue;
          }
        }
        visibleMessages.push(msg);
      }

      setMessages(visibleMessages);
      setAnnotations(restoredAnnotations);
    });

    socket.on("message", (msg: ChatMessage) => {
      if (msg.type === "ai_interjection") {
        const payload = parseAIContent(msg.content);
        if (payload.type === "ambiguity") {
          setMessages((prev) => {
            const target = [...prev].reverse().find(
              (m) => m.type === "human" && m.content.toLowerCase().includes(payload.pronoun.toLowerCase())
            );
            if (target) {
              setAnnotations((a) => ({ ...a, [target.id]: { pronoun: payload.pronoun, referent: payload.referent } }));
            }
            return prev;
          });
          return;
        }
      }
      setMessages((prev) => {
        // Replace optimistic temp message from same user with matching content
        const tempIdx = prev.findIndex(
          (m) => m.id.startsWith("temp-") && m.content === msg.content && m.userId === msg.userId
        );
        if (tempIdx !== -1) {
          const next = [...prev];
          next[tempIdx] = msg;
          return next;
        }
        return [...prev, msg];
      });
    });

    return () => {
      socket.off("history");
      socket.off("message");
      socket.off("connect");
      socket.off("connect_error");
      socket.off("error");
      socket.off("roomDeleted");
      socket.off("kicked");
      socket.off("roomMembers");
      socket.off("roomMeta");
      socket.off("aiStreamStart");
      socket.off("aiStreamChunk");
      socket.off("aiStreamEnd");
      socket.off("userTyping");
      socket.off("userStopTyping");
      socket.off("channelsUpdated");
    };
  }, [status, roomId, userId, username]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-join first channel once authenticated (non-DM rooms)
  useEffect(() => {
    if (status !== "authenticated" || !userId || roomId.startsWith("dm-")) return;
    const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
    fetch(`${SERVER}/api/rooms/${roomId}/channels`)
      .then(r => r.json())
      .then(data => {
        const channels: Channel[] = data.channels ?? [];
        if (channels.length > 0 && !activeChannel) {
          selectChannel(channels[0]);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId, roomId]);

  function emitTyping() {
    getSocket({ id: userId, username }).emit("typing", { roomId });
  }

  function emitStopTyping() {
    getSocket({ id: userId, username }).emit("stopTyping", { roomId });
  }

  function selectChannel(channel: Channel) {
    setActiveChannel(channel);
    setMessages([]);
    const s = getSocket({ id: userId, username });
    s.emit("joinChannel", { channelId: channel.id });
  }

  function kickUser(targetUserId: string) {
    const s = getSocket({ id: userId, username });
    s.emit("kick", { roomId, targetUserId });
  }

  async function deleteRoom() {
    const res = await fetch(`${SERVER}/api/rooms/${roomId}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) router.push("/lobby");
  }

  function sendMessage(content: string) {
    // Optimistic: show message immediately with a temp id
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      content,
      type: content.startsWith('{"type":"image"') ? "image" : "human",
      senderType: "HUMAN",
      createdAt: new Date().toISOString(),
      roomId,
      userId,
      user: { username },
    } as any;
    setMessages((prev) => [...prev, optimistic]);

    const s = getSocket({ id: userId, username });
    s.emit("sendMessage", { roomId, userId, username, content, settings, channelId: activeChannel?.id });
  }

  async function vibeSearch(query: string) {
    setVibeSearching(true);
    setVibeResultStatus("idle");
    setHighlightedId(null);
    try {
      const res = await fetch("/api/vibe-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, messages }),
      });
      const { id } = await res.json();
      if (id && messageRefs.current[id]) {
        setHighlightedId(id);
        setVibeResultStatus("found");
        messageRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHighlightedId(null), 3000);
      } else {
        setVibeResultStatus("not_found");
      }
    } catch {
      setVibeResultStatus("not_found");
    } finally {
      setVibeSearching(false);
    }
  }

  function summarize(since: Date | null) {
    if (summarizing) return;
    setSummarizeModalOpen(false);
    setSummarizing(true);
    const s = getSocket({ id: userId, username });
    s.emit("summarize", { roomId, since: since?.toISOString() ?? null });
    s.once("summarizeDone", () => setSummarizing(false));
  }

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeRoomName={roomId} />

      {/* Channel list — only for non-DM rooms */}
      {!roomId.startsWith("dm-") && (
        <div className="w-44 shrink-0 border-r border-gray-800 flex flex-col">
          <div className="flex h-14 items-center border-b border-gray-800 px-3 gap-1">
            <span className="text-xs font-semibold text-gray-300 truncate flex-1">#{roomId}</span>
            <button
              onClick={() => setRoomGraphOpen(v => !v)}
              title="Room knowledge graph"
              className={`shrink-0 rounded-lg p-1 transition-colors ${roomGraphOpen ? "text-amber-400 bg-amber-900/30" : "text-gray-600 hover:text-amber-400 hover:bg-gray-800"}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M10 1a9 9 0 1 0 0 18A9 9 0 0 0 10 1ZM4.5 9.5a.75.75 0 0 0 0 1.5h3.69l-1.22 1.22a.75.75 0 1 0 1.06 1.06l2.5-2.5a.75.75 0 0 0 0-1.06l-2.5-2.5a.75.75 0 0 0-1.06 1.06l1.22 1.22H4.5Zm6.25-3.25a.75.75 0 0 1 .75-.75h.5a3 3 0 0 1 0 6h-.5a.75.75 0 0 1 0-1.5h.5a1.5 1.5 0 0 0 0-3h-.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChannelList
              roomName={roomId}
              activeChannelId={activeChannel?.id ?? null}
              canEdit={isOwner || isAdmin}
              userId={userId}
              onSelectChannel={selectChannel}
              refreshTrigger={channelRefresh}
            />
          </div>
        </div>
      )}

      {/* Per-room knowledge graph panel */}
      {roomGraphOpen && !roomId.startsWith("dm-") && roomMeta && (
        <RoomGraph
          roomName={roomId}
          roomDbId={roomMeta.id}
          onClose={() => setRoomGraphOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col min-w-0">
      <header className="flex items-center gap-3 border-b border-gray-800 px-6 py-4">
        <span className="text-lg font-semibold">
          {dmPartner ? `@ ${dmPartner}` : activeChannel ? `#${activeChannel.name}` : `#${roomId}`}
        </span>
        <span className="ml-auto text-sm text-gray-500">{username}</span>
        <button onClick={() => setDetailsOpen((v) => !v)}
          className="ml-3 rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 relative" title="Room details">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z" />
          </svg>
          {onlineMembers.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">
              {onlineMembers.length}
            </span>
          )}
        </button>
        <button onClick={() => setSettingsOpen(true)}
          className="ml-3 rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300" title="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
          </svg>
        </button>
      </header>

      {vibeSearchOpen && (
        <VibeSearch
          onSearch={vibeSearch}
          onClose={() => { setVibeSearchOpen(false); setVibeResultStatus("idle"); setHighlightedId(null); }}
          searching={vibeSearching}
          resultStatus={vibeResultStatus}
        />
      )}

      {!roomId.startsWith("dm-") && !activeChannel ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-600">Select a channel to start chatting</div>
      ) : (
        <>
          <ChatWindow messages={messages} currentUsername={username} annotations={annotations} highlightedId={highlightedId} messageRefs={messageRefs} />
          <div ref={bottomRef} />
        </>
      )}

      {/* Streaming AI cards — same amber card, text types in live */}
      {streamingMsgs.size > 0 && (
        <div className="space-y-2 px-4 py-2">
          {Array.from(streamingMsgs.entries()).map(([tempId, { text, sarcasm }]) => (
            <AIStreamingCard key={tempId} text={text} sarcasm={sarcasm} />
          ))}
        </div>
      )}

      <FunctionsBar onSummarize={() => setSummarizeModalOpen(true)} summarizing={summarizing} onVibeSearch={() => setVibeSearchOpen(true)} />

      {/* Typing indicator */}
      {typingUsers.size > 0 && (() => {
        const names = Array.from(typingUsers.values());
        const label = names.length === 1
          ? `${names[0]} is typing`
          : names.length === 2
          ? `${names[0]} and ${names[1]} are typing`
          : `${names[0]} and ${names.length - 1} others are typing`;
        return (
          <div className="flex items-center gap-2 px-5 py-1.5 text-xs text-gray-400">
            <span className="flex gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            <span>{label}</span>
          </div>
        );
      })()}

      {(roomId.startsWith("dm-") || activeChannel) && (
        <MessageInput onSend={sendMessage} onTyping={emitTyping} onStopTyping={emitStopTyping} />
      )}

      {summarizeModalOpen && (
        <SummarizeModal onConfirm={summarize} onClose={() => setSummarizeModalOpen(false)} />
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onChange={setSettings} />

      {detailsOpen && (
        <RoomDetails
          roomId={roomId}
          meta={roomMeta}
          onlineMembers={onlineMembers}
          currentUserId={userId}
          isOwner={isOwner}
          isAdmin={isAdmin}
          onClose={() => setDetailsOpen(false)}
          onKick={kickUser}
          onMetaUpdate={(meta) => setRoomMeta(meta)}
          onDelete={(isOwner || isAdmin) ? deleteRoom : undefined}
        />
      )}
      </div>
    </div>
  );
}
