"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import ChatWindow from "@/components/ChatWindow";
import MessageInput from "@/components/MessageInput";
import FunctionsBar from "@/components/FunctionsBar";
import PollBanner from "@/components/PollBanner";
import PollCard, { type Poll } from "@/components/PollCard";
import SummarizeModal from "@/components/SummarizeModal";
import VibeSearch from "@/components/VibeSearch";
import RoomPanel from "@/components/RoomPanel";
import type { Settings } from "@/components/RoomPanel";
import Sidebar from "@/components/Sidebar";
import ArenaSidebar from "@/components/ArenaSidebar";
import ChannelList, { type Channel } from "@/components/ChannelList";
import RoomGraph from "@/components/RoomGraph";
import type { ChatMessage, ClaimInfo, CredScore, DebatePosition, UserPositionEntry, DebateTurnState } from "@/lib/types";
import { parseAIContent } from "@/lib/types";
import DebateHeader from "@/components/DebateHeader";
import TurnBanner from "@/components/TurnBanner";
import UserProfileModal from "@/components/UserProfileModal";
import SidebarChat from "@/components/SidebarChat";
import SubDebateModal from "@/components/SubDebateModal";
import type { RoomMeta } from "@/components/RoomPanel";
import { getBotById } from "@/lib/bots";

export type Annotation = { pronoun: string; referent: string };

const DEFAULT_SETTINGS: Settings = { factualCorrection: true, ambiguityResolution: true };

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [annotations, setAnnotations] = useState<Record<string, Annotation>>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"room" | "settings" | "ai">("room");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeModalOpen, setSummarizeModalOpen] = useState(false);
  const [vibeSearchOpen, setVibeSearchOpen] = useState(false);
  const [vibeSearching, setVibeSearching] = useState(false);
  const [vibeResultStatus, setVibeResultStatus] = useState<"idle" | "found" | "not_found">("idle");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [onlineMembers, setOnlineMembers] = useState<{ userId: string; username: string; role?: string }[]>([]);
  const [myFishbowlRole, setMyFishbowlRole] = useState<"PARTICIPANT" | "SPECTATOR" | null>(null);
  const [seatRequests, setSeatRequests] = useState<{ userId: string; username: string }[]>([]);
  const [roomMeta, setRoomMeta] = useState<RoomMeta | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [streamingMsgs, setStreamingMsgs] = useState<Map<string, { text: string; sarcasm: boolean; isMention?: boolean }>>(new Map());
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [channelRefresh, setChannelRefresh] = useState(0);
  const [roomGraphOpen, setRoomGraphOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [pollSuggestion, setPollSuggestion] = useState<{ question: string; options: string[] } | null>(null);
  const [activePolls, setActivePolls] = useState<Poll[]>([]);
  const [claims, setClaims] = useState<Record<string, ClaimInfo>>({});
  const [credibilityScores, setCredibilityScores] = useState<Record<string, CredScore>>({});
  const [positions, setPositions] = useState<Record<string, UserPositionEntry>>({});
  const [myPosition, setMyPosition] = useState<DebatePosition | null>(null);
  const [debateTurn, setDebateTurn] = useState<DebateTurnState | null>(null);
  const [profileModal, setProfileModal] = useState<{ userId: string; username: string } | null>(null);
  const [subDebateModal, setSubDebateModal] = useState<{ messageId: string; content: string } | null>(null);
  const [subDebateCreating, setSubDebateCreating] = useState(false);
  const [stances, setStances] = useState<string[]>([]);
  const [myLastSwitchedAt, setMyLastSwitchedAt] = useState<number | null>(null);
  const [channelPositions, setChannelPositions] = useState<Record<string, Record<string, UserPositionEntry>>>({});
  const [sidebarChannel, setSidebarChannel] = useState<{ id: string; name: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMessages, setSidebarMessages] = useState<ChatMessage[]>([]);
  const [spectatorChatChannelId, setSpectatorChatChannelId] = useState<string | null>(null);
  const [spectatorChatOpen, setSpectatorChatOpen] = useState(false);
  const [spectatorChatMessages, setSpectatorChatMessages] = useState<ChatMessage[]>([]);
  const spectatorChatChannelRef = useRef<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState<{ id: string; username: string }[]>([]);
  const [inviteStatus, setInviteStatus] = useState<Record<string, "sending" | "sent" | "error">>({});
  const sidebarChannelRef = useRef<{ id: string; name: string } | null>(null);
  // Mobile: "channels" shows channel list, "chat" shows the chat area
  const [mobileView, setMobileView] = useState<"channels" | "chat">(
    roomId.startsWith("dm-") ? "chat" : "channels"
  );
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  // Ref so reconnect handler can always see the latest active channel without stale closure
  const activeChannelRef = useRef<Channel | null>(null);

  const isBotRoom = roomId.startsWith("arena-");
  const [matchState, setMatchState] = useState<"active" | "judging" | "ended">("active");
  const [matchResult, setMatchResult] = useState<{
    winner: "human" | "bot";
    verdict: string;
    scoreImpact: number;
    botId: string;
  } | null>(null);
  const [propositionScore, setPropositionScore] = useState(50); // 0=bot winning, 100=human winning
  const [timeLeft, setTimeLeft] = useState<number | null>(null); // seconds remaining
  const lastScoredLenRef = useRef(0);

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
    const roomPassword = sessionStorage.getItem(`room-pw:${roomId}`) ?? undefined;

    // Track whether this is a reconnect (vs. the initial connect).
    // On initial connect the auto-join effect handles joinChannel.
    // On reconnects we must re-send it ourselves since the server loses room membership.
    let initialConnectDone = socket.connected; // already connected = first connect already fired
    function rejoin() {
      socket.emit("joinRoom", { roomId, roomName: roomId, password: roomPassword });
      if (initialConnectDone && activeChannelRef.current) {
        // Reconnect: restore channel room (server lost it on disconnect)
        socket.emit("joinChannel", { channelId: activeChannelRef.current.id });
      }
      initialConnectDone = true;
    }
    socket.on("connect", rejoin);
    if (socket.connected) rejoin();
    socket.on("connect_error", (err) => console.error("[Socket] connect_error", err.message));
    socket.on("error", ({ message }: { message: string }) => alert(message));
    socket.on("roomDeleted", () => router.push("/lobby"));
    socket.on("kicked", () => { alert("You were kicked from this room."); router.push("/lobby"); });
    socket.on("channelsUpdated", () => setChannelRefresh(v => v + 1));
    socket.on("pollSuggested", (s: { question: string; options: string[] }) => setPollSuggestion(s));
    socket.on("pollCreated", (poll: Poll) => setActivePolls(prev => [poll, ...prev]));
    socket.on("pollUpdated", (poll: Poll) => setActivePolls(prev =>
      poll.closedAt ? prev.filter(p => p.id !== poll.id) : prev.map(p => p.id === poll.id ? poll : p)
    ));
    socket.on("claimStaked", ({ claimId, messageId, status, claimantId, challengeCount }: { claimId: string; messageId: string; status: ClaimInfo["status"]; claimantId: string; challengeCount: number }) => {
      setClaims(prev => ({ ...prev, [messageId]: { id: claimId, messageId, claimantId, status, challengeCount } }));
    });
    socket.on("claimVerdict", ({ claimId, messageId, status, reasoning, claimantId, challengeCount }: { claimId: string; messageId: string; status: ClaimInfo["status"]; reasoning: string; claimantId: string; challengeCount: number }) => {
      setClaims(prev => ({ ...prev, [messageId]: { id: claimId, messageId, claimantId, status, reasoning, challengeCount } }));
    });
    socket.on("credibilityUpdate", (score: CredScore) => {
      setCredibilityScores(prev => ({ ...prev, [score.userId]: score }));
    });
    socket.on("positionUpdate", (entry: UserPositionEntry & { channelId?: string }) => {
      if (entry.channelId) {
        setChannelPositions(prev => ({
          ...prev,
          [entry.channelId!]: { ...(prev[entry.channelId!] ?? {}), [entry.userId]: entry },
        }));
      } else {
        setPositions(prev => ({ ...prev, [entry.userId]: entry }));
        if (entry.userId === userId) setMyPosition(entry.position);
      }
    });
    socket.on("debatePositions", (entries: UserPositionEntry[]) => {
      const map: Record<string, UserPositionEntry> = {};
      entries.forEach(e => { map[e.userId] = e; });
      setPositions(prev => ({ ...prev, ...map }));
      const mine = entries.find(e => e.userId === userId);
      if (mine) setMyPosition(mine.position);
    });
    socket.on("debateTurnUpdate", (turn: DebateTurnState) => setDebateTurn(turn));
    socket.on("stancesUpdated", (newStances: string[]) => setStances(newStances));
    socket.on("channelPositions", ({ channelId, positions: entries }: { channelId: string; positions: UserPositionEntry[] }) => {
      const map: Record<string, UserPositionEntry> = {};
      entries.forEach(e => { map[e.userId] = e; });
      setChannelPositions(prev => ({ ...prev, [channelId]: map }));
    });
    socket.on("sidebarChannel", (ch: { id: string; name: string } | null) => {
      if (!ch) {
        setSidebarChannel(null);
        sidebarChannelRef.current = null;
        setSidebarMessages([]);
        return;
      }
      setSidebarChannel(ch);
      sidebarChannelRef.current = ch;
      // Use joinSidebar (not joinChannel) so we don't leave the main channel or overwrite messages via history
      socket.emit("joinSidebar", { channelId: ch.id });
      fetch(`${SERVER}/api/channels/${ch.id}/messages`)
        .then(r => r.json())
        .then((msgs: ChatMessage[]) => setSidebarMessages(msgs.filter((m: ChatMessage) => m.type === "human")))
        .catch(() => {});
    });
    socket.on("roomMembers", (members: { userId: string; username: string; role?: string }[]) => setOnlineMembers(members));
    socket.on("fishbowlRole", (role: "PARTICIPANT" | "SPECTATOR") => setMyFishbowlRole(role));
    socket.on("seatRequest", ({ userId: reqUserId, username: reqUsername }: { userId: string; username: string }) => {
      setSeatRequests(prev => prev.some(r => r.userId === reqUserId) ? prev : [...prev, { userId: reqUserId, username: reqUsername }]);
    });
    socket.on("roomMeta", (meta: RoomMeta & { stances?: string[]; isFishbowl?: boolean; fishbowlSeats?: number | null; spectatorChatChannelId?: string | null }) => {
      setRoomMeta(meta as any);
      if (meta.stances && meta.stances.length > 0) setStances(meta.stances);
      if (meta.spectatorChatChannelId && meta.spectatorChatChannelId !== spectatorChatChannelRef.current) {
        setSpectatorChatChannelId(meta.spectatorChatChannelId);
        spectatorChatChannelRef.current = meta.spectatorChatChannelId;
        socket.emit("joinSidebar", { channelId: meta.spectatorChatChannelId });
        fetch(`${SERVER}/api/channels/${meta.spectatorChatChannelId}/messages`)
          .then(r => r.json())
          .then((msgs: ChatMessage[]) => setSpectatorChatMessages(msgs.filter((m: ChatMessage) => m.type === "human")))
          .catch(() => {});
      }
    });
    socket.on("aiStreamStart", ({ tempId, sarcasm, isMention }: { tempId: string; sarcasm: boolean; isMention?: boolean }) => {
      setStreamingMsgs((prev) => new Map(prev).set(tempId, { text: "", sarcasm, isMention }));
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
    // Backfill membership for users who entered this room before RoomMember existed
    if (userId && !roomId.startsWith("dm-")) {
      fetch(`${SERVER}/api/rooms/${roomId}/join`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).catch(() => {});
    }

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

    // Channel-specific history: only apply if still viewing that channel (prevents stale overwrites on fast navigation)
    socket.on("channelHistory", ({ channelId, messages: history }: { channelId: string; messages: ChatMessage[] }) => {
      if (activeChannelRef.current?.id !== channelId) return;
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
      // Route spectator chat messages
      if (msg.channelId && msg.channelId === spectatorChatChannelRef.current) {
        setSpectatorChatMessages(prev => {
          const tempIdx = prev.findIndex(m => m.id.startsWith("temp-") && m.content === msg.content && m.userId === msg.userId);
          if (tempIdx !== -1) { const next = [...prev]; next[tempIdx] = msg; return next; }
          return [...prev, msg];
        });
        return;
      }
      // Route sidebar messages to split-pane state only when sidebar isn't the active main channel
      const isSidebarMsg = msg.channelId && msg.channelId === sidebarChannelRef.current?.id;
      const sidebarIsMainView = sidebarChannelRef.current?.id && sidebarChannelRef.current.id === activeChannelRef.current?.id;
      if (isSidebarMsg && !sidebarIsMainView) {
        setSidebarMessages(prev => {
          const tempIdx = prev.findIndex(m => m.id.startsWith("temp-") && m.content === msg.content && m.userId === msg.userId);
          if (tempIdx !== -1) { const next = [...prev]; next[tempIdx] = msg; return next; }
          return [...prev, msg];
        });
        return;
      }
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

    socket.on("reactionsUpdate", ({ messageId, reactions }: { messageId: string; reactions: import("@/lib/types").Reaction[] }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    });

    socket.on("messageEdited", ({ messageId, content, editedAt }: { messageId: string; content: string; editedAt: string }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content, editedAt } : m));
    });

    socket.on("messageDeleted", ({ messageId }: { messageId: string }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, type: "deleted" as const, content: "", deletedAt: new Date().toISOString() } : m));
    });

    return () => {
      socket.off("connect", rejoin);
      socket.off("history");
      socket.off("channelHistory");
      socket.off("message");
      socket.off("reactionsUpdate");
      socket.off("messageEdited");
      socket.off("messageDeleted");
      socket.off("connect_error");
      socket.off("error");
      socket.off("roomDeleted");
      socket.off("kicked");
      socket.off("pollSuggested");
      socket.off("pollCreated");
      socket.off("pollUpdated");
      socket.off("claimStaked");
      socket.off("claimVerdict");
      socket.off("credibilityUpdate");
      socket.off("positionUpdate");
      socket.off("debatePositions");
      socket.off("debateTurnUpdate");
      socket.off("stancesUpdated");
      socket.off("channelPositions");
      socket.off("sidebarChannel");
      socket.off("roomMembers");
      socket.off("fishbowlRole");
      socket.off("seatRequest");
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
  }, [messages, streamingMsgs]);

  // Auto-join first channel once authenticated (non-DM rooms)
  useEffect(() => {
    if (status !== "authenticated" || !userId || roomId.startsWith("dm-")) return;
    const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
    fetch(`${SERVER}/api/rooms/${roomId}/channels`)
      .then(r => r.json())
      .then(data => {
        // Apply room meta (proposition, stances) immediately from HTTP — no socket timing dep
        if (data.roomMeta) {
          setRoomMeta(data.roomMeta);
          if (Array.isArray(data.roomMeta.stances) && data.roomMeta.stances.length > 0) {
            setStances(data.roomMeta.stances);
          }
        }
        const channels: Channel[] = (data.channels ?? []).filter((c: Channel) => !c.isSubDebate && !c.isSidebar);
        if (channels.length > 0 && !activeChannel) {
          selectChannel(channels[0]);
          setMobileView("chat"); // on mobile, go straight to the chat after auto-join
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId, roomId]);

  // Arena: parse win condition from room metadata
  type WinCondition =
    | { type: "exchanges"; limit: number }
    | { type: "time"; minutes: number }
    | { type: "proposition"; threshold: number };
  const winCondition: WinCondition = (() => {
    if (!isBotRoom || !(roomMeta as any)?.matchConfig) return { type: "exchanges", limit: 10 };
    try { return JSON.parse((roomMeta as any).matchConfig) as WinCondition; }
    catch { return { type: "exchanges", limit: 10 }; }
  })();

  // Arena: derive human turn count from message list
  const myTurnCount = isBotRoom
    ? messages.filter((m) => (m as any).userId === userId).length
    : 0;

  // Arena: load existing match result on mount (handles page reload after match ends)
  useEffect(() => {
    if (!isBotRoom || !userId) return;
    fetch(`${SERVER}/api/arena-result/${encodeURIComponent(roomId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.winner) {
          setMatchResult(data);
          setMatchState("ended");
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBotRoom, userId]);

  // Arena: exchanges — auto-trigger when limit reached
  useEffect(() => {
    if (!isBotRoom || matchState !== "active" || winCondition.type !== "exchanges") return;
    if (myTurnCount >= winCondition.limit) triggerJudge(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurnCount, matchState, isBotRoom, winCondition.type, (winCondition as any).limit]);

  // Arena: time — countdown and auto-trigger when expired
  useEffect(() => {
    if (!isBotRoom || matchState !== "active" || winCondition.type !== "time" || !roomMeta) return;
    const startMs = new Date((roomMeta as any).createdAt ?? Date.now()).getTime();
    const durationMs = (winCondition as { type: "time"; minutes: number }).minutes * 60 * 1000;
    const endMs = startMs + durationMs;
    function tick() {
      const remaining = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && matchState === "active") triggerJudge(false);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBotRoom, matchState, winCondition.type, (winCondition as any).minutes, (roomMeta as any)?.createdAt]);

  // Arena: proposition — score after each message, trigger when threshold crossed
  useEffect(() => {
    if (!isBotRoom || matchState !== "active" || winCondition.type !== "proposition") return;
    if (messages.length <= lastScoredLenRef.current || messages.length < 2) return;
    lastScoredLenRef.current = messages.length;
    const threshold = (winCondition as { type: "proposition"; threshold: number }).threshold;
    fetch(`${SERVER}/api/arena-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomName: roomId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.score === undefined || matchState !== "active") return;
        const score = Math.max(0, Math.min(100, Number(data.score)));
        setPropositionScore(score);
        if (score >= threshold) triggerJudge(false, "human");
        else if (score <= 100 - threshold) triggerJudge(false, "bot");
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, isBotRoom, matchState, winCondition.type, (winCondition as any).threshold]);

  async function triggerJudge(forfeit: boolean, forcedWinner?: "human" | "bot") {
    setMatchState("judging");
    try {
      const res = await fetch(`${SERVER}/api/arena-judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: roomId, userId, forfeit, forcedWinner }),
      });
      if (res.ok) {
        const data = await res.json();
        setMatchResult(data);
        setMatchState("ended");
      } else {
        setMatchState("active");
      }
    } catch {
      setMatchState("active");
    }
  }

  function emitTyping() {
    getSocket({ id: userId, username }).emit("typing", { roomId });
  }

  function emitStopTyping() {
    getSocket({ id: userId, username }).emit("stopTyping", { roomId });
  }

  function selectChannel(channel: Channel) {
    activeChannelRef.current = channel;
    setActiveChannel(channel);
    setMessages([]);
    setActivePolls([]);
    setPollSuggestion(null);
    setClaims({});
    // Always clear sidebar state on channel switch; joinChannel will restore it if a sidebar exists
    setSidebarChannel(null);
    sidebarChannelRef.current = null;
    setSidebarMessages([]);
    setSidebarOpen(false);
    fetch(`${SERVER}/api/channels/${channel.id}/claims`)
      .then(r => r.json())
      .then(({ claims: claimsArr, credScores }: { claims: (ClaimInfo & { verdict?: string })[]; credScores: Record<string, CredScore> }) => {
        const claimsMap: Record<string, ClaimInfo> = {};
        claimsArr.forEach(c => { claimsMap[c.messageId] = { id: c.id, messageId: c.messageId, claimantId: c.claimantId, status: c.status, reasoning: c.verdict ?? undefined, challengeCount: c.challengeCount }; });
        setClaims(claimsMap);
        setCredibilityScores(prev => ({ ...prev, ...credScores }));
      })
      .catch(() => {});
    fetch(`${SERVER}/api/channels/${channel.id}/polls`)
      .then(r => r.json())
      .then((polls: Poll[]) => setActivePolls(polls))
      .catch(() => {});
    // Join the socket room for real-time messages
    const s = getSocket({ id: userId, username });
    s.emit("joinChannel", { channelId: channel.id });
    // Fetch history via HTTP — reliable regardless of socket timing
    fetch(`${SERVER}/api/channels/${channel.id}/messages`)
      .then(r => r.json())
      .then((msgs: ChatMessage[]) => {
        const restoredAnnotations: Record<string, { pronoun: string; referent: string }> = {};
        const visible: ChatMessage[] = [];
        for (const msg of msgs) {
          if (msg.type === "ai_interjection") {
            const payload = parseAIContent(msg.content);
            if (payload.type === "ambiguity") {
              const target = [...visible].reverse().find(
                m => m.type === "human" && m.content.toLowerCase().includes(payload.pronoun.toLowerCase())
              );
              if (target) restoredAnnotations[target.id] = { pronoun: payload.pronoun, referent: payload.referent };
              continue;
            }
          }
          visible.push(msg);
        }
        setMessages(visible);
        setAnnotations(restoredAnnotations);
      })
      .catch(() => {});
  }

  function createPoll(question: string, options: string[]) {
    getSocket({ id: userId, username }).emit("createPoll", {
      roomId, channelId: activeChannel?.id ?? null, question, options, userId,
    });
    setPollSuggestion(null);
  }

  function votePoll(pollId: string, option: string) {
    getSocket({ id: userId, username }).emit("votePoll", { pollId, userId, option });
  }

  function closePoll(pollId: string) {
    getSocket({ id: userId, username }).emit("closePoll", { pollId, userId });
  }

  function stakeClaim(messageId: string) {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    // Optimistic: show pending badge immediately before server responds
    setClaims(prev => ({
      ...prev,
      [messageId]: { id: `pending-${messageId}`, messageId, claimantId: userId, status: "PENDING", challengeCount: 0 },
    }));
    getSocket({ id: userId, username }).emit("stakeClaim", {
      messageId, roomId, channelId: activeChannel?.id ?? null, text: msg.content,
    });
  }

  function challengeClaim(claimId: string) {
    getSocket({ id: userId, username }).emit("challengeClaim", {
      claimId, roomId, channelId: activeChannel?.id ?? null,
    });
  }

  function setDebatePosition(pos: string) {
    if (activeChannel?.isSubDebate) {
      setChannelPositions(prev => ({
        ...prev,
        [activeChannel.id]: { ...(prev[activeChannel.id] ?? {}), [userId]: { userId, username, position: pos } },
      }));
      getSocket({ id: userId, username }).emit("setPosition", { roomId, channelId: activeChannel.id, position: pos });
    } else {
      setMyPosition(pos);
      setPositions(prev => ({ ...prev, [userId]: { userId, username, position: pos } }));
      setMyLastSwitchedAt(Date.now());
      getSocket({ id: userId, username }).emit("setPosition", { roomId, position: pos });
    }
  }

  function setDebateMode(mode: "open" | "structured") {
    // Optimistic update so the UI responds instantly
    setDebateTurn(mode === "structured"
      ? { mode: "structured", currentSide: "FOR", currentSpeakerId: null, currentSpeakerName: null, turnNumber: 1 }
      : { mode: "open", currentSide: "FOR", currentSpeakerId: null, currentSpeakerName: null, turnNumber: 0 }
    );
    getSocket({ id: userId, username }).emit("setDebateMode", { roomId, mode });
  }

  function claimFloor() {
    getSocket({ id: userId, username }).emit("claimFloor", { roomId });
  }

  function passTurn() {
    getSocket({ id: userId, username }).emit("passTurn", { roomId });
  }

  function kickUser(targetUserId: string) {
    const s = getSocket({ id: userId, username });
    s.emit("kick", { roomId, targetUserId });
  }

  function grantSeat(targetUserId: string) {
    getSocket({ id: userId, username }).emit("grantSeat", { roomId, targetUserId });
    setSeatRequests(prev => prev.filter(r => r.userId !== targetUserId));
  }

  function revokeSeat(targetUserId: string) {
    getSocket({ id: userId, username }).emit("revokeSeat", { roomId, targetUserId });
  }

  function requestSeat() {
    getSocket({ id: userId, username }).emit("requestSeat", { roomId });
  }

  async function deleteRoom() {
    const res = await fetch(`${SERVER}/api/rooms/${roomId}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) router.push("/lobby");
  }

  function sendSidebarMessage(content: string) {
    if (!sidebarChannelRef.current) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId, content, type: "human", senderType: "HUMAN",
      createdAt: new Date().toISOString(), roomId, userId,
      channelId: sidebarChannelRef.current.id,
      user: { username },
    } as any;
    setSidebarMessages(prev => [...prev, optimistic]);
    getSocket({ id: userId, username }).emit("sendMessage", {
      roomId, userId, username, content, settings,
      channelId: sidebarChannelRef.current!.id,
    });
  }

  function sendSpectatorMessage(content: string) {
    if (!spectatorChatChannelRef.current) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId, content, type: "human", senderType: "HUMAN",
      createdAt: new Date().toISOString(), roomId, userId,
      channelId: spectatorChatChannelRef.current,
      user: { username },
    } as any;
    setSpectatorChatMessages(prev => [...prev, optimistic]);
    getSocket({ id: userId, username }).emit("sendMessage", {
      roomId, userId, username, content, settings,
      channelId: spectatorChatChannelRef.current,
    });
  }

  async function createSidebarForChannel(channelId: string) {
    try {
      const res = await fetch(`${SERVER}/api/rooms/${roomId}/channels/${channelId}/sidebar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const ch = await res.json();
        const sidebar = { id: ch.id, name: ch.name };
        setSidebarChannel(sidebar);
        sidebarChannelRef.current = sidebar;
        getSocket({ id: userId, username }).emit("joinSidebar", { channelId: ch.id });
        fetch(`${SERVER}/api/channels/${ch.id}/messages`)
          .then(r => r.json())
          .then((msgs: ChatMessage[]) => setSidebarMessages(msgs))
          .catch(() => {});
        setSidebarOpen(true);
        setChannelRefresh(v => v + 1);
      }
    } catch { /* ignore */ }
  }

  async function createSubDebate(proposition: string) {
    if (!subDebateModal) return;
    setSubDebateCreating(true);
    try {
      const res = await fetch(`${SERVER}/api/rooms/${roomId}/sub-debates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          proposition,
          messageId: subDebateModal.messageId,
          messagePreview: subDebateModal.content.slice(0, 120),
        }),
      });
      if (res.ok) {
        const channel = await res.json();
        setSubDebateModal(null);
        selectChannel(channel);
        setChannelRefresh(v => v + 1);
      }
    } finally {
      setSubDebateCreating(false);
    }
  }

  useEffect(() => {
    if (!inviteQuery.trim()) { setInviteResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${SERVER}/api/users/search?q=${encodeURIComponent(inviteQuery)}&excludeId=${userId}`)
        .then(r => r.json()).then(setInviteResults).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [inviteQuery, userId]);

  function sendInvite(targetUsername: string) {
    if (!roomId.startsWith("dm-")) {
      setInviteStatus(p => ({ ...p, [targetUsername]: "sending" }));
      const s = getSocket({ id: userId, username });
      s.emit("sendInvite", { targetUsername, roomName: roomId });
      s.once("inviteSent", () => setInviteStatus(p => ({ ...p, [targetUsername]: "sent" })));
      s.once("inviteError", ({ message }: { message: string }) => {
        setInviteStatus(p => ({ ...p, [targetUsername]: "error" }));
        alert(message);
      });
    }
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

  function handleReact(messageId: string, emoji: string) {
    getSocket({ id: userId, username }).emit("addReaction", {
      messageId, emoji, roomName: roomId, channelId: activeChannel?.id ?? null,
    });
  }

  function handleEditMessage(messageId: string, content: string) {
    getSocket({ id: userId, username }).emit("editMessage", {
      messageId, content, roomName: roomId, channelId: activeChannel?.id ?? null,
    });
  }

  function handleDeleteMessage(messageId: string) {
    getSocket({ id: userId, username }).emit("deleteMessage", {
      messageId, roomName: roomId, channelId: activeChannel?.id ?? null,
    });
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
    s.emit("summarize", { roomId, since: since?.toISOString() ?? null, channelId: activeChannel?.id ?? null });
    s.once("summarizeDone", () => setSummarizing(false));
  }

  const activePositions = activeChannel?.isSubDebate
    ? (channelPositions[activeChannel.id] ?? {})
    : positions;
  const activeMyPosition = activeChannel?.isSubDebate
    ? channelPositions[activeChannel.id]?.[userId]?.position ?? null
    : myPosition;
  const activeStances = activeChannel?.isSubDebate ? ["FOR", "AGAINST"] : (stances.length > 0 ? stances : ["FOR", "AGAINST"]);
  const isOpinionated = !!(activeChannel?.isOpinionated || (roomMeta as any)?.isOpinionated);

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center text-gray-500">Loading…</div>;
  }

  return (
    <div className="flex h-full overflow-hidden">
      {roomId.startsWith("arena-")
        ? <ArenaSidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        : <Sidebar activeRoomName={roomId} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      }

      {/* Channel list — only for non-DM rooms */}
      {!roomId.startsWith("dm-") && (
        <div className={`
          border-r border-gray-800 flex flex-col bg-gray-900
          ${mobileView === "channels" ? "flex" : "hidden"}
          w-full md:w-44 md:flex md:shrink-0
        `}>
          <div className="flex min-h-14 items-center border-b border-gray-800 px-3 gap-2 pt-safe">
            {/* Mobile: hamburger to open sidebar */}
            <button className="md:hidden shrink-0 rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              onClick={() => setMobileSidebarOpen(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-xs font-semibold text-gray-300 truncate">#{roomId}</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChannelList
              roomName={roomId}
              activeChannelId={activeChannel?.id ?? null}
              canEdit={isOwner || isAdmin}
              userId={userId}
              onSelectChannel={(ch) => { setRoomGraphOpen(false); selectChannel(ch); setMobileView("chat"); }}
              refreshTrigger={channelRefresh}
              graphActive={roomGraphOpen}
              onGraphClick={() => { setRoomGraphOpen(v => !v); setMobileView("chat"); }}
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

      <div className={`
        flex-col min-w-0
        ${mobileView === "chat" || roomId.startsWith("dm-") ? "flex" : "hidden"}
        flex-1 md:flex
      `}>
      <header className="flex items-center gap-2 border-b border-gray-800 px-3 md:px-6 pb-2.5 pt-safe">
        {/* Mobile: back to channels (non-DM) or hamburger (DM) */}
        {!roomId.startsWith("dm-") ? (
          <button className="md:hidden shrink-0 rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            onClick={() => setMobileView("channels")} title="Back to channels">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
          </button>
        ) : (
          <button className="md:hidden shrink-0 rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            onClick={() => setMobileSidebarOpen(true)} title="Open menu">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <span className="text-base md:text-lg font-semibold truncate">
          {dmPartner ? `@ ${dmPartner}` : activeChannel ? `#${activeChannel.name}` : `#${roomId}`}
        </span>
        {/* Fishbowl seat counter */}
        {(roomMeta as any)?.isFishbowl && (roomMeta as any)?.fishbowlSeats && (
          <span className="hidden sm:flex shrink-0 items-center gap-1 rounded-full bg-cyan-900/40 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path d="M8 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM5 9.5a3 3 0 0 0-3 3 .5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5 3 3 0 0 0-3-3H5Z" />
            </svg>
            {onlineMembers.filter(m => m.role !== "SPECTATOR").length}/{(roomMeta as any).fishbowlSeats} seats
          </span>
        )}
        {/* Spectator chat toggle — fishbowl rooms only, visible to everyone */}
        {!roomId.startsWith("dm-") && spectatorChatChannelId && (
          <button
            onClick={() => { setSpectatorChatOpen(v => !v); if (sidebarOpen) setSidebarOpen(false); }}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
              spectatorChatOpen
                ? "border-cyan-600 bg-cyan-900/40 text-cyan-300"
                : "border-gray-700 text-gray-500 hover:border-cyan-700/60 hover:text-cyan-500"
            }`}
            title={spectatorChatOpen ? "Hide spectator chat" : "Show spectator chat"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
              <path fillRule="evenodd" d="M1.38 8.28a.87.87 0 0 1 0-.566 7.003 7.003 0 0 1 13.239.006.87.87 0 0 1 0 .565A7.003 7.003 0 0 1 1.379 8.28ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clipRule="evenodd" />
            </svg>
            Spectator chat
          </button>
        )}
        {/* Side chat toggle — participants only in fishbowl rooms; all in regular rooms */}
        {!roomId.startsWith("dm-") && activeChannel && !activeChannel.isSidebar && myFishbowlRole !== "SPECTATOR" && (
          <button
            onClick={() => {
              if (sidebarChannel) {
                setSidebarOpen(v => !v);
              } else {
                createSidebarForChannel(activeChannel.id);
              }
              if (spectatorChatOpen) setSpectatorChatOpen(false);
            }}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
              sidebarOpen && sidebarChannel
                ? "border-gray-500 bg-gray-700/60 text-gray-300"
                : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400"
            }`}
            title={sidebarChannel ? (sidebarOpen ? "Hide side chat" : "Show side chat") : "Add side chat"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path fillRule="evenodd" d="M2.5 3A1.5 1.5 0 0 0 1 4.5v7A1.5 1.5 0 0 0 2.5 13h3.879a1.5 1.5 0 0 0 1.06-.44l4.122-4.12a1.5 1.5 0 0 0 0-2.122L7.44 2.44A1.5 1.5 0 0 0 6.378 2H2.5Zm3.75 5.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" clipRule="evenodd" />
              <path d="M10.22 4.72a.75.75 0 0 1 1.06 0l.97.97.97-.97a.75.75 0 1 1 1.06 1.06l-.97.97.97.97a.75.75 0 1 1-1.06 1.06l-.97-.97-.97.97a.75.75 0 0 1-1.06-1.06l.97-.97-.97-.97a.75.75 0 0 1 0-1.06Z" />
            </svg>
            {sidebarChannel ? "Side chat" : "Add side chat"}
          </button>
        )}
        {/* Structure toggle — visible to owners/admins on non-DM rooms */}
        {(isOwner || isAdmin) && !roomId.startsWith("dm-") && (
          <button
            onClick={() => setDebateMode(debateTurn?.mode === "structured" ? "open" : "structured")}
            className={`ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
              debateTurn?.mode === "structured"
                ? "border-indigo-500 bg-indigo-600/20 text-indigo-300"
                : "border-gray-700 text-gray-500 hover:border-indigo-600/40 hover:text-indigo-400"
            }`}
            title={debateTurn?.mode === "structured" ? "Switch to free chat" : "Enable structured turn-based debate"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.575a.75.75 0 0 1-1.12.814L8 11.232l-3.136 2.762a.75.75 0 0 1-1.12-.814l.853-3.576-2.79-2.39a.75.75 0 0 1 .427-1.316l3.663-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
            </svg>
            {debateTurn?.mode === "structured" ? "Structured on" : "Structure"}
          </button>
        )}
        {/* Invite button — only for non-DM rooms */}
        {!roomId.startsWith("dm-") && (
          <button
            onClick={() => { setInviteOpen(v => !v); setInviteQuery(""); setInviteResults([]); setInviteStatus({}); }}
            className={`${(isOwner || isAdmin) ? "" : "ml-auto"} relative rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors`}
            title="Invite user"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2.046 15.253c-.18.736.411 1.497 1.163 1.497H12.79c.752 0 1.343-.761 1.163-1.497C13.357 12.585 11.205 11 8 11s-5.357 1.585-5.954 3.253ZM15.5 7a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 15.5 7Z" />
            </svg>
          </button>
        )}

        {/* Single panel button — opens unified Room/Settings/AI panel */}
        <button
          onClick={() => { setPanelTab("room"); setPanelOpen(v => !v); }}
          className={`${(isOwner || isAdmin) && !roomId.startsWith("dm-") ? "ml-2" : (roomId.startsWith("dm-") ? "ml-auto" : "")} relative rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors`}
          title="Room panel">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z" />
          </svg>
          {onlineMembers.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">
              {onlineMembers.length}
            </span>
          )}
        </button>
      </header>

      {/* Invite modal */}
      {inviteOpen && !roomId.startsWith("dm-") && (
        <div className="border-b border-gray-800 bg-gray-900/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inviteQuery}
                onChange={e => setInviteQuery(e.target.value)}
                placeholder="Search by username…"
                autoFocus
                className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              />
              {inviteResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                  {inviteResults.map(u => {
                    const st = inviteStatus[u.username];
                    return (
                      <div key={u.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-800 transition-colors">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300">
                          {u.username[0].toUpperCase()}
                        </span>
                        <span className="flex-1 text-sm text-gray-200">{u.username}</span>
                        <button
                          onClick={() => sendInvite(u.username)}
                          disabled={!!st}
                          className={`rounded-full px-3 py-0.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                            st === "sent" ? "bg-emerald-600/20 text-emerald-400" :
                            st === "error" ? "bg-red-600/20 text-red-400" :
                            "bg-indigo-600 text-white hover:bg-indigo-500"
                          }`}
                        >
                          {st === "sent" ? "Sent!" : st === "error" ? "Error" : st === "sending" ? "…" : "Invite"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              onClick={() => setInviteOpen(false)}
              className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-800 hover:text-gray-400 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {vibeSearchOpen && (
        <VibeSearch
          onSearch={vibeSearch}
          onClose={() => { setVibeSearchOpen(false); setVibeResultStatus("idle"); setHighlightedId(null); }}
          searching={vibeSearching}
          resultStatus={vibeResultStatus}
        />
      )}

      {/* Debate proposition + position picker */}
      {!roomId.startsWith("dm-") && (activeChannel?.isSubDebate || ((roomMeta as any)?.proposition)) && (
        <DebateHeader
          proposition={
            activeChannel?.isSubDebate
              ? ((activeChannel as any).proposition ?? "Sub-debate")
              : (roomMeta as any).proposition
          }
          stances={activeStances}
          positions={activePositions}
          myPosition={activeMyPosition}
          credibilityScores={credibilityScores}
          debateTurn={debateTurn}
          isOwner={isOwner}
          isAdmin={isAdmin}
          isOpinionated={isOpinionated}
          stanceCooldown={(roomMeta as any)?.stanceCooldown ?? 0}
          myLastSwitchedAt={myLastSwitchedAt}
          onSetPosition={setDebatePosition}
          onSetDebateMode={setDebateMode}
        />
      )}

      {/* Opinionated badge when there's no proposition/DebateHeader */}
      {!roomId.startsWith("dm-") && isOpinionated && !activeChannel?.isSubDebate && !(roomMeta as any)?.proposition && (
        <div className="shrink-0 flex items-center gap-1.5 border-b border-amber-900/30 bg-amber-950/20 px-4 py-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-amber-500">
            <path fillRule="evenodd" d="M1 8.74c0 .983.713 1.825 1.69 1.943L3 10.698V13.5a.5.5 0 0 0 .724.447L8 11.82l4.276 2.127A.5.5 0 0 0 13 13.5v-2.802l.31-.016A2 2 0 0 0 15 8.74V5a3 3 0 0 0-3-3H4a3 3 0 0 0-3 3v3.74Z" clipRule="evenodd" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Opinionated chat</span>
          <span className="text-[10px] text-amber-600">· messages don&apos;t affect your Veritas Score</span>
        </div>
      )}

      {/* Fishbowl spectator banner */}
      {(roomMeta as any)?.isFishbowl && myFishbowlRole === "SPECTATOR" && (
        <div className="shrink-0 flex items-center gap-3 border-b border-cyan-900/40 bg-cyan-950/20 px-4 py-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-cyan-400">
            <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
          </svg>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">Spectating</span>
            <span className="ml-2 text-xs text-cyan-600">You can watch but not send messages</span>
          </div>
          <button
            onClick={requestSeat}
            className="shrink-0 rounded-full bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500 transition-colors"
          >
            Request a seat
          </button>
        </div>
      )}

      {/* Seat request notifications (owner only) */}
      {isOwner && seatRequests.length > 0 && (
        <div className="shrink-0 space-y-1 border-b border-cyan-900/40 bg-cyan-950/10 px-4 py-2">
          {seatRequests.map(req => (
            <div key={req.userId} className="flex items-center gap-3">
              <span className="flex-1 text-xs text-cyan-300">
                <span className="font-semibold">{req.username}</span> is requesting a debate seat
              </span>
              <button onClick={() => grantSeat(req.userId)} className="rounded-full bg-cyan-600 px-3 py-0.5 text-xs font-semibold text-white hover:bg-cyan-500 transition-colors">Grant</button>
              <button onClick={() => setSeatRequests(prev => prev.filter(r => r.userId !== req.userId))} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Dismiss</button>
            </div>
          ))}
        </div>
      )}

      {/* Arena match progress banner */}
      {isBotRoom && matchState === "active" && winCondition.type === "exchanges" && (
        <div className="shrink-0 flex items-center gap-3 border-b border-amber-900/30 bg-amber-950/15 px-4 py-2">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-amber-500">
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
          </svg>
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Arena Match</span>
            <span className="text-[10px] text-amber-700">·</span>
            <span className="text-[10px] text-amber-600/80">{myTurnCount} / {winCondition.limit} exchanges</span>
            <div className="flex gap-0.5 ml-1">
              {Array.from({ length: winCondition.limit }).map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i < myTurnCount ? "bg-amber-500" : "bg-gray-700"}`} />
              ))}
            </div>
          </div>
          <button onClick={() => triggerJudge(true)} className="shrink-0 rounded-full border border-red-800/50 px-2.5 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-900/20 transition-colors">Forfeit</button>
        </div>
      )}
      {isBotRoom && matchState === "active" && winCondition.type === "time" && (
        <div className="shrink-0 flex items-center gap-3 border-b border-indigo-900/30 bg-indigo-950/15 px-4 py-2">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-indigo-400">
            <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
          </svg>
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">Arena Match</span>
            <span className="text-[10px] text-indigo-700">·</span>
            {timeLeft !== null && (
              <span className={`text-[10px] font-mono font-bold ${timeLeft <= 30 ? "text-red-400" : "text-indigo-300"}`}>
                {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
              </span>
            )}
            <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden mx-1">
              {timeLeft !== null && (
                <div
                  className="h-full bg-indigo-500 transition-all duration-1000"
                  style={{ width: `${(timeLeft / (winCondition.minutes * 60)) * 100}%` }}
                />
              )}
            </div>
          </div>
          <button onClick={() => triggerJudge(true)} className="shrink-0 rounded-full border border-red-800/50 px-2.5 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-900/20 transition-colors">Forfeit</button>
        </div>
      )}
      {isBotRoom && matchState === "active" && winCondition.type === "proposition" && (
        <div className="shrink-0 border-b border-violet-900/30 bg-violet-950/10 px-4 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-violet-400">
              <path d="M7.457 3.843A1.5 1.5 0 0 1 8.5 3.002L13 3a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1l-4.5-.002a1.5 1.5 0 0 1-1.043-.841L6.9 3.75l.557.093zM3 8.998l4.5.002a1.5 1.5 0 0 1 1.043.841L9.1 11.25l-.557-.093A1.5 1.5 0 0 1 7.5 11.998L3 12a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z"/>
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">Proposition Bar</span>
            <span className="text-[10px] text-violet-700">·</span>
            <span className="text-[10px] text-violet-500/70">win at {winCondition.threshold}%</span>
            <button onClick={() => triggerJudge(true)} className="ml-auto shrink-0 rounded-full border border-red-800/50 px-2.5 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-900/20 transition-colors">Forfeit</button>
          </div>
          {/* Sliding proposition bar */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-red-400 shrink-0 w-8 text-right">Bot</span>
            <div className="relative flex-1 h-3 rounded-full bg-gray-800 overflow-hidden">
              {/* Bot zone (left) */}
              <div className="absolute inset-y-0 left-0 bg-red-600/50 rounded-full transition-all duration-700" style={{ width: `${100 - propositionScore}%` }} />
              {/* Human zone (right) */}
              <div className="absolute inset-y-0 right-0 bg-emerald-600/50 rounded-full transition-all duration-700" style={{ width: `${propositionScore}%` }} />
              {/* Center needle */}
              <div className="absolute inset-y-0 w-0.5 bg-white/80 transition-all duration-700" style={{ left: `${propositionScore}%`, transform: "translateX(-50%)" }} />
            </div>
            <span className="text-[9px] font-bold text-emerald-400 shrink-0 w-8">You</span>
          </div>
        </div>
      )}
      {isBotRoom && matchState === "judging" && (
        <div className="shrink-0 flex items-center justify-center gap-2 border-b border-amber-900/30 bg-amber-950/15 px-4 py-3">
          <svg className="h-4 w-4 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs font-medium text-amber-400">Judging the debate…</span>
        </div>
      )}

      {(() => {
        const anyPanelOpen = (sidebarOpen && !!sidebarChannel) || (spectatorChatOpen && !!spectatorChatChannelId);
        return (
      <div className={`flex flex-1 overflow-hidden min-h-0 ${anyPanelOpen ? "flex-row" : "flex-col"}`}>
        {/* Main chat column — hidden on mobile when sidebar is open (sidebar takes full screen instead) */}
        <div className={`relative flex-col flex-1 overflow-hidden min-w-0 ${anyPanelOpen ? "hidden md:flex" : "flex"}`}>
          {/* Arena match result overlay */}
          {isBotRoom && matchState === "ended" && matchResult && (() => {
            const bot = getBotById(matchResult.botId);
            const won = matchResult.winner === "human";
            return (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-950/85 backdrop-blur-sm">
                <div className="mx-4 w-full max-w-sm rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-6 text-center space-y-4">
                  <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${won ? "bg-emerald-950 ring-2 ring-emerald-700" : "bg-red-950 ring-2 ring-red-800"}`}>
                    {won ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-emerald-400">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="9 12 11 14 15 10" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-red-400">
                        <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h2 className={`text-2xl font-bold ${won ? "text-emerald-400" : "text-red-400"}`}>
                      {won ? "You Won!" : "You Lost"}
                    </h2>
                    {bot && <p className="mt-0.5 text-sm text-gray-500">vs. {bot.name} — {bot.title}</p>}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-400 italic">"{matchResult.verdict}"</p>
                  <div className={`rounded-xl px-4 py-2.5 ring-1 ${won ? "bg-emerald-950/40 ring-emerald-900/40" : "bg-red-950/30 ring-red-900/30"}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Veritas Score Impact</p>
                    <p className={`text-xl font-bold tabular-nums mt-0.5 ${won ? "text-emerald-400" : "text-red-400"}`}>
                      {matchResult.scoreImpact > 0 ? "+" : ""}{matchResult.scoreImpact.toFixed(1)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push("/arena")}
                      className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition-colors"
                    >
                      Return to Arena
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {!roomId.startsWith("dm-") && !activeChannel ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-600">Select a channel to start chatting</div>
          ) : (
            <>
              {activeChannel?.isSubDebate && activeChannel.proposition && (
                <div className="shrink-0 border-b border-amber-900/40 bg-amber-950/20 px-4 py-2 flex items-start gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500">
                    <path fillRule="evenodd" d="M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 0 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    <path d="M3 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM11.5 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM3 11.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM11.5 11.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
                  </svg>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Sub-debate</span>
                    <p className="text-xs text-amber-200/80 leading-relaxed">{activeChannel.proposition}</p>
                    {activeChannel.parentMessagePreview && (
                      <p className="mt-0.5 text-[10px] italic text-gray-600 line-clamp-1">"{activeChannel.parentMessagePreview}"</p>
                    )}
                  </div>
                </div>
              )}
              <ChatWindow messages={messages} currentUsername={username} currentUserId={userId} isAdmin={isAdmin} annotations={annotations} highlightedId={highlightedId} messageRefs={messageRefs} streamingMsgs={streamingMsgs} claims={claims} credibilityScores={credibilityScores} positions={activePositions} stances={activeStances} onStakeClaim={isOpinionated ? undefined : stakeClaim} onChallengeClaim={isOpinionated ? undefined : challengeClaim} onUserClick={(uid, uname) => setProfileModal({ userId: uid, username: uname })} onSubDebate={(msgId, content) => setSubDebateModal({ messageId: msgId, content })} onReact={handleReact} onEdit={handleEditMessage} onDelete={handleDeleteMessage} />
              <div ref={bottomRef} />
            </>
          )}
        </div>
        {/* Sidebar chat panel (participants) */}
        {sidebarOpen && sidebarChannel && (
          <SidebarChat
            messages={sidebarMessages}
            currentUsername={username}
            onSend={sendSidebarMessage}
            onClose={() => setSidebarOpen(false)}
          />
        )}
        {/* Spectator chat panel (fishbowl rooms) */}
        {spectatorChatOpen && spectatorChatChannelId && (
          <SidebarChat
            messages={spectatorChatMessages}
            currentUsername={username}
            onSend={sendSpectatorMessage}
            onClose={() => setSpectatorChatOpen(false)}
            variant="spectator"
            readOnly={myFishbowlRole !== "SPECTATOR"}
          />
        )}
      </div>
        );
      })()}

      {/* Poll suggestion banner */}
      {pollSuggestion && (
        <PollBanner
          suggestion={pollSuggestion}
          onDismiss={() => setPollSuggestion(null)}
          onConfirm={createPoll}
        />
      )}

      {/* Active polls */}
      {activePolls.length > 0 && (
        <div className="shrink-0 max-h-64 overflow-y-auto border-t border-gray-800/60">
          {activePolls.map(poll => (
            <PollCard
              key={poll.id}
              poll={poll}
              currentUserId={userId}
              canClose={isOwner || isAdmin || poll.createdBy === userId}
              onVote={votePoll}
              onClose={closePoll}
            />
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

      {/* Turn-based debate banner */}
      {debateTurn?.mode === "structured" && !roomId.startsWith("dm-") && (
        <TurnBanner
          turn={debateTurn}
          myPosition={activeMyPosition}
          myUserId={userId}
          isOwner={isOwner}
          isAdmin={isAdmin}
          onClaimFloor={claimFloor}
          onPassTurn={passTurn}
          onEndStructured={() => setDebateMode("open")}
          stances={activeStances}
        />
      )}

      {(roomId.startsWith("dm-") || activeChannel) && (() => {
        const isSidebarChannel = activeChannel?.isSidebar === true;
        const isSpectating = (roomMeta as any)?.isFishbowl && myFishbowlRole === "SPECTATOR";
        const isStructured = debateTurn?.mode === "structured" && !roomId.startsWith("dm-") && !isSidebarChannel;
        const isMyTurn = debateTurn?.currentSpeakerId === userId;
        const floorClaimed = !!debateTurn?.currentSpeakerId;
        const isMySide = myPosition === debateTurn?.currentSide;
        const arenaLocked = isBotRoom && matchState !== "active";
        const locked = isSpectating || (isStructured && !isMyTurn) || arenaLocked;
        const reason = arenaLocked
          ? matchState === "judging"
            ? "Judging in progress…"
            : "The match has ended"
          : isSpectating
          ? "You're spectating — request a seat above to participate"
          : isStructured
          ? !myPosition || myPosition === "NEUTRAL"
            ? "Set a FOR or AGAINST position to participate in structured debate"
            : !isMySide
            ? `Waiting for the ${debateTurn?.currentSide} side to speak…`
            : floorClaimed
            ? `${debateTurn?.currentSpeakerName} has the floor`
            : "Claim the floor above to speak"
          : undefined;
        return <MessageInput onSend={sendMessage} onTyping={emitTyping} onStopTyping={emitStopTyping} disabled={locked} disabledReason={reason} members={onlineMembers.map(m => ({ id: m.userId, username: m.username }))} />;
      })()}

      {summarizeModalOpen && (
        <SummarizeModal onConfirm={summarize} onClose={() => setSummarizeModalOpen(false)} />
      )}

      {profileModal && (
        <UserProfileModal userId={profileModal.userId} onClose={() => setProfileModal(null)} />
      )}

      {subDebateModal && (
        <SubDebateModal
          messageContent={subDebateModal.content}
          loading={subDebateCreating}
          onConfirm={createSubDebate}
          onClose={() => setSubDebateModal(null)}
        />
      )}

      <RoomPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        tab={panelTab}
        roomId={roomId}
        meta={roomMeta}
        onlineMembers={onlineMembers}
        currentUserId={userId}
        isOwner={isOwner}
        isAdmin={isAdmin}
        onKick={kickUser}
        onGrantSeat={grantSeat}
        onRevokeSeat={revokeSeat}
        onMetaUpdate={(meta) => setRoomMeta(meta)}
        onDelete={(isOwner || isAdmin) ? deleteRoom : undefined}
        settings={settings}
        onSettingsChange={setSettings}
      />
      </div>
    </div>
  );
}
