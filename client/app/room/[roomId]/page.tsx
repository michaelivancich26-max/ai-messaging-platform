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
    socket.on("roomMembers", (members: { userId: string; username: string }[]) => setOnlineMembers(members));
    socket.on("roomMeta", (meta: RoomMeta) => setRoomMeta(meta));
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
      setMessages((prev) => [...prev, msg]);
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
    };
  }, [status, roomId, userId, username]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function kickUser(targetUserId: string) {
    const s = getSocket({ id: userId, username });
    s.emit("kick", { roomId, targetUserId });
  }

  function sendMessage(content: string) {
    const s = getSocket({ id: userId, username });
    s.emit("sendMessage", { roomId, userId, username, content, settings });
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
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-gray-800 px-6 py-4">
        <button onClick={() => router.push("/lobby")} className="text-gray-500 hover:text-gray-300">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </button>
        <span className="text-lg font-semibold">{dmPartner ? `@ ${dmPartner}` : `#${roomId}`}</span>
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

      <ChatWindow messages={messages} currentUsername={username} annotations={annotations} highlightedId={highlightedId} messageRefs={messageRefs} />
      <div ref={bottomRef} />

      <FunctionsBar onSummarize={() => setSummarizeModalOpen(true)} summarizing={summarizing} onVibeSearch={() => setVibeSearchOpen(true)} />
      <MessageInput onSend={sendMessage} />

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
        />
      )}
    </div>
  );
}
