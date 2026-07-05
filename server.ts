import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { PrismaClient, SenderType } from "@prisma/client";
import { createClient } from "redis";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { scheduleAI, respondToMention } from "./services/aiOrchestrator";
import { evaluateClaim, computeCredibility } from "./services/claimEvaluator";
import { summarizeConversation } from "./services/summarizer";
import { containsSlur } from "./services/contentFilter";
import { respondAsBot, BOT_IDS, judgeMatch, scoreMatch } from "./services/debateBot";
import bcrypt from "bcryptjs";

const CLIENT_ORIGIN = process.env.CLIENT_URL ?? "http://localhost:3000";
const ALLOWED_ORIGINS = [
  CLIENT_ORIGIN,
  "http://localhost:3000",
  "https://ai-messaging-platform-7wpu.space",
  "https://ai-messaging-platform-7wpu.vercel.app",
];

const app = express();
app.set("trust proxy", 1);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());
// General limit — generous enough for rapid room navigation (each page load = ~6 GET requests)
app.use(rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }));
// Tighter limit for write operations (POST/PATCH/DELETE)
const writeLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
app.use((req, _res, next) => { if (req.method !== "GET") return writeLimiter(req, _res, next); next(); });

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
});

// Socket middleware — attach session user to socket
io.use((socket, next) => {
  const user = socket.handshake.auth?.user as { id: string; username: string } | undefined;
  if (!user?.id || !user?.username) return next(new Error("Authentication required"));
  (socket as any).user = user;
  console.log("[Auth] Socket connected:", user.username);
  next();
});

const prisma = new PrismaClient();

const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
redis.on("error", (err) => console.error("[Redis] Client error:", err));
redis.connect().catch(console.error);

const WINDOW_KEY = (roomId: string) => `chat:${roomId}:window`;
const WINDOW_SIZE = 6;

function mapMessages(messages: any[]) {
  return messages.map((m) => {
    if (m.deletedAt) return { ...m, content: "", type: "deleted" };
    let type: string = "human";
    let content = m.content;
    if (m.senderType === "AI") {
      if (m.content.startsWith('{"type":"summary"')) type = "summary";
      else type = "ai_interjection";
    } else if (m.content.startsWith('{"type":"image"')) {
      type = "image";
      try {
        const p = JSON.parse(m.content);
        content = JSON.stringify({ type: "image", src: null, filename: p.filename, messageId: m.id });
      } catch {}
    }
    return { ...m, content, type };
  });
}

async function loadWithReactions(messages: any[]) {
  const mapped = mapMessages(messages);
  if (mapped.length === 0) return mapped;
  try {
    const ids = mapped.map((m: any) => m.id);
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","messageId","userId","username","emoji" FROM "Reaction" WHERE "messageId" = ANY($1::text[])`,
      ids
    );
    const byMsg: Record<string, any[]> = {};
    for (const r of rows) {
      if (!byMsg[r.messageId]) byMsg[r.messageId] = [];
      byMsg[r.messageId].push({ id: r.id, userId: r.userId, username: r.username, emoji: r.emoji });
    }
    return mapped.map((m: any) => ({ ...m, reactions: byMsg[m.id] ?? [] }));
  } catch {
    return mapped.map((m: any) => ({ ...m, reactions: [] }));
  }
}

// Presence: roomId → Map<socketId, { userId, username }>
const presence = new Map<string, Map<string, { userId: string; username: string; role?: string }>>();

// Tracks bot rooms where an opening message is already in flight (prevents double-fire on fast reconnects)
const botOpeningPending = new Set<string>();

// Global socket index: userId → Set<socketId> for real-time notification delivery
const userSockets = new Map<string, Set<string>>();

function deliverNotification(userId: string, notif: object) {
  const sids = userSockets.get(userId);
  if (!sids) return;
  for (const sid of sids) io.to(sid).emit("notification", notif);
}

// Debate positions: roomId → Map<userId, { userId, username, position }>
const debatePositions = new Map<string, Map<string, { userId: string; username: string; position: string }>>();

// Structured debate turn state: roomId → turn state
interface DebateTurnState {
  mode: "open" | "structured";
  currentSide: "FOR" | "AGAINST";
  currentSpeakerId: string | null;
  currentSpeakerName: string | null;
  turnNumber: number;
}
const debateTurns = new Map<string, DebateTurnState>();
const channelSidebars = new Map<string, string>(); // parentChannelId → sidebar channelId
const channelPositions = new Map<string, Map<string, { userId: string; username: string; position: string }>>();

function broadcastPresence(roomId: string) {
  const members = presence.get(roomId);
  const list = members ? Array.from(members.values()) : [];
  io.to(roomId).emit("roomMembers", list);
}

async function getFishbowlRole(userId: string, roomId: string): Promise<string> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ role: string }[]>(
      `SELECT "role" FROM "RoomMember" WHERE "userId" = $1 AND "roomId" = $2`, userId, roomId
    );
    return rows[0]?.role ?? "SPECTATOR";
  } catch { return "PARTICIPANT"; }
}

function leavePresence(socketId: string) {
  for (const [roomId, members] of presence.entries()) {
    if (members.has(socketId)) {
      members.delete(socketId);
      broadcastPresence(roomId);
      if (members.size === 0) presence.delete(roomId);
    }
  }
}

io.on("connection", (socket) => {
  const socketUser = (socket as any).user as { id: string; username: string };

  // Register socket for notification delivery
  if (!userSockets.has(socketUser.id)) userSockets.set(socketUser.id, new Set());
  userSockets.get(socketUser.id)!.add(socket.id);

  socket.on("disconnect", () => {
    leavePresence(socket.id);
    const sids = userSockets.get(socketUser.id);
    if (sids) {
      sids.delete(socket.id);
      if (sids.size === 0) userSockets.delete(socketUser.id);
    }
  });

  socket.on("joinRoom", async (payload: { roomId: string; roomName: string; password?: string }) => {
    const { roomId, roomName, password } = payload;
    try {
      const room = await prisma.room.findUnique({ where: { name: roomName } });
      if (!room) { socket.emit("roomDeleted"); return; }

      if (room.isDM && room.participant1Id !== socketUser.id && room.participant2Id !== socketUser.id) {
        socket.emit("roomDeleted"); return;
      }
      if (room.isPrivate && room.password) {
        const requestingUser = await prisma.user.findUnique({ where: { id: socketUser.id } });
        const isAdmin = requestingUser?.isAdmin ?? false;
        const isCreator = room.creatorId === socketUser.id;
        if (!isAdmin && !isCreator) {
          if (!password) { socket.emit("error", { message: "Password required." }); return; }
          const valid = await bcrypt.compare(password, room.password);
          if (!valid) { socket.emit("error", { message: "Incorrect password." }); return; }
        }
      }
      socket.data.roomDbId = room.id;
      socket.data.roomId = roomId;

      socket.join(roomId);

      // Presence — include fishbowl role if applicable
      const isFishbowl = !!(room as any).isFishbowl;
      let fishbowlRole = "PARTICIPANT";
      if (isFishbowl) fishbowlRole = await getFishbowlRole(socketUser.id, room.id);
      if (!presence.has(roomId)) presence.set(roomId, new Map());
      presence.get(roomId)!.set(socket.id, {
        userId: socketUser.id, username: socketUser.username,
        ...(isFishbowl ? { role: fishbowlRole } : {}),
      });
      broadcastPresence(roomId);
      if (isFishbowl) socket.emit("fishbowlRole", fishbowlRole);

      // Send room meta (without password hash)
      const { password: _pw, ...roomMeta } = room as any;
      let stances: string[] = [];
      let stanceCooldown = 0;
      let metaIsFishbowl = false;
      let metaFishbowlSeats: number | null = null;
      let spectatorChatChannelId: string | null = null;
      let metaMatchConfig: string | null = null;
      let metaIsBotRoom = false;
      let metaBotId: string | null = null;
      try {
        const stRow = await prisma.$queryRawUnsafe<{
          stances: string | null; stanceCooldown: number | null;
          isFishbowl: boolean; fishbowlSeats: number | null;
          matchConfig: string | null; isBotRoom: boolean; botId: string | null;
        }[]>(
          `SELECT "stances", "stanceCooldown", "isFishbowl", "fishbowlSeats", "matchConfig", "isBotRoom", "botId" FROM "Room" WHERE "id" = $1`, room.id
        );
        if (stRow[0]?.stances) stances = JSON.parse(stRow[0].stances);
        if (stRow[0]?.stanceCooldown) stanceCooldown = stRow[0].stanceCooldown;
        metaIsFishbowl = stRow[0]?.isFishbowl ?? false;
        metaFishbowlSeats = stRow[0]?.fishbowlSeats ?? null;
        metaMatchConfig = stRow[0]?.matchConfig ?? null;
        metaIsBotRoom = stRow[0]?.isBotRoom ?? false;
        metaBotId = stRow[0]?.botId ?? null;
      } catch { /* columns may not exist yet */ }
      if (metaIsFishbowl) {
        try {
          const scRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
            `SELECT "id" FROM "Channel" WHERE "roomId" = $1 AND "isSpectatorChat" = true LIMIT 1`, room.id
          );
          spectatorChatChannelId = scRows[0]?.id ?? null;
          if (spectatorChatChannelId) socket.join(`channel:${spectatorChatChannelId}`);
        } catch { /* ignore */ }
      }
      socket.emit("roomMeta", { ...roomMeta, stances, stanceCooldown, isFishbowl: metaIsFishbowl, fishbowlSeats: metaFishbowlSeats, spectatorChatChannelId, matchConfig: metaMatchConfig, isBotRoom: metaIsBotRoom, botId: metaBotId });

      // Bot rooms: emit history (no channels, so this is the only delivery path)
      // and trigger bot opening if botFirst is set
      if (metaIsBotRoom) {
        try {
          const botHistory = await prisma.message.findMany({
            where: { roomId: room.id },
            orderBy: { createdAt: "desc" },
            take: 50,
            include: { user: true },
          });
          botHistory.reverse();
          socket.emit("history", await loadWithReactions(botHistory));

          const cfg = metaMatchConfig ? JSON.parse(metaMatchConfig) : null;
          console.log("[BotFirst] joinRoom", { roomName: room.name, botFirst: cfg?.botFirst, botId: metaBotId });
          if (cfg?.botFirst && metaBotId) {
            const msgCount = await prisma.message.count({ where: { roomId: room.id } });
            console.log("[BotFirst] msgCount=", msgCount, "pending=", botOpeningPending.has(room.id));
            if (msgCount === 0 && !botOpeningPending.has(room.id)) {
              botOpeningPending.add(room.id);
              console.log("[BotFirst] firing respondAsBot from joinRoom", { botId: metaBotId, roomName: room.name });
              respondAsBot(room.id, room.name, metaBotId, "", null, io, prisma, true)
                .finally(() => botOpeningPending.delete(room.id));
            }
          }
        } catch (e) { console.error("[BotFirst] joinRoom error", e); }
      }

      // Emit current turn state — restore from Redis if not in memory (e.g. after server restart)
      if (!debateTurns.has(roomId)) {
        try {
          const saved = await redis.get(`debate:turn:${roomId}`);
          if (saved) debateTurns.set(roomId, JSON.parse(saved) as DebateTurnState);
        } catch { /* redis unavailable */ }
      }
      const currentTurn = debateTurns.get(roomId);
      if (currentTurn) socket.emit("debateTurnUpdate", currentTurn);

      // Emit current debate positions for this room
      const roomPositions = debatePositions.get(roomId);
      if (roomPositions) {
        socket.emit("debatePositions", Array.from(roomPositions.values()));
      } else {
        // Load persisted positions from DB and hydrate in-memory
        try {
          const persisted = await prisma.$queryRawUnsafe<{ userId: string; position: string }[]>(
            `SELECT "userId", "position"::text FROM "UserPosition" WHERE "roomId" = $1`, room.id
          );
          if (persisted.length > 0) {
            const map = new Map<string, { userId: string; username: string; position: string }>();
            for (const p of persisted) {
              const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { username: true } });
              if (user) map.set(p.userId, { userId: p.userId, username: user.username, position: p.position });
            }
            debatePositions.set(roomId, map);
            socket.emit("debatePositions", Array.from(map.values()));
          }
        } catch { /* table may not exist yet */ }
      }

      // For DMs and competitive rooms: emit history directly (no channels)
      if (room.isDM || room.name.startsWith("comp-")) {
        const history = await prisma.message.findMany({
          where: { roomId: room.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { user: true },
        });
        history.reverse();
        socket.emit("history", await loadWithReactions(history));
      }
    } catch (err) {
      console.error("joinRoom error:", err);
    }
  });

  // Join a specific channel within a room — emits its history
  socket.on("joinChannel", async (payload: { channelId: string }) => {
    const { channelId } = payload;
    try {
      // Leave any previously joined channel socket rooms
      for (const room of socket.rooms) {
        if (room.startsWith("channel:")) socket.leave(room);
      }

      const channel = await prisma.channel.findUnique({ where: { id: channelId }, include: { room: true } });
      if (!channel) { socket.emit("error", { message: "Channel not found." }); return; }

      socket.join(`channel:${channelId}`);

      // Note: bot-first opening is triggered in joinRoom, not here —
      // bot rooms have no channels so joinChannel is never called for them.

      const history = await prisma.message.findMany({
        where: { channelId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: true },
      });
      history.reverse();
      socket.emit("channelHistory", { channelId, messages: await loadWithReactions(history) });

      // Emit channel-level positions for sub-debate channels
      try {
        if ((channel as any).isSubDebate) {
          const chPos = channelPositions.get(channelId);
          if (chPos) {
            socket.emit("channelPositions", { channelId, positions: Array.from(chPos.values()) });
          }
        }
      } catch { /* ignore */ }

      // Emit sidebar channel for this channel (null if none) — skip for sidebar channels themselves
      if (!(channel as any).isSidebar) {
        let sbId = channelSidebars.get(channelId);
        if (!sbId) {
          try {
            const sb = await (prisma as any).channel.findFirst({ where: { parentChannelId: channelId, isSidebar: true } });
            if (sb) { channelSidebars.set(channelId, sb.id); sbId = sb.id; }
          } catch { /* parentChannelId column may not exist yet */ }
        }
        socket.emit("sidebarChannel", sbId ? { id: sbId, name: "side chat" } : null);
      }
    } catch (err) {
      console.error("joinChannel error:", err);
    }
  });

  // Join a sidebar channel without leaving the main channel or emitting history
  socket.on("joinSidebar", async ({ channelId }: { channelId: string }) => {
    try {
      const channel = await (prisma as any).channel.findUnique({ where: { id: channelId } });
      if (!channel?.isSidebar) return;
      socket.join(`channel:${channelId}`);
    } catch (err) {
      console.error("joinSidebar error:", err);
    }
  });

  socket.on("kick", async ({ roomId, targetUserId }: { roomId: string; targetUserId: string }) => {
    try {
      const room = await prisma.room.findUnique({ where: { name: roomId } });
      if (!room) return;
      const requestingUser = await prisma.user.findUnique({ where: { id: socketUser.id } });
      const isAdmin = requestingUser?.isAdmin ?? false;
      if (room.creatorId !== socketUser.id && !isAdmin) {
        socket.emit("error", { message: "Only the room owner can kick members." });
        return;
      }
      // Find and disconnect all sockets belonging to targetUserId in this room
      const members = presence.get(roomId);
      if (!members) return;
      for (const [sid, info] of members.entries()) {
        if (info.userId === targetUserId) {
          const targetSocket = io.sockets.sockets.get(sid);
          if (targetSocket) {
            targetSocket.emit("kicked", { roomId });
            targetSocket.leave(roomId);
          }
          members.delete(sid);
        }
      }
      broadcastPresence(roomId);
    } catch (err) {
      console.error("kick error:", err);
    }
  });

  socket.on("requestSeat", async ({ roomId }: { roomId: string }) => {
    try {
      const room = await prisma.room.findUnique({ where: { name: roomId } });
      if (!room?.creatorId) return;
      const ownerSockets = userSockets.get(room.creatorId);
      if (ownerSockets) {
        for (const sid of ownerSockets) {
          io.to(sid).emit("seatRequest", { userId: socketUser.id, username: socketUser.username, roomId });
        }
      }
    } catch (err) { console.error("requestSeat error:", err); }
  });

  socket.on("grantSeat", async ({ roomId, targetUserId }: { roomId: string; targetUserId: string }) => {
    try {
      const room = await prisma.room.findUnique({ where: { name: roomId } });
      if (!room) return;
      const requestingUser = await prisma.user.findUnique({ where: { id: socketUser.id } });
      if (room.creatorId !== socketUser.id && !requestingUser?.isAdmin) {
        socket.emit("error", { message: "Only the room owner can grant seats." }); return;
      }
      const fishbowlSeats = (room as any).fishbowlSeats ?? 4;
      const countRows = await prisma.$queryRawUnsafe<{ count: string }[]>(
        `SELECT COUNT(*)::text as count FROM "RoomMember" WHERE "roomId" = $1 AND "role" = 'PARTICIPANT'`, room.id
      );
      if (parseInt(countRows[0]?.count ?? "0") >= fishbowlSeats) {
        socket.emit("error", { message: "No seats available." }); return;
      }
      await prisma.$executeRawUnsafe(
        `UPDATE "RoomMember" SET "role" = 'PARTICIPANT' WHERE "userId" = $1 AND "roomId" = $2`,
        targetUserId, room.id
      );
      const members = presence.get(roomId);
      if (members) {
        for (const [sid, info] of members.entries()) {
          if (info.userId === targetUserId) members.set(sid, { ...info, role: "PARTICIPANT" });
        }
      }
      const targetSockets = userSockets.get(targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) io.to(sid).emit("fishbowlRole", "PARTICIPANT");
      }
      broadcastPresence(roomId);
    } catch (err) { console.error("grantSeat error:", err); }
  });

  socket.on("revokeSeat", async ({ roomId, targetUserId }: { roomId: string; targetUserId: string }) => {
    try {
      const room = await prisma.room.findUnique({ where: { name: roomId } });
      if (!room) return;
      const requestingUser = await prisma.user.findUnique({ where: { id: socketUser.id } });
      if (room.creatorId !== socketUser.id && !requestingUser?.isAdmin) {
        socket.emit("error", { message: "Only the room owner can revoke seats." }); return;
      }
      await prisma.$executeRawUnsafe(
        `UPDATE "RoomMember" SET "role" = 'SPECTATOR' WHERE "userId" = $1 AND "roomId" = $2`,
        targetUserId, room.id
      );
      const members = presence.get(roomId);
      if (members) {
        for (const [sid, info] of members.entries()) {
          if (info.userId === targetUserId) members.set(sid, { ...info, role: "SPECTATOR" });
        }
      }
      const targetSockets = userSockets.get(targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) io.to(sid).emit("fishbowlRole", "SPECTATOR");
      }
      broadcastPresence(roomId);
    } catch (err) { console.error("revokeSeat error:", err); }
  });

  socket.on(
    "sendMessage",
    async (payload: { roomId: string; userId: string; username: string; content: string; channelId?: string; settings?: { factualCorrection: boolean; ambiguityResolution: boolean } }) => {
      const { roomId, userId, username, settings, channelId } = payload;
      const rawContent = payload.content?.trim().replace(/\0/g, "") ?? "";
      if (!rawContent) return;

      const isImage = rawContent.startsWith('{"type":"image"');
      if (isImage && rawContent.length > 8_000_000) {
        socket.emit("error", { message: "Image is too large to send." });
        return;
      }

      const content = isImage ? rawContent : rawContent.slice(0, 2000);

      if (!isImage && containsSlur(content)) {
        socket.emit("error", { message: "Message contains prohibited language and was not sent." });
        return;
      }

      try {
        let user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
          user = await prisma.user.create({
            data: { username, email: `${username}@chat.local`, password: "" },
          }).catch(() => prisma.user.findUniqueOrThrow({ where: { username } }));
        }

        const room = await prisma.room.findUnique({ where: { name: roomId } });
        if (!room) { socket.emit("roomDeleted"); return; }

        // Enforce fishbowl channel access rules
        let isSidebarMsg = false;
        let isSpectatorChatMsg = false;
        let isChannelOpinionated = false;
        if (channelId) {
          try {
            const ch = await (prisma as any).channel.findUnique({ where: { id: channelId } });
            isSidebarMsg = !!(ch as any)?.isSidebar && !(ch as any)?.isSpectatorChat;
            isSpectatorChatMsg = !!(ch as any)?.isSpectatorChat;
            isChannelOpinionated = !!(ch as any)?.isOpinionated;
          } catch { /* ignore */ }
        }
        if ((room as any).isFishbowl) {
          const role = await getFishbowlRole(user.id, room.id);
          if (isSpectatorChatMsg) {
            // Spectator chat: only spectators can write
            if (role !== "SPECTATOR") {
              socket.emit("error", { message: "Only spectators can write in the spectator chat." });
              return;
            }
          } else if (role === "SPECTATOR") {
            // All other channels: spectators cannot write
            socket.emit("error", { message: "Spectators cannot send messages." });
            return;
          }
        }

        // Enforce structured debate turn order (sidebar channel is exempt)
        const isOpinionated = isChannelOpinionated || !!(room as any).isOpinionated;
        if (!isImage && !isSidebarMsg && !isSpectatorChatMsg) {
          const turn = debateTurns.get(roomId);
          if (turn?.mode === "structured") {
            if (!turn.currentSpeakerId) {
              socket.emit("error", { message: "Claim the floor before speaking." });
              return;
            }
            if (turn.currentSpeakerId !== user.id) {
              socket.emit("error", { message: "It's not your turn to speak." });
              return;
            }
          }
        }

        const message = await prisma.message.create({
          data: { content, senderType: SenderType.HUMAN, roomId: room.id, userId: user.id, channelId: channelId ?? null },
          include: { user: true },
        });

        const emitTarget = channelId ? `channel:${channelId}` : roomId;
        io.to(emitTarget).emit("message", { ...message, type: "human" });

        // Auto-advance structured debate turn after speaking (not for sidebar/spectator messages)
        if (!isImage && !isSidebarMsg && !isSpectatorChatMsg) {
          const turn = debateTurns.get(roomId);
          if (turn?.mode === "structured" && turn.currentSpeakerId === user.id) {
            const nextSide: "FOR" | "AGAINST" = turn.currentSide === "FOR" ? "AGAINST" : "FOR";
            const newTurn: DebateTurnState = { mode: "structured", currentSide: nextSide, currentSpeakerId: null, currentSpeakerName: null, turnNumber: turn.turnNumber + 1 };
            debateTurns.set(roomId, newTurn);
            io.to(emitTarget).emit("debateTurnUpdate", newTurn);
          }
        }

        // Bot auto-reply (fire-and-forget; delay is handled inside respondAsBot)
        // Skip for competitive (human vs human) rooms even if isBotRoom is set
        const isCompetitiveRoom = room.name.startsWith("comp-");
        if (!isImage && !isSidebarMsg && !isSpectatorChatMsg && !isCompetitiveRoom && (room as any).isBotRoom && (room as any).botId) {
          respondAsBot(room.id, room.name, (room as any).botId as string, content, channelId ?? null, io, prisma);
        }

        if (!isImage && !isSpectatorChatMsg) {
          const windowKey = WINDOW_KEY(channelId ?? roomId);
          await redis.lPush(windowKey, JSON.stringify({ role: "human", content, username }));
          await redis.lTrim(windowKey, 0, WINDOW_SIZE - 1);
          const aiDeps = { redis, io, prisma, settings: settings ?? { factualCorrection: true, ambiguityResolution: true }, emitRoom: emitTarget, aiPersona: room.aiPersona ?? undefined, roomName: room.name, channelId: channelId ?? null };
          if (!isOpinionated && !(room as any).isBotRoom) scheduleAI(channelId ?? roomId, aiDeps);
          if (/@claude\b/i.test(content)) {
            respondToMention(content, channelId ?? roomId, aiDeps);
          }
          // Notify @mentioned users (excluding @claude handled above)
          const mentionMatches = content.match(/@(\w+)/gi);
          if (mentionMatches) {
            const names = [...new Set(mentionMatches.map((m: string) => m.slice(1).toLowerCase()))]
              .filter((u: string) => u !== "claude" && u !== socketUser.username.toLowerCase());
            for (const uname of names) {
              try {
                const target = await prisma.user.findFirst({ where: { username: { equals: uname, mode: "insensitive" } }, select: { id: true } });
                if (!target) continue;
                const notif = await (prisma as any).notification.create({
                  data: { userId: target.id, type: "mention", roomId: room.id, roomName: room.name, channelId: channelId ?? null, fromUserId: socketUser.id, fromUsername: socketUser.username, content: content.slice(0, 120) },
                });
                deliverNotification(target.id, notif);
              } catch { /* ignore per-user errors */ }
            }
          }
        }
      } catch (err) {
        console.error("sendMessage error:", err);
      }
    }
  );

  socket.on("typing", ({ roomId }: { roomId: string }) => {
    socket.to(roomId).emit("userTyping", { userId: socketUser.id, username: socketUser.username });
  });

  socket.on("stopTyping", ({ roomId }: { roomId: string }) => {
    socket.to(roomId).emit("userStopTyping", { userId: socketUser.id });
  });

  // ── Invite another user to a room ──────────────────────────────────────────
  socket.on("sendInvite", async ({ targetUsername, roomName }: { targetUsername: string; roomName: string }) => {
    try {
      const target = await prisma.user.findUnique({ where: { username: targetUsername }, select: { id: true } });
      if (!target) { socket.emit("inviteError", { message: "User not found." }); return; }
      if (target.id === socketUser.id) { socket.emit("inviteError", { message: "You can't invite yourself." }); return; }
      const room = await prisma.room.findUnique({ where: { name: roomName } });
      if (!room) return;
      const alreadyMember = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId: target.id, roomId: room.id } } });
      if (alreadyMember) { socket.emit("inviteError", { message: "That user is already in this room." }); return; }
      const pending = await (prisma as any).notification.findFirst({ where: { userId: target.id, type: "invite", roomId: room.id, resolved: false } });
      if (pending) { socket.emit("inviteError", { message: "Invite already sent." }); return; }
      const notif = await (prisma as any).notification.create({
        data: { userId: target.id, type: "invite", roomId: room.id, roomName: room.name, fromUserId: socketUser.id, fromUsername: socketUser.username },
      });
      deliverNotification(target.id, notif);
      socket.emit("inviteSent", { ok: true });
    } catch (err) {
      console.error("[sendInvite]", err);
    }
  });

  // ── Accept or decline an invite ────────────────────────────────────────────
  socket.on("respondInvite", async ({ notifId, accepted }: { notifId: string; accepted: boolean }) => {
    try {
      const notif = await (prisma as any).notification.findUnique({ where: { id: notifId } });
      if (!notif || notif.userId !== socketUser.id) return;
      await (prisma as any).notification.update({ where: { id: notifId }, data: { resolved: true, accepted, read: true } });
      if (accepted && notif.roomId) {
        const room = await prisma.room.findUnique({ where: { id: notif.roomId } });
        if (room) {
          await prisma.roomMember.upsert({
            where: { userId_roomId: { userId: socketUser.id, roomId: room.id } },
            update: {}, create: { userId: socketUser.id, roomId: room.id },
          });
          socket.emit("inviteAccepted", { roomName: room.name, isDM: room.isDM });
        }
      }
    } catch (err) {
      console.error("[respondInvite]", err);
    }
  });

  // ── Reactions ──────────────────────────────────────────────────────────────
  socket.on("addReaction", async ({ messageId, emoji, roomName, channelId }: { messageId: string; emoji: string; roomName: string; channelId?: string | null }) => {
    const ALLOWED = ["👍","👎","❤️","😂","🔥","🤔"];
    if (!ALLOWED.includes(emoji)) return;
    try {
      const existing = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM "Reaction" WHERE "messageId" = $1 AND "userId" = $2 AND "emoji" = $3`,
        messageId, socketUser.id, emoji
      );
      if (existing.length > 0) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "Reaction" WHERE "messageId" = $1 AND "userId" = $2 AND "emoji" = $3`,
          messageId, socketUser.id, emoji
        );
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "Reaction" ("id","messageId","userId","username","emoji","createdAt") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,NOW()) ON CONFLICT ("messageId","userId","emoji") DO NOTHING`,
          messageId, socketUser.id, socketUser.username, emoji
        );
      }
      const reactions = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","userId","username","emoji" FROM "Reaction" WHERE "messageId" = $1`,
        messageId
      );
      const target = channelId ? `channel:${channelId}` : roomName;
      io.to(target).emit("reactionsUpdate", { messageId, reactions });
    } catch (err) {
      console.error("[addReaction]", err);
    }
  });

  // ── Edit message ───────────────────────────────────────────────────────────
  socket.on("editMessage", async ({ messageId, content, roomName, channelId }: { messageId: string; content: string; roomName: string; channelId?: string | null }) => {
    const trimmed = content?.trim().slice(0, 2000);
    if (!trimmed) return;
    try {
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg || msg.userId !== socketUser.id) return;
      if ((msg as any).deletedAt) return;
      await prisma.$executeRawUnsafe(
        `UPDATE "Message" SET "content" = $1, "editedAt" = NOW() WHERE "id" = $2`,
        trimmed, messageId
      );
      const target = channelId ? `channel:${channelId}` : roomName;
      io.to(target).emit("messageEdited", { messageId, content: trimmed, editedAt: new Date().toISOString() });
    } catch (err) {
      console.error("[editMessage]", err);
    }
  });

  // ── Delete message ─────────────────────────────────────────────────────────
  socket.on("deleteMessage", async ({ messageId, roomName, channelId }: { messageId: string; roomName: string; channelId?: string | null }) => {
    try {
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg) return;
      const requestingUser = await prisma.user.findUnique({ where: { id: socketUser.id } });
      const isAdmin = requestingUser?.isAdmin ?? false;
      if (msg.userId !== socketUser.id && !isAdmin) return;
      await prisma.$executeRawUnsafe(`UPDATE "Message" SET "deletedAt" = NOW() WHERE "id" = $1`, messageId);
      const target = channelId ? `channel:${channelId}` : roomName;
      io.to(target).emit("messageDeleted", { messageId });
    } catch (err) {
      console.error("[deleteMessage]", err);
    }
  });

  socket.on("summarize", async ({ roomId, since, channelId }: { roomId: string; since: string | null; channelId: string | null }) => {
    try {
      await summarizeConversation({ roomId, redis, io, prisma, since, channelId: channelId ?? null, socketId: socket.id });
    } catch (err) {
      console.error("[summarize]", err);
    } finally {
      socket.emit("summarizeDone");
    }
  });

  socket.on("createPoll", async ({ roomId, channelId, question, options, userId }: {
    roomId: string; channelId?: string | null; question: string; options: string[]; userId: string;
  }) => {
    try {
      const room = await prisma.room.findUnique({ where: { name: roomId } });
      if (!room) return;
      const poll = await (prisma as any).poll.create({
        data: { roomId: room.id, channelId: channelId ?? null, question: question.trim().slice(0, 200), options: options.map((o: string) => o.trim().slice(0, 100)).filter(Boolean).slice(0, 4), createdBy: userId },
        include: { votes: true },
      });
      const emitTarget = channelId ? `channel:${channelId}` : roomId;
      io.to(emitTarget).emit("pollCreated", poll);
    } catch (err) {
      console.error("[createPoll]", err);
    }
  });

  socket.on("votePoll", async ({ pollId, userId, option }: { pollId: string; userId: string; option: string }) => {
    try {
      await (prisma as any).pollVote.upsert({
        where: { pollId_userId: { pollId, userId } },
        update: { option },
        create: { pollId, userId, option },
      });
      const poll = await (prisma as any).poll.findUnique({ where: { id: pollId }, include: { votes: true } });
      if (!poll) return;
      const room = await prisma.room.findUnique({ where: { id: poll.roomId } });
      const emitTarget = poll.channelId ? `channel:${poll.channelId}` : room?.name ?? poll.roomId;
      io.to(emitTarget).emit("pollUpdated", poll);
    } catch (err) {
      console.error("[votePoll]", err);
    }
  });

  socket.on("closePoll", async ({ pollId, userId }: { pollId: string; userId: string }) => {
    try {
      const poll = await (prisma as any).poll.findUnique({ where: { id: pollId } });
      if (!poll) return;
      const room = await prisma.room.findUnique({ where: { id: poll.roomId } });
      const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
      if (poll.createdBy !== userId && room?.creatorId !== userId && !requestingUser?.isAdmin) return;
      const updated = await (prisma as any).poll.update({
        where: { id: pollId },
        data: { closedAt: new Date() },
        include: { votes: true },
      });
      const emitTarget = poll.channelId ? `channel:${poll.channelId}` : room?.name ?? poll.roomId;
      io.to(emitTarget).emit("pollUpdated", updated);
    } catch (err) {
      console.error("[closePoll]", err);
    }
  });

  socket.on("stakeClaim", async ({ messageId, roomId, channelId, text }: {
    messageId: string; roomId: string; channelId?: string | null; text: string;
  }) => {
    try {
      const room = await prisma.room.findUnique({ where: { name: roomId } });
      if (!room) return;
      let isClaimOpinionated = !!(room as any).isOpinionated;
      if (!isClaimOpinionated && channelId) {
        try {
          const ch = await (prisma as any).channel.findUnique({ where: { id: channelId } });
          isClaimOpinionated = !!(ch as any)?.isOpinionated;
        } catch { /* ignore */ }
      }

      // Prevent duplicate claims on the same message
      const existing = await (prisma as any).claim.findFirst({ where: { messageId } });
      if (existing) { socket.emit("claimStaked", { claimId: existing.id, messageId, status: existing.status, claimantId: existing.claimantId, challengeCount: 0 }); return; }

      const claim = await (prisma as any).claim.create({
        data: { messageId, roomId: room.id, channelId: channelId ?? null, claimantId: socketUser.id, text: text.slice(0, 500), status: "PENDING" },
      });

      const emitTarget = channelId ? `channel:${channelId}` : roomId;
      io.to(emitTarget).emit("claimStaked", { claimId: claim.id, messageId, status: "PENDING", claimantId: socketUser.id, challengeCount: 0 });

      // Evaluate asynchronously
      try {
        const proposition = (room as any).proposition ?? null;
        const { verdict, reasoning, relevance } = await evaluateClaim(text, "", proposition);
        await (prisma as any).claim.update({
          where: { id: claim.id },
          data: { status: verdict, verdict: reasoning, relevance, updatedAt: new Date() },
        });
        io.to(emitTarget).emit("claimVerdict", { claimId: claim.id, messageId, status: verdict, reasoning, claimantId: socketUser.id, challengeCount: 0 });
        if (!isClaimOpinionated) {
          const cred = await computeCredibility(socketUser.id, prisma);
          io.to(emitTarget).emit("credibilityUpdate", cred);
        }
      } catch (e) {
        console.error("[stakeClaim] evaluation error:", e);
      }
    } catch (err) {
      console.error("[stakeClaim]", err);
    }
  });

  socket.on("challengeClaim", async ({ claimId, roomId, channelId }: {
    claimId: string; roomId: string; channelId?: string | null;
  }) => {
    try {
      const claim = await (prisma as any).claim.findUnique({ where: { id: claimId } });
      if (!claim) return;

      await (prisma as any).claimChallenge.create({
        data: { claimId, challengerId: socketUser.id },
      });

      const challenges = await (prisma as any).claimChallenge.findMany({ where: { claimId } });
      const emitTarget = channelId ? `channel:${channelId}` : roomId;

      // Re-evaluate with fresh eyes
      try {
        const claimRoom = await prisma.room.findUnique({ where: { id: claim.roomId } });
        const proposition = (claimRoom as any)?.proposition ?? null;
        const { verdict, reasoning, relevance } = await evaluateClaim(
          claim.text,
          `This claim has been challenged ${challenges.length} time(s). Be extra rigorous.`,
          proposition,
        );
        await (prisma as any).claim.update({
          where: { id: claimId },
          data: { status: verdict, verdict: reasoning, relevance, updatedAt: new Date() },
        });
        const cred = await computeCredibility(claim.claimantId, prisma);
        io.to(emitTarget).emit("claimVerdict", { claimId, messageId: claim.messageId, status: verdict, reasoning, claimantId: claim.claimantId, challengeCount: challenges.length });
        io.to(emitTarget).emit("credibilityUpdate", cred);
      } catch (e) {
        console.error("[challengeClaim] evaluation error:", e);
      }
    } catch (err) {
      console.error("[challengeClaim]", err);
    }
  });

  socket.on("setPosition", async ({ roomId, position, channelId }: { roomId: string; position: string; channelId?: string }) => {
    if (!position?.trim()) return;
    try {
      if (channelId) {
        if (!channelPositions.has(channelId)) channelPositions.set(channelId, new Map());
        channelPositions.get(channelId)!.set(socketUser.id, { userId: socketUser.id, username: socketUser.username, position });
        io.to(`channel:${channelId}`).emit("positionUpdate", { userId: socketUser.id, username: socketUser.username, position, channelId });
      } else {
        // Look up room for cooldown check and DB upsert
        let room: any = null;
        try { room = await prisma.room.findUnique({ where: { name: roomId } }); } catch { /* ignore */ }
        let cooldownSecs = 0;
        if (room) {
          try {
            const coolRow = await prisma.$queryRawUnsafe<{ stanceCooldown: number | null }[]>(
              `SELECT "stanceCooldown" FROM "Room" WHERE "id" = $1`, room.id
            );
            cooldownSecs = coolRow[0]?.stanceCooldown ?? 0;
          } catch { /* stanceCooldown column may not exist yet */ }
        }
        if (cooldownSecs > 0) {
          try {
            const lastSwitchRaw = await redis.get(`stance:cooldown:${roomId}:${socketUser.id}`);
            if (lastSwitchRaw) {
              const elapsed = (Date.now() - parseInt(lastSwitchRaw)) / 1000;
              if (elapsed < cooldownSecs) {
                const remaining = Math.ceil(cooldownSecs - elapsed);
                socket.emit("error", { message: `You can't switch stances for another ${remaining}s.` });
                return;
              }
            }
          } catch { /* redis unavailable — skip cooldown check */ }
        }
        if (!debatePositions.has(roomId)) debatePositions.set(roomId, new Map());
        debatePositions.get(roomId)!.set(socketUser.id, { userId: socketUser.id, username: socketUser.username, position });
        if (room) {
          try {
            await prisma.$executeRawUnsafe(
              `INSERT INTO "UserPosition" ("id", "userId", "roomId", "position", "updatedAt", "createdAt")
               VALUES (gen_random_uuid()::text, $1, $2, $3, NOW(), NOW())
               ON CONFLICT ("userId", "roomId") DO UPDATE SET "position" = $3, "updatedAt" = NOW()`,
              socketUser.id, room.id, position
            );
          } catch { /* ignore */ }
        }
        if (cooldownSecs > 0) {
          try { await redis.set(`stance:cooldown:${roomId}:${socketUser.id}`, Date.now().toString(), { EX: cooldownSecs + 60 }); } catch { /* ignore */ }
        }
        io.to(roomId).emit("positionUpdate", { userId: socketUser.id, username: socketUser.username, position });
      }
    } catch (err) {
      console.error("[setPosition]", err);
    }
  });

  socket.on("setDebateMode", async ({ roomId, mode }: { roomId: string; mode: "open" | "structured" }) => {
    try {
      const room = await prisma.room.findUnique({ where: { name: roomId } });
      if (!room) return;
      const requestingUser = await prisma.user.findUnique({ where: { id: socketUser.id } });
      if (room.creatorId !== socketUser.id && !requestingUser?.isAdmin) {
        socket.emit("error", { message: "Only the room owner can change debate mode." });
        return;
      }
      const turn: DebateTurnState = mode === "structured"
        ? { mode: "structured", currentSide: "FOR", currentSpeakerId: null, currentSpeakerName: null, turnNumber: 1 }
        : { mode: "open", currentSide: "FOR", currentSpeakerId: null, currentSpeakerName: null, turnNumber: 0 };
      debateTurns.set(roomId, turn);
      redis.set(`debate:turn:${roomId}`, JSON.stringify(turn), { EX: 86400 }).catch(() => {});
      io.to(roomId).emit("debateTurnUpdate", turn);
    } catch (err) {
      console.error("[setDebateMode]", err);
    }
  });

  socket.on("setStances", async ({ roomId, stances }: { roomId: string; stances: string[] }) => {
    try {
      const room = await prisma.room.findUnique({ where: { name: roomId } });
      if (!room) return;
      const requestingUser = await prisma.user.findUnique({ where: { id: socketUser.id } });
      if (room.creatorId !== socketUser.id && !requestingUser?.isAdmin) return;
      const validStances = stances.map(s => s.trim()).filter(Boolean).slice(0, 6);
      await prisma.$executeRawUnsafe(
        `UPDATE "Room" SET "stances" = $1 WHERE "id" = $2`,
        JSON.stringify(validStances), room.id
      );
      io.to(roomId).emit("stancesUpdated", validStances);
    } catch (err) {
      console.error("[setStances]", err);
    }
  });

  socket.on("claimFloor", ({ roomId }: { roomId: string }) => {
    try {
      const turn = debateTurns.get(roomId);
      if (!turn || turn.mode !== "structured") return;
      if (turn.currentSpeakerId) return; // already claimed
      const roomPos = debatePositions.get(roomId);
      const userPos = roomPos?.get(socketUser.id)?.position;
      if (userPos !== turn.currentSide) {
        socket.emit("error", { message: `Only a ${turn.currentSide} participant can claim the floor now.` });
        return;
      }
      const newTurn: DebateTurnState = { ...turn, currentSpeakerId: socketUser.id, currentSpeakerName: socketUser.username };
      debateTurns.set(roomId, newTurn);
      redis.set(`debate:turn:${roomId}`, JSON.stringify(newTurn), { EX: 86400 }).catch(() => {});
      io.to(roomId).emit("debateTurnUpdate", newTurn);
    } catch (err) {
      console.error("[claimFloor]", err);
    }
  });

  socket.on("passTurn", async ({ roomId }: { roomId: string }) => {
    try {
      const turn = debateTurns.get(roomId);
      if (!turn || turn.mode !== "structured") return;
      const room = await prisma.room.findUnique({ where: { name: roomId } });
      const requestingUser = await prisma.user.findUnique({ where: { id: socketUser.id } });
      const canPass = room?.creatorId === socketUser.id || requestingUser?.isAdmin || turn.currentSpeakerId === socketUser.id;
      if (!canPass) return;
      const nextSide: "FOR" | "AGAINST" = turn.currentSide === "FOR" ? "AGAINST" : "FOR";
      const newTurn: DebateTurnState = { mode: "structured", currentSide: nextSide, currentSpeakerId: null, currentSpeakerName: null, turnNumber: turn.turnNumber + 1 };
      debateTurns.set(roomId, newTurn);
      redis.set(`debate:turn:${roomId}`, JSON.stringify(newTurn), { EX: 86400 }).catch(() => {});
      io.to(roomId).emit("debateTurnUpdate", newTurn);
    } catch (err) {
      console.error("[passTurn]", err);
    }
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// Combined lobby fetch — joined rooms + DMs + users in one round trip
app.get("/api/lobby", async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const [memberships, dms, users] = await Promise.all([
      prisma.roomMember.findMany({
        where: { userId },
        include: { room: { select: { id: true, name: true, description: true, proposition: true, isPrivate: true, creatorId: true, isDM: true, participant1Id: true, participant2Id: true, _count: { select: { messages: true } } } } },
        orderBy: { joinedAt: "desc" },
      } as any),
      prisma.room.findMany({
        where: { isDM: true, OR: [{ participant1Id: userId }, { participant2Id: userId }] },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { messages: true } } },
      }),
      prisma.user.findMany({
        where: { id: { not: userId } },
        select: { id: true, username: true, avatarUrl: true },
        orderBy: { username: "asc" },
      }),
    ]);
    const rooms = (memberships as any[]).map((m: any) => m.room);
    res.json({ rooms, dms, users });
  } catch {
    res.status(500).json({ error: "Failed to load lobby" });
  }
});

// Browse all public rooms (for the discover page)
app.get("/api/rooms/browse", async (req, res) => {
  const userId = req.query.userId as string;
  try {
    const rooms = await prisma.room.findMany({
      where: { isDM: false },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { messages: true, members: true } } },
    });
    const [joinedMemberships, fishbowlRows, participantCounts] = await Promise.all([
      userId ? prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } }) : Promise.resolve([]),
      prisma.$queryRawUnsafe<{ id: string; isFishbowl: boolean; fishbowlSeats: number | null }[]>(
        `SELECT "id", "isFishbowl", "fishbowlSeats" FROM "Room" WHERE "isDM" = false`
      ).catch(() => [] as any[]),
      prisma.$queryRawUnsafe<{ roomId: string; count: string }[]>(
        `SELECT "roomId", COUNT(*)::text as count FROM "RoomMember" WHERE "role" = 'PARTICIPANT' GROUP BY "roomId"`
      ).catch(() => [] as any[]),
    ]);
    const joinedIds = new Set(joinedMemberships.map(m => m.roomId));
    const fishbowlMap = new Map((fishbowlRows as any[]).map((f: any) => [f.id, f]));
    const participantMap = new Map((participantCounts as any[]).map((p: any) => [p.roomId, parseInt(p.count)]));
    res.json(rooms.map(({ password: _pw, ...r }) => {
      const fb = fishbowlMap.get(r.id) as any;
      return {
        ...r,
        joined: joinedIds.has(r.id),
        isFishbowl: fb?.isFishbowl ?? false,
        fishbowlSeats: fb?.fishbowlSeats ?? null,
        participantCount: participantMap.get(r.id) ?? 0,
      };
    }));
  } catch {
    res.status(500).json({ error: "Failed to browse rooms" });
  }
});

// POST /api/rooms/:name/join
app.post("/api/rooms/:name/join", async (req, res) => {
  const { userId } = req.body as { userId: string };
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Check if already a member (don't downgrade an existing participant)
    const existing = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: room.id } },
    });

    let role = "PARTICIPANT";
    if (!existing) {
      if ((room as any).isFishbowl && room.creatorId !== userId) {
        const countRows = await prisma.$queryRawUnsafe<{ count: string }[]>(
          `SELECT COUNT(*)::text as count FROM "RoomMember" WHERE "roomId" = $1 AND "role" = 'PARTICIPANT'`, room.id
        );
        const seats = (room as any).fishbowlSeats ?? 4;
        role = parseInt(countRows[0]?.count ?? "0") < seats ? "PARTICIPANT" : "SPECTATOR";
      }
      await prisma.roomMember.create({ data: { userId, roomId: room.id } } as any);
      if (role === "SPECTATOR") {
        await prisma.$executeRawUnsafe(
          `UPDATE "RoomMember" SET "role" = 'SPECTATOR' WHERE "userId" = $1 AND "roomId" = $2`, userId, room.id
        );
      }
    } else {
      role = (existing as any).role ?? "PARTICIPANT";
    }

    res.json({ ok: true, role });
  } catch {
    res.status(500).json({ error: "Failed to join room" });
  }
});

// POST /api/rooms/:name/leave
app.post("/api/rooms/:name/leave", async (req, res) => {
  const { userId } = req.body as { userId: string };
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    await prisma.roomMember.deleteMany({ where: { userId, roomId: room.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to leave room" });
  }
});

app.get("/api/rooms", async (_req, res) => {
  const rooms = await prisma.room.findMany({
    where: { isDM: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { messages: true } } },
  });
  res.json(rooms.map(({ password: _pw, ...r }) => r));
});

// Lazy-load full image data for a specific message (history sends stubs)
app.get("/api/messages/:id/image", async (req, res) => {
  try {
    const msg = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!msg || !msg.content.startsWith('{"type":"image"')) return res.status(404).json({ error: "Not found" });
    const parsed = JSON.parse(msg.content);
    res.json({ src: parsed.src, filename: parsed.filename });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/arena-score — live proposition score (0 = bot winning, 100 = human winning, 50 = even)
app.post("/api/arena-score", async (req, res) => {
  try {
    const { roomName } = req.body as { roomName: string };
    if (!roomName) return res.status(400).json({ error: "roomName required" });
    const roomRows = await prisma.$queryRawUnsafe<{ id: string; botId: string | null }[]>(
      `SELECT id, "botId" FROM "Room" WHERE name = $1 LIMIT 1`, roomName,
    );
    if (!roomRows.length) return res.json({ score: 50 });
    const { id: roomDbId, botId } = roomRows[0];
    if (!botId) return res.json({ score: 50 });
    const score = await scoreMatch(roomDbId, botId, prisma);
    res.json({ score });
  } catch (e) {
    console.error("[arena-score]", e);
    res.json({ score: 50 });
  }
});

// ── ELO ─────────────────────────────────────────────────────────────────────
function calcElo(ratingA: number, ratingB: number, aWon: boolean, K = 32): { newA: number; newB: number } {
  const expected = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const score = aWon ? 1 : 0;
  return {
    newA: Math.round(ratingA + K * (score - expected)),
    newB: Math.round(ratingB + K * ((1 - score) - (1 - expected))),
  };
}

// GET /api/challenges — list open challenges (optionally excluding the requesting user's own)
app.get("/api/challenges", async (req, res) => {
  try {
    const excludeUserId = (req.query.excludeUserId as string) ?? null;
    const rows = excludeUserId
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT c.*, u.username, u.elo FROM "Challenge" c
           JOIN "User" u ON c."userId" = u.id
           WHERE c.status = 'open' AND c."userId" != $1
           ORDER BY c."createdAt" DESC LIMIT 50`,
          excludeUserId,
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT c.*, u.username, u.elo FROM "Challenge" c
           JOIN "User" u ON c."userId" = u.id
           WHERE c.status = 'open'
           ORDER BY c."createdAt" DESC LIMIT 50`,
        );
    res.json(rows);
  } catch (e) {
    console.error("[challenges GET]", e);
    res.status(500).json({ error: "Failed to fetch challenges" });
  }
});

// GET /api/challenges/mine — challenges posted by a specific user
app.get("/api/challenges/mine", async (req, res) => {
  try {
    const { userId } = req.query as { userId: string };
    if (!userId) return res.status(400).json({ error: "userId required" });
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.*, u.username, u.elo FROM "Challenge" c
       JOIN "User" u ON c."userId" = u.id
       WHERE c."userId" = $1
       ORDER BY c."createdAt" DESC LIMIT 50`,
      userId,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch your challenges" });
  }
});

// POST /api/challenges — post a new challenge
app.post("/api/challenges", async (req, res) => {
  try {
    const { userId, claim, stance, winCondition } = req.body as {
      userId: string; claim: string; stance: "affirmative" | "negative"; winCondition: object;
    };
    if (!userId || !claim?.trim() || !stance || !winCondition) {
      return res.status(400).json({ error: "userId, claim, stance, and winCondition required" });
    }
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "Challenge" ("id","userId","claim","stance","winCondition")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4) RETURNING "id"`,
      userId, claim.trim(), stance, JSON.stringify(winCondition),
    );
    res.json({ id: rows[0].id });
  } catch (e) {
    console.error("[challenges POST]", e);
    res.status(500).json({ error: "Failed to post challenge" });
  }
});

// DELETE /api/challenges/:id — cancel a challenge (poster only)
app.delete("/api/challenges/:id", async (req, res) => {
  try {
    const { userId } = req.body as { userId: string };
    const { id } = req.params;
    await prisma.$executeRawUnsafe(
      `UPDATE "Challenge" SET status = 'cancelled' WHERE id = $1 AND "userId" = $2 AND status = 'open'`,
      id, userId,
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to cancel challenge" });
  }
});

// POST /api/challenges/:id/accept — accept a challenge, create competitive room
app.post("/api/challenges/:id/accept", async (req, res) => {
  try {
    const { userId } = req.body as { userId: string };
    const { id: challengeId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId required" });

    // Fetch challenge
    const challenges = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.*, u.username AS "challengerUsername", u.elo AS "challengerElo"
       FROM "Challenge" c JOIN "User" u ON c."userId" = u.id
       WHERE c.id = $1 AND c.status = 'open'`,
      challengeId,
    );
    if (challenges.length === 0) return res.status(404).json({ error: "Challenge not found or already taken" });
    const challenge = challenges[0];
    if (challenge.userId === userId) return res.status(400).json({ error: "Cannot accept your own challenge" });

    // Fetch acceptor ELO
    const acceptorRows = await prisma.$queryRawUnsafe<{ elo: number }[]>(
      `SELECT elo FROM "User" WHERE id = $1`, userId,
    );
    const challengedElo = acceptorRows[0]?.elo ?? 1200;

    // Mark challenge matched
    await prisma.$executeRawUnsafe(
      `UPDATE "Challenge" SET status = 'matched' WHERE id = $1`, challengeId,
    );

    // Create competitive room
    const shortId = Date.now().toString(36).slice(-5);
    const roomName = `comp-${challengeId.slice(-6)}-${shortId}`;
    const wc = JSON.parse(challenge.winCondition);
    const matchConfig = JSON.stringify({
      isCompetitive: true,
      challengeId,
      challengerId: challenge.userId,
      challengedId: userId,
      challengerStance: challenge.stance,
      challengedStance: challenge.stance === "affirmative" ? "negative" : "affirmative",
      topic: challenge.claim,
      ...wc,
    });

    const room = await prisma.room.create({ data: { name: roomName, isPrivate: false, creatorId: challenge.userId } } as any);
    await prisma.$executeRawUnsafe(
      `UPDATE "Room" SET "matchConfig" = $1 WHERE "id" = $2`, matchConfig, room.id,
    );
    await prisma.roomMember.createMany({
      data: [{ userId: challenge.userId, roomId: room.id }, { userId, roomId: room.id }],
    } as any);

    // Create CompetitiveMatch record
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CompetitiveMatch"
         ("id","challengeId","challengerId","challengedId","challengerStance","challengedStance","roomName","challengerEloBefore","challengedEloBefore")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8)`,
      challengeId, challenge.userId, userId,
      challenge.stance, challenge.stance === "affirmative" ? "negative" : "affirmative",
      roomName, challenge.challengerElo ?? 1200, challengedElo,
    );

    // Notify the challenge poster via socket
    const posterSockets = userSockets.get(challenge.userId);
    if (posterSockets) {
      const acceptorUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      for (const sid of posterSockets) {
        io.to(sid).emit("challengeAccepted", { roomName, challengeId, acceptedBy: acceptorUser?.username ?? "Someone" });
      }
    }

    res.json({ roomName });
  } catch (e) {
    console.error("[challenges accept]", e);
    res.status(500).json({ error: "Failed to accept challenge" });
  }
});

// POST /api/competitive/complete — AI judge + ELO update (idempotent)
app.post("/api/competitive/complete", async (req, res) => {
  try {
    const { roomName, forcedWinner } = req.body as { roomName: string; forcedWinner?: string };
    if (!roomName) return res.status(400).json({ error: "roomName required" });

    // Idempotent: return existing result
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "CompetitiveMatch" WHERE "roomName" = $1 AND status = 'complete' LIMIT 1`, roomName,
    );
    if (existing.length > 0) {
      const m = existing[0];
      return res.json({
        winnerId: m.winnerId, verdict: m.verdict,
        challengerEloChange: (m.challengerEloAfter ?? m.challengerEloBefore) - m.challengerEloBefore,
        challengedEloChange: (m.challengedEloAfter ?? m.challengedEloBefore) - m.challengedEloBefore,
        challengerEloAfter: m.challengerEloAfter, challengedEloAfter: m.challengedEloAfter,
        challengerId: m.challengerId, challengedId: m.challengedId,
      });
    }

    // Fetch match
    const matches = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "CompetitiveMatch" WHERE "roomName" = $1 LIMIT 1`, roomName,
    );
    if (matches.length === 0) return res.status(404).json({ error: "Match not found" });
    const match = matches[0];

    // Fetch room messages for transcript
    const roomRows = await prisma.room.findUnique({ where: { name: roomName }, select: { id: true } });
    if (!roomRows) return res.status(404).json({ error: "Room not found" });

    const messages = await prisma.message.findMany({
      where: { roomId: roomRows.id },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "asc" },
      take: 40,
    });

    const transcript = messages
      .map(m => `${m.user?.username ?? "User"}: ${m.content}`)
      .join("\n");

    // AI judge
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic();
    let winnerId = forcedWinner ?? match.challengerId;
    let verdict = "The debate was inconclusive.";
    try {
      const judgePrompt =
        `You are an impartial debate judge. One debater (ID: ${match.challengerId}) argued ${match.challengerStance} the proposition: "${transcript.split("\n")[0]}". ` +
        `The other (ID: ${match.challengedId}) argued ${match.challengedStance}. ` +
        `Based on logic, evidence quality, and persuasion, decide who argued better. ` +
        `Return ONLY valid JSON: {"winnerId":"${match.challengerId}" or "${match.challengedId}","verdict":"one concise sentence"}\n\nTranscript:\n${transcript}`;
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 150,
        messages: [{ role: "user", content: judgePrompt }],
      });
      const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
      const jsonStart = raw.indexOf("{");
      const parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart) : raw);
      if (!forcedWinner && (parsed.winnerId === match.challengerId || parsed.winnerId === match.challengedId)) {
        winnerId = parsed.winnerId;
      }
      if (typeof parsed.verdict === "string" && parsed.verdict) verdict = parsed.verdict;
    } catch (e) {
      console.error("[competitive judge]", e);
    }

    // Calculate ELO
    const challengerWon = winnerId === match.challengerId;
    const { newA: challengerEloAfter, newB: challengedEloAfter } = calcElo(
      match.challengerEloBefore ?? 1200,
      match.challengedEloBefore ?? 1200,
      challengerWon,
    );

    // Update ELO in User table
    await prisma.$executeRawUnsafe(`UPDATE "User" SET elo = $1 WHERE id = $2`, challengerEloAfter, match.challengerId);
    await prisma.$executeRawUnsafe(`UPDATE "User" SET elo = $1 WHERE id = $2`, challengedEloAfter, match.challengedId);

    // Mark match complete
    await prisma.$executeRawUnsafe(
      `UPDATE "CompetitiveMatch" SET status='complete', "winnerId"=$1, verdict=$2,
       "challengerEloAfter"=$3, "challengedEloAfter"=$4, "completedAt"=NOW()
       WHERE "roomName"=$5`,
      winnerId, verdict, challengerEloAfter, challengedEloAfter, roomName,
    );

    res.json({
      winnerId, verdict,
      challengerEloChange: challengerEloAfter - (match.challengerEloBefore ?? 1200),
      challengedEloChange: challengedEloAfter - (match.challengedEloBefore ?? 1200),
      challengerEloAfter, challengedEloAfter,
      challengerId: match.challengerId, challengedId: match.challengedId,
    });
  } catch (e) {
    console.error("[competitive complete]", e);
    res.status(500).json({ error: "Failed to complete match" });
  }
});

// GET /api/competitive/match/:roomName — fetch match result
app.get("/api/competitive/match/:roomName", async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "CompetitiveMatch" WHERE "roomName" = $1 LIMIT 1`, req.params.roomName,
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/lessons/progress?userId=xxx
app.get("/api/lessons/progress", async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const rows = await prisma.$queryRawUnsafe<{ seriesSlug: string; lessonSlug: string }[]>(
      `SELECT "seriesSlug", "lessonSlug" FROM "UserLessonProgress" WHERE "userId" = $1`, userId
    );
    res.json({ completed: rows });
  } catch (e) {
    console.error("[lessons/progress]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/lessons/complete — mark a lesson complete (idempotent)
app.post("/api/lessons/complete", async (req, res) => {
  const { userId, seriesSlug, lessonSlug } = req.body;
  if (!userId || !seriesSlug || !lessonSlug) return res.status(400).json({ error: "userId, seriesSlug, lessonSlug required" });
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "UserLessonProgress" ("userId", "seriesSlug", "lessonSlug")
       VALUES ($1, $2, $3)
       ON CONFLICT ("userId", "seriesSlug", "lessonSlug") DO NOTHING`,
      userId, seriesSlug, lessonSlug
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[lessons/complete]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/leaderboard — top users by ELO
app.get("/api/leaderboard", async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.id, u.username, u.elo,
         COALESCE(wins.count, 0) AS wins,
         COALESCE(losses.count, 0) AS losses
       FROM "User" u
       LEFT JOIN (
         SELECT "winnerId" AS uid, COUNT(*) AS count FROM "CompetitiveMatch" WHERE status='complete' GROUP BY "winnerId"
       ) wins ON wins.uid = u.id
       LEFT JOIN (
         SELECT CASE WHEN "winnerId"!="challengerId" THEN "challengerId" ELSE "challengedId" END AS uid,
                COUNT(*) AS count
         FROM "CompetitiveMatch" WHERE status='complete' GROUP BY uid
       ) losses ON losses.uid = u.id
       WHERE u.elo != 1200 OR wins.count IS NOT NULL
       ORDER BY u.elo DESC LIMIT 25`,
    );
    res.json(rows);
  } catch (e) {
    console.error("[leaderboard]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/arena-result/:roomName
app.get("/api/arena-result/:roomName", async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "ArenaMatch" WHERE "roomName" = $1 LIMIT 1`,
      req.params.roomName,
    );
    if (rows.length === 0) return res.status(404).json({ error: "No result" });
    const row = rows[0];
    res.json({ winner: row.winner, verdict: row.verdict, scoreImpact: Number(row.scoreImpact), botId: row.botId });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/arena-judge — idempotent: returns existing result if already judged
app.post("/api/arena-judge", async (req, res) => {
  try {
    const { roomName, userId, forfeit = false, forcedWinner } = req.body as {
      roomName: string; userId: string; forfeit?: boolean; forcedWinner?: "human" | "bot";
    };
    if (!roomName || !userId) return res.status(400).json({ error: "roomName and userId required" });

    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "ArenaMatch" WHERE "roomName" = $1 LIMIT 1`,
      roomName,
    );
    if (existing.length > 0) {
      const row = existing[0];
      return res.json({ winner: row.winner, verdict: row.verdict, scoreImpact: Number(row.scoreImpact), botId: row.botId });
    }

    const roomRows = await prisma.$queryRawUnsafe<{ id: string; botId: string | null }[]>(
      `SELECT id, "botId" FROM "Room" WHERE name = $1 LIMIT 1`,
      roomName,
    );
    if (roomRows.length === 0) return res.status(404).json({ error: "Room not found" });
    const roomDbId = roomRows[0].id;
    const botId = roomRows[0].botId ?? roomName.replace("arena-", "").split("-")[0];
    if (!botId) return res.status(400).json({ error: "Bot not found for room" });

    const result = await judgeMatch(roomDbId, roomName, userId, botId, prisma, forfeit, forcedWinner);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "ArenaMatch" ("id","roomName","userId","botId","winner","verdict","scoreImpact")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6)
       ON CONFLICT ("roomName") DO NOTHING`,
      roomName, userId, result.botId, result.winner, result.verdict, result.scoreImpact,
    );

    res.json(result);
  } catch (e) {
    console.error("[arena-judge]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/:id/profile
app.get("/api/users/:id/profile", async (req, res) => {
  try {
    const uid = req.params.id;
    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true, username: true, email: true, emailVerified: true, bio: true, avatarUrl: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    const eloRows = await prisma.$queryRawUnsafe<{ elo: number }[]>(
      `SELECT elo FROM "User" WHERE id = $1`, uid,
    ).catch(() => [{ elo: 1200 }]);
    const elo = eloRows[0]?.elo ?? 1200;

    const [cred, debateRows, messageRows, arenaRows, arenaStats] = await Promise.all([
      computeCredibility(uid, prisma).catch(() => null),
      prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count FROM "RoomMember" rm JOIN "Room" r ON r.id = rm."roomId" WHERE rm."userId" = $1 AND r."isDM" = false AND r."isBotRoom" = false`,
        uid,
      ).catch(() => [{ count: 0n }]),
      prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count FROM "Message" WHERE "senderId" = $1`,
        uid,
      ).catch(() => [{ count: 0n }]),
      prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count FROM "RoomMember" rm JOIN "Room" r ON r.id = rm."roomId" WHERE rm."userId" = $1 AND r."isBotRoom" = true`,
        uid,
      ).catch(() => [{ count: 0n }]),
      prisma.$queryRawUnsafe<{ wins: bigint; losses: bigint; bonus: number }[]>(
        `SELECT
          COALESCE(SUM(CASE WHEN "winner"='human' THEN 1 ELSE 0 END),0) AS wins,
          COALESCE(SUM(CASE WHEN "winner"='bot'   THEN 1 ELSE 0 END),0) AS losses,
          COALESCE(SUM("scoreImpact"),0) AS bonus
         FROM "ArenaMatch" WHERE "userId" = $1`,
        uid,
      ).catch(() => [{ wins: 0n, losses: 0n, bonus: 0 }]),
    ]);
    const as = arenaStats[0] as any;
    const stats = {
      debateCount: Number((debateRows[0] as any)?.count ?? 0),
      messageCount: Number((messageRows[0] as any)?.count ?? 0),
      arenaMatchCount: Number((arenaRows[0] as any)?.count ?? 0),
      arenaWins: Number(as?.wins ?? 0),
      arenaLosses: Number(as?.losses ?? 0),
      arenaBonus: Math.round(Number(as?.bonus ?? 0) * 10) / 10,
    };
    res.json({ ...user, elo, stats, ...(cred ? { cred } : {}) });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/users/:id/profile
app.patch("/api/users/:id/profile", async (req, res) => {
  const { bio, avatarUrl } = req.body as { bio?: string; avatarUrl?: string };
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(bio !== undefined && { bio: bio.trim().slice(0, 500) }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: { id: true, username: true, bio: true, avatarUrl: true },
    });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/users", async (req, res) => {
  const excludeId = req.query.excludeId as string | undefined;
  const users = await prisma.user.findMany({
    where: excludeId ? { id: { not: excludeId } } : {},
    select: { id: true, username: true },
    orderBy: { username: "asc" },
  });
  res.json(users);
});

app.get("/api/dm", async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const dms = await prisma.room.findMany({
    where: {
      isDM: true,
      OR: [{ participant1Id: userId }, { participant2Id: userId }],
    },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
  res.json(dms);
});

app.post("/api/dm", async (req, res) => {
  const { userId1, userId2 } = req.body as { userId1: string; userId2: string };
  if (!userId1 || !userId2) return res.status(400).json({ error: "Both user IDs required" });
  const [a, b] = [userId1, userId2].sort();
  const name = `dm-${a}-${b}`;
  try {
    const existing = await prisma.room.findUnique({ where: { name } });
    const room = existing ?? await prisma.room.create({ data: { name, isDM: true, participant1Id: a, participant2Id: b } });
    // Notify the other participant only for brand-new DMs
    if (!existing) {
      const initiator = await prisma.user.findUnique({ where: { id: userId1 }, select: { username: true } });
      const recipientId = userId1 === a ? b : a;
      const notif = await (prisma as any).notification.create({
        data: { userId: recipientId, type: "invite", roomId: room.id, roomName: `dm:${initiator?.username ?? userId1}`, fromUserId: userId1, fromUsername: initiator?.username ?? "Someone" },
      });
      deliverNotification(recipientId, notif);
    }
    res.json(room);
  } catch {
    res.status(500).json({ error: "Failed to create DM" });
  }
});

// POST /api/bot-rooms — create a private 1v1 debate room against a bot
app.post("/api/bot-rooms", async (req, res) => {
  const { userId, botId, winCondition = { type: "exchanges", limit: 10 } } = req.body as {
    userId: string; botId: string; winCondition?: object;
  };
  if (!userId || !botId) return res.status(400).json({ error: "userId and botId required" });
  if (!BOT_IDS.includes(botId)) return res.status(400).json({ error: "Unknown bot" });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const shortId = Date.now().toString(36).slice(-5);
    const name = `arena-${botId}-${userId.slice(-5)}-${shortId}`;

    const room = await prisma.room.create({
      data: { name, isPrivate: false, creatorId: userId },
    } as any);

    await prisma.$executeRawUnsafe(
      `UPDATE "Room" SET "isBotRoom" = true, "botId" = $1, "matchConfig" = $2 WHERE "id" = $3`,
      botId, JSON.stringify(winCondition), room.id,
    );

    await prisma.roomMember.create({ data: { userId, roomId: room.id } } as any);

    res.json({ name, id: room.id });
  } catch (e) {
    console.error("[bot-rooms]", e);
    res.status(500).json({ error: "Failed to create bot room" });
  }
});

// POST /api/bot-kick — trigger bot's opening message when botFirst is set
app.post("/api/bot-kick", async (req, res) => {
  const { roomName } = req.body as { roomName: string };
  if (!roomName) { res.status(400).json({ error: "roomName required" }); return; }
  try {
    const roomRows = await prisma.$queryRawUnsafe<{ id: string; botId: string | null; matchConfig: string | null }[]>(
      `SELECT id, "botId", "matchConfig" FROM "Room" WHERE name = $1 LIMIT 1`, roomName,
    );
    if (!roomRows[0]) { res.status(404).json({ error: "Room not found" }); return; }
    const { id: roomDbId, botId, matchConfig } = roomRows[0];

    // Idempotent: only send opening if no messages exist yet
    const msgCount = await prisma.message.count({ where: { roomId: roomDbId } });
    if (msgCount > 0) { res.json({ ok: true, skipped: true }); return; }

    const cfg = matchConfig ? JSON.parse(matchConfig) : {};
    if (!cfg.botFirst) { res.json({ ok: true, skipped: true }); return; }

    const resolvedBotId = botId ?? roomName.replace("arena-", "").split("-")[0];
    // Get the room's first channel so the message lands in the right channel
    const firstChannel = await prisma.channel.findFirst({ where: { roomId: roomDbId }, orderBy: { createdAt: "asc" } });
    // Fire-and-forget; client will receive bot message via socket
    respondAsBot(roomDbId, roomName, resolvedBotId, "", firstChannel?.id ?? null, io, prisma, true);
    res.json({ ok: true });
  } catch (e) {
    console.error("[bot-kick]", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/rooms", async (req, res) => {
  const name = req.body?.name?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
  const creatorId = req.body?.creatorId as string | undefined;
  const description = req.body?.description?.trim().slice(0, 200) || null;
  const proposition = req.body?.proposition?.trim().slice(0, 300) || null;
  const isPrivate: boolean = req.body?.isPrivate === true;
  const rawPassword: string | undefined = req.body?.password;
  const maxMembers: number | null = req.body?.maxMembers ? parseInt(req.body.maxMembers) : null;
  const aiPersona: string | null = req.body?.aiPersona?.trim().slice(0, 500) || null;
  const isOpinionated: boolean = req.body?.isOpinionated === true;
  const stanceCooldown: number = req.body?.stanceCooldown ? Math.max(0, Math.round(parseInt(req.body.stanceCooldown))) : 0;
  const rawStances: string[] | undefined = Array.isArray(req.body?.stances) ? req.body.stances : undefined;
  const isFishbowl: boolean = req.body?.isFishbowl === true;
  const fishbowlSeats: number | null = req.body?.fishbowlSeats ? Math.min(20, Math.max(2, parseInt(req.body.fishbowlSeats))) : null;

  if (!name) return res.status(400).json({ error: "Invalid room name" });
  if (containsSlur(name)) return res.status(400).json({ error: "Room name contains prohibited language." });
  if (isPrivate && !rawPassword) return res.status(400).json({ error: "Private rooms require a password." });
  if (maxMembers !== null && (maxMembers < 2 || maxMembers > 500)) return res.status(400).json({ error: "Max members must be between 2 and 500." });
  if (isFishbowl && (!fishbowlSeats || fishbowlSeats < 2 || fishbowlSeats > 20)) return res.status(400).json({ error: "Fishbowl rooms need 2–20 seats." });

  try {
    const existing = await prisma.room.findUnique({ where: { name } });
    if (existing) return res.status(409).json({ error: "Room already exists" });
    const password = isPrivate && rawPassword ? await bcrypt.hash(rawPassword, 10) : null;
    const room = await prisma.room.create({
      data: { name, description, proposition, creatorId: creatorId ?? null, isPrivate, password, maxMembers, aiPersona, isOpinionated, isFishbowl, fishbowlSeats },
    } as any);
    if (stanceCooldown > 0) {
      try { await prisma.$executeRawUnsafe(`UPDATE "Room" SET "stanceCooldown" = $1 WHERE "id" = $2`, stanceCooldown, room.id); } catch { /* ignore */ }
    }
    if (rawStances && rawStances.length > 0) {
      const cleanStances = rawStances.map((s: string) => s.trim()).filter(Boolean).slice(0, 6);
      if (cleanStances.length > 0) {
        await prisma.$executeRawUnsafe(`UPDATE "Room" SET "stances" = $1 WHERE "id" = $2`, JSON.stringify(cleanStances), room.id);
      }
    }
    // Auto-create default "general" channel for every new room
    await prisma.channel.create({ data: { name: "general", roomId: room.id, order: 0 } });
    // Auto-create spectator-chat channel for fishbowl rooms
    if (isFishbowl) {
      await (prisma as any).channel.create({ data: { name: "spectator-chat", roomId: room.id, order: 999, isSidebar: true, isSpectatorChat: true } });
    }
    // Auto-join the creator as a PARTICIPANT
    if (creatorId) {
      await prisma.roomMember.create({ data: { userId: creatorId, roomId: room.id } } as any);
    }
    res.json({ ...room, password: undefined });
  } catch {
    res.status(500).json({ error: "Failed to create room" });
  }
});

// GET /api/rooms/:name/channels — sections + channels tree
// GET /api/channels/:id/messages — channel history for initial load
app.get("/api/channels/:id/messages", async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { channelId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: true },
    });
    messages.reverse();
    res.json(await loadWithReactions(messages));
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/rooms/:name/channels", async (req, res) => {
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const [sections, channels, sidebarChannelList] = await Promise.all([
      prisma.section.findMany({ where: { roomId: room.id }, orderBy: { order: "asc" } }),
      (prisma as any).channel.findMany({ where: { roomId: room.id, isSidebar: false }, orderBy: { order: "asc" } }),
      (prisma as any).channel.findMany({ where: { roomId: room.id, isSidebar: true } }),
    ]);
    let stances: string[] = [];
    let stanceCooldown = 0;
    let matchConfig: string | null = null;
    let isBotRoom = false;
    let botId: string | null = null;
    try {
      const stRow = await prisma.$queryRawUnsafe<{
        stances: string | null; stanceCooldown: number | null;
        matchConfig: string | null; isBotRoom: boolean; botId: string | null;
      }[]>(
        `SELECT "stances", "stanceCooldown", "matchConfig", "isBotRoom", "botId" FROM "Room" WHERE "id" = $1`, room.id
      );
      if (stRow[0]?.stances) stances = JSON.parse(stRow[0].stances);
      if (stRow[0]?.stanceCooldown) stanceCooldown = stRow[0].stanceCooldown;
      matchConfig = stRow[0]?.matchConfig ?? null;
      isBotRoom = stRow[0]?.isBotRoom ?? false;
      botId = stRow[0]?.botId ?? null;
    } catch { /* columns may not exist yet */ }
    const { password: _pw, ...roomMeta } = room as any;
    res.json({ sections, channels, sidebarChannels: sidebarChannelList, roomMeta: { ...roomMeta, stances, stanceCooldown, matchConfig, isBotRoom, botId } });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/rooms/:name/sections
app.post("/api/rooms/:name/sections", async (req, res) => {
  const { userId, name: sectionName } = req.body as { userId: string; name: string };
  if (!userId || !sectionName?.trim()) return res.status(400).json({ error: "userId and name required" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (room.creatorId !== userId && !requestingUser?.isAdmin) return res.status(403).json({ error: "Unauthorized" });
    const count = await prisma.section.count({ where: { roomId: room.id } });
    const section = await prisma.section.create({ data: { name: sectionName.trim().slice(0, 50), roomId: room.id, order: count } });
    io.to(req.params.name).emit("channelsUpdated");
    res.json(section);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/rooms/:name/sections/:id
app.patch("/api/rooms/:name/sections/:id", async (req, res) => {
  const { userId, name: newName } = req.body as { userId: string; name: string };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (room.creatorId !== userId && !requestingUser?.isAdmin) return res.status(403).json({ error: "Unauthorized" });
    const section = await prisma.section.update({ where: { id: req.params.id }, data: { name: newName.trim().slice(0, 50) } });
    io.to(req.params.name).emit("channelsUpdated");
    res.json(section);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/rooms/:name/sections/:id
app.delete("/api/rooms/:name/sections/:id", async (req, res) => {
  const { userId } = req.body as { userId: string };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (room.creatorId !== userId && !requestingUser?.isAdmin) return res.status(403).json({ error: "Unauthorized" });
    // Move section's channels to unsectioned
    await prisma.channel.updateMany({ where: { sectionId: req.params.id }, data: { sectionId: null } });
    await prisma.section.delete({ where: { id: req.params.id } });
    io.to(req.params.name).emit("channelsUpdated");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/rooms/:name/sub-debates — branch a message into a focused sub-debate channel
app.post("/api/rooms/:name/sub-debates", async (req, res) => {
  const { userId, proposition, messageId, messagePreview } = req.body as {
    userId: string; proposition: string; messageId?: string; messagePreview?: string;
  };
  if (!userId || !proposition?.trim()) return res.status(400).json({ error: "userId and proposition required" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const count = await (prisma as any).channel.count({ where: { roomId: room.id } });
    const channel = await (prisma as any).channel.create({
      data: {
        name: proposition.trim().slice(0, 60),
        roomId: room.id,
        order: count,
        isSubDebate: true,
        proposition: proposition.trim().slice(0, 300),
        parentMessageId: messageId ?? null,
        parentMessagePreview: messagePreview?.trim().slice(0, 200) ?? null,
      },
    });
    io.to(req.params.name).emit("channelsUpdated");
    res.json(channel);
  } catch (e) {
    console.error("[sub-debates]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/rooms/:name/channels/:id/sidebar — create (or return) sidebar for a channel
app.post("/api/rooms/:name/channels/:id/sidebar", async (req, res) => {
  const { userId } = req.body as { userId: string };
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const parentChannel = await prisma.channel.findUnique({ where: { id: req.params.id } });
    if (!parentChannel || parentChannel.roomId !== room.id) return res.status(404).json({ error: "Channel not found" });

    let sb = await (prisma as any).channel.findFirst({ where: { parentChannelId: req.params.id, isSidebar: true } });
    if (!sb) {
      const count = await prisma.channel.count({ where: { roomId: room.id } });
      sb = await (prisma as any).channel.create({
        data: { name: "side chat", roomId: room.id, isSidebar: true, parentChannelId: req.params.id, order: count },
      });
      channelSidebars.set(req.params.id, sb.id);
      io.to(req.params.name).emit("channelsUpdated");
      io.to(`channel:${req.params.id}`).emit("sidebarChannel", { id: sb.id, name: "side chat" });
    } else {
      channelSidebars.set(req.params.id, sb.id);
    }
    res.json(sb);
  } catch (e) {
    console.error("[sidebar create]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/rooms/:name/channels
app.post("/api/rooms/:name/channels", async (req, res) => {
  const { userId, name: channelName, sectionId } = req.body as { userId: string; name: string; sectionId?: string };
  if (!userId || !channelName?.trim()) return res.status(400).json({ error: "userId and name required" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (room.creatorId !== userId && !requestingUser?.isAdmin) return res.status(403).json({ error: "Unauthorized" });
    const count = await prisma.channel.count({ where: { roomId: room.id } });
    const channel = await prisma.channel.create({
      data: { name: channelName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40), roomId: room.id, sectionId: sectionId ?? null, order: count },
    });
    io.to(req.params.name).emit("channelsUpdated");
    res.json(channel);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/rooms/:name/channels/:id
app.patch("/api/rooms/:name/channels/:id", async (req, res) => {
  const { userId, name: newName, sectionId, isOpinionated: chOpinionated } = req.body as { userId: string; name?: string; sectionId?: string | null; isOpinionated?: boolean };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (room.creatorId !== userId && !requestingUser?.isAdmin) return res.status(403).json({ error: "Unauthorized" });
    const data: any = {};
    if (newName) data.name = newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    if (sectionId !== undefined) data.sectionId = sectionId;
    if (chOpinionated !== undefined) data.isOpinionated = chOpinionated;
    const channel = await (prisma as any).channel.update({ where: { id: req.params.id }, data });
    io.to(req.params.name).emit("channelsUpdated");
    res.json(channel);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/rooms/:name/channels/:id
app.delete("/api/rooms/:name/channels/:id", async (req, res) => {
  const { userId } = req.body as { userId: string };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (room.creatorId !== userId && !requestingUser?.isAdmin) return res.status(403).json({ error: "Unauthorized" });
    // Don't allow deleting the last channel
    const count = await prisma.channel.count({ where: { roomId: room.id } });
    if (count <= 1) return res.status(400).json({ error: "Cannot delete the last channel." });
    await prisma.message.updateMany({ where: { channelId: req.params.id }, data: { channelId: null } });
    await prisma.channel.delete({ where: { id: req.params.id } });
    io.to(req.params.name).emit("channelsUpdated");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/rooms/:name/auth", async (req, res) => {
  const { name } = req.params;
  const { password, userId } = req.body as { password: string; userId?: string };
  if (!password) return res.status(400).json({ error: "Password required" });
  try {
    const room = await prisma.room.findUnique({ where: { name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!room.isPrivate || !room.password) {
      if (userId) await prisma.roomMember.upsert({ where: { userId_roomId: { userId, roomId: room.id } }, update: {}, create: { userId, roomId: room.id } });
      return res.json({ ok: true });
    }
    const valid = await bcrypt.compare(password, room.password);
    if (valid && userId) {
      await prisma.roomMember.upsert({ where: { userId_roomId: { userId, roomId: room.id } }, update: {}, create: { userId, roomId: room.id } });
    }
    res.json({ ok: valid });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/rooms/:name", async (req, res) => {
  const { name } = req.params;
  try {
    const room = await prisma.room.findUnique({
      where: { name },
      include: { _count: { select: { messages: true } } },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const { password: _pw, ...rest } = room as any;
    res.json(rest);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/rooms/:name", async (req, res) => {
  const { name } = req.params;
  const { userId, description, proposition, maxMembers, isPrivate, password: newPassword, aiPersona, stances, isOpinionated, stanceCooldown } = req.body as {
    userId: string;
    description?: string;
    proposition?: string;
    maxMembers?: number | null;
    isPrivate?: boolean;
    password?: string;
    aiPersona?: string | null;
    stances?: string[];
    isOpinionated?: boolean;
    stanceCooldown?: number;
  };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const room = await prisma.room.findUnique({ where: { name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
    const isAdmin = requestingUser?.isAdmin ?? false;
    if (room.creatorId !== userId && !isAdmin) return res.status(403).json({ error: "Only the creator can edit this room" });

    const data: any = {};
    if (description !== undefined) data.description = description?.trim().slice(0, 200) || null;
    if (proposition !== undefined) data.proposition = proposition?.trim().slice(0, 300) || null;
    if (maxMembers !== undefined) data.maxMembers = maxMembers;
    if (isPrivate !== undefined) {
      data.isPrivate = isPrivate;
      if (!isPrivate) data.password = null;
    }
    if (newPassword) data.password = await bcrypt.hash(newPassword, 10);
    if (aiPersona !== undefined) data.aiPersona = aiPersona?.trim().slice(0, 500) || null;
    if (isOpinionated !== undefined) data.isOpinionated = isOpinionated;

    const updated = await prisma.room.update({ where: { name }, data });
    const { password: _pw, ...rest } = updated as any;
    // Handle stanceCooldown via raw SQL (not in Prisma schema)
    let stanceCooldownVal = 0;
    try {
      if (stanceCooldown !== undefined) {
        const cooldownNum = Math.max(0, Math.round(stanceCooldown));
        await prisma.$executeRawUnsafe(`UPDATE "Room" SET "stanceCooldown" = $1 WHERE "id" = $2`, cooldownNum, updated.id);
        stanceCooldownVal = cooldownNum;
      } else {
        const coolRow = await prisma.$queryRawUnsafe<{ stanceCooldown: number | null }[]>(
          `SELECT "stanceCooldown" FROM "Room" WHERE "id" = $1`, updated.id
        );
        stanceCooldownVal = coolRow[0]?.stanceCooldown ?? 0;
      }
    } catch { /* stanceCooldown column may not exist yet */ }
    if (Array.isArray(stances)) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Room" SET "stances" = $1 WHERE "id" = $2`,
        JSON.stringify(stances.map((s: string) => s.trim()).filter(Boolean).slice(0, 6)),
        updated.id
      );
      io.to(name).emit("stancesUpdated", stances.map((s: string) => s.trim()).filter(Boolean).slice(0, 6));
    }
    // Notify everyone in the room of updated meta
    io.to(name).emit("roomMeta", { ...rest, stanceCooldown: stanceCooldownVal });
    res.json({ ...rest, stanceCooldown: stanceCooldownVal });
  } catch {
    res.status(500).json({ error: "Failed to update room" });
  }
});

app.delete("/api/rooms/:name", async (req, res) => {
  const { name } = req.params;
  const { userId } = req.body as { userId: string };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const room = await prisma.room.findUnique({ where: { name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
    const isAdmin = requestingUser?.isAdmin ?? false;
    if (room.creatorId !== userId && !isAdmin) return res.status(403).json({ error: "Only the creator can delete this room" });
    io.to(name).emit("roomDeleted");
    await prisma.message.deleteMany({ where: { roomId: room.id } });
    await prisma.room.delete({ where: { name } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete room" });
  }
});

// GET /api/channels/:id/polls — active polls for a channel
app.get("/api/channels/:id/polls", async (req, res) => {
  try {
    const polls = await (prisma as any).poll.findMany({
      where: { channelId: req.params.id, closedAt: null },
      include: { votes: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(polls);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/channels/:id/claims — all claims for a channel with credibility scores
app.get("/api/channels/:id/claims", async (req, res) => {
  try {
    const claims = await (prisma as any).claim.findMany({
      where: { channelId: req.params.id },
      include: { _count: { select: { challenges: true } } },
      orderBy: { createdAt: "asc" },
    });
    const claimantIds: string[] = [...new Set<string>(claims.map((c: any) => c.claimantId as string))];
    const credScores: Record<string, any> = {};
    for (const uid of claimantIds) {
      credScores[uid] = await computeCredibility(uid, prisma);
    }
    res.json({ claims: claims.map((c: any) => ({ ...c, challengeCount: c._count.challenges, _count: undefined })), credScores });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/search?q=&excludeId=
app.get("/api/users/search", async (req, res) => {
  const q = ((req.query.q as string) ?? "").trim();
  const excludeId = req.query.excludeId as string | undefined;
  if (!q) return res.json([]);
  try {
    const users = await prisma.user.findMany({
      where: { username: { contains: q, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, username: true, avatarUrl: true },
      take: 8,
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/notifications?userId=
app.get("/api/notifications", async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const notifs = await (prisma as any).notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(notifs);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/notifications/read
app.patch("/api/notifications/read", async (req, res) => {
  const { userId } = req.body as { userId: string };
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    await (prisma as any).notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/graph — knowledge graph (filtered to userId's joined rooms when provided; roomId scopes to one room)
app.get("/api/graph", async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    const scopeRoomId = req.query.roomId as string | undefined;  // DB room id for per-room graph

    // Build room id filter
    let roomIdFilter: string[] | undefined;
    if (scopeRoomId) {
      roomIdFilter = [scopeRoomId];
    } else if (userId) {
      const memberships = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } });
      // Only apply filter when the user actually has memberships; an empty array would return nothing
      if (memberships.length > 0) roomIdFilter = memberships.map(m => m.roomId);
    }

    const roomWhere = roomIdFilter ? { id: { in: roomIdFilter }, isDM: false } : { isDM: false };
    const nodeWhere = roomIdFilter ? { roomId: { in: roomIdFilter } } : {};
    const edgeWhere = roomIdFilter ? { roomId: { in: roomIdFilter } } : {};

    type CountRow = { nodeId: string; count: bigint };
    const [rawNodes, edges, rooms] = await Promise.all([
      prisma.graphNode.findMany({ where: nodeWhere, orderBy: { createdAt: "asc" } }),
      prisma.graphEdge.findMany({ where: edgeWhere, orderBy: { createdAt: "asc" } }),
      prisma.room.findMany({ where: roomWhere, select: { id: true, name: true } }),
    ]);

    // Person nodes are global — pull in any person node referenced by these edges
    // that may live in a different room (cross-room deduplication side-effect)
    let crossRoomPersonNodes: typeof rawNodes = [];
    if (roomIdFilter) {
      const edgeNodeIds = new Set(edges.flatMap(e => [e.fromNodeId, e.toNodeId]));
      if (edgeNodeIds.size > 0) {
        crossRoomPersonNodes = await prisma.graphNode.findMany({
          where: {
            id: { in: [...edgeNodeIds] },
            type: "person",
            NOT: { roomId: { in: roomIdFilter } },
          },
          orderBy: { createdAt: "asc" },
        });
      }
    }

    // Merge all nodes then deduplicate person nodes by label (they're global — same person = same node)
    const allNodes = [...rawNodes, ...crossRoomPersonNodes];
    const personCanonical = new Map<string, string>(); // label.toLowerCase() → canonical id
    const idRemap = new Map<string, string>();          // duplicate id → canonical id
    for (const n of allNodes) {
      if (n.type !== "person") continue;
      const key = n.label.toLowerCase().trim();
      if (personCanonical.has(key)) {
        idRemap.set(n.id, personCanonical.get(key)!);
      } else {
        personCanonical.set(key, n.id);
      }
    }

    // Remap edge endpoints to canonical person ids, drop self-loops
    const dedupedEdges = edges
      .map(e => ({
        ...e,
        fromNodeId: idRemap.get(e.fromNodeId) ?? e.fromNodeId,
        toNodeId: idRemap.get(e.toNodeId) ?? e.toNodeId,
      }))
      .filter(e => e.fromNodeId !== e.toNodeId);

    // GraphNodeMessage may not exist yet on some deployments — degrade gracefully
    let counts: CountRow[] = [];
    try {
      counts = await prisma.$queryRaw<CountRow[]>`SELECT "nodeId", COUNT(*) AS count FROM "GraphNodeMessage" GROUP BY "nodeId"`;
    } catch (err) {
      console.error("[Graph] GraphNodeMessage count query failed:", err);
    }
    const countMap = new Map(counts.map((r) => [r.nodeId, Number(r.count)]));
    // Sum correction counts for any remapped duplicates into their canonical node
    for (const [dupId, canonId] of idRemap) {
      const dupCount = countMap.get(dupId) ?? 0;
      if (dupCount > 0) countMap.set(canonId, (countMap.get(canonId) ?? 0) + dupCount);
    }
    const nodes = allNodes
      .filter(n => !idRemap.has(n.id))
      .map(n => ({ ...n, correctionCount: countMap.get(n.id) ?? 0 }));
    res.json({ nodes, edges: dedupedEdges, rooms });
  } catch (err) {
    console.error("[Graph] Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/graph/nodes/:id/messages — AI correction cards linked to a graph node
app.get("/api/graph/nodes/:id/messages", async (req, res) => {
  try {
    const nodeId = req.params.id;
    const messages = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT m.* FROM "Message" m
      JOIN "GraphNodeMessage" gnm ON gnm."messageId" = m.id
      WHERE gnm."nodeId" = ${nodeId}
      ORDER BY gnm."createdAt" DESC
    `;
    res.json(messages);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT ?? 3001;

async function start() {
  try {
    await prisma.$executeRawUnsafe("SELECT 1");
    console.log("[DB] Connected");
  } catch (e) {
    console.error("[DB] Connection failed:", e);
  }

  // Ensure GraphNodeMessage table exists — Railway migration history can get out of sync
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GraphNodeMessage" (
        "id" TEXT NOT NULL,
        "nodeId" TEXT NOT NULL,
        "messageId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GraphNodeMessage_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "GraphNodeMessage_nodeId_messageId_key"
        ON "GraphNodeMessage"("nodeId", "messageId");
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'GraphNodeMessage_nodeId_fkey'
        ) THEN
          ALTER TABLE "GraphNodeMessage"
            ADD CONSTRAINT "GraphNodeMessage_nodeId_fkey"
            FOREIGN KEY ("nodeId") REFERENCES "GraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'GraphNodeMessage_messageId_fkey'
        ) THEN
          ALTER TABLE "GraphNodeMessage"
            ADD CONSTRAINT "GraphNodeMessage_messageId_fkey"
            FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    console.log("[DB] GraphNodeMessage table ready");
  } catch (e) {
    console.error("[DB] GraphNodeMessage setup failed:", e);
  }

  // Ensure Poll tables exist
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Poll" (
        "id" TEXT NOT NULL, "roomId" TEXT NOT NULL, "channelId" TEXT,
        "question" TEXT NOT NULL, "options" TEXT[] NOT NULL, "createdBy" TEXT NOT NULL,
        "closedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
      );
      CREATE TABLE IF NOT EXISTS "PollVote" (
        "id" TEXT NOT NULL, "pollId" TEXT NOT NULL, "userId" TEXT NOT NULL, "option" TEXT NOT NULL,
        CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "PollVote_pollId_userId_key" ON "PollVote"("pollId", "userId");
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Poll_roomId_fkey') THEN
          ALTER TABLE "Poll" ADD CONSTRAINT "Poll_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PollVote_pollId_fkey') THEN
          ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    console.log("[DB] Poll tables ready");
  } catch (e) {
    console.error("[DB] Poll tables setup failed:", e);
  }

  // Ensure Claim tables exist
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClaimStatus') THEN
          CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'SUPPORTED', 'REFUTED', 'CONTESTED');
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS "Claim" (
        "id" TEXT NOT NULL, "messageId" TEXT NOT NULL, "roomId" TEXT NOT NULL,
        "channelId" TEXT, "claimantId" TEXT NOT NULL, "text" TEXT NOT NULL,
        "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING', "verdict" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
      );
      CREATE TABLE IF NOT EXISTS "ClaimChallenge" (
        "id" TEXT NOT NULL, "claimId" TEXT NOT NULL, "challengerId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ClaimChallenge_pkey" PRIMARY KEY ("id")
      );
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Claim_messageId_fkey') THEN
          ALTER TABLE "Claim" ADD CONSTRAINT "Claim_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Claim_roomId_fkey') THEN
          ALTER TABLE "Claim" ADD CONSTRAINT "Claim_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClaimChallenge_claimId_fkey') THEN
          ALTER TABLE "ClaimChallenge" ADD CONSTRAINT "ClaimChallenge_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    console.log("[DB] Claim tables ready");
  } catch (e) {
    console.error("[DB] Claim tables setup failed:", e);
  }

  // Ensure User profile columns exist (Railway migration history can get out of sync)
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bio" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT`);
    console.log("[DB] User profile columns ready");
  } catch (e) {
    console.error("[DB] User profile columns setup failed:", e);
  }

  // Ensure debate position tables and Room.proposition exist
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "proposition" TEXT`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DebatePosition') THEN
          CREATE TYPE "DebatePosition" AS ENUM ('FOR', 'AGAINST', 'NEUTRAL');
        END IF;
      END $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserPosition" (
        "id"        TEXT         NOT NULL,
        "userId"    TEXT         NOT NULL,
        "roomId"    TEXT         NOT NULL,
        "position"  TEXT         NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserPosition_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UserPosition_userId_roomId_key"
        ON "UserPosition"("userId", "roomId")
    `);
    console.log("[DB] Debate position tables ready");
  } catch (e) {
    console.error("[DB] Debate position tables setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "relevance" FLOAT NOT NULL DEFAULT 1.0;
    `);
    console.log("[DB] Claim relevance column ready");
  } catch (e) {
    console.error("[DB] Claim relevance column setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "isSidebar" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log("[DB] Channel isSidebar column ready");
  } catch (e) {
    console.error("[DB] Channel isSidebar column setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "isSubDebate" BOOLEAN NOT NULL DEFAULT false`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "proposition" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "parentMessageId" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "parentMessagePreview" TEXT`);
    console.log("[DB] Channel sub-debate columns ready");
  } catch (e) {
    console.error("[DB] Channel sub-debate columns setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "stances" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "UserPosition" ALTER COLUMN "position" TYPE TEXT USING "position"::text`);
    console.log("[DB] Stances and position columns ready");
  } catch (e) {
    console.error("[DB] Stances/position column setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "parentChannelId" TEXT;
    `);
    console.log("[DB] Channel parentChannelId column ready");
  } catch (e) {
    console.error("[DB] Channel parentChannelId column setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "isOpinionated" BOOLEAN NOT NULL DEFAULT false;`);
    console.log("[DB] Room isOpinionated column ready");
  } catch (e) {
    console.error("[DB] Room isOpinionated column setup failed:", e);
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "isOpinionated" BOOLEAN NOT NULL DEFAULT false;`);
    console.log("[DB] Channel isOpinionated column ready");
  } catch (e) {
    console.error("[DB] Channel isOpinionated column setup failed:", e);
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "stanceCooldown" INTEGER NOT NULL DEFAULT 0;`);
    console.log("[DB] Room stanceCooldown column ready");
  } catch (e) {
    console.error("[DB] Room stanceCooldown column setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Notification" (
        "id"           TEXT NOT NULL PRIMARY KEY,
        "userId"       TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "type"         TEXT NOT NULL,
        "roomId"       TEXT,
        "roomName"     TEXT,
        "channelId"    TEXT,
        "fromUserId"   TEXT,
        "fromUsername" TEXT,
        "content"      TEXT,
        "read"         BOOLEAN NOT NULL DEFAULT false,
        "resolved"     BOOLEAN NOT NULL DEFAULT false,
        "accepted"     BOOLEAN,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");`);
    console.log("[DB] Notification table ready");
  } catch (e) {
    console.error("[DB] Notification table setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3)`);
    console.log("[DB] Message edit/delete columns ready");
  } catch (e) {
    console.error("[DB] Message edit/delete columns setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "isFishbowl" BOOLEAN NOT NULL DEFAULT false`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "fishbowlSeats" INTEGER`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "RoomMember" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'PARTICIPANT'`);
    console.log("[DB] Fishbowl columns ready");
  } catch (e) {
    console.error("[DB] Fishbowl columns setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "isSpectatorChat" BOOLEAN NOT NULL DEFAULT false`);
    console.log("[DB] Channel isSpectatorChat column ready");
  } catch (e) {
    console.error("[DB] Channel isSpectatorChat column setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Reaction" (
        "id"        TEXT NOT NULL PRIMARY KEY,
        "messageId" TEXT NOT NULL REFERENCES "Message"("id") ON DELETE CASCADE,
        "userId"    TEXT NOT NULL,
        "username"  TEXT NOT NULL,
        "emoji"     TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Reaction_messageId_userId_emoji_key" ON "Reaction"("messageId","userId","emoji");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Reaction_messageId_idx" ON "Reaction"("messageId");`);
    console.log("[DB] Reaction table ready");
  } catch (e) {
    console.error("[DB] Reaction table setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "isBotRoom" BOOLEAN NOT NULL DEFAULT false`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "botId" TEXT`);
    console.log("[DB] Bot room columns ready");
  } catch (e) {
    console.error("[DB] Bot room columns setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ArenaMatch" (
        "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "roomName"    TEXT NOT NULL UNIQUE,
        "userId"      TEXT NOT NULL,
        "botId"       TEXT NOT NULL,
        "winner"      TEXT NOT NULL,
        "verdict"     TEXT NOT NULL,
        "scoreImpact" DOUBLE PRECISION NOT NULL,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ArenaMatch_userId_idx" ON "ArenaMatch"("userId")`);
    console.log("[DB] ArenaMatch table ready");
  } catch (e) {
    console.error("[DB] ArenaMatch table setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "matchConfig" TEXT`);
    console.log("[DB] matchConfig column ready");
  } catch (e) {
    console.error("[DB] matchConfig column setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "elo" INTEGER NOT NULL DEFAULT 1200`);
    console.log("[DB] User.elo column ready");
  } catch (e) {
    console.error("[DB] User.elo setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Challenge" (
        "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"       TEXT NOT NULL,
        "claim"        TEXT NOT NULL,
        "stance"       TEXT NOT NULL,
        "winCondition" TEXT NOT NULL,
        "status"       TEXT NOT NULL DEFAULT 'open',
        "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Challenge_status_idx" ON "Challenge"("status")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Challenge_userId_idx" ON "Challenge"("userId")`);
    console.log("[DB] Challenge table ready");
  } catch (e) {
    console.error("[DB] Challenge table setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CompetitiveMatch" (
        "id"                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "challengeId"          TEXT NOT NULL,
        "challengerId"         TEXT NOT NULL,
        "challengedId"         TEXT NOT NULL,
        "challengerStance"     TEXT NOT NULL,
        "challengedStance"     TEXT NOT NULL,
        "roomName"             TEXT NOT NULL UNIQUE,
        "status"               TEXT NOT NULL DEFAULT 'active',
        "winnerId"             TEXT,
        "verdict"              TEXT,
        "challengerEloBefore"  INTEGER,
        "challengedEloBefore"  INTEGER,
        "challengerEloAfter"   INTEGER,
        "challengedEloAfter"   INTEGER,
        "createdAt"            TIMESTAMP NOT NULL DEFAULT NOW(),
        "completedAt"          TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CompetitiveMatch_challengerId_idx" ON "CompetitiveMatch"("challengerId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CompetitiveMatch_challengedId_idx" ON "CompetitiveMatch"("challengedId")`);
    console.log("[DB] CompetitiveMatch table ready");
  } catch (e) {
    console.error("[DB] CompetitiveMatch table setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserLessonProgress" (
        "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"      TEXT NOT NULL,
        "seriesSlug"  TEXT NOT NULL,
        "lessonSlug"  TEXT NOT NULL,
        "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("userId", "seriesSlug", "lessonSlug")
      )
    `);
    console.log("[DB] UserLessonProgress table ready");
  } catch (e) {
    console.error("[DB] UserLessonProgress table setup failed:", e);
  }

  httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
