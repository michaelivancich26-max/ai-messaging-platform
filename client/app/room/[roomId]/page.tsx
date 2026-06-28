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
  const [onlineMembers, setOnlineMembers] = useState<{ userId: string; username: string }[]>([]);
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
  const [channelPositions, setChannelPositions] = useState<Record<string, Record<string, UserPositionEntry>>>({});
  const [sidebarChannel, setSidebarChannel] = useState<{ id: string; name: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMessages, setSidebarMessages] = useState<ChatMessage[]>([]);
  const sidebarChannelRef = useRef<{ id: string; name: string } | null>(null);
  // Mobile: "channels" shows channel list, "chat" shows the chat area
  const [mobileView, setMobileView] = useState<"channels" | "chat">(
    roomId.startsWith("dm-") ? "chat" : "channels"
  );
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  // Ref so reconnect handler can always see the latest active channel without stale closure
  const activeChannelRef = useRef<Channel | null>(null);

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
    socket.on("roomMembers", (members: { userId: string; username: string }[]) => setOnlineMembers(members));
    socket.on("roomMeta", (meta: RoomMeta & { stances?: string[] }) => {
      setRoomMeta(meta);
      if (meta.stances && meta.stances.length > 0) setStances(meta.stances);
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

    socket.on("message", (msg: ChatMessage) => {
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

    return () => {
      socket.off("connect", rejoin);
      socket.off("history");
      socket.off("message");
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
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeRoomName={roomId} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      {/* Channel list — only for non-DM rooms */}
      {!roomId.startsWith("dm-") && (
        <div className={`
          border-r border-gray-800 flex flex-col bg-gray-900
          ${mobileView === "channels" ? "flex" : "hidden"}
          w-full md:w-44 md:flex md:shrink-0
        `}>
          <div className="flex h-14 items-center border-b border-gray-800 px-3 gap-2">
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
      <header className="flex items-center gap-2 border-b border-gray-800 px-3 md:px-6 py-2.5">
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
        {/* Side chat toggle — visible for any non-sidebar, non-DM channel */}
        {!roomId.startsWith("dm-") && activeChannel && !activeChannel.isSidebar && (
          <button
            onClick={() => {
              if (sidebarChannel) {
                setSidebarOpen(v => !v);
              } else {
                createSidebarForChannel(activeChannel.id);
              }
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
        {/* Single panel button — opens unified Room/Settings/AI panel */}
        <button
          onClick={() => { setPanelTab("room"); setPanelOpen(v => !v); }}
          className={`${(isOwner || isAdmin) && !roomId.startsWith("dm-") ? "ml-2" : "ml-auto"} relative rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors`}
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

      <div className={`flex flex-1 overflow-hidden min-h-0 ${sidebarOpen && sidebarChannel ? "flex-row" : "flex-col"}`}>
        {/* Main chat column */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
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
              <ChatWindow messages={messages} currentUsername={username} annotations={annotations} highlightedId={highlightedId} messageRefs={messageRefs} streamingMsgs={streamingMsgs} claims={claims} credibilityScores={credibilityScores} positions={activePositions} stances={activeStances} onStakeClaim={isOpinionated ? undefined : stakeClaim} onChallengeClaim={isOpinionated ? undefined : challengeClaim} onUserClick={(uid, uname) => setProfileModal({ userId: uid, username: uname })} onSubDebate={(msgId, content) => setSubDebateModal({ messageId: msgId, content })} />
              <div ref={bottomRef} />
            </>
          )}
        </div>
        {/* Sidebar chat panel */}
        {sidebarOpen && sidebarChannel && (
          <SidebarChat
            messages={sidebarMessages}
            currentUsername={username}
            onSend={sendSidebarMessage}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>

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
        const isStructured = debateTurn?.mode === "structured" && !roomId.startsWith("dm-") && !isSidebarChannel;
        const isMyTurn = debateTurn?.currentSpeakerId === userId;
        const floorClaimed = !!debateTurn?.currentSpeakerId;
        const isMySide = myPosition === debateTurn?.currentSide;
        const locked = isStructured && !isMyTurn;
        const reason = isStructured
          ? !myPosition || myPosition === "NEUTRAL"
            ? "Set a FOR or AGAINST position to participate in structured debate"
            : !isMySide
            ? `Waiting for the ${debateTurn?.currentSide} side to speak…`
            : floorClaimed
            ? `${debateTurn?.currentSpeakerName} has the floor`
            : "Claim the floor above to speak"
          : undefined;
        return <MessageInput onSend={sendMessage} onTyping={emitTyping} onStopTyping={emitStopTyping} disabled={locked} disabledReason={reason} />;
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
        onMetaUpdate={(meta) => setRoomMeta(meta)}
        onDelete={(isOwner || isAdmin) ? deleteRoom : undefined}
        settings={settings}
        onSettingsChange={setSettings}
      />
      </div>
    </div>
  );
}
