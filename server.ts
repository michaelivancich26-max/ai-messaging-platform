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
app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));

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
redis.connect().catch(console.error);

const WINDOW_KEY = (roomId: string) => `chat:${roomId}:window`;
const WINDOW_SIZE = 6;

function mapMessages(messages: any[]) {
  return messages.map((m) => {
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

// Presence: roomId → Map<socketId, { userId, username }>
const presence = new Map<string, Map<string, { userId: string; username: string }>>();

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

  socket.on("disconnect", () => leavePresence(socket.id));

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

      // Presence
      if (!presence.has(roomId)) presence.set(roomId, new Map());
      presence.get(roomId)!.set(socket.id, { userId: socketUser.id, username: socketUser.username });
      broadcastPresence(roomId);

      // Send room meta (without password hash)
      const { password: _pw, ...roomMeta } = room as any;
      let stances: string[] = [];
      try {
        const stRow = await prisma.$queryRawUnsafe<{ stances: string | null }[]>(
          `SELECT "stances" FROM "Room" WHERE "id" = $1`, room.id
        );
        if (stRow[0]?.stances) stances = JSON.parse(stRow[0].stances);
      } catch { /* stances column not yet added */ }
      socket.emit("roomMeta", { ...roomMeta, stances });

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

      // For DMs: emit history directly (no channels)
      if (room.isDM) {
        const history = await prisma.message.findMany({
          where: { roomId: room.id },
          orderBy: { createdAt: "asc" },
          take: 20,
          include: { user: true },
        });
        socket.emit("history", mapMessages(history));
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

      const history = await prisma.message.findMany({
        where: { channelId },
        orderBy: { createdAt: "asc" },
        take: 20,
        include: { user: true },
      });
      socket.emit("history", mapMessages(history));

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

        // Enforce structured debate turn order (sidebar channel is exempt)
        let isSidebarMsg = false;
        let isChannelOpinionated = false;
        if (channelId) {
          try {
            const ch = await (prisma as any).channel.findUnique({ where: { id: channelId } });
            isSidebarMsg = !!(ch as any)?.isSidebar;
            isChannelOpinionated = !!(ch as any)?.isOpinionated;
          } catch { /* ignore */ }
        }
        const isOpinionated = isChannelOpinionated || !!(room as any).isOpinionated;
        if (!isImage && !isSidebarMsg) {
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

        // Auto-advance structured debate turn after speaking (not for sidebar messages)
        if (!isImage && !isSidebarMsg) {
          const turn = debateTurns.get(roomId);
          if (turn?.mode === "structured" && turn.currentSpeakerId === user.id) {
            const nextSide: "FOR" | "AGAINST" = turn.currentSide === "FOR" ? "AGAINST" : "FOR";
            const newTurn: DebateTurnState = { mode: "structured", currentSide: nextSide, currentSpeakerId: null, currentSpeakerName: null, turnNumber: turn.turnNumber + 1 };
            debateTurns.set(roomId, newTurn);
            io.to(emitTarget).emit("debateTurnUpdate", newTurn);
          }
        }

        if (!isImage) {
          const windowKey = WINDOW_KEY(channelId ?? roomId);
          await redis.lPush(windowKey, JSON.stringify({ role: "human", content, username }));
          await redis.lTrim(windowKey, 0, WINDOW_SIZE - 1);
          const aiDeps = { redis, io, prisma, settings: settings ?? { factualCorrection: true, ambiguityResolution: true }, emitRoom: emitTarget, aiPersona: room.aiPersona ?? undefined, roomName: room.name, channelId: channelId ?? null };
          if (!isOpinionated) scheduleAI(channelId ?? roomId, aiDeps);
          if (/@claude\b/i.test(content)) {
            respondToMention(content, channelId ?? roomId, aiDeps);
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
        if (!debatePositions.has(roomId)) debatePositions.set(roomId, new Map());
        debatePositions.get(roomId)!.set(socketUser.id, { userId: socketUser.id, username: socketUser.username, position });
        try {
          const room = await prisma.room.findUnique({ where: { name: roomId } });
          if (room) {
            await prisma.$executeRawUnsafe(
              `INSERT INTO "UserPosition" ("id", "userId", "roomId", "position", "updatedAt", "createdAt")
               VALUES (gen_random_uuid()::text, $1, $2, $3, NOW(), NOW())
               ON CONFLICT ("userId", "roomId") DO UPDATE SET "position" = $3, "updatedAt" = NOW()`,
              socketUser.id, room.id, position
            );
          }
        } catch { /* ignore */ }
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
    let joinedIds = new Set<string>();
    if (userId) {
      const memberships = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } });
      joinedIds = new Set(memberships.map(m => m.roomId));
    }
    res.json(rooms.map(({ password: _pw, ...r }) => ({ ...r, joined: joinedIds.has(r.id) })));
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
    await prisma.roomMember.upsert({
      where: { userId_roomId: { userId, roomId: room.id } },
      update: {},
      create: { userId, roomId: room.id },
    });
    res.json({ ok: true });
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

// GET /api/users/:id/profile
app.get("/api/users/:id/profile", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, username: true, bio: true, avatarUrl: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    const cred = await computeCredibility(req.params.id, prisma).catch(() => null);
    res.json({ ...user, ...(cred ? { cred } : {}) });
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
    const room = await prisma.room.upsert({
      where: { name },
      create: { name, isDM: true, participant1Id: a, participant2Id: b },
      update: {},
    });
    res.json(room);
  } catch {
    res.status(500).json({ error: "Failed to create DM" });
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

  if (!name) return res.status(400).json({ error: "Invalid room name" });
  if (containsSlur(name)) return res.status(400).json({ error: "Room name contains prohibited language." });
  if (isPrivate && !rawPassword) return res.status(400).json({ error: "Private rooms require a password." });
  if (maxMembers !== null && (maxMembers < 2 || maxMembers > 500)) return res.status(400).json({ error: "Max members must be between 2 and 500." });

  try {
    const existing = await prisma.room.findUnique({ where: { name } });
    if (existing) return res.status(409).json({ error: "Room already exists" });
    const password = isPrivate && rawPassword ? await bcrypt.hash(rawPassword, 10) : null;
    const room = await prisma.room.create({
      data: { name, description, proposition, creatorId: creatorId ?? null, isPrivate, password, maxMembers, aiPersona },
    } as any);
    // Auto-create default "general" channel for every new room
    await prisma.channel.create({ data: { name: "general", roomId: room.id, order: 0 } });
    // Auto-join the creator
    if (creatorId) {
      await prisma.roomMember.create({ data: { userId: creatorId, roomId: room.id } });
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
      orderBy: { createdAt: "asc" },
      take: 20,
      include: { user: true },
    });
    res.json(mapMessages(messages));
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
    try {
      const stRow = await prisma.$queryRawUnsafe<{ stances: string | null }[]>(
        `SELECT "stances" FROM "Room" WHERE "id" = $1`, room.id
      );
      if (stRow[0]?.stances) stances = JSON.parse(stRow[0].stances);
    } catch { /* stances column may not exist yet */ }
    const { password: _pw, ...roomMeta } = room as any;
    res.json({ sections, channels, sidebarChannels: sidebarChannelList, roomMeta: { ...roomMeta, stances } });
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
  const { userId, description, proposition, maxMembers, isPrivate, password: newPassword, aiPersona, stances, isOpinionated } = req.body as {
    userId: string;
    description?: string;
    proposition?: string;
    maxMembers?: number | null;
    isPrivate?: boolean;
    password?: string;
    aiPersona?: string | null;
    stances?: string[];
    isOpinionated?: boolean;
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
    if (Array.isArray(stances)) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Room" SET "stances" = $1 WHERE "id" = $2`,
        JSON.stringify(stances.map((s: string) => s.trim()).filter(Boolean).slice(0, 6)),
        updated.id
      );
      io.to(name).emit("stancesUpdated", stances.map((s: string) => s.trim()).filter(Boolean).slice(0, 6));
    }
    // Notify everyone in the room of updated meta
    io.to(name).emit("roomMeta", rest);
    res.json(rest);
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
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bio" TEXT;
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
    `);
    console.log("[DB] User profile columns ready");
  } catch (e) {
    console.error("[DB] User profile columns setup failed:", e);
  }

  // Ensure debate position tables and Room.proposition exist
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "proposition" TEXT;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DebatePosition') THEN
          CREATE TYPE "DebatePosition" AS ENUM ('FOR', 'AGAINST', 'NEUTRAL');
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS "UserPosition" (
        "id"        TEXT             NOT NULL,
        "userId"    TEXT             NOT NULL,
        "roomId"    TEXT             NOT NULL,
        "position"  "DebatePosition" NOT NULL,
        "updatedAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserPosition_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "UserPosition_userId_roomId_key"
        ON "UserPosition"("userId", "roomId");
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
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "isSubDebate" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "proposition" TEXT;
      ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "parentMessageId" TEXT;
      ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "parentMessagePreview" TEXT;
    `);
    console.log("[DB] Channel sub-debate columns ready");
  } catch (e) {
    console.error("[DB] Channel sub-debate columns setup failed:", e);
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "stances" TEXT;
      ALTER TABLE "UserPosition" ALTER COLUMN "position" TYPE TEXT USING "position"::text;
    `);
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
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "isOpinionated" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "isOpinionated" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log("[DB] isOpinionated columns ready");
  } catch (e) {
    console.error("[DB] isOpinionated column setup failed:", e);
  }

  httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
