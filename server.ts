import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { PrismaClient, SenderType } from "@prisma/client";
import { createClient } from "redis";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { scheduleAI, respondToMention } from "./services/aiOrchestrator";
import { evaluateClaim, computeCredibility, SCORE_WEIGHTS } from "./services/claimEvaluator";
import { summarizeConversation } from "./services/summarizer";
import { containsSlur } from "./services/contentFilter";
import { respondAsBot, BOT_IDS, BOT_TIER, judgeMatch, scoreMatch } from "./services/debateBot";
import { computeMedals, type MedalStats } from "./services/medals";
import { TOPIC_CATALOG, isCategoryId, categoryLabel } from "./services/topics";
import { getDeck, beliefCount, recordBelief, seedFromCatalog, type Stance } from "./services/propositions";
import { transcriptText } from "./services/transcript";
import { verifySessionToken, bearerToken, assertAuthConfigured, type Actor } from "./services/auth";
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

// Open the caller's session token, if they sent one, and hang the result off
// the request. This only ESTABLISHES identity — it doesn't require it, because
// a handful of routes (login, register, public profiles) are legitimately
// anonymous. Routes that need a caller use requireActor.
//
// The token rides in an Authorization header rather than a cookie because the
// client and server are different origins in production (Vercel and Railway),
// where a session cookie set by one is simply never sent to the other.
app.use(async (req, _res, next) => {
  req.actor = await verifySessionToken(bearerToken(req.headers as { authorization?: string }));
  next();
});

// Everything under /api requires a caller.
//
// This is a whitelist rather than a per-route guard because the signed-out
// surface is entirely Next.js — registration, sign-in, password reset and email
// verification are all routes in the client app, and nothing reaches this
// server until you already hold a session. So "authenticated" is the default
// and exceptions are the rare thing, which is the right way round: a route
// added later is protected by forgetting, not by remembering.
//
// This closes anonymous forgery. It does NOT by itself stop a signed-in user
// from naming someone else's id in a body — that's what reading identity via
// actorId() rather than from the request is for. Both halves are required.
const PUBLIC_API = [
  /^\/api\/topics$/,   // the category list; no user data
];
app.use("/api", (req, res, next) => {
  if (PUBLIC_API.some((r) => r.test(req.baseUrl + req.path))) return next();
  if (!req.actor) return res.status(401).json({ error: "Authentication required" });
  next();
});

// Who the caller is, per their verified session token.
//
// Deliberately ignores req.query.userId and req.body.userId. Those are a claim,
// not evidence, and reading them is how this server ended up with no
// authentication at all. If a route needs to know who is calling, it is this or
// nothing.
function actorId(req: Request): string | null {
  return req.actor?.id ?? null;
}

// Guard for routes that require a signed-in caller. Returns the actor, or
// answers 401 and returns null — call sites bail on null.
function requireActor(req: Request, res: Response): Actor | null {
  if (!req.actor) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.actor;
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
});

// Socket middleware — establish who is on the other end of this connection.
//
// This used to take `handshake.auth.user` at face value, which only ever
// checked that an identity object had been SENT. Anyone could connect as
// anyone, and every socket event downstream inherited that. Now the client
// sends its session token and the server opens it.
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  const actor = await verifySessionToken(token);
  if (!actor) return next(new Error("Authentication required"));
  (socket as any).user = { id: actor.id, username: actor.username, isAdmin: actor.isAdmin };
  console.log("[Auth] Socket connected:", actor.username);
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

// A message too trivial to be a real debate claim — "ok", "lol", "yes", a lone
// emoji. We skip the whole per-message AI chain for these: the auto-stake + claim
// evaluation, and any bot reply. Evaluating them spends a model call to score
// noise, and a bot answering an ack adds nothing. The message is still delivered
// and stored — only the (paid) AI work is skipped.
function isTrivialForAI(content: string): boolean {
  const t = (content ?? "").trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return true;          // punctuation / emoji only
  const words = t.split(/\s+/).filter(Boolean);
  return words.length <= 2 && t.length < 15;          // very short acknowledgements
}

// Bot replies are debounced per room+channel: a burst of quick human messages
// draws ONE reply to the latest instead of one (expensive) reply each. The timer
// always fires, so a lone message is still answered — just after a short pause.
const botReplyTimers = new Map<string, ReturnType<typeof setTimeout>>();
const botReplyLatest = new Map<string, { content: string; channelId: string | null }>();
const BOT_REPLY_DEBOUNCE_MS = 800;

function scheduleBotReply(
  roomDbId: string, roomName: string, botId: string,
  content: string, channelId: string | null,
): void {
  const key = `${roomName}::${channelId ?? ""}`;
  botReplyLatest.set(key, { content, channelId });
  const existing = botReplyTimers.get(key);
  if (existing) clearTimeout(existing);
  botReplyTimers.set(key, setTimeout(() => {
    botReplyTimers.delete(key);
    const latest = botReplyLatest.get(key);
    botReplyLatest.delete(key);
    if (latest) respondAsBot(roomDbId, roomName, botId, latest.content, latest.channelId, io, prisma);
  }, BOT_REPLY_DEBOUNCE_MS));
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
    // Don't pair people who closed the tab, and don't leave their opponent
    // arguing with nobody. Skipped if they still have another socket open.
    if (!userSockets.has(socketUser.id)) {
      leaveRapidQueue(socketUser.id).catch(() => {});
      resolveRapidMatchesFor(socketUser.id).catch(() => {});
    }
  });

  // "Move on" — an offer to end on the bar, which only lands if the other side
  // agrees. One press cannot end a round: that's what made bailing while ahead
  // the winning move. If you want out unilaterally you leave, and leaving
  // forfeits.
  socket.on("rapidMoveOn", async (payload: { roomName?: string }) => {
    const roomName = payload?.roomName;
    if (!roomName) return;
    try {
      const rows = await prisma.$queryRawUnsafe<{ challengerId: string; challengedId: string }[]>(
        `SELECT "challengerId","challengedId" FROM "CompetitiveMatch"
         WHERE "roomName"=$1 AND status='active' AND "isRapid"=TRUE AND ($2 IN ("challengerId","challengedId"))
         LIMIT 1`,
        roomName, socketUser.id,
      );
      if (!rows.length) return;   // not their round to end
      const { challengerId, challengedId } = rows[0];

      let votes = rapidMoveOnVotes.get(roomName);
      if (!votes) { votes = new Set(); rapidMoveOnVotes.set(roomName, votes); }
      votes.add(socketUser.id);

      if (votes.has(challengerId) && votes.has(challengedId)) {
        rapidMoveOnVotes.delete(roomName);
        await settleRapidOnBar(roomName);
        return;
      }

      // Tell them both where the offer stands.
      io.to(roomName).emit("rapidMoveOnOffered", { roomName, by: socketUser.id });
    } catch (e) { console.error("[rapidMoveOn]", e); }
  });

  // Take the offer back — you're staying in.
  socket.on("rapidMoveOnCancel", (payload: { roomName?: string }) => {
    const roomName = payload?.roomName;
    if (!roomName) return;
    const votes = rapidMoveOnVotes.get(roomName);
    if (!votes?.delete(socketUser.id)) return;
    if (!votes.size) rapidMoveOnVotes.delete(roomName);
    io.to(roomName).emit("rapidMoveOnWithdrawn", { roomName, by: socketUser.id });
  });

  socket.on("rapidQueueJoin", async (payload: { categoryId?: string | null }) => {
    try {
      const raw = payload?.categoryId ?? null;
      const categoryId = raw && isCategoryId(raw) ? raw : null;   // unknown category => any

      // Pairing needs a claim BOTH of you have taken a side on, so someone with
      // a handful of positions mostly can't be matched at all — they'd sit in
      // the queue watching it fail for reasons they can't see. The gate is a
      // matching requirement first and an onboarding step second.
      const positions = await beliefCount(prisma, socketUser.id);
      if (positions < DECK_GATE) {
        socket.emit("rapidNeedsDeck", { positioned: positions, gate: DECK_GATE });
        return;
      }

      const pairing = await joinRapidQueue(socketUser.id, categoryId);
      if (!pairing) {
        socket.emit("rapidQueueWaiting", { categoryId });
        return;
      }
      try {
        await startRapidMatch(pairing);
      } catch (e) {
        console.error("[startRapidMatch]", e);
        // Both players were already claimed out of the pool, so tell each of
        // them it fell through — otherwise the one who was waiting just hangs.
        for (const side of [pairing.a, pairing.b]) {
          for (const sid of userSockets.get(side.userId) ?? []) {
            io.to(sid).emit("rapidQueueLeft", {});
            io.to(sid).emit("error", { message: "Could not start the round. Try again." });
          }
        }
      }
    } catch (e) {
      console.error("[rapidQueueJoin]", e);
      socket.emit("error", { message: "Could not join the queue." });
      leaveRapidQueue(socketUser.id).catch(() => {});
    }
  });

  socket.on("rapidQueueLeave", async () => {
    await leaveRapidQueue(socketUser.id);
    socket.emit("rapidQueueLeft", {});
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

      // Replay any pending "move on" offer to a (re)joining client. The votes
      // live only in server memory, so a remount mid-round would otherwise show
      // neither side's offer — and the opponent could settle the round on a vote
      // this client was never told about. Only present for a rapid round that's
      // mid-negotiation, so its absence is the common case.
      const pendingVotes = rapidMoveOnVotes.get(roomName);
      if (pendingVotes && pendingVotes.size) {
        socket.emit("rapidMoveOnState", { roomName, voters: Array.from(pendingVotes) });
      }

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
    async (payload: { roomId: string; content: string; channelId?: string }) => {
      const { roomId, channelId } = payload;
      // Identity is the socket's verified session, never the payload. The
      // client still sends userId/username out of habit; they are ignored.
      const username = socketUser.username;
      const rawContent = payload.content?.trim().replace(/\0/g, "") ?? "";
      if (!rawContent) return;

      const isImage = rawContent.startsWith('{"type":"image"');
      if (isImage && rawContent.length > 8_000_000) {
        socket.emit("error", { message: "Image is too large to send." });
        return;
      }

      const content = isImage ? rawContent : rawContent.slice(0, 2000);
      // Trivial acks skip the paid AI chain (claim eval + bot reply) below.
      const trivial = isTrivialForAI(content);

      if (!isImage && containsSlur(content)) {
        socket.emit("error", { message: "Message contains prohibited language and was not sent." });
        return;
      }

      try {
        // By verified id. This used to look the sender up by a username taken
        // straight from the payload and CREATE the account when it didn't
        // exist — empty password, fabricated @chat.local email. So sending a
        // message as any unused name silently minted that account, with no
        // registration and no email verification, and sending one as an
        // existing name posted as that person. Both are gone: the socket only
        // connects with a session token, and the sender is whoever it names.
        const user = await prisma.user.findUnique({ where: { id: socketUser.id } });
        if (!user) return;   // valid token for a user since deleted
        bumpDailyStreak(user.id).catch(() => {});

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

        // Track full exchanges in competitive rooms to update the proposition bar
        if (!isImage && !isSidebarMsg && !isSpectatorChatMsg && room.name.startsWith("comp-")) {
          trackExchangeMessage(room.name, user.id).catch(() => {});
        }

        // Bot auto-reply (fire-and-forget; delay is handled inside respondAsBot)
        // Skip for competitive (human vs human) rooms even if isBotRoom is set
        const isCompetitiveRoom = room.name.startsWith("comp-");
        if (!isImage && !trivial && !isSidebarMsg && !isSpectatorChatMsg && !isCompetitiveRoom && (room as any).isBotRoom && (room as any).botId) {
          scheduleBotReply(room.id, room.name, (room as any).botId as string, content, channelId ?? null);
        }

        // Auto-stake every human message as a claim (skip DMs, images, sidebar,
        // spectator chat, and trivial acks that would only score noise)
        if (!isImage && !trivial && !isSidebarMsg && !isSpectatorChatMsg && !room.isDM) {
          (async () => {
            try {
              const existing = await (prisma as any).claim.findFirst({ where: { messageId: message.id } });
              if (existing) return;
              const claim = await (prisma as any).claim.create({
                data: { messageId: message.id, roomId: room.id, channelId: channelId ?? null, claimantId: user.id, text: content.slice(0, 500), status: "PENDING" },
              });
              io.to(emitTarget).emit("claimStaked", { claimId: claim.id, messageId: message.id, status: "PENDING", claimantId: user.id, challengeCount: 0 });
              const proposition = (room as any).proposition ?? null;
              // Fetch the 3 most recent prior messages as context so the evaluator
              // can tell critiques and challenges apart from standalone factual claims.
              const priorMsgs = await (prisma as any).message.findMany({
                where: { roomId: room.id, channelId: channelId ?? null, id: { not: message.id }, senderType: SenderType.HUMAN },
                orderBy: { createdAt: "desc" },
                take: 3,
                include: { user: { select: { username: true } } },
              });
              const priorContext = (priorMsgs as any[]).reverse()
                .map((m: any) => `${m.user?.username ?? "User"}: ${(m.content as string).slice(0, 300)}`)
                .join("\n");
              const { verdict, reasoning, relevance, evidence, logic, impact, score: claimScore } = await evaluateClaim(content, priorContext, proposition);
              await (prisma as any).claim.update({
                where: { id: claim.id },
                data: { status: verdict, verdict: reasoning, relevance, updatedAt: new Date() },
              });
              await prisma.$executeRawUnsafe(`UPDATE "Claim" SET evidence=$1,logic=$2,impact=$3,score=$4 WHERE id=$5`, evidence, logic, impact, claimScore, claim.id);
              io.to(emitTarget).emit("claimVerdict", { claimId: claim.id, messageId: message.id, status: verdict, reasoning, claimantId: user.id, challengeCount: 0, score: claimScore, relevance, evidence, logic, impact });
              if (!isOpinionated) {
                const cred = await computeCredibility(user.id, prisma);
                io.to(emitTarget).emit("credibilityUpdate", cred);
              }
              updateUserClaimStats(user.id).catch(() => {});
            } catch (e) {
              console.error("[auto-stake]", e);
            }
          })();
        }

        if (!isImage && !isSpectatorChatMsg) {
          const windowKey = WINDOW_KEY(channelId ?? roomId);
          await redis.lPush(windowKey, JSON.stringify({ role: "human", content, username }));
          await redis.lTrim(windowKey, 0, WINDOW_SIZE - 1);
          const aiDeps = { redis, io, prisma, emitRoom: emitTarget, aiPersona: room.aiPersona ?? undefined, roomName: room.name, channelId: channelId ?? null };
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

  socket.on("createPoll", async ({ roomId, channelId, question, options }: {
    roomId: string; channelId?: string | null; question: string; options: string[];
  }) => {
    const userId = socketUser.id;
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

  socket.on("votePoll", async ({ pollId, option }: { pollId: string; option: string }) => {
    const userId = socketUser.id;   // never the payload — that would be voting as anyone
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

  socket.on("closePoll", async ({ pollId }: { pollId: string }) => {
    // From the verified socket. The permission check below compares this
    // against the poll's creator and the room's — reading it from the payload
    // meant claiming to be the creator WAS being the creator.
    const userId = socketUser.id;
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

      // Auto-apply debate mode when the structured debate vote closes
      if (room && poll.question === "Should this debate be structured?") {
        const voteCounts: Record<string, number> = {};
        for (const v of updated.votes) voteCounts[v.option] = (voteCounts[v.option] ?? 0) + 1;
        const winner = poll.options.reduce((a: string, b: string) => (voteCounts[b] ?? 0) > (voteCounts[a] ?? 0) ? b : a, poll.options[0]);
        const mode = winner === "Structured" ? "structured" : "open";
        const turn: DebateTurnState = mode === "structured"
          ? { mode: "structured", currentSide: "FOR", currentSpeakerId: null, currentSpeakerName: null, turnNumber: 1 }
          : { mode: "open", currentSide: "FOR", currentSpeakerId: null, currentSpeakerName: null, turnNumber: 0 };
        debateTurns.set(room.name, turn);
        redis.set(`debate:turn:${room.name}`, JSON.stringify(turn), { EX: 86400 }).catch(() => {});
        io.to(room.name).emit("debateTurnUpdate", turn);
      }
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
        const { verdict, reasoning, relevance, evidence, logic, impact, score: claimScore } = await evaluateClaim(text, "", proposition);
        await (prisma as any).claim.update({
          where: { id: claim.id },
          data: { status: verdict, verdict: reasoning, relevance, updatedAt: new Date() },
        });
        await prisma.$executeRawUnsafe(`UPDATE "Claim" SET evidence=$1,logic=$2,impact=$3,score=$4 WHERE id=$5`, evidence, logic, impact, claimScore, claim.id);
        io.to(emitTarget).emit("claimVerdict", { claimId: claim.id, messageId, status: verdict, reasoning, claimantId: socketUser.id, challengeCount: 0, score: claimScore, relevance, evidence, logic, impact });
        if (!isClaimOpinionated) {
          const cred = await computeCredibility(socketUser.id, prisma);
          io.to(emitTarget).emit("credibilityUpdate", cred);
        }
        updateUserClaimStats(socketUser.id).catch(() => {});
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

      // The first few challenges re-judge the claim "with fresh eyes"; past that
      // the verdict has stabilised and re-running the model on identical text just
      // burns calls. Record the challenge and bump the count, but reuse the
      // existing verdict.
      const REEVAL_CAP = 3;
      if (challenges.length > REEVAL_CAP) {
        io.to(emitTarget).emit("claimVerdict", {
          claimId, messageId: claim.messageId, status: claim.status, reasoning: claim.verdict,
          claimantId: claim.claimantId, challengeCount: challenges.length,
          score: Number(claim.score ?? 0), relevance: claim.relevance,
          evidence: claim.evidence, logic: claim.logic, impact: claim.impact,
        });
        return;
      }

      // Re-evaluate with fresh eyes
      try {
        const claimRoom = await prisma.room.findUnique({ where: { id: claim.roomId } });
        const proposition = (claimRoom as any)?.proposition ?? null;
        const { verdict, reasoning, relevance, evidence, logic, impact, score: claimScore } = await evaluateClaim(
          claim.text,
          `This claim has been challenged ${challenges.length} time(s). Be extra rigorous.`,
          proposition,
        );
        await (prisma as any).claim.update({
          where: { id: claimId },
          data: { status: verdict, verdict: reasoning, relevance, updatedAt: new Date() },
        });
        await prisma.$executeRawUnsafe(`UPDATE "Claim" SET evidence=$1,logic=$2,impact=$3,score=$4 WHERE id=$5`, evidence, logic, impact, claimScore, claimId);
        const cred = await computeCredibility(claim.claimantId, prisma);
        io.to(emitTarget).emit("claimVerdict", { claimId, messageId: claim.messageId, status: verdict, reasoning, claimantId: claim.claimantId, challengeCount: challenges.length, score: claimScore, relevance, evidence, logic, impact });
        io.to(emitTarget).emit("credibilityUpdate", cred);
        updateUserClaimStats(claim.claimantId).catch(() => {});
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
      const roomPresence = presence.get(roomId);
      const uniqueUsers = roomPresence ? new Set(Array.from(roomPresence.values()).map(m => m.userId)) : new Set();
      const multiUser = uniqueUsers.size > 1;

      if (multiUser) {
        // With multiple people present, only the current side may pass the turn
        const roomPos = debatePositions.get(roomId);
        const userSide = roomPos?.get(socketUser.id)?.position;
        if (userSide !== turn.currentSide) {
          socket.emit("error", { message: `Only a ${turn.currentSide} participant can pass the turn right now.` });
          return;
        }
      } else {
        // Solo — fall back to owner/admin/current speaker check
        const room = await prisma.room.findUnique({ where: { name: roomId } });
        const requestingUser = await prisma.user.findUnique({ where: { id: socketUser.id } });
        const canPass = room?.creatorId === socketUser.id || requestingUser?.isAdmin || turn.currentSpeakerId === socketUser.id;
        if (!canPass) return;
      }
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
  const userId = actorId(req)!;
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
  const userId = actorId(req)!;
  try {
    const rooms = await prisma.room.findMany({
      where: {
        isDM: false,
        AND: [
          { NOT: { name: { startsWith: "arena-" } } },
          { NOT: { name: { startsWith: "comp-" } } },
        ],
      },
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
  const userId = actorId(req)!;
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
  const userId = actorId(req)!;
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

// ═══════════════════════════════════════════════════════════════════════════
// Proposition bar — the live persuasion score on competitive matches
//
// Each side's credibility-weighted claim points (SUPPORTED*2 - REFUTED*3, min 1
// base per debater) give a raw share, sharpened toward the extremes. Starts
// 50/50, recomputed on each full exchange (both sides post since the last
// update), frozen between. This bar is also the win condition for competitive
// proposition matches: the room triggers the judge when it crosses the
// threshold, so what spectators see is exactly what ends the match.
// ═══════════════════════════════════════════════════════════════════════════
const BAR_SHARPEN = 2.5;               // >1 pushes the bar toward the extremes
const TIE_EPSILON = 0.02;              // |priceA-0.5| below this at close => draw
const PRICE_MIN = 0.02, PRICE_MAX = 0.98;
// A per-side neutral prior, ~one average claim's worth of score. It keeps the
// bar centred before anyone has a scored claim and stops a single early verdict
// from slamming it to an extreme; real claim scores swamp it as the debate builds.
const PROP_PRIOR = 50;

// roomName -> which sides have spoken since the last bar update
const exchangeTracker = new Map<string, { a: boolean; b: boolean }>();

function sharpenProb(p: number): number {
  const g = BAR_SHARPEN;
  const a = Math.pow(p, g), b = Math.pow(1 - p, g);
  const v = a + b > 0 ? a / (a + b) : 0.5;
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, v));
}

async function createProposition(opts: { roomName: string; matchType: "1v1" | "team"; sideA: string[]; sideB: string[]; labelA: string; labelB: string }): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "MatchProposition" ("id","roomName","matchType","sideA","sideB","labelA","labelB","priceA","status")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,0.5,'open')
       ON CONFLICT ("roomName") DO NOTHING`,
      opts.roomName, opts.matchType, JSON.stringify(opts.sideA), JSON.stringify(opts.sideB), opts.labelA, opts.labelB,
    );
  } catch (e) { console.error("[createProposition]", e); }
}

// Recompute the sharpened proposition-bar probability from room-scoped claims.
async function recomputePropositionBar(roomName: string): Promise<void> {
  try {
    const mRows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "MatchProposition" WHERE "roomName"=$1 AND status='open' LIMIT 1`, roomName);
    if (!mRows.length) return;
    const prop = mRows[0];
    const sideA: string[] = JSON.parse(prop.sideA), sideB: string[] = JSON.parse(prop.sideB);
    const roomRow = await prisma.room.findUnique({ where: { name: roomName }, select: { id: true } });
    if (!roomRow) return;
    // Each staked claim is scored 0–100 by the evaluator, blending the verdict
    // (SUPPORTED > CONTESTED > REFUTED) with relevance, evidence, logic and impact.
    // The bar is side A's share of that quality-weighted total. Scoring on claim
    // QUALITY — not just the comparatively rare SUPPORTED/REFUTED verdict — means
    // an all-CONTESTED opinion debate (the norm) still separates the two debaters
    // instead of pinning the bar at 0.5, which used to void almost every round.
    const scoreRows = await prisma.$queryRawUnsafe<{ claimantId: string; total: number }[]>(
      `SELECT "claimantId", COALESCE(SUM(score), 0)::float AS total FROM "Claim"
       WHERE "roomId"=$1 AND status IN ('SUPPORTED','CONTESTED','REFUTED') GROUP BY "claimantId"`, roomRow.id,
    );
    const scoreOf: Record<string, number> = {};
    for (const r of scoreRows) scoreOf[r.claimantId] = Number(r.total);
    const strength = (ids: string[]) => PROP_PRIOR + ids.reduce((t, id) => t + (scoreOf[id] ?? 0), 0);
    const pa = strength(sideA), pb = strength(sideB);
    const raw = pa / (pa + pb);   // both sides carry the prior, so this is always defined
    const priceA = sharpenProb(raw);
    await prisma.$executeRawUnsafe(`UPDATE "MatchProposition" SET "priceA"=$1, "lastExchange"="lastExchange"+1 WHERE "roomName"=$2`, priceA, roomName);
    io.to(roomName).emit("propositionUpdate", { roomName, priceA, priceB: 1 - priceA });
  } catch (e) { console.error("[recomputePropositionBar]", e); }
}

// Called on every human message in a comp- room; recomputes the bar once both
// sides have spoken since the last update (a "full exchange").
async function trackExchangeMessage(roomName: string, senderId: string): Promise<void> {
  try {
    const mRows = await prisma.$queryRawUnsafe<any[]>(`SELECT "sideA","sideB" FROM "MatchProposition" WHERE "roomName"=$1 AND status='open' LIMIT 1`, roomName);
    if (!mRows.length) return;
    const sideA: string[] = JSON.parse(mRows[0].sideA), sideB: string[] = JSON.parse(mRows[0].sideB);
    const side = sideA.includes(senderId) ? "a" : sideB.includes(senderId) ? "b" : null;
    if (!side) return;
    const t = exchangeTracker.get(roomName) ?? { a: false, b: false };
    t[side] = true;
    if (t.a && t.b) {
      exchangeTracker.set(roomName, { a: false, b: false });
      await recomputePropositionBar(roomName);
    } else {
      exchangeTracker.set(roomName, t);
    }
  } catch (e) { console.error("[trackExchangeMessage]", e); }
}

// Freeze the bar at its final value when the match ends.
async function settleProposition(roomName: string): Promise<void> {
  try {
    await recomputePropositionBar(roomName);                 // capture the final bar
    const mRows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "MatchProposition" WHERE "roomName"=$1 AND status='open' LIMIT 1`, roomName);
    if (!mRows.length) return;
    const prop = mRows[0];
    const priceA: number = prop.priceA;
    const tie = Math.abs(priceA - 0.5) < TIE_EPSILON;
    const winSide: "A" | "B" | null = tie ? null : (priceA > 0.5 ? "A" : "B");
    await prisma.$executeRawUnsafe(`UPDATE "MatchProposition" SET status='settled', "winningSide"=$1, "priceA"=$2, "settledAt"=NOW() WHERE id=$3`, winSide, priceA, prop.id);
    exchangeTracker.delete(roomName);
    rapidMoveOnVotes.delete(roomName);
    io.to(roomName).emit("propositionSettled", { roomName, winningSide: winSide, priceA });
  } catch (e) { console.error("[settleProposition]", e); }
}

interface PropositionStat { priceA: number; labelA: string; labelB: string; status: string }

// Fetch the proposition bar for a set of rooms in a single query.
async function propositionStats(roomNames: string[]): Promise<Map<string, PropositionStat>> {
  const out = new Map<string, PropositionStat>();
  if (!roomNames.length) return out;
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "roomName", "priceA", "labelA", "labelB", status FROM "MatchProposition"
       WHERE "roomName" = ANY($1::text[])`,
      roomNames,
    );
    for (const r of rows) {
      out.set(r.roomName, { priceA: Number(r.priceA), labelA: r.labelA, labelB: r.labelB, status: r.status });
    }
  } catch (e) { console.error("[propositionStats]", e); }
  return out;
}

// ── Proposition endpoint ──────────────────────────────────────────────────────
app.get("/api/proposition/:roomName", async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "MatchProposition" WHERE "roomName"=$1 LIMIT 1`, req.params.roomName);
    if (!rows.length) return res.json({ proposition: null });
    const m = rows[0];
    let topic = "";
    try {
      const r = await prisma.$queryRawUnsafe<{ matchConfig: string | null }[]>(`SELECT "matchConfig" FROM "Room" WHERE name=$1`, m.roomName);
      topic = (r[0]?.matchConfig ? JSON.parse(r[0].matchConfig).topic : "") ?? "";
    } catch { /* no topic */ }
    res.json({ proposition: { roomName: m.roomName, matchType: m.matchType, labelA: m.labelA, labelB: m.labelB, priceA: m.priceA, priceB: 1 - m.priceA, status: m.status, winningSide: m.winningSide, topic } });
  } catch (e) { console.error("[proposition get]", e); res.status(500).json({ error: "Server error" }); }
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

// Recompute and persist a user's per-category rubric averages from their claims.
// Fire-and-forget after each claim evaluation; feeds the profile + medals.
async function updateUserClaimStats(userId: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" u SET
         "avgClaimScore" = COALESCE(a.avg_score, 0),
         "avgAccuracy"   = COALESCE(a.avg_accuracy, 0),
         "avgRelevance"  = COALESCE(a.avg_relevance, 0),
         "avgEvidence"   = COALESCE(a.avg_evidence, 0),
         "avgLogic"      = COALESCE(a.avg_logic, 0),
         "avgImpact"     = COALESCE(a.avg_impact, 0),
         "claimsRated"   = COALESCE(a.n, 0)
       FROM (
         SELECT
           AVG("score")                                                                     AS avg_score,
           AVG(CASE status WHEN 'SUPPORTED' THEN 10 WHEN 'CONTESTED' THEN 5 ELSE 0 END)     AS avg_accuracy,
           AVG("relevance" * 10)                                                            AS avg_relevance,
           AVG("evidence")                                                                  AS avg_evidence,
           AVG("logic")                                                                     AS avg_logic,
           AVG("impact")                                                                    AS avg_impact,
           COUNT(*)                                                                         AS n
         FROM "Claim"
         WHERE "claimantId" = $1 AND status != 'PENDING' AND "score" IS NOT NULL
       ) a
       WHERE u.id = $1`,
      userId,
    );
  } catch (e) {
    console.error("[updateUserClaimStats]", e);
  }
}

// Bump a user's daily activity streak. Called on message send (fire-and-forget).
// Same day → no change; consecutive day → +1; gap → reset to 1. Tracks longest.
async function bumpDailyStreak(userId: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" u SET
         "dailyStreak"   = ns.new_streak,
         "longestStreak" = GREATEST(u."longestStreak", ns.new_streak),
         "lastActiveDay" = CURRENT_DATE
       FROM (
         SELECT CASE
           WHEN "lastActiveDay" = CURRENT_DATE - 1 THEN "dailyStreak" + 1
           WHEN "lastActiveDay" = CURRENT_DATE      THEN "dailyStreak"
           ELSE 1
         END AS new_streak
         FROM "User" WHERE id = $1
       ) ns
       WHERE u.id = $1 AND (u."lastActiveDay" IS DISTINCT FROM CURRENT_DATE)`,
      userId,
    );
  } catch (e) {
    console.error("[bumpDailyStreak]", e);
  }
}

// GET /api/challenges — list open challenges (optionally excluding the requesting user's own)
app.get("/api/challenges", async (req, res) => {
  try {
    const excludeUserId = actorId(req);
    const rows = excludeUserId
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT c.*, u.username, u.elo FROM "Challenge" c
           JOIN "User" u ON c."userId" = u.id
           WHERE c.status = 'open' AND c."userId" != $1
             AND NOT EXISTS (SELECT 1 FROM "ChallengeMember" m WHERE m."challengeId" = c.id)
           ORDER BY c."createdAt" DESC LIMIT 50`,
          excludeUserId,
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT c.*, u.username, u.elo FROM "Challenge" c
           JOIN "User" u ON c."userId" = u.id
           WHERE c.status = 'open'
             AND NOT EXISTS (SELECT 1 FROM "ChallengeMember" m WHERE m."challengeId" = c.id)
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
    const userId = actorId(req)!;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.*, u.username, u.elo FROM "Challenge" c
       JOIN "User" u ON c."userId" = u.id
       WHERE c."userId" = $1
         AND NOT EXISTS (SELECT 1 FROM "ChallengeMember" m WHERE m."challengeId" = c.id)
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
    const userId = actorId(req)!;
    const { claim, stance, winCondition } = req.body as {
    claim: string; stance: "affirmative" | "negative"; winCondition: object;
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
    const userId = actorId(req)!;
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
    const userId = actorId(req)!;
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

    // Open the proposition bar for this match
    try {
      const names = await prisma.$queryRawUnsafe<{ id: string; username: string }[]>(`SELECT id, username FROM "User" WHERE id = ANY($1::text[])`, [challenge.userId, userId]);
      const nm = (id: string) => names.find((n) => n.id === id)?.username ?? "Debater";
      await createProposition({ roomName, matchType: "1v1", sideA: [challenge.userId], sideB: [userId], labelA: nm(challenge.userId), labelB: nm(userId) });
    } catch (e) { console.error("[proposition 1v1]", e); }

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
// Judge a competitive match, settle ELO, and broadcast the result. Idempotent —
// both clients race to call this, and a Rapid Fire forfeit calls it server-side,
// so the second caller gets the stored result rather than a second judgement.
// Returns null only when the room or match doesn't exist.
async function completeCompetitiveMatch(roomName: string, forcedWinner?: string, forcedVerdict?: string): Promise<any | null> {
  {
    // Idempotent: return existing result
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "CompetitiveMatch" WHERE "roomName" = $1 AND status = 'complete' LIMIT 1`, roomName,
    );
    if (existing.length > 0) {
      const m = existing[0];
      return {
        winnerId: m.winnerId, verdict: m.verdict,
        challengerEloChange: (m.challengerEloAfter ?? m.challengerEloBefore) - m.challengerEloBefore,
        challengedEloChange: (m.challengedEloAfter ?? m.challengedEloBefore) - m.challengedEloBefore,
        challengerEloAfter: m.challengerEloAfter, challengedEloAfter: m.challengedEloAfter,
        challengerId: m.challengerId, challengedId: m.challengedId,
      };
    }

    // Fetch match
    const matches = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "CompetitiveMatch" WHERE "roomName" = $1 LIMIT 1`, roomName,
    );
    if (matches.length === 0) return null;
    const match = matches[0];

    // Single-flight: for a client-driven competitive match (status 'active'),
    // every debater's browser may POST /complete at the same instant and each
    // would otherwise run the ~1-2s judge and write ELO. Take the match with one
    // atomic transition; the losers wait for and return the winner's stored
    // result. Rapid/forfeit settle paths pre-claim the round to 'closing', so
    // status is not 'active'/'judging' here and they skip this and proceed.
    if (match.status === "active" || match.status === "judging") {
      const claimed = await prisma.$executeRawUnsafe(
        `UPDATE "CompetitiveMatch" SET status='judging' WHERE "roomName"=$1 AND status='active'`, roomName,
      );
      if (claimed !== 1) {
        for (let i = 0; i < 25; i++) {
          await new Promise((r) => setTimeout(r, 200));
          const done = await prisma.$queryRawUnsafe<any[]>(
            `SELECT * FROM "CompetitiveMatch" WHERE "roomName"=$1 AND status='complete' LIMIT 1`, roomName,
          );
          if (done.length) {
            const m = done[0];
            return {
              winnerId: m.winnerId, verdict: m.verdict,
              challengerEloChange: (m.challengerEloAfter ?? m.challengerEloBefore) - m.challengerEloBefore,
              challengedEloChange: (m.challengedEloAfter ?? m.challengedEloBefore) - m.challengedEloBefore,
              challengerEloAfter: m.challengerEloAfter, challengedEloAfter: m.challengedEloAfter,
              challengerId: m.challengerId, challengedId: m.challengedId,
            };
          }
        }
        return null;   // winner still completing; the client also gets the matchComplete socket broadcast
      }
    }

    // Fetch room messages for transcript
    const roomRows = await prisma.room.findUnique({ where: { name: roomName }, select: { id: true } });
    if (!roomRows) return null;

    const messages = await prisma.message.findMany({
      where: { roomId: roomRows.id },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "asc" },
      take: 40,
    });

    const transcript = messages
      .map(m => `${m.user?.username ?? "User"}: ${transcriptText(m.content)}`)
      .join("\n");

    // The real proposition lives in Room.matchConfig — a raw column, so Prisma's
    // select can't reach it. Falling back to the first message is a poor guess:
    // it's whatever the opener happened to type.
    let proposition = "";
    try {
      const cfgRows = await prisma.$queryRawUnsafe<{ matchConfig: string | null }[]>(
        `SELECT "matchConfig" FROM "Room" WHERE name = $1`, roomName,
      );
      const cfg = cfgRows[0]?.matchConfig ? JSON.parse(cfgRows[0].matchConfig) : null;
      if (typeof cfg?.topic === "string") proposition = cfg.topic;
    } catch { /* fall back to the transcript below */ }
    if (!proposition) proposition = transcript.split("\n")[0] ?? "";

    let winnerId = forcedWinner ?? match.challengerId;
    let verdict = "The debate was inconclusive.";

    if (forcedWinner) {
      // The winner is already decided — by forfeit, or by leading the bar when
      // a Rapid Fire round ended. Don't ask the judge: it burns a call and
      // returns a verdict about who argued better, which reads as a
      // contradiction next to a winner decided some other way.
      verdict = forcedVerdict ?? "Won by forfeit — the other debater left the debate.";
    } else {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic();
      try {
        const judgePrompt =
          `You are an impartial debate judge. One debater (ID: ${match.challengerId}) argued ${match.challengerStance} the proposition: "${proposition}". ` +
          `The other (ID: ${match.challengedId}) argued ${match.challengedStance}. ` +
          `Based on logic, evidence quality, and persuasion, decide who argued better. ` +
          `Return ONLY valid JSON: {"winnerId":"${match.challengerId}" or "${match.challengedId}","verdict":"one concise sentence"}\n\nTranscript:\n${transcript}`;
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 150,
          messages: [{ role: "user", content: judgePrompt }],
        });
        const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
        // Slice to the last "}" so trailing prose after the JSON object doesn't break the parse.
        const jsonStart = raw.indexOf("{");
        const jsonEnd = raw.lastIndexOf("}");
        const parsed = JSON.parse(jsonStart >= 0 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw);
        if (parsed.winnerId === match.challengerId || parsed.winnerId === match.challengedId) {
          winnerId = parsed.winnerId;
        }
        if (typeof parsed.verdict === "string" && parsed.verdict) verdict = parsed.verdict;
      } catch (e) {
        console.error("[competitive judge]", e);
      }
    }

    // Calculate ELO
    const challengerWon = winnerId === match.challengerId;
    const { newA: challengerEloAfter, newB: challengedEloAfter } = calcElo(
      match.challengerEloBefore ?? 1200,
      match.challengedEloBefore ?? 1200,
      challengerWon,
    );

    // Rapid Fire settles on its own ladder — short rounds against strangers
    // shouldn't move the Battle Grounds rating. Column name is derived from a
    // boolean, so it's safe to interpolate.
    const eloCol = match.isRapid ? "rapidElo" : "elo";
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "${eloCol}" = $1 WHERE id = $2`, challengerEloAfter, match.challengerId);
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "${eloCol}" = $1 WHERE id = $2`, challengedEloAfter, match.challengedId);

    // Mark match complete
    await prisma.$executeRawUnsafe(
      `UPDATE "CompetitiveMatch" SET status='complete', "winnerId"=$1, verdict=$2,
       "challengerEloAfter"=$3, "challengedEloAfter"=$4, "completedAt"=NOW()
       WHERE "roomName"=$5`,
      winnerId, verdict, challengerEloAfter, challengedEloAfter, roomName,
    );

    const payload = {
      winnerId, verdict,
      challengerEloChange: challengerEloAfter - (match.challengerEloBefore ?? 1200),
      challengedEloChange: challengedEloAfter - (match.challengedEloBefore ?? 1200),
      challengerEloAfter, challengedEloAfter,
      challengerId: match.challengerId, challengedId: match.challengedId,
    };
    // Broadcast to everyone in the room (spectators + both players) for live verdicts
    io.to(roomName).emit("matchComplete", { isTeam: false, ...payload });

    // Freeze the proposition bar at its final value
    settleProposition(roomName).catch(() => {});

    // Debating counts toward the daily streak, not just chatting.
    for (const uid of [match.challengerId, match.challengedId]) {
      if (uid) bumpDailyStreak(uid).catch(() => {});
    }

    return payload;
  }
}

// Settling a match is a privilege of the two people in it.
//
// The /api gate proves the caller is somebody; it does not make them somebody
// in THIS match. Without the check below any signed-in user could post another
// pair's roomName with a forcedWinner and hand out the win — which is also the
// whole of the forfeit / mutual-move-on rules undone, since those only bind the
// people the round is actually between.
//
// The internal Rapid paths (forfeitRapidRound, settleRapidOnBar) call
// completeCompetitiveMatch directly rather than coming back through HTTP, so the
// server can still settle a round nobody is left to settle.
app.post("/api/competitive/complete", async (req, res) => {
  try {
    const { roomName, forcedWinner } = req.body as { roomName: string; forcedWinner?: string };
    if (!roomName) return res.status(400).json({ error: "roomName required" });

    const caller = actorId(req)!;
    const partyRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "challengerId", "challengedId" FROM "CompetitiveMatch" WHERE "roomName" = $1 LIMIT 1`, roomName,
    );
    if (partyRows.length === 0) return res.status(404).json({ error: "Match not found" });
    const { challengerId, challengedId } = partyRows[0];
    if (caller !== challengerId && caller !== challengedId) {
      return res.status(403).json({ error: "Only a debater in this match can complete it" });
    }

    // forcedWinner exists to say "I'm walking, give it to them". So the only
    // winner you may name is your OPPONENT. Being in the match is not licence to
    // award yourself the round and skip the judge — without this, a participant
    // could still take any match they were losing.
    if (forcedWinner !== undefined) {
      const opponent = caller === challengerId ? challengedId : challengerId;
      if (forcedWinner !== opponent) {
        return res.status(403).json({ error: "You can only forfeit to your opponent, not declare a winner" });
      }
    }

    const payload = await completeCompetitiveMatch(roomName, forcedWinner);
    if (!payload) return res.status(404).json({ error: "Match not found" });
    res.json(payload);
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

// ═══════════════════════════════════════════════════════════════════════════
// Rapid Fire — queued 1v1 against whoever's waiting
//
// Join the pool with a category (or nothing, meaning any). The pairing routine
// takes the longest-waiting compatible opponent, picks a topic from the agreed
// category, and deals opposing stances — you can't take a side on a topic you
// haven't seen yet, so the server assigns them.
//
// The round is a normal comp- room: same client rendering, same proposition
// bar. It differs in that the topic and stances are dealt rather than chosen,
// it settles on a separate ELO ladder, and it has NO automatic end — it runs
// until someone moves on or leaves, and whoever leads the bar takes it. Below
// RAPID_MIN_MESSAGES a side the round is voided instead: the bar scores claims,
// and it only moves once both sides have spoken, so an early exit has nothing
// to read a winner from.
// ═══════════════════════════════════════════════════════════════════════════
const RAPID_MIN_MESSAGES = 3;              // per side, before a leave can decide a winner
const RAPID_LOCK_KEY = 8123407;            // advisory lock id — serialises pairing

// Who has offered to end each round. Both sides have to press it: the first
// press is an offer, the second is agreement, and only then does the bar
// decide. Deliberately in memory — a round doesn't outlive a restart anyway,
// and a stale offer is worse than no offer. Cleared on every path a round can
// end by, or it leaks a set per abandoned room.
const rapidMoveOnVotes = new Map<string, Set<string>>();

interface RapidPairing {
  roomName: string;
  topic: string;
  categoryId: string;
  propositionId: string;
  a: { userId: string; stance: string };
  b: { userId: string; stance: string };
}

// Add the user to the pool and pair them against someone who actually
// disagrees with them.
//
// This used to match on CATEGORY and then deal each side with a coin flip, so
// two people who might well have agreed were assigned random halves of a random
// claim. Nobody argued what they believed, which is the opposite of the point.
// The deck exists so this query has something real to work with: it pairs on a
// proposition the two of them genuinely hold opposite views on.
//
// Preference order:
//   1. Comparable conviction. A zealot against someone mildly curious is a
//      miserable round for both, however opposed they are.
//   2. Comparable rating, bucketed — a preference, not a filter, because a hard
//      band on a thin queue just means nobody ever matches.
//   3. Longest wait, so the queue stays fair once quality is equal.
//
// The whole thing runs under a transaction-scoped advisory lock. Without it two
// simultaneous joiners can each insert, each fail to see the other's uncommitted
// row, and both sit waiting with nobody left to pair them. Pairing is rare
// enough that serialising it costs nothing.
async function joinRapidQueue(userId: string, categoryId: string | null): Promise<RapidPairing | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${RAPID_LOCK_KEY})`);

    await tx.$executeRawUnsafe(
      `INSERT INTO "DebateQueue" ("userId","categoryId") VALUES ($1,$2)
       ON CONFLICT ("userId") DO UPDATE SET "categoryId" = $2, "joinedAt" = NOW()`,
      userId, categoryId,
    );

    // Each side's category preference, where they named one, must be satisfied
    // by the claim itself — not merely by the two of them having asked for the
    // same thing.
    const rows = await tx.$queryRawUnsafe<{
      opponentId: string; propositionId: string; text: string;
      categoryId: string; myStance: string; opStance: string;
    }[]>(
      `SELECT q."userId"        AS "opponentId",
              p."id"            AS "propositionId",
              p."text"          AS "text",
              p."categoryId"    AS "categoryId",
              me."stance"       AS "myStance",
              op."stance"       AS "opStance"
       FROM "DebateQueue" q
       JOIN "UserBelief" op   ON op."userId" = q."userId" AND op."stance" <> 'skip'
       JOIN "UserBelief" me   ON me."propositionId" = op."propositionId"
                             AND me."userId" = $1 AND me."stance" <> 'skip'
       JOIN "Proposition" p   ON p."id" = op."propositionId" AND p."status" = 'live'
       JOIN "User" mu         ON mu."id" = $1
       JOIN "User" ou         ON ou."id" = q."userId"
       WHERE q."userId" <> $1
         AND me."stance" <> op."stance"
         AND ($2::text IS NULL OR p."categoryId" = $2::text)
         AND (q."categoryId" IS NULL OR p."categoryId" = q."categoryId")
       ORDER BY ABS(COALESCE(me."confidence",1) - COALESCE(op."confidence",1)) ASC,
                ABS(mu."rapidElo" - ou."rapidElo") / 100 ASC,
                q."joinedAt" ASC
       LIMIT 1`,
      userId, categoryId,
    );
    if (!rows.length) return null;
    const m = rows[0];

    await tx.$executeRawUnsafe(`DELETE FROM "DebateQueue" WHERE "userId" = ANY($1::text[])`, [userId, m.opponentId]);

    // No coin flip: each of them argues the side they already hold. Agreeing
    // with the claim is the affirmative.
    const sideOf = (stance: string) => (stance === "agree" ? "affirmative" : "negative");
    return {
      roomName: `comp-q${Date.now().toString(36).slice(-5)}-${Math.random().toString(36).slice(2, 7)}`,
      topic: m.text,
      categoryId: m.categoryId,
      propositionId: m.propositionId,
      a: { userId, stance: sideOf(m.myStance) },
      b: { userId: m.opponentId, stance: sideOf(m.opStance) },
    };
  });
}

async function leaveRapidQueue(userId: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "DebateQueue" WHERE "userId" = $1`, userId);
  } catch (e) { console.error("[leaveRapidQueue]", e); }
}

// Build the room for a pairing and tell both players. Mirrors the challenge
// accept path, minus the Challenge row — there was never a challenge.
async function startRapidMatch(p: RapidPairing): Promise<void> {
  const ids = [p.a.userId, p.b.userId];
  const users = await prisma.$queryRawUnsafe<{ id: string; username: string; rapidElo: number }[]>(
    `SELECT id, username, "rapidElo" FROM "User" WHERE id = ANY($1::text[])`, ids,
  );
  const nameOf = (id: string) => users.find((u) => u.id === id)?.username ?? "Debater";
  const eloOf = (id: string) => Number(users.find((u) => u.id === id)?.rapidElo ?? 1200);

  const matchConfig = JSON.stringify({
    isCompetitive: true,
    isRapid: true,
    challengerId: p.a.userId,
    challengedId: p.b.userId,
    challengerStance: p.a.stance,
    challengedStance: p.b.stance,
    topic: p.topic,
    categoryId: p.categoryId,
    // Which claim this round is about. The post-round "did your position move?"
    // needs it, and it's the link back to the deck.
    propositionId: p.propositionId,
    // "manual" matches none of the client's auto-judge effects, so nothing ends
    // the round but a player leaving.
    type: "manual",
  });

  const room = await prisma.room.create({ data: { name: p.roomName, isPrivate: false, creatorId: p.a.userId } } as any);
  await prisma.$executeRawUnsafe(`UPDATE "Room" SET "matchConfig" = $1 WHERE "id" = $2`, matchConfig, room.id);
  await prisma.roomMember.createMany({ data: ids.map((userId) => ({ userId, roomId: room.id })) } as any);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompetitiveMatch"
       ("id","challengeId","challengerId","challengedId","challengerStance","challengedStance","roomName","challengerEloBefore","challengedEloBefore","isRapid")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
    null, p.a.userId, p.b.userId, p.a.stance, p.b.stance, p.roomName, eloOf(p.a.userId), eloOf(p.b.userId),
  );

  try {
    await createProposition({
      roomName: p.roomName, matchType: "1v1",
      sideA: [p.a.userId], sideB: [p.b.userId],
      labelA: nameOf(p.a.userId), labelB: nameOf(p.b.userId),
    });
  } catch (e) { console.error("[proposition rapid]", e); }

  for (const side of [p.a, p.b]) {
    const opponent = side.userId === p.a.userId ? p.b : p.a;
    for (const sid of userSockets.get(side.userId) ?? []) {
      io.to(sid).emit("rapidMatchFound", {
        roomName: p.roomName,
        topic: p.topic,
        stance: side.stance,
        opponent: nameOf(opponent.userId),
        minMessages: RAPID_MIN_MESSAGES,
      });
    }
  }
}

// Claim the sole right to end a rapid round.
//
// Every way a round can end — a forfeit, a mutual move-on that settles on the
// bar, and the void sub-paths of both — has to pass through here first. It
// flips status 'active' -> 'closing' in one conditional UPDATE, so of any number
// of concurrent enders exactly one gets rowcount 1 and proceeds; the rest get 0
// and go home.
//
// This replaces a claim-by-winnerId that only forfeit did. That was not enough:
// the win paths could claim a winner, but the VOID paths have no winner to
// claim with, so a forfeit and a bar-settle could each believe they owned the
// round and race two contradictory outcomes (opposite winners, or a void racing
// a completion) into completeCompetitiveMatch, whose idempotency guard is an
// unlocked read-then-write. A single status transition is the one gate they all
// share.
async function claimRapidRound(roomName: string): Promise<boolean> {
  const n = await prisma.$executeRawUnsafe(
    `UPDATE "CompetitiveMatch" SET status='closing'
     WHERE "roomName"=$1 AND status='active' AND "isRapid"=TRUE`,
    roomName,
  );
  return n === 1;
}

// Discard a round nobody can be judged on. Leaves no result and no ELO, so
// walking out early gains you nothing and costs the other side nothing.
//
// Only ever reached after claimRapidRound has moved the round to 'closing', so
// it matches that — 'active' is kept too so the function stays correct if it's
// ever called on an unclaimed round.
async function voidRapidRound(roomName: string, reason: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "CompetitiveMatch" SET status='void', "completedAt"=NOW() WHERE "roomName"=$1 AND status IN ('active','closing')`,
    roomName,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "MatchProposition" SET status='settled', "settledAt"=NOW() WHERE "roomName"=$1`,
    roomName,
  );
  exchangeTracker.delete(roomName);
  rapidMoveOnVotes.delete(roomName);
  io.to(roomName).emit("rapidRoundVoided", { roomName, reason });
}

// Both players pressing "move on" is the only thing that ends a round on the
// bar. Whoever leads takes it; dead level, or short of the message floor, and
// it's voided.
async function settleRapidOnBar(roomName: string): Promise<void> {
  try {
    const state = await loadActiveRapid(roomName);
    if (!state) return;
    const { match } = state;

    // Take the round before touching anything. A forfeit racing this settle
    // would otherwise reach completeCompetitiveMatch alongside it with a
    // different winner.
    if (!(await claimRapidRound(roomName))) return;

    if (await rapidBelowFloor(state)) {
      await voidRapidRound(roomName, `The round ended before ${RAPID_MIN_MESSAGES} messages each — no result.`);
      return;
    }

    // Bring the bar up to date before reading a leader off it.
    await recomputePropositionBar(roomName);
    const propRows = await prisma.$queryRawUnsafe<{ priceA: number }[]>(
      `SELECT "priceA" FROM "MatchProposition" WHERE "roomName"=$1 LIMIT 1`, roomName,
    );
    const priceA = Number(propRows[0]?.priceA ?? 0.5);

    if (Math.abs(priceA - 0.5) < TIE_EPSILON) {
      await voidRapidRound(roomName, "The bar was dead level when you both moved on — no result.");
      return;
    }

    // sideA of the proposition is the challenger (see startRapidMatch).
    const winnerId = priceA > 0.5 ? match.challengerId : match.challengedId;
    const lead = Math.round((winnerId === match.challengerId ? priceA : 1 - priceA) * 100);
    await completeCompetitiveMatch(
      roomName, winnerId,
      `Ahead on the proposition bar at ${lead}% when you both agreed to move on.`,
    ).catch(() => null);
  } catch (e) { console.error("[settleRapidOnBar]", e); }
}

// Someone walked out. They lose.
//
// This used to hand the win to whoever led the bar REGARDLESS of who left —
// the leaver only changed the wording of the verdict. So the optimal play was
// to bail the instant you were ahead, which banks a win and teaches exactly the
// reflex this site exists to break. You cannot take a round by leaving it: to
// win on the bar you have to hold your lead until your opponent agrees it's
// over.
//
// Below the message floor it's still a void — walking out of a round nobody
// argued gains nothing and costs the other side nothing, and that's also what
// protects someone whose connection drops in the first ten seconds.
async function forfeitRapidRound(roomName: string, leaverId: string): Promise<void> {
  try {
    const state = await loadActiveRapid(roomName);
    if (!state) return;
    const { match } = state;

    // Take the round first. Two simultaneous disconnects, or a disconnect
    // racing a bar-settle, would otherwise both reach completeCompetitiveMatch
    // — and because the winner here is derived from WHO LEFT, the two callers
    // compute OPPOSITE winners and race four absolute ELO writes. The claim lets
    // exactly one through.
    if (!(await claimRapidRound(roomName))) return;

    if (await rapidBelowFloor(state)) {
      await voidRapidRound(roomName, `The round ended before ${RAPID_MIN_MESSAGES} messages each — no result.`);
      return;
    }

    const winnerId = leaverId === match.challengerId ? match.challengedId : match.challengerId;
    await completeCompetitiveMatch(
      roomName, winnerId,
      "The other debater left the round. Leaving forfeits, whatever the bar said.",
    ).catch(() => null);
  } catch (e) { console.error("[forfeitRapidRound]", e); }
}

interface ActiveRapid { match: any; roomId: string }

async function loadActiveRapid(roomName: string): Promise<ActiveRapid | null> {
  const matches = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "CompetitiveMatch" WHERE "roomName"=$1 AND status='active' AND "isRapid"=TRUE LIMIT 1`,
    roomName,
  );
  if (!matches.length) return null;
  const room = await prisma.room.findUnique({ where: { name: roomName }, select: { id: true } });
  if (!room) return null;
  return { match: matches[0], roomId: room.id };
}

// The bar scores claims and only moves once both sides have spoken, so short of
// this there is nothing to read a result off either way.
async function rapidBelowFloor({ match, roomId }: ActiveRapid): Promise<boolean> {
  const counts = await prisma.$queryRawUnsafe<{ userId: string; n: bigint }[]>(
    `SELECT "userId", COUNT(*) AS n FROM "Message"
     WHERE "roomId"=$1 AND "userId" IS NOT NULL GROUP BY "userId"`,
    roomId,
  );
  const said = (id: string) => Number(counts.find((c) => c.userId === id)?.n ?? 0);
  return said(match.challengerId) < RAPID_MIN_MESSAGES || said(match.challengedId) < RAPID_MIN_MESSAGES;
}

// Every active rapid round this user is in. Match completion is otherwise
// entirely client-driven, so without this an abandoned round stays 'active'
// forever — and in a queue of strangers, walking out is routine.
async function resolveRapidMatchesFor(userId: string): Promise<void> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ roomName: string }[]>(
      `SELECT "roomName" FROM "CompetitiveMatch"
       WHERE status = 'active' AND "isRapid" = TRUE AND ($1 IN ("challengerId","challengedId"))`,
      userId,
    );
    for (const m of rows) await forfeitRapidRound(m.roomName, userId);
  } catch (e) { console.error("[resolveRapidMatchesFor]", e); }
}

// The categories, with how many claims are actually live in each.
//
// `count` used to be the length of the hardcoded seed list, which stopped being
// true the moment propositions became a table — it would have kept reporting 5
// per category however many were approved.
app.get("/api/topics", async (_req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<{ categoryId: string; n: bigint }[]>(
      `SELECT "categoryId", COUNT(*) AS n FROM "Proposition" WHERE "status" = 'live' GROUP BY "categoryId"`,
    );
    const live = new Map(rows.map((r) => [r.categoryId, Number(r.n)]));
    res.json(TOPIC_CATALOG.map((c) => ({ id: c.id, label: c.label, count: live.get(c.id) ?? 0 })));
  } catch (e) {
    console.error("[GET /api/topics]", e);
    res.status(500).json({ error: "Failed to load categories" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// The deck
// ═══════════════════════════════════════════════════════════════════════════
// Users take sides on claims here, ahead of and outside any match. Rapid
// pairing reads the result, which is what lets it find someone who genuinely
// disagrees with you rather than dealing you a random side.
//
// It also carries the friction the match can't afford: stance and confidence
// are collected in advance, so queueing stays a single tap.

// Positions needed before Rapid will queue you. Two strangers can only be
// paired where their beliefs OVERLAP, so a user with a handful of positions
// mostly can't be matched at all — the gate is a matching requirement first
// and an onboarding step second.
const DECK_GATE = 10;

// Cards to take a side on, plus progress toward the gate.
app.get("/api/deck", async (req, res) => {
  try {
    const userId = actorId(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const limit = Number(req.query.limit ?? 20);

    const [cards, positioned] = await Promise.all([
      getDeck(prisma, userId, limit),
      beliefCount(prisma, userId),
    ]);
    res.json({ cards, positioned, gate: DECK_GATE });
  } catch (e) {
    console.error("[GET /api/deck]", e);
    res.status(500).json({ error: "Failed to load deck" });
  }
});

// Take a side. `confidence` is 1 (held) or 2 (strongly held); skip sends neither.
app.post("/api/deck/position", async (req, res) => {
  try {
    const userId = actorId(req);
    const { propositionId, stance, confidence, roomName, correction } = req.body as {
      propositionId?: string; stance?: Stance; confidence?: number; roomName?: string; correction?: boolean;
    };
    if (!userId || !propositionId) return res.status(400).json({ error: "userId and propositionId required" });
    if (stance !== "agree" && stance !== "disagree" && stance !== "skip") {
      return res.status(400).json({ error: "stance must be agree, disagree or skip" });
    }
    if (stance !== "skip" && confidence !== 1 && confidence !== 2) {
      return res.status(400).json({ error: "confidence must be 1 or 2" });
    }

    const result = await recordBelief(
      prisma, userId, propositionId, stance,
      stance === "skip" ? null : confidence!,
      roomName ?? null,
      !correction,
    );
    res.json({ ...result, positioned: await beliefCount(prisma, userId) });
  } catch (e) {
    console.error("[POST /api/deck/position]", e);
    res.status(500).json({ error: "Failed to record position" });
  }
});

// Resolve which claim a rapid round was about, and confirm the caller argued
// it. Shared by the aftermath GET and POST so the proposition is always taken
// from the ROUND, never from the client — you can only answer for the debate
// you were actually in, on the claim it was actually about.
type RoundResolution =
  | { kind: "ok"; propositionId: string }
  | { kind: "none" }                              // not a rapid round with a proposition
  | { kind: "error"; status: number; error: string };

async function resolveRapidRoundForUser(roomName: string, userId: string): Promise<RoundResolution> {
  // matchConfig is a raw-SQL column, NOT in the Prisma schema — every reader
  // goes through $queryRawUnsafe; prisma.room.findUnique({ select: {
  // matchConfig } }) throws a validation error.
  const roomRows = await prisma.$queryRawUnsafe<{ matchConfig: string | null }[]>(
    `SELECT "matchConfig" FROM "Room" WHERE name = $1 LIMIT 1`, roomName,
  );
  const matchConfig = roomRows[0]?.matchConfig ?? null;
  if (!matchConfig) return { kind: "error", status: 404, error: "No such round" };

  let cfg: any;
  try { cfg = JSON.parse(matchConfig); } catch { return { kind: "none" }; }
  if (!cfg?.isRapid || !cfg.propositionId) return { kind: "none" };
  if (userId !== cfg.challengerId && userId !== cfg.challengedId) {
    return { kind: "error", status: 403, error: "Not your round" };
  }
  return { kind: "ok", propositionId: cfg.propositionId };
}

async function aftermathAnswered(userId: string, roomName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ one: number }[]>(
    `SELECT 1 AS one FROM "RapidAftermathAnswered" WHERE "userId"=$1 AND "roomName"=$2 LIMIT 1`,
    userId, roomName,
  );
  return rows.length > 0;
}

// What was argued in a round, and where the caller stood on it going in.
//
// This is what closes the loop: deck -> match -> "did that move you?" -> deck.
// Whether a debate changes anyone's mind is the only honest measure of whether
// this product does what it says, and it's a question no comment section can
// even ask.
app.get("/api/rapid/aftermath/:roomName", async (req, res) => {
  try {
    const userId = actorId(req)!;
    const round = await resolveRapidRoundForUser(req.params.roomName, userId);
    if (round.kind === "error") return res.status(round.status).json({ error: round.error });
    if (round.kind === "none") return res.json({ proposition: null });

    // Already answered — don't re-prompt. This is what a remounted client sees
    // after it's submitted once, so the prompt doesn't come back.
    if (await aftermathAnswered(userId, req.params.roomName)) {
      return res.json({ proposition: null, answered: true });
    }

    const rows = await prisma.$queryRawUnsafe<{ id: string; text: string; stance: string; confidence: number | null }[]>(
      `SELECT p."id", p."text", b."stance", b."confidence"
       FROM "Proposition" p
       LEFT JOIN "UserBelief" b ON b."propositionId" = p."id" AND b."userId" = $1
       WHERE p."id" = $2 LIMIT 1`,
      userId, round.propositionId,
    );
    if (!rows.length) return res.json({ proposition: null });

    res.json({
      proposition: { id: rows[0].id, text: rows[0].text },
      before: rows[0].stance ? { stance: rows[0].stance, confidence: rows[0].confidence } : null,
    });
  } catch (e) {
    console.error("[GET /api/rapid/aftermath]", e);
    res.status(500).json({ error: "Failed to load round" });
  }
});

// Record where the caller now stands, once. The proposition is the round's, not
// the client's — so this can't be used to log a mind-change for a claim you
// never argued or a room you weren't in. Idempotent per (user, room): the marker
// is claimed inside the same transaction as the belief write, so a re-open, a
// double-tap, or a page reload can't produce a second BeliefChange for one
// debate. Returns { changed } authoritatively, so the client shows held vs
// changed from the truth rather than guessing.
app.post("/api/rapid/aftermath/:roomName", async (req, res) => {
  try {
    const userId = actorId(req)!;
    const roomName = req.params.roomName;
    const { stance, confidence } = req.body as { stance?: Stance; confidence?: number };
    if (stance !== "agree" && stance !== "disagree") {
      return res.status(400).json({ error: "stance must be agree or disagree" });
    }
    if (confidence !== 1 && confidence !== 2) {
      return res.status(400).json({ error: "confidence must be 1 or 2" });
    }

    const round = await resolveRapidRoundForUser(roomName, userId);
    if (round.kind === "error") return res.status(round.status).json({ error: round.error });
    if (round.kind === "none") return res.status(404).json({ error: "No such round" });

    const result = await prisma.$transaction(async (tx) => {
      // The marker is the gate. ON CONFLICT DO NOTHING returns rowcount 0 when
      // this room was already answered, and the whole transaction — marker AND
      // belief write — rolls back together if anything below throws, so a
      // failed write leaves nothing claimed and the user can retry.
      const claimed = await tx.$executeRawUnsafe(
        `INSERT INTO "RapidAftermathAnswered" ("userId","roomName") VALUES ($1,$2)
         ON CONFLICT ("userId","roomName") DO NOTHING`,
        userId, roomName,
      );
      if (claimed === 0) return { alreadyAnswered: true, changed: false };
      const r = await recordBelief(tx as any, userId, round.propositionId, stance, confidence, roomName, true);
      return { alreadyAnswered: false, changed: r.changed };
    });

    res.json(result);
  } catch (e) {
    console.error("[POST /api/rapid/aftermath]", e);
    res.status(500).json({ error: "Failed to record" });
  }
});

// ── Review ───────────────────────────────────────────────────────────────────
// Generated claims land as drafts; nothing reaches the deck without a human.

async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const rows = await prisma.$queryRawUnsafe<{ isAdmin: boolean }[]>(
    `SELECT "isAdmin" FROM "User" WHERE id = $1`, userId,
  );
  return !!rows[0]?.isAdmin;
}

app.get("/api/admin/propositions", async (req, res) => {
  try {
    const userId = actorId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: "Admins only" });
    const status = (req.query.status as string) ?? "draft";
    // The agree/disagree split is the only real measure of whether a claim
    // belongs in the deck, and it's one nothing can know in advance — a
    // generator can't tell that "politicians shouldn't trade stocks" polls at
    // 90%. A claim nobody argues with is dead weight: it can't produce a
    // pairing, and every deck slot it occupies is one a live claim didn't get.
    // Surfacing the split here is what lets the deck curate itself.
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT p."id", p."text", p."categoryId", p."status", p."source", p."createdAt",
              COALESCE(t.n, 0)::int      AS "positions",
              COALESCE(t.agrees, 0)::int AS "agrees"
       FROM "Proposition" p
       LEFT JOIN (
         SELECT "propositionId",
                COUNT(*)                                      AS n,
                COUNT(*) FILTER (WHERE stance = 'agree')      AS agrees
         FROM "UserBelief" WHERE stance <> 'skip' GROUP BY "propositionId"
       ) t ON t."propositionId" = p."id"
       WHERE p."status" = $1
       ORDER BY p."categoryId", p."createdAt" DESC LIMIT 500`,
      status,
    );
    res.json(rows);
  } catch (e) {
    console.error("[GET /api/admin/propositions]", e);
    res.status(500).json({ error: "Failed to load propositions" });
  }
});

app.post("/api/admin/propositions/:id", async (req, res) => {
  try {
    const userId = actorId(req);
    if (!(await isAdmin(userId))) return res.status(403).json({ error: "Admins only" });
    const { status } = req.body as { status?: string };
    if (status !== "live" && status !== "draft" && status !== "retired") {
      return res.status(400).json({ error: "status must be live, draft or retired" });
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "Proposition" SET "status" = $1 WHERE "id" = $2`, status, req.params.id,
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/admin/propositions/:id]", e);
    res.status(500).json({ error: "Failed to update proposition" });
  }
});

app.get("/api/rapid/queue-size", async (_req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) AS count FROM "DebateQueue"`);
    res.json({ waiting: Number(rows[0]?.count ?? 0) });
  } catch { res.json({ waiting: 0 }); }
});

app.get("/api/rapid/leaderboard", async (_req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.id, u.username, u."rapidElo" AS elo,
              COALESCE(w.count, 0)::int AS wins,
              COALESCE(l.count, 0)::int AS losses
       FROM "User" u
       JOIN (SELECT DISTINCT "challengerId" AS uid FROM "CompetitiveMatch" WHERE "isRapid" = TRUE AND status='complete'
             UNION SELECT DISTINCT "challengedId" FROM "CompetitiveMatch" WHERE "isRapid" = TRUE AND status='complete') p ON p.uid = u.id
       LEFT JOIN (SELECT "winnerId" AS uid, COUNT(*)::int AS count FROM "CompetitiveMatch"
                  WHERE "isRapid" = TRUE AND status='complete' GROUP BY "winnerId") w ON w.uid = u.id
       LEFT JOIN (SELECT uid, COUNT(*)::int AS count FROM (
                    SELECT "challengerId" AS uid, "winnerId" FROM "CompetitiveMatch" WHERE "isRapid" = TRUE AND status='complete'
                    UNION ALL
                    SELECT "challengedId" AS uid, "winnerId" FROM "CompetitiveMatch" WHERE "isRapid" = TRUE AND status='complete'
                  ) x WHERE "winnerId" IS DISTINCT FROM uid GROUP BY uid) l ON l.uid = u.id
       ORDER BY u."rapidElo" DESC LIMIT 25`,
    ).catch(() => [] as any[]);
    res.json(rows.map((r) => ({ ...r, wins: Number(r.wins), losses: Number(r.losses), elo: Number(r.elo) })));
  } catch (e) { console.error("[rapid leaderboard]", e); res.status(500).json({ error: "Server error" }); }
});

// ─── Team competitive matches (pre-formed teams, 1v1–3v3) ─────────────────────

const OPP_STANCE = (s: string) => (s === "affirmative" ? "negative" : "affirmative");

// Count accepted + invited members on a side
async function teamCounts(challengeId: string): Promise<{ A: { accepted: number; total: number }; B: { accepted: number; total: number } }> {
  const rows = await prisma.$queryRawUnsafe<{ side: string; status: string; n: number }[]>(
    `SELECT side, status, COUNT(*)::int AS n FROM "ChallengeMember" WHERE "challengeId" = $1 GROUP BY side, status`,
    challengeId,
  );
  const out = { A: { accepted: 0, total: 0 }, B: { accepted: 0, total: 0 } };
  for (const r of rows) {
    const side = r.side === "A" ? out.A : out.B;
    side.total += Number(r.n);
    if (r.status === "accepted") side.accepted += Number(r.n);
  }
  return out;
}

// When both sides have `teamSize` accepted members, create the room + TeamMatch and notify.
async function startTeamMatchIfReady(challengeId: string): Promise<string | null> {
  const chRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "Challenge" WHERE id = $1 LIMIT 1`, challengeId,
  );
  if (chRows.length === 0) return null;
  const ch = chRows[0];
  if (ch.status === "matched") return null;
  const size = Number(ch.teamSize ?? 1);

  const members = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "ChallengeMember" WHERE "challengeId" = $1 AND status = 'accepted' ORDER BY "createdAt" ASC`,
    challengeId,
  );
  const teamA = members.filter((m) => m.side === "A").map((m) => m.userId);
  const teamB = members.filter((m) => m.side === "B").map((m) => m.userId);
  if (teamA.length < size || teamB.length < size) return null;

  // Build room
  const shortId = Date.now().toString(36).slice(-5);
  const roomName = `comp-t${challengeId.slice(-5)}-${shortId}`;
  const wc = (() => { try { return JSON.parse(ch.winCondition); } catch { return { type: "exchanges", limit: 10 }; } })();
  const sideAStance = ch.stance as string;
  const matchConfig = JSON.stringify({
    isCompetitive: true,
    isTeam: true,
    challengeId,
    topic: ch.claim,
    teamSize: size,
    sideAStance,
    sideBStance: OPP_STANCE(sideAStance),
    teamA,
    teamB,
    ...wc,
  });

  const captainA = members.find((m) => m.side === "A" && m.role === "captain")?.userId ?? teamA[0];
  const room = await prisma.room.create({ data: { name: roomName, isPrivate: false, creatorId: captainA } } as any);
  await prisma.$executeRawUnsafe(`UPDATE "Room" SET "matchConfig" = $1 WHERE "id" = $2`, matchConfig, room.id);
  await prisma.roomMember.createMany({
    data: [...teamA, ...teamB].map((uid) => ({ userId: uid, roomId: room.id })),
    skipDuplicates: true,
  } as any);

  // Snapshot ELO for all members
  const allIds = [...teamA, ...teamB];
  const eloRows = await prisma.$queryRawUnsafe<{ id: string; elo: number }[]>(
    `SELECT id, elo FROM "User" WHERE id = ANY($1::text[])`, allIds,
  );
  const eloBefore: Record<string, number> = {};
  for (const uid of allIds) eloBefore[uid] = eloRows.find((r) => r.id === uid)?.elo ?? 1200;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "TeamMatch"
       ("id","challengeId","roomName","topic","teamSize","sideAStance","teamA","teamB","eloBefore")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8)`,
    challengeId, roomName, ch.claim, size, sideAStance,
    JSON.stringify(teamA), JSON.stringify(teamB), JSON.stringify(eloBefore),
  );
  await prisma.$executeRawUnsafe(`UPDATE "Challenge" SET status = 'matched' WHERE id = $1`, challengeId);

  // Open the proposition bar for this match
  try {
    await createProposition({ roomName, matchType: "team", sideA: teamA, sideB: teamB, labelA: `Side A · ${sideAStance}`, labelB: `Side B · ${OPP_STANCE(sideAStance)}` });
  } catch (e) { console.error("[proposition team]", e); }

  // Notify all members their match is ready
  for (const uid of allIds) {
    const sids = userSockets.get(uid);
    if (!sids) continue;
    for (const sid of sids) io.to(sid).emit("teamMatchStarted", { roomName, topic: ch.claim });
  }
  return roomName;
}

// POST /api/team/challenges — create a pre-formed team challenge (captain of side A)
app.post("/api/team/challenges", async (req, res) => {
  try {
    const userId = actorId(req)!;
    const { topic, stance, teamSize, winCondition } = req.body as {
    topic: string; stance: "affirmative" | "negative"; teamSize: number; winCondition: object;
    };
    if (!userId || !topic?.trim() || !stance || !winCondition) {
      return res.status(400).json({ error: "userId, topic, stance, and winCondition required" });
    }
    const size = Math.min(3, Math.max(1, Number(teamSize) || 1));
    // Solo team (size 1) is immediately open; larger teams start in 'forming' while the captain invites
    const status = size === 1 ? "open" : "forming";
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "Challenge" ("id","userId","claim","stance","winCondition","teamSize","status")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6) RETURNING "id"`,
      userId, topic.trim(), stance, JSON.stringify(winCondition), size, status,
    );
    const challengeId = rows[0].id;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ChallengeMember" ("id","challengeId","userId","side","role","status")
       VALUES (gen_random_uuid()::text,$1,$2,'A','captain','accepted')`,
      challengeId, userId,
    );
    res.json({ id: challengeId, status });
  } catch (e) {
    console.error("[team create]", e);
    res.status(500).json({ error: "Failed to create team challenge" });
  }
});

// POST /api/team/challenges/:id/invite — captain invites a user to their side
app.post("/api/team/challenges/:id/invite", async (req, res) => {
  try {
    const userId = actorId(req)!;
    const { targetUsername } = req.body as {targetUsername: string };
    const { id: challengeId } = req.params;
    if (!userId || !targetUsername?.trim()) return res.status(400).json({ error: "userId and targetUsername required" });

    const chRows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Challenge" WHERE id = $1 LIMIT 1`, challengeId);
    if (chRows.length === 0) return res.status(404).json({ error: "Challenge not found" });
    const ch = chRows[0];
    const size = Number(ch.teamSize ?? 1);

    const meRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "ChallengeMember" WHERE "challengeId" = $1 AND "userId" = $2 AND role = 'captain' LIMIT 1`,
      challengeId, userId,
    );
    if (meRows.length === 0) return res.status(403).json({ error: "Only the team captain can invite" });
    const side = meRows[0].side as string;

    const counts = await teamCounts(challengeId);
    const sideCount = side === "A" ? counts.A.total : counts.B.total;
    if (sideCount >= size) return res.status(400).json({ error: "Your team is already full" });

    const target = await prisma.user.findFirst({
      where: { username: { equals: targetUsername.trim(), mode: "insensitive" } },
      select: { id: true, username: true },
    });
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.id === userId) return res.status(400).json({ error: "You're already on the team" });

    const dupe = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "ChallengeMember" WHERE "challengeId" = $1 AND "userId" = $2 LIMIT 1`, challengeId, target.id,
    );
    if (dupe.length > 0) return res.status(400).json({ error: "That user is already invited or on a team" });

    await prisma.$executeRawUnsafe(
      `INSERT INTO "ChallengeMember" ("id","challengeId","userId","side","role","status")
       VALUES (gen_random_uuid()::text,$1,$2,$3,'member','invited')`,
      challengeId, target.id, side,
    );

    const captain = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    try {
      const notif = await (prisma as any).notification.create({
        data: {
          userId: target.id, type: "team_invite", fromUserId: userId,
          fromUsername: captain?.username ?? "A captain",
          content: ch.claim, roomName: challengeId,
        },
      });
      deliverNotification(target.id, notif);
    } catch { /* notification best-effort */ }

    res.json({ ok: true, invited: target.username });
  } catch (e) {
    console.error("[team invite]", e);
    res.status(500).json({ error: "Failed to send invite" });
  }
});

// POST /api/team/challenges/:id/respond — invitee accepts or declines
app.post("/api/team/challenges/:id/respond", async (req, res) => {
  try {
    const userId = actorId(req)!;
    const { accepted } = req.body as {accepted: boolean };
    const { id: challengeId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const memRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "ChallengeMember" WHERE "challengeId" = $1 AND "userId" = $2 AND status = 'invited' LIMIT 1`,
      challengeId, userId,
    );
    if (memRows.length === 0) return res.status(404).json({ error: "No pending invite" });

    if (!accepted) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "ChallengeMember" WHERE "challengeId" = $1 AND "userId" = $2 AND status = 'invited'`,
        challengeId, userId,
      );
      return res.json({ ok: true, declined: true });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "ChallengeMember" SET status = 'accepted' WHERE "challengeId" = $1 AND "userId" = $2`,
      challengeId, userId,
    );

    // Advance challenge status as sides fill
    const chRows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Challenge" WHERE id = $1 LIMIT 1`, challengeId);
    const ch = chRows[0];
    const size = Number(ch?.teamSize ?? 1);
    const counts = await teamCounts(challengeId);
    if (ch?.status === "forming" && counts.A.accepted >= size) {
      await prisma.$executeRawUnsafe(`UPDATE "Challenge" SET status = 'open' WHERE id = $1`, challengeId);
    }
    const roomName = await startTeamMatchIfReady(challengeId);
    res.json({ ok: true, roomName });
  } catch (e) {
    console.error("[team respond]", e);
    res.status(500).json({ error: "Failed to respond" });
  }
});

// POST /api/team/challenges/:id/accept — an opposing captain accepts an open team challenge
app.post("/api/team/challenges/:id/accept", async (req, res) => {
  try {
    const userId = actorId(req)!;
    const { id: challengeId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const chRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "Challenge" WHERE id = $1 AND status = 'open' LIMIT 1`, challengeId,
    );
    if (chRows.length === 0) return res.status(404).json({ error: "Challenge not available" });
    const ch = chRows[0];
    const size = Number(ch.teamSize ?? 1);

    const already = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "ChallengeMember" WHERE "challengeId" = $1 AND "userId" = $2 LIMIT 1`, challengeId, userId,
    );
    if (already.length > 0) return res.status(400).json({ error: "You're already in this match" });

    await prisma.$executeRawUnsafe(`UPDATE "Challenge" SET status = 'filling' WHERE id = $1`, challengeId);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ChallengeMember" ("id","challengeId","userId","side","role","status")
       VALUES (gen_random_uuid()::text,$1,$2,'B','captain','accepted')`,
      challengeId, userId,
    );

    const roomName = await startTeamMatchIfReady(challengeId); // instant for 1v1
    res.json({ ok: true, status: "filling", roomName });
  } catch (e) {
    console.error("[team accept]", e);
    res.status(500).json({ error: "Failed to accept" });
  }
});

// DELETE /api/team/challenges/:id — captain A cancels a challenge that hasn't matched
app.delete("/api/team/challenges/:id", async (req, res) => {
  try {
    const userId = actorId(req)!;
    const { id: challengeId } = req.params;
    await prisma.$executeRawUnsafe(
      `UPDATE "Challenge" SET status = 'cancelled'
       WHERE id = $1 AND "userId" = $2 AND status IN ('forming','open','filling')`,
      challengeId, userId,
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to cancel" });
  }
});

// GET /api/team/challenges — open team challenges looking for an opponent (exclude mine)
app.get("/api/team/challenges", async (req, res) => {
  try {
    const excludeUserId = actorId(req);
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.id, c.claim, c.stance, c."winCondition", c."teamSize", c."createdAt",
              u.id AS "captainId", u.username AS "captainName", u.elo AS "captainElo"
       FROM "Challenge" c JOIN "User" u ON c."userId" = u.id
       WHERE c.status = 'open'
         AND EXISTS (SELECT 1 FROM "ChallengeMember" m WHERE m."challengeId" = c.id)
         ${excludeUserId ? `AND NOT EXISTS (SELECT 1 FROM "ChallengeMember" m2 WHERE m2."challengeId" = c.id AND m2."userId" = $1)` : ``}
       ORDER BY c."createdAt" DESC LIMIT 50`,
      ...(excludeUserId ? [excludeUserId] : []),
    );
    res.json(rows);
  } catch (e) {
    console.error("[team challenges GET]", e);
    res.status(500).json({ error: "Failed to fetch team challenges" });
  }
});

// GET /api/team/invites?userId= — pending team invites for a user
app.get("/api/team/invites", async (req, res) => {
  try {
    const userId = actorId(req)!;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT m.id AS "memberId", m.side, m."challengeId", c.claim, c.stance, c."teamSize",
              cap.username AS "captainName", cap.elo AS "captainElo"
       FROM "ChallengeMember" m
       JOIN "Challenge" c ON m."challengeId" = c.id
       JOIN "User" cap ON c."userId" = cap.id
       WHERE m."userId" = $1 AND m.status = 'invited' AND c.status IN ('forming','open','filling')
       ORDER BY m."createdAt" DESC`,
      userId,
    );
    res.json(rows);
  } catch (e) {
    console.error("[team invites GET]", e);
    res.status(500).json({ error: "Failed to fetch invites" });
  }
});

// GET /api/team/mine?userId= — challenges the user is part of (any side/role)
app.get("/api/team/mine", async (req, res) => {
  try {
    const userId = actorId(req)!;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.id, c.claim, c.stance, c."winCondition", c."teamSize", c.status, c."createdAt",
              m.side AS "mySide", m.role AS "myRole",
              t."roomName"
       FROM "ChallengeMember" m
       JOIN "Challenge" c ON m."challengeId" = c.id
       LEFT JOIN "TeamMatch" t ON t."challengeId" = c.id
       WHERE m."userId" = $1 AND m.status = 'accepted' AND c.status != 'cancelled'
       ORDER BY c."createdAt" DESC LIMIT 50`,
      userId,
    );
    res.json(rows);
  } catch (e) {
    console.error("[team mine GET]", e);
    res.status(500).json({ error: "Failed to fetch your team matches" });
  }
});

// GET /api/team/challenges/:id — full roster for the lobby view
app.get("/api/team/challenges/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const chRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.*, u.username AS "captainName" FROM "Challenge" c JOIN "User" u ON c."userId" = u.id WHERE c.id = $1 LIMIT 1`, id,
    );
    if (chRows.length === 0) return res.status(404).json({ error: "Not found" });
    const members = await prisma.$queryRawUnsafe<any[]>(
      `SELECT m.side, m.role, m.status, u.id AS "userId", u.username, u.elo
       FROM "ChallengeMember" m JOIN "User" u ON m."userId" = u.id
       WHERE m."challengeId" = $1 ORDER BY m."createdAt" ASC`, id,
    );
    const ch = chRows[0];
    let wc: any = null;
    try { wc = JSON.parse(ch.winCondition); } catch { /* ignore */ }
    res.json({
      id: ch.id, topic: ch.claim, stance: ch.stance, teamSize: Number(ch.teamSize ?? 1),
      status: ch.status, winCondition: wc, captainName: ch.captainName,
      sideA: members.filter((m) => m.side === "A"),
      sideB: members.filter((m) => m.side === "B"),
    });
  } catch (e) {
    console.error("[team roster GET]", e);
    res.status(500).json({ error: "Failed to fetch roster" });
  }
});

// POST /api/team/complete — team-aware AI judge + ELO (idempotent)
app.post("/api/team/complete", async (req, res) => {
  try {
    const { roomName, forfeitUserId } = req.body as { roomName: string; forfeitUserId?: string };
    if (!roomName) return res.status(400).json({ error: "roomName required" });

    const matchRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "TeamMatch" WHERE "roomName" = $1 LIMIT 1`, roomName,
    );
    if (matchRows.length === 0) return res.status(404).json({ error: "Team match not found" });
    const match = matchRows[0];

    const teamA: string[] = JSON.parse(match.teamA);
    const teamB: string[] = JSON.parse(match.teamB);
    const eloBefore: Record<string, number> = JSON.parse(match.eloBefore ?? "{}");

    // Same rule as the 1v1: only the people in the match may end it. teamA and
    // teamB are the accepted ChallengeMember roster frozen onto the TeamMatch
    // row when it started, so they are the participant list — a spectator's
    // client never posts here, and a stranger's has no business to.
    const caller = actorId(req)!;
    const callerSide = teamA.includes(caller) ? "A" : teamB.includes(caller) ? "B" : null;
    if (!callerSide) {
      return res.status(403).json({ error: "Only a debater in this match can complete it" });
    }

    // You may only forfeit your OWN side. Naming anyone on the other team would
    // be handing yourself the match, so the id has to sit on the caller's side —
    // which permits the client's own "I forfeit" and nothing else.
    if (forfeitUserId !== undefined) {
      const forfeitSide = teamA.includes(forfeitUserId) ? "A" : teamB.includes(forfeitUserId) ? "B" : null;
      if (forfeitSide !== callerSide) {
        return res.status(403).json({ error: "You can only forfeit your own side" });
      }
    }

    // Idempotent
    if (match.status === "complete") {
      const eloAfter: Record<string, number> = JSON.parse(match.eloAfter ?? "{}");
      return res.json({ isTeam: true, winningSide: match.winningSide, verdict: match.verdict, teamA, teamB, eloBefore, eloAfter, sideAStance: match.sideAStance, topic: match.topic });
    }

    // Single-flight (see /api/competitive/complete): every member of both teams
    // posts /complete at match end, so without this each would run the judge and
    // write ELO. One atomic claim; the rest wait for and return the stored result.
    const claimed = await prisma.$executeRawUnsafe(
      `UPDATE "TeamMatch" SET status='judging' WHERE "roomName"=$1 AND status='active'`, roomName,
    );
    if (claimed !== 1) {
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const done = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "TeamMatch" WHERE "roomName"=$1 AND status='complete' LIMIT 1`, roomName,
        );
        if (done.length) {
          const m = done[0];
          return res.json({ isTeam: true, winningSide: m.winningSide, verdict: m.verdict, teamA, teamB, eloBefore, eloAfter: JSON.parse(m.eloAfter ?? "{}"), sideAStance: m.sideAStance, topic: m.topic });
        }
      }
      return res.status(409).json({ error: "Match is being completed" });
    }

    const roomRow = await prisma.room.findUnique({ where: { name: roomName }, select: { id: true } });
    if (!roomRow) return res.status(404).json({ error: "Room not found" });

    const messages = await prisma.message.findMany({
      where: { roomId: roomRow.id },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "asc" },
      take: 60,
    });
    const sideOf = (uid: string) => (teamA.includes(uid) ? "A" : teamB.includes(uid) ? "B" : "?");
    const transcript = messages
      .map((m) => `[Team ${sideOf(m.userId ?? "")}] ${m.user?.username ?? "User"}: ${transcriptText(m.content)}`)
      .join("\n");

    let winningSide: "A" | "B" = "A";
    let verdict = "The debate was inconclusive.";

    if (forfeitUserId) {
      // Forfeiting side loses
      winningSide = teamA.includes(forfeitUserId) ? "B" : "A";
      verdict = "A team forfeited the match.";
    } else {
      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic();
        const judgePrompt =
          `You are an impartial debate judge for a team debate on the proposition: "${match.topic}". ` +
          `Team A argued ${match.sideAStance}; Team B argued ${OPP_STANCE(match.sideAStance)}. ` +
          `Based on logic, evidence quality, and persuasion across all members, decide which team argued better. ` +
          `Return ONLY valid JSON: {"winningSide":"A" or "B","verdict":"one concise sentence"}\n\nTranscript:\n${transcript}`;
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5", max_tokens: 150,
          messages: [{ role: "user", content: judgePrompt }],
        });
        const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
        // Slice to the last "}" so trailing prose after the JSON object doesn't break the parse.
        const jsonStart = raw.indexOf("{");
        const jsonEnd = raw.lastIndexOf("}");
        const parsed = JSON.parse(jsonStart >= 0 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw);
        if (parsed.winningSide === "A" || parsed.winningSide === "B") winningSide = parsed.winningSide;
        if (typeof parsed.verdict === "string" && parsed.verdict) verdict = parsed.verdict;
      } catch (e) {
        console.error("[team judge]", e);
      }
    }

    // ELO: each member rated against the opposing team's average
    const avg = (ids: string[]) => ids.reduce((s, id) => s + (eloBefore[id] ?? 1200), 0) / Math.max(1, ids.length);
    const avgA = avg(teamA);
    const avgB = avg(teamB);
    const eloAfter: Record<string, number> = {};
    for (const uid of teamA) {
      const { newA } = calcElo(eloBefore[uid] ?? 1200, avgB, winningSide === "A");
      eloAfter[uid] = newA;
    }
    for (const uid of teamB) {
      const { newA } = calcElo(eloBefore[uid] ?? 1200, avgA, winningSide === "B");
      eloAfter[uid] = newA;
    }
    for (const uid of [...teamA, ...teamB]) {
      await prisma.$executeRawUnsafe(`UPDATE "User" SET elo = $1 WHERE id = $2`, eloAfter[uid], uid);
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "TeamMatch" SET status='complete', "winningSide"=$1, verdict=$2, "eloAfter"=$3, "completedAt"=NOW()
       WHERE "roomName"=$4`,
      winningSide, verdict, JSON.stringify(eloAfter), roomName,
    );

    const payload = { isTeam: true, winningSide, verdict, teamA, teamB, eloBefore, eloAfter, sideAStance: match.sideAStance, topic: match.topic };
    // Broadcast to everyone in the room (spectators + all players) for live verdicts
    io.to(roomName).emit("matchComplete", payload);

    // Freeze the proposition bar at its final value
    settleProposition(roomName).catch(() => {});

    // Debating counts toward the daily streak, not just chatting.
    for (const uid of [...teamA, ...teamB]) bumpDailyStreak(uid).catch(() => {});

    res.json(payload);
  } catch (e) {
    console.error("[team complete]", e);
    res.status(500).json({ error: "Failed to complete team match" });
  }
});

// GET /api/team/match/:roomName — fetch team match result (for reload)
app.get("/api/team/match/:roomName", async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "TeamMatch" WHERE "roomName" = $1 LIMIT 1`, req.params.roomName,
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    const m = rows[0];
    res.json({
      isTeam: true, status: m.status, winningSide: m.winningSide, verdict: m.verdict,
      teamA: JSON.parse(m.teamA), teamB: JSON.parse(m.teamB),
      eloBefore: JSON.parse(m.eloBefore ?? "{}"), eloAfter: JSON.parse(m.eloAfter ?? "{}"),
      sideAStance: m.sideAStance, topic: m.topic,
    });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/lessons/progress?userId=xxx
app.get("/api/lessons/progress", async (req, res) => {
  const userId = actorId(req)!;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    // completedAt is the FIRST completion (the insert is ON CONFLICT DO NOTHING),
    // which is what "where you left off" wants: the furthest you've actually got.
    const rows = await prisma.$queryRawUnsafe<{ seriesSlug: string; lessonSlug: string; completedAt: Date }[]>(
      `SELECT "seriesSlug", "lessonSlug", "completedAt" FROM "UserLessonProgress"
       WHERE "userId" = $1 ORDER BY "completedAt" DESC`, userId
    );
    res.json({ completed: rows });
  } catch (e) {
    console.error("[lessons/progress]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/lessons/complete — mark a lesson complete (idempotent)
app.post("/api/lessons/complete", async (req, res) => {
  const userId = actorId(req)!;
  const { seriesSlug, lessonSlug } = req.body;
  if (!userId || !seriesSlug || !lessonSlug) return res.status(400).json({ error: "userId, seriesSlug, lessonSlug required" });
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "UserLessonProgress" ("userId", "seriesSlug", "lessonSlug")
       VALUES ($1, $2, $3)
       ON CONFLICT ("userId", "seriesSlug", "lessonSlug") DO NOTHING`,
      userId, seriesSlug, lessonSlug
    );
    bumpDailyStreak(userId).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error("[lessons/complete]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/puzzles/progress?userId=xxx
app.get("/api/puzzles/progress", async (req, res) => {
  const userId = actorId(req)!;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const rows = await prisma.$queryRawUnsafe<{ puzzleId: string; completedAt: Date }[]>(
      `SELECT "puzzleId", "completedAt" FROM "UserPuzzleProgress"
       WHERE "userId" = $1 ORDER BY "completedAt" DESC`, userId
    );
    // `completed` stays a bare id list — existing callers depend on that shape.
    res.json({ completed: rows.map(r => r.puzzleId), solved: rows });
  } catch (e) {
    console.error("[puzzles/progress]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/puzzles/complete — idempotent
app.post("/api/puzzles/complete", async (req, res) => {
  const userId = actorId(req)!;
  const { puzzleId } = req.body;
  if (!userId || !puzzleId) return res.status(400).json({ error: "userId and puzzleId required" });
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "UserPuzzleProgress" ("userId", "puzzleId")
       VALUES ($1, $2)
       ON CONFLICT ("userId", "puzzleId") DO NOTHING`,
      userId, puzzleId
    );
    bumpDailyStreak(userId).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error("[puzzles/complete]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Trending topics ───────────────────────────────────────────────────────────
interface TrendingTopic { headline: string; proposition: string; source: string; roomName: string; sourceUrl?: string; }
let trendingCache: { topics: TrendingTopic[]; at: number } | null = null;
const TRENDING_TTL = 60 * 60 * 1000; // 1 hour

function trendingSlug(proposition: string): string {
  return "tr-" + proposition.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/, "").slice(0, 37);
}

function extractRssHeadlines(xml: string, source: string): { title: string; source: string; url?: string }[] {
  const out: { title: string; source: string; url?: string }[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks.slice(0, 10)) {
    const m = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = m?.[1]?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    const linkMatch = block.match(/<link>([^<]+)<\/link>/i) ?? block.match(/<link[^>]+href="([^"]+)"/i);
    const url = linkMatch?.[1]?.trim();
    if (title && title.length > 15) out.push({ title, source, url });
  }
  return out;
}

async function buildTrending(): Promise<TrendingTopic[]> {
  const RSS = [
    { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC" },
    { url: "https://feeds.npr.org/1001/rss.xml",          source: "NPR" },
    { url: "https://www.theguardian.com/world/rss",        source: "Guardian" },
  ];
  const settled = await Promise.allSettled(
    RSS.map(async ({ url, source }) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      try {
        const r = await fetch(url, { signal: ctrl.signal });
        return extractRssHeadlines(await r.text(), source);
      } finally { clearTimeout(t); }
    })
  );
  const headlines = settled
    .filter(r => r.status === "fulfilled")
    .flatMap(r => (r as PromiseFulfilledResult<{ title: string; source: string; url?: string }[]>).value);
  if (headlines.length === 0) return [];
  const urlMap = new Map<string, string>();
  headlines.forEach(h => { if (h.url) urlMap.set(h.title, h.url); });

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic();
  const list = headlines.map(h => `[${h.source}] ${h.title}`).join("\n");
  const prompt = `You are generating debate topics from today's news headlines. For each headline that has genuine two-sided potential (reasonable people could argue both sides), write a short balanced debate proposition in the style "Should [X]?" or "Is [X] justified?". Keep each proposition under 12 words.

Skip: natural disasters, deaths, sports results, pure entertainment, purely factual events with no ethical/policy dimension.

Return ONLY a JSON array, no markdown. Each item: {"headline":"original","proposition":"debate proposition","source":"source name"}. Return 5 to 7 items.

Headlines:\n${list}`;

  try {
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = resp.content[0].type === "text" ? resp.content[0].text.trim() : "[]";
    const s = raw.indexOf("["), e = raw.lastIndexOf("]");
    if (s === -1 || e === -1) return [];
    const parsed = JSON.parse(raw.slice(s, e + 1)) as Omit<TrendingTopic, "roomName">[];
    const topics: TrendingTopic[] = await Promise.all(
      parsed.map(async (t) => {
        const roomName = trendingSlug(t.proposition);
        const room = await prisma.room.upsert({
          where: { name: roomName },
          update: {},
          create: { name: roomName, proposition: t.proposition, creatorId: null, isPrivate: false } as any,
        });

        const existingChannels = await prisma.channel.count({ where: { roomId: room.id } });
        if (existingChannels === 0) {
          await prisma.$executeRawUnsafe(`UPDATE "Room" SET "stanceCooldown" = 60 WHERE "id" = $1`, room.id).catch(() => {});
          const [debateSection, resourceSection] = await Promise.all([
            prisma.section.create({ data: { name: "Debate", roomId: room.id, order: 0 } }),
            prisma.section.create({ data: { name: "Resources", roomId: room.id, order: 1 } }),
          ]);
          const generalChannel = await (prisma as any).channel.create({ data: { name: "general", roomId: room.id, sectionId: debateSection.id, order: 0 } });
          await (prisma as any).channel.createMany({
            data: [
              { name: "for",       roomId: room.id, sectionId: debateSection.id,   order: 1 },
              { name: "against",   roomId: room.id, sectionId: debateSection.id,   order: 2 },
              { name: "evidence",  roomId: room.id, sectionId: resourceSection.id, order: 0 },
              { name: "off-topic", roomId: room.id, sectionId: resourceSection.id, order: 1 },
            ],
          });
          await (prisma as any).poll.create({
            data: { roomId: room.id, channelId: generalChannel.id, question: "Should this debate be structured?", options: ["Structured", "Open"], createdBy: "system" },
          });
        }

        const sourceUrl = urlMap.get(t.headline);
        return { ...t, roomName, ...(sourceUrl ? { sourceUrl } : {}) };
      })
    );
    return topics;
  } catch { return []; }
}

app.get("/api/trending", async (_req, res) => {
  try {
    if (trendingCache && Date.now() - trendingCache.at < TRENDING_TTL) {
      return res.json({ topics: trendingCache.topics });
    }
    const topics = await buildTrending();
    trendingCache = { topics, at: Date.now() };
    res.json({ topics });
  } catch (e) {
    console.error("[trending]", e);
    res.json({ topics: [] });
  }
});

// GET /api/leaderboard — top users by ELO
app.get("/api/leaderboard", async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.id, u.username, u.elo,
         COALESCE(wins.count, 0)::int AS wins,
         COALESCE(losses.count, 0)::int AS losses
       FROM "User" u
       LEFT JOIN (
         SELECT "winnerId" AS uid, COUNT(*)::int AS count FROM "CompetitiveMatch" WHERE status='complete' GROUP BY "winnerId"
       ) wins ON wins.uid = u.id
       LEFT JOIN (
         SELECT CASE WHEN "winnerId" != "challengerId" THEN "challengerId" ELSE "challengedId" END AS uid,
                COUNT(*)::int AS count
         FROM "CompetitiveMatch" WHERE status='complete' GROUP BY uid
       ) losses ON losses.uid = u.id
       WHERE u.elo != 1200 OR wins.count IS NOT NULL
       ORDER BY u.elo DESC LIMIT 25`,
    );
    res.json(rows.map(r => ({ ...r, wins: Number(r.wins), losses: Number(r.losses), elo: Number(r.elo) })));
  } catch (e) {
    console.error("[leaderboard]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/arena-leaderboard — top arena players by arena ELO
app.get("/api/arena-leaderboard", async (_req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u.id, u.username, u."arenaElo" AS elo,
         COALESCE(w.count, 0)::int AS wins,
         COALESCE(l.count, 0)::int AS losses
       FROM "User" u
       JOIN (SELECT "userId", COUNT(*) AS c FROM "ArenaMatch" WHERE "ranked" = true GROUP BY "userId") am ON am."userId" = u.id
       LEFT JOIN (SELECT "userId" AS uid, COUNT(*)::int AS count FROM "ArenaMatch" WHERE "winner" = 'human' AND "ranked" = true GROUP BY "userId") w ON w.uid = u.id
       LEFT JOIN (SELECT "userId" AS uid, COUNT(*)::int AS count FROM "ArenaMatch" WHERE "winner" = 'bot'   AND "ranked" = true GROUP BY "userId") l ON l.uid = u.id
       ORDER BY u."arenaElo" DESC LIMIT 25`,
    ).catch(() => [] as any[]);
    res.json(rows.map(r => ({ ...r, wins: Number(r.wins), losses: Number(r.losses), elo: Number(r.elo) })));
  } catch (e) {
    console.error("[arena-leaderboard]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/arena/claims — the vetted, two-sided LIVE claims a ranked (ELO-earning)
// arena match can be built on, grouped by category. Free-text topics stay allowed
// in the UI but only these earn ELO.
app.get("/api/arena/claims", async (_req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<{ id: string; text: string; categoryId: string }[]>(
      `SELECT id, text, "categoryId" FROM "Proposition" WHERE status = 'live' ORDER BY "categoryId", text LIMIT 300`,
    );
    const byCat = new Map<string, { id: string; text: string }[]>();
    for (const r of rows) {
      const label = categoryLabel(r.categoryId);
      if (!byCat.has(label)) byCat.set(label, []);
      byCat.get(label)!.push({ id: r.id, text: r.text });
    }
    res.json(Array.from(byCat, ([category, claims]) => ({ category, claims })));
  } catch (e) {
    console.error("[arena/claims]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/live-matches — in-progress competitive 1v1 and team matches, watchable
app.get("/api/live-matches", async (_req, res) => {
  try {
    const [compRows, teamRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT cm."roomName", cm."challengerId", cm."challengedId",
                cm."challengerStance", cm."challengedStance", cm."createdAt", c.claim AS topic
         FROM "CompetitiveMatch" cm
         LEFT JOIN "Challenge" c ON cm."challengeId" = c.id
         WHERE cm.status = 'active'
         ORDER BY cm."createdAt" DESC LIMIT 40`,
      ).catch(() => [] as any[]),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT "roomName", topic, "teamSize", "sideAStance", "teamA", "teamB", "createdAt"
         FROM "TeamMatch" WHERE status = 'active' ORDER BY "createdAt" DESC LIMIT 40`,
      ).catch(() => [] as any[]),
    ]);

    // Gather all participant ids to resolve usernames + elo in one query
    const ids = new Set<string>();
    for (const r of compRows) { ids.add(r.challengerId); ids.add(r.challengedId); }
    for (const r of teamRows) {
      try { (JSON.parse(r.teamA) as string[]).forEach(id => ids.add(id)); } catch {}
      try { (JSON.parse(r.teamB) as string[]).forEach(id => ids.add(id)); } catch {}
    }
    const users = ids.size
      ? await prisma.$queryRawUnsafe<{ id: string; username: string; elo: number }[]>(
          `SELECT id, username, elo FROM "User" WHERE id = ANY($1::text[])`, [...ids],
        ).catch(() => [] as any[])
      : [];
    const uMap = new Map(users.map(u => [u.id, { username: u.username, elo: Number(u.elo ?? 1200) }]));
    const who = (id: string) => uMap.get(id) ?? { username: "Player", elo: 1200 };
    const oppStance = (s: string) => (s === "affirmative" ? "negative" : "affirmative");
    const viewers = (roomName: string) => presence.get(roomName)?.size ?? 0;

    const matches = [
      ...compRows.map(r => ({
        type: "1v1" as const,
        roomName: r.roomName,
        topic: r.topic ?? "Debate",
        teamSize: 1,
        sideAStance: r.challengerStance,
        sideBStance: r.challengedStance,
        sideA: [who(r.challengerId)],
        sideB: [who(r.challengedId)],
        participantIds: [r.challengerId, r.challengedId],
        viewers: viewers(r.roomName),
        startedAt: r.createdAt,
      })),
      ...teamRows.map(r => {
        const teamA: string[] = (() => { try { return JSON.parse(r.teamA); } catch { return []; } })();
        const teamB: string[] = (() => { try { return JSON.parse(r.teamB); } catch { return []; } })();
        return {
          type: "team" as const,
          roomName: r.roomName,
          topic: r.topic ?? "Debate",
          teamSize: Number(r.teamSize ?? teamA.length),
          sideAStance: r.sideAStance,
          sideBStance: oppStance(r.sideAStance),
          sideA: teamA.map(who),
          sideB: teamB.map(who),
          participantIds: [...teamA, ...teamB],
          viewers: viewers(r.roomName),
          startedAt: r.createdAt,
        };
      }),
    ];

    // Surface the highest-rated / most-watched matches first
    const prominence = (m: typeof matches[number]) => {
      const maxElo = Math.max(0, ...[...m.sideA, ...m.sideB].map(p => p.elo));
      return m.viewers * 10000 + maxElo;
    };
    matches.sort((a, b) => prominence(b) - prominence(a));

    // Attach the live proposition bar so cards can show who's ahead.
    const stats = await propositionStats(matches.map((m) => m.roomName));
    const enriched = matches.map((m) => {
      const s = stats.get(m.roomName);
      return {
        ...m,
        priceA: s?.priceA ?? 0.5,
        priceB: s ? 1 - s.priceA : 0.5,
        labelA: s?.labelA ?? null,
        labelB: s?.labelB ?? null,
      };
    });
    res.json(enriched);
  } catch (e) {
    console.error("[live-matches]", e);
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
    const userId = actorId(req)!;
    const { roomName, forfeit = false, forcedWinner } = req.body as {
      roomName: string; forfeit?: boolean; forcedWinner?: "human" | "bot";
    };
    if (!roomName) return res.status(400).json({ error: "roomName required" });

    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "ArenaMatch" WHERE "roomName" = $1 LIMIT 1`,
      roomName,
    );
    if (existing.length > 0) {
      const row = existing[0];
      return res.json({ winner: row.winner, verdict: row.verdict, scoreImpact: Number(row.scoreImpact), botId: row.botId, ranked: !!row.ranked });
    }

    const roomRows = await prisma.$queryRawUnsafe<{ id: string; botId: string | null; matchConfig: string | null }[]>(
      `SELECT id, "botId", "matchConfig" FROM "Room" WHERE name = $1 LIMIT 1`,
      roomName,
    );
    if (roomRows.length === 0) return res.status(404).json({ error: "Room not found" });
    const roomDbId = roomRows[0].id;
    const botId = roomRows[0].botId ?? roomName.replace("arena-", "").split("-")[0];
    if (!botId) return res.status(400).json({ error: "Bot not found for room" });
    // Ranked was decided at room creation (server-authoritative): true only for a
    // vetted live claim. Unranked practice never touches ELO or the leaderboard.
    let ranked = false;
    try { ranked = !!JSON.parse(roomRows[0].matchConfig ?? "{}").ranked; } catch { /* unranked */ }

    const result = await judgeMatch(roomDbId, roomName, userId, botId, prisma, forfeit, forcedWinner);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "ArenaMatch" ("id","roomName","userId","botId","winner","verdict","scoreImpact","ranked")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT ("roomName") DO NOTHING`,
      roomName, userId, result.botId, result.winner, result.verdict, result.scoreImpact, ranked,
    );

    // Training counts toward the daily streak, not just chatting.
    bumpDailyStreak(userId).catch(() => {});

    // Update the user's arena ELO against a tier-scaled bot rating (tier 1→1200 … tier 5→2000).
    // RANKED matches only — a win on a custom topic (where the bot may hold an
    // indefensible stance) moves nothing, which is the whole anti-farm gate.
    if (ranked) {
      try {
        const tier = BOT_TIER[result.botId] ?? 3;
        const botRating = 1000 + tier * 200;
        const aeRows = await prisma.$queryRawUnsafe<{ arenaElo: number }[]>(
          `SELECT "arenaElo" FROM "User" WHERE id = $1`, userId,
        ).catch(() => [] as any[]);
        const cur = Number(aeRows[0]?.arenaElo ?? 1200);
        const { newA } = calcElo(cur, botRating, result.winner === "human");
        await prisma.$executeRawUnsafe(`UPDATE "User" SET "arenaElo" = $1 WHERE id = $2`, newA, userId);
      } catch (e) { console.error("[arena elo]", e); }
    }

    // Keep only the last 5 arena match logs per user — delete messages from older completed rooms
    const ARENA_LOG_LIMIT = 5;
    const matchCountRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM "ArenaMatch" WHERE "userId" = $1`, userId,
    );
    if (Number(matchCountRows[0]?.count ?? 0n) > ARENA_LOG_LIMIT) {
      await prisma.$executeRawUnsafe(`DELETE FROM "Message" WHERE "roomId" = $1`, roomDbId);
    }

    res.json({ ...result, ranked });
  } catch (e) {
    console.error("[arena-judge]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Build the full profile payload (stats, medals, rubric averages) for a user.
// `includePrivate` controls whether account fields (email) are returned.
async function buildProfilePayload(
  user: { id: string; username: string; email: string; emailVerified: Date | null; bio: string | null; avatarUrl: string | null; createdAt: Date },
  includePrivate: boolean,
) {
  const uid = user.id;
  const uRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT elo, "avgClaimScore", "avgAccuracy", "avgRelevance", "avgEvidence", "avgLogic", "avgImpact",
            "claimsRated", "dailyStreak", "longestStreak", "featuredMedals"
     FROM "User" WHERE id = $1`, uid,
  ).catch(() => [] as any[]);
  const u0 = uRows[0] ?? {};
  const elo = Number(u0.elo ?? 1200);
  const claimAverages = {
    score:     Math.round(Number(u0.avgClaimScore ?? 0) * 10) / 10,
    accuracy:  Math.round(Number(u0.avgAccuracy   ?? 0) * 10) / 10,
    relevance: Math.round(Number(u0.avgRelevance  ?? 0) * 10) / 10,
    evidence:  Math.round(Number(u0.avgEvidence   ?? 0) * 10) / 10,
    logic:     Math.round(Number(u0.avgLogic      ?? 0) * 10) / 10,
    impact:    Math.round(Number(u0.avgImpact     ?? 0) * 10) / 10,
    rated:     Number(u0.claimsRated ?? 0),
  };
  const dailyStreak = Number(u0.dailyStreak ?? 0);
  const longestStreak = Number(u0.longestStreak ?? 0);

  const [cred, debateRows, messageRows, arenaRows, arenaStats, botsRows, teamWinRows, compWinRows] = await Promise.all([
    computeCredibility(uid, prisma).catch(() => null),
    prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS count FROM "RoomMember" rm JOIN "Room" r ON r.id = rm."roomId" WHERE rm."userId" = $1 AND r."isDM" = false AND r."isBotRoom" = false`,
      uid,
    ).catch(() => [{ count: 0n }]),
    prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS count FROM "Message" WHERE "userId" = $1`,
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
    prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(DISTINCT "botId") AS count FROM "ArenaMatch" WHERE "userId" = $1 AND "winner" = 'human'`,
      uid,
    ).catch(() => [{ count: 0n }]),
    prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS count FROM "TeamMatch"
       WHERE status = 'complete' AND (
         (jsonb_exists("teamA"::jsonb, $1) AND "winningSide" = 'A') OR
         (jsonb_exists("teamB"::jsonb, $1) AND "winningSide" = 'B')
       )`,
      uid,
    ).catch(() => [{ count: 0n }]),
    prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS count FROM "CompetitiveMatch" WHERE status = 'complete' AND "winnerId" = $1`,
      uid,
    ).catch(() => [{ count: 0n }]),
  ]);
  const as = arenaStats[0] as any;
  const arenaWins = Number(as?.wins ?? 0);
  const arenaLosses = Number(as?.losses ?? 0);
  const stats = {
    debateCount: Number((debateRows[0] as any)?.count ?? 0),
    messageCount: Number((messageRows[0] as any)?.count ?? 0),
    arenaMatchCount: Number((arenaRows[0] as any)?.count ?? 0),
    arenaWins,
    arenaLosses,
    arenaBonus: Math.round(Number(as?.bonus ?? 0) * 10) / 10,
    dailyStreak,
    longestStreak,
  };

  const accountAgeDays = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000);
  const medalStats: MedalStats = {
    elo,
    arenaWins,
    arenaMatches: arenaWins + arenaLosses,
    botsDefeated: Number((botsRows[0] as any)?.count ?? 0),
    totalBots: BOT_IDS.length,
    longestStreak,
    currentStreak: dailyStreak,
    veritasScore: cred?.score ?? 0,
    supported: cred?.supported ?? 0,
    contested: cred?.contested ?? 0,
    refuted: cred?.refuted ?? 0,
    totalClaims: cred?.total ?? 0,
    avgClaimScore: claimAverages.score,
    debateCount: stats.debateCount,
    messageCount: stats.messageCount,
    teamWins: Number((teamWinRows[0] as any)?.count ?? 0),
    competitiveWins: Number((compWinRows[0] as any)?.count ?? 0),
    accountAgeDays,
  };
  const medals = computeMedals(medalStats);

  // Featured medals: only surface ones the user has actually earned
  const earnedIds = new Set(medals.filter(m => m.earned).map(m => m.id));
  let featuredMedals: string[] = [];
  try {
    const raw = JSON.parse(u0.featuredMedals ?? "[]");
    if (Array.isArray(raw)) featuredMedals = raw.filter((id: any) => typeof id === "string" && earnedIds.has(id)).slice(0, 6);
  } catch { /* no featured selection */ }

  const publicUser = includePrivate
    ? user
    : { id: user.id, username: user.username, bio: user.bio, avatarUrl: user.avatarUrl, createdAt: user.createdAt };

  return { ...publicUser, elo, stats, claimAverages, medals, featuredMedals, ...(cred ? { cred } : {}) };
}

// GET /api/users/:id/profile — profile; account fields only for the owner
//
// Other people's profiles are legitimately readable — UserProfileModal opens
// this for whoever you clicked — so the fix is not to lock the route to the
// owner, it's to stop handing a stranger the account fields. This used to pass
// includePrivate: true unconditionally, which returned email and emailVerified
// for any id an authenticated caller cared to enumerate.
app.get("/api/users/:id/profile", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, username: true, email: true, emailVerified: true, bio: true, avatarUrl: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(await buildProfilePayload(user, actorId(req) === user.id));
  } catch (e) {
    console.error("[profile GET]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/by-name/:username/profile — public profile (no account fields)
app.get("/api/users/by-name/:username/profile", async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { username: { equals: req.params.username, mode: "insensitive" } },
      select: { id: true, username: true, email: true, emailVerified: true, bio: true, avatarUrl: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(await buildProfilePayload(user, false));
  } catch (e) {
    console.error("[public profile GET]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/users/:id/matches — a user's completed 1v1 competitive matches (most recent first)
app.get("/api/users/:id/matches", async (req, res) => {
  const uid = req.params.id;
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT cm."roomName", cm."challengerId", cm."challengedId", cm."winnerId", cm.verdict,
              cm."challengerEloBefore", cm."challengedEloBefore", cm."challengerEloAfter", cm."challengedEloAfter",
              cm."completedAt", c.claim AS topic,
              uc.username AS "challengerName", ud.username AS "challengedName"
       FROM "CompetitiveMatch" cm
       LEFT JOIN "Challenge" c ON cm."challengeId" = c.id
       LEFT JOIN "User" uc ON uc.id = cm."challengerId"
       LEFT JOIN "User" ud ON ud.id = cm."challengedId"
       WHERE cm.status = 'complete' AND (cm."challengerId" = $1 OR cm."challengedId" = $1)
       ORDER BY cm."completedAt" DESC NULLS LAST LIMIT 20`, uid,
    ).catch(() => [] as any[]);
    const matches = rows.map((r) => {
      const isChallenger = r.challengerId === uid;
      const eloBefore = Number((isChallenger ? r.challengerEloBefore : r.challengedEloBefore) ?? 1200);
      const eloAfter = Number((isChallenger ? r.challengerEloAfter : r.challengedEloAfter) ?? eloBefore);
      return {
        roomName: r.roomName,
        topic: r.topic ?? "Debate",
        opponentName: (isChallenger ? r.challengedName : r.challengerName) ?? "Opponent",
        won: r.winnerId === uid,
        eloAfter,
        eloDelta: eloAfter - eloBefore,
        verdict: r.verdict ?? "",
        completedAt: r.completedAt,
        challengerId: r.challengerId,
        challengedId: r.challengedId,
      };
    });
    res.json(matches);
  } catch (e) {
    console.error("[user matches GET]", e);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/users/:id/profile — the owner only
//
// The write target came from the path param and was never compared to the
// caller, so any signed-in user could rewrite anyone's bio, avatar and medals
// by changing the id in the URL. The :id stays in the path because the client
// builds the URL that way, but it is now checked, not obeyed.
app.patch("/api/users/:id/profile", async (req, res) => {
  if (actorId(req) !== req.params.id) {
    return res.status(403).json({ error: "You can only edit your own profile" });
  }
  const { bio, avatarUrl, featuredMedals } = req.body as { bio?: string; avatarUrl?: string; featuredMedals?: string[] };
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(bio !== undefined && { bio: bio.trim().slice(0, 500) }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: { id: true, username: true, bio: true, avatarUrl: true },
    });
    // Featured medals are stored on a raw column; cap at 6 and keep only strings
    if (featuredMedals !== undefined) {
      const clean = Array.isArray(featuredMedals)
        ? featuredMedals.filter(id => typeof id === "string").slice(0, 6)
        : [];
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "featuredMedals" = $1 WHERE id = $2`, JSON.stringify(clean), req.params.id,
      );
    }
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

// ── Direct messages ───────────────────────────────────────────────────────────
// A DM room's name is `dm-<sortedIdA>-<sortedIdB>` — a canonical database key so
// the pair dedupes, not something to put in front of a user. Clients address
// conversations by partner username; these endpoints do the translation.

function dmRoomName(userIdA: string, userIdB: string): string {
  const [a, b] = [userIdA, userIdB].sort();
  return `dm-${a}-${b}`;
}

// Which read-state column is "mine" depends on the participant slot I landed in.
function dmReadField(room: { participant1Id: string | null }, userId: string): "participant1ReadAt" | "participant2ReadAt" {
  return room.participant1Id === userId ? "participant1ReadAt" : "participant2ReadAt";
}

// Messages from the other person that arrived after I last read.
function dmUnreadWhere(room: { id: string; participant1Id: string | null }, userId: string) {
  const readAt = (room as any)[dmReadField(room, userId)] as Date | null;
  return { roomId: room.id, userId: { not: userId }, ...(readAt ? { createdAt: { gt: readAt } } : {}) };
}

app.get("/api/dm/conversations", async (req, res) => {
  const userId = actorId(req)!;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const rooms = await prisma.room.findMany({
      where: { isDM: true, OR: [{ participant1Id: userId }, { participant2Id: userId }] },
    });
    const partnerIds = rooms
      .map((r) => (r.participant1Id === userId ? r.participant2Id : r.participant1Id))
      .filter((id): id is string => !!id);
    const partners = await prisma.user.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, username: true, avatarUrl: true },
    });
    const byId = new Map(partners.map((p) => [p.id, p]));

    const convos = (await Promise.all(rooms.map(async (r) => {
      const partnerId = r.participant1Id === userId ? r.participant2Id : r.participant1Id;
      const partner = partnerId ? byId.get(partnerId) : null;
      if (!partner) return null;                       // partner deleted — hide the thread
      const last = await prisma.message.findFirst({
        where: { roomId: r.id },
        orderBy: { createdAt: "desc" },
        select: { content: true, createdAt: true, userId: true },
      });
      const unread = await prisma.message.count({ where: dmUnreadWhere(r, userId) });
      return {
        roomName: r.name,
        partner,
        lastMessage: last ? { content: last.content, createdAt: last.createdAt, mine: last.userId === userId } : null,
        lastActivity: last?.createdAt ?? r.createdAt,
        unread,
      };
    }))).filter((c): c is NonNullable<typeof c> => !!c);

    convos.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
    res.json(convos);
  } catch (e) { console.error("[dm conversations]", e); res.status(500).json({ error: "Server error" }); }
});

app.get("/api/dm/unread-count", async (req, res) => {
  const userId = actorId(req)!;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const rooms = await prisma.room.findMany({
      where: { isDM: true, OR: [{ participant1Id: userId }, { participant2Id: userId }] },
    });
    const counts = await Promise.all(rooms.map((r) => prisma.message.count({ where: dmUnreadWhere(r, userId) })));
    res.json({ unread: counts.reduce((a, b) => a + b, 0), conversations: counts.filter((c) => c > 0).length });
  } catch (e) { console.error("[dm unread-count]", e); res.status(500).json({ error: "Server error" }); }
});

// Resolve a partner username to its DM room, creating the room on first contact.
app.get("/api/dm/with/:username", async (req, res) => {
  const userId = actorId(req)!;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const partner = await prisma.user.findFirst({
      where: { username: { equals: req.params.username, mode: "insensitive" } },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!partner) return res.status(404).json({ error: "User not found" });
    if (partner.id === userId) return res.status(400).json({ error: "You can't message yourself" });

    const name = dmRoomName(userId, partner.id);
    const [a, b] = [userId, partner.id].sort();
    let room = await prisma.room.findUnique({ where: { name } });
    if (!room) {
      room = await prisma.room.create({ data: { name, isDM: true, participant1Id: a, participant2Id: b } });
      const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      const notif = await (prisma as any).notification.create({
        data: { userId: partner.id, type: "invite", roomId: room.id, roomName: `dm:${me?.username ?? userId}`, fromUserId: userId, fromUsername: me?.username ?? "Someone" },
      });
      deliverNotification(partner.id, notif);
    }
    // roomId is the DB id, which is what emitted messages carry. The client needs
    // it to tell this conversation's messages apart: joinRoom never leaves the
    // previous room, so a socket stays subscribed to every DM it has opened.
    res.json({ roomName: room.name, roomId: room.id, partner });
  } catch (e) { console.error("[dm with]", e); res.status(500).json({ error: "Server error" }); }
});

// Mark a conversation read as of now.
app.post("/api/dm/read", async (req, res) => {
  const userId = actorId(req)!;
  const { roomName } = req.body as {roomName: string };
  if (!userId || !roomName) return res.status(400).json({ error: "userId and roomName required" });
  try {
    const room = await prisma.room.findUnique({ where: { name: roomName } });
    if (!room?.isDM) return res.status(404).json({ error: "Not a DM" });
    if (room.participant1Id !== userId && room.participant2Id !== userId) return res.status(403).json({ error: "Not a participant" });
    await prisma.room.update({ where: { id: room.id }, data: { [dmReadField(room, userId)]: new Date() } as any });
    res.json({ ok: true });
  } catch (e) { console.error("[dm read]", e); res.status(500).json({ error: "Server error" }); }
});

// POST /api/bot-rooms — create a private 1v1 debate room against a bot
app.post("/api/bot-rooms", async (req, res) => {
  const userId = actorId(req)!;
  const { botId, winCondition = { type: "exchanges", limit: 10 } } = req.body as {
    botId: string; winCondition?: { topic?: string; propositionId?: string; [k: string]: unknown };
  };
  if (!botId) return res.status(400).json({ error: "botId required" });
  if (!BOT_IDS.includes(botId)) return res.status(400).json({ error: "Unknown bot" });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Ranked iff the debate is on a vetted, two-sided LIVE claim — either chosen
    // by id, or a free-text topic that exactly matches one. Curated claims are
    // balanced by construction, so no side is a free win; anything else is
    // unranked practice that earns no ELO. This is the anti-farm gate: you can no
    // longer deal a bot an indefensible custom stance and bank a ranked win. The
    // server is the authority — the client's flag is never trusted.
    const wc: any = { ...(winCondition as any) };
    let liveClaim: { id: string; text: string } | null = null;
    if (typeof wc.propositionId === "string" && wc.propositionId) {
      const rows = await prisma.$queryRawUnsafe<{ id: string; text: string }[]>(
        `SELECT id, text FROM "Proposition" WHERE id = $1 AND status = 'live' LIMIT 1`, wc.propositionId,
      );
      if (rows[0]) liveClaim = rows[0];
    }
    if (!liveClaim && typeof wc.topic === "string" && wc.topic.trim()) {
      const rows = await prisma.$queryRawUnsafe<{ id: string; text: string }[]>(
        `SELECT id, text FROM "Proposition" WHERE status = 'live' AND lower(text) = lower($1) LIMIT 1`, wc.topic.trim(),
      );
      if (rows[0]) liveClaim = rows[0];
    }
    wc.ranked = !!liveClaim;
    if (liveClaim) { wc.topic = liveClaim.text; wc.propositionId = liveClaim.id; }
    else { delete wc.propositionId; }

    const shortId = Date.now().toString(36).slice(-5);
    const name = `arena-${botId}-${userId.slice(-5)}-${shortId}`;

    const room = await prisma.room.create({
      data: { name, isPrivate: false, creatorId: userId },
    } as any);

    await prisma.$executeRawUnsafe(
      `UPDATE "Room" SET "isBotRoom" = true, "botId" = $1, "matchConfig" = $2 WHERE "id" = $3`,
      botId, JSON.stringify(wc), room.id,
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
    const generalChannel = await prisma.channel.create({ data: { name: "general", roomId: room.id, order: 0 } });
    // Auto-create spectator-chat channel for fishbowl rooms
    if (isFishbowl) {
      await (prisma as any).channel.create({ data: { name: "spectator-chat", roomId: room.id, order: 999, isSidebar: true, isSpectatorChat: true } });
    }
    // Auto-create structured debate vote for public rooms
    if (!isPrivate) {
      await (prisma as any).poll.create({
        data: { roomId: room.id, channelId: generalChannel.id, question: "Should this debate be structured?", options: ["Structured", "Open"], createdBy: creatorId ?? "system" },
      });
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

// GET /api/rooms/:name/claims — all evaluated claims with rubric scores
app.get("/api/rooms/:name/claims", async (req, res) => {
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const claims = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.id, c."messageId", c."claimantId", c.text, c.status,
              c.verdict AS reasoning, c.relevance, c.evidence, c.logic, c.impact, c.score,
              c."createdAt", c."channelId", u.username AS "claimantName"
       FROM "Claim" c
       LEFT JOIN "User" u ON u.id = c."claimantId"
       WHERE c."roomId" = $1 AND c.status != 'PENDING'
       ORDER BY COALESCE(c.score, 0) DESC, c."createdAt" DESC
       LIMIT 200`,
      room.id,
    );
    res.json(claims.map(r => ({
      ...r,
      relevance: r.relevance !== null ? Number(r.relevance) : null,
      evidence:  r.evidence  !== null ? Number(r.evidence)  : null,
      logic:     r.logic     !== null ? Number(r.logic)     : null,
      impact:    r.impact    !== null ? Number(r.impact)    : null,
      score:     r.score     !== null ? Number(r.score)     : null,
    })));
  } catch (e) {
    console.error("[claims]", e);
    res.status(500).json({ error: "Failed to fetch claims" });
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
  const userId = actorId(req)!;
  const { name: sectionName } = req.body as {name: string };
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
  const userId = actorId(req)!;
  const { name: newName } = req.body as {name: string };
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
  const userId = actorId(req)!;
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
  const userId = actorId(req)!;
  const { proposition, messageId, messagePreview } = req.body as {
    proposition: string; messageId?: string; messagePreview?: string;
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
  const userId = actorId(req)!;
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
  const userId = actorId(req)!;
  const { name: channelName, sectionId } = req.body as {name: string; sectionId?: string };
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
  const userId = actorId(req)!;
  const { name: newName, sectionId, isOpinionated: chOpinionated } = req.body as {name?: string; sectionId?: string | null; isOpinionated?: boolean };
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
  const userId = actorId(req)!;
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
  const userId = actorId(req);
  const { password } = req.body as { password: string };
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

app.get("/api/rooms/match", async (req, res) => {
  const prop = (req.query.proposition as string | undefined)?.trim();
  if (!prop || prop.length < 5) return res.json({ room: null });
  try {
    const rooms = await prisma.room.findMany({
      where: {
        proposition: { equals: prop, mode: "insensitive" },
        isDM: false,
        isPrivate: false,
        AND: [
          { NOT: { name: { startsWith: "arena-" } } },
          { NOT: { name: { startsWith: "comp-" } } },
        ],
      },
      take: 1,
      include: { _count: { select: { members: true } } },
    });
    res.json({ room: rooms[0] ?? null });
  } catch {
    res.status(500).json({ room: null });
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
  const userId = actorId(req)!;
  const { description, proposition, maxMembers, isPrivate, password: newPassword, aiPersona, stances, isOpinionated, stanceCooldown } = req.body as {
    
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
  const userId = actorId(req)!;
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
  const userId = actorId(req)!;
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
  const userId = actorId(req)!;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    await (prisma as any).notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/notifications — "Clear all". Persists the clear so dismissed
// notifications don't reappear on the next fetch (i.e. after a refresh). Keeps
// UNRESOLVED invites: for a room/DM invite the notification is the invite record
// itself (respondInvite resolves it by notifId), so deleting one would strand an
// invite the user can no longer accept or decline.
app.delete("/api/notifications", async (req, res) => {
  const userId = actorId(req)!;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    await (prisma as any).notification.deleteMany({
      where: { userId, NOT: { type: "invite", resolved: false } },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});


const PORT = process.env.PORT ?? 3001;

async function start() {
  // Before anything else. Without the secret no session token can be opened, so
  // every request would arrive anonymous — and a server that can't tell who is
  // calling has no business accepting connections. Refusing to boot makes that
  // a single obvious line at deploy time instead of a site that looks up but is
  // signed out for everyone.
  assertAuthConfigured();
  console.log("[Auth] Session token verification ready");

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
    // Only matches on a vetted, two-sided curated claim count toward arena ELO
    // and the leaderboard — custom free-text topics are unranked practice. This
    // is what stops farming a bot you've dealt an indefensible stance.
    await prisma.$executeRawUnsafe(`ALTER TABLE "ArenaMatch" ADD COLUMN IF NOT EXISTS "ranked" BOOLEAN NOT NULL DEFAULT false`);
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
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "arenaElo" INTEGER NOT NULL DEFAULT 1200`);
    // Rapid Fire has its own ladder so short, stranger-matched rounds can't move
    // the Battle Grounds rating.
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "rapidElo" INTEGER NOT NULL DEFAULT 1200`);
    console.log("[DB] User.elo column ready");
  } catch (e) {
    console.error("[DB] User.elo setup failed:", e);
  }

  // Per-category rubric averages + daily activity streak (for profile + medals)
  try {
    for (const col of ["avgClaimScore", "avgAccuracy", "avgRelevance", "avgEvidence", "avgLogic", "avgImpact"]) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "${col}" DOUBLE PRECISION NOT NULL DEFAULT 0`);
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "claimsRated" INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyStreak" INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "longestStreak" INTEGER NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActiveDay" DATE`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "featuredMedals" TEXT`);
    console.log("[DB] User rubric-average + streak columns ready");
  } catch (e) {
    console.error("[DB] User rubric-average/streak setup failed:", e);
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

  // ── The belief layer ─────────────────────────────────────────────────────────
  // What each user actually thinks, collected by the deck ahead of any match.
  // Rapid pairing reads this to find a real disagreement instead of dealing a
  // random side, so these tables are upstream of the queue below.
  //
  // NOTE: deliberately not "UserPosition" — that model already exists in
  // schema.prisma and means something else entirely (your FOR/AGAINST stance
  // within one room). A belief is about a claim and outlives any debate.
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Proposition" (
        "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "text"       TEXT NOT NULL UNIQUE,
        "categoryId" TEXT NOT NULL,
        "status"     TEXT NOT NULL DEFAULT 'draft',   -- draft | live | retired
        "source"     TEXT NOT NULL DEFAULT 'ai',      -- seed | ai | user
        "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Proposition_status_idx" ON "Proposition"("status","categoryId")`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserBelief" (
        "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"        TEXT NOT NULL,
        "propositionId" TEXT NOT NULL,
        "stance"        TEXT NOT NULL,                -- agree | disagree | skip
        "confidence"    SMALLINT,                     -- 1 = held, 2 = strongly held; null for skip
        "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE ("userId","propositionId")
      )
    `);
    // Pairing's hot path: given a proposition, who holds the opposite side.
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserBelief_prop_stance_idx" ON "UserBelief"("propositionId","stance")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserBelief_userId_idx" ON "UserBelief"("userId")`);

    // Every time someone's mind actually moves. This is the log the whole
    // product is arguing for, so it's kept separately from the current state
    // rather than overwritten — "changed my mind 4 times" is a credential.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BeliefChange" (
        "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"         TEXT NOT NULL,
        "propositionId"  TEXT NOT NULL,
        "fromStance"     TEXT NOT NULL,
        "toStance"       TEXT NOT NULL,
        "fromConfidence" SMALLINT,
        "toConfidence"   SMALLINT,
        "roomName"       TEXT,                        -- the debate that moved it, if any
        "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BeliefChange_userId_idx" ON "BeliefChange"("userId","createdAt")`);

    // One row per (user, rapid round) once they've answered the post-debate
    // "did that move you?". It makes the aftermath idempotent: the prompt asks
    // once and the answer lands once, so re-opening the result modal — which
    // remounts the component and resets its in-memory guards — cannot log a
    // second BeliefChange for the same debate and inflate the one metric this
    // whole loop exists to measure.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RapidAftermathAnswered" (
        "userId"     TEXT NOT NULL,
        "roomName"   TEXT NOT NULL,
        "answeredAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("userId","roomName")
      )
    `);
    console.log("[DB] Belief layer ready");
  } catch (e) {
    console.error("[DB] Belief layer setup failed:", e);
  }

  // Rapid Fire waiting pool. One row per waiting user; rows are claimed by the
  // pairing routine and deleted, so this table is empty at rest.
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DebateQueue" (
        "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"     TEXT NOT NULL UNIQUE,
        "categoryId" TEXT,                                  -- null = any category
        "joinedAt"   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DebateQueue_joinedAt_idx" ON "DebateQueue"("joinedAt")`);
    // Anyone left in the pool from a previous process is gone — sockets died with it.
    await prisma.$executeRawUnsafe(`DELETE FROM "DebateQueue"`);
    console.log("[DB] DebateQueue table ready");
  } catch (e) {
    console.error("[DB] DebateQueue table setup failed:", e);
  }

  // Seed the catalog claims as live so any deploy has a deck on day one.
  // Idempotent: ON CONFLICT (text) DO NOTHING never duplicates, and never
  // resurrects a claim an admin has since retired.
  try {
    const seeded = await seedFromCatalog(prisma);
    console.log(seeded ? `[DB] Seeded ${seeded} catalog propositions as live` : "[DB] Catalog already seeded");
  } catch (e) {
    console.error("[DB] Catalog seed failed:", e);
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
    // Rapid Fire rounds are CompetitiveMatch rows too — they just settle on a
    // separate ladder, so completion needs to tell them apart.
    await prisma.$executeRawUnsafe(`ALTER TABLE "CompetitiveMatch" ADD COLUMN IF NOT EXISTS "isRapid" BOOLEAN NOT NULL DEFAULT FALSE`);
    // A Rapid Fire round is paired from a queue, so it has no Challenge row.
    await prisma.$executeRawUnsafe(`ALTER TABLE "CompetitiveMatch" ALTER COLUMN "challengeId" DROP NOT NULL`);
    console.log("[DB] CompetitiveMatch table ready");
  } catch (e) {
    console.error("[DB] CompetitiveMatch table setup failed:", e);
  }

  // ── Team competitive: pre-formed teams (invite friends, 1v1–3v3) ──────────────
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "teamSize" INTEGER NOT NULL DEFAULT 1`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ChallengeMember" (
        "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "challengeId" TEXT NOT NULL,
        "userId"      TEXT NOT NULL,
        "side"        TEXT NOT NULL,                        -- 'A' | 'B'
        "role"        TEXT NOT NULL DEFAULT 'member',       -- 'captain' | 'member'
        "status"      TEXT NOT NULL DEFAULT 'invited',      -- 'invited' | 'accepted'
        "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE ("challengeId","userId")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ChallengeMember_challengeId_idx" ON "ChallengeMember"("challengeId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ChallengeMember_user_status_idx" ON "ChallengeMember"("userId","status")`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TeamMatch" (
        "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "challengeId" TEXT NOT NULL,
        "roomName"    TEXT NOT NULL UNIQUE,
        "topic"       TEXT NOT NULL,
        "teamSize"    INTEGER NOT NULL,
        "sideAStance" TEXT NOT NULL,
        "teamA"       TEXT NOT NULL,                        -- JSON array of userIds
        "teamB"       TEXT NOT NULL,                        -- JSON array of userIds
        "status"      TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'complete'
        "winningSide" TEXT,                                 -- 'A' | 'B'
        "verdict"     TEXT,
        "eloBefore"   TEXT,                                 -- JSON map userId -> elo
        "eloAfter"    TEXT,                                 -- JSON map userId -> elo
        "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
        "completedAt" TIMESTAMP
      )
    `);
    console.log("[DB] Team competitive tables ready");
  } catch (e) {
    console.error("[DB] Team competitive table setup failed:", e);
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

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserPuzzleProgress" (
        "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId"      TEXT NOT NULL,
        "puzzleId"    TEXT NOT NULL,
        "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("userId", "puzzleId")
      )
    `);
    console.log("[DB] UserPuzzleProgress table ready");
  } catch (e) {
    console.error("[DB] UserPuzzleProgress table setup failed:", e);
  }

  // Claim rubric columns (added after initial schema — safe to run repeatedly)
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "score"    DOUBLE PRECISION`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "evidence" INTEGER`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "logic"    INTEGER`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "impact"   INTEGER`);
    console.log("[DB] Claim rubric columns ready");
  } catch (e) {
    console.error("[DB] Claim rubric columns setup failed:", e);
  }

  // Proposition bar on live matches. Carries over any rows from the old
  // "BetMarket" table, which held the same bar plus betting columns.
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MatchProposition" (
        "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "roomName"     TEXT NOT NULL UNIQUE,
        "matchType"    TEXT NOT NULL,                        -- '1v1' | 'team'
        "sideA"        TEXT NOT NULL,                        -- JSON array of userIds
        "sideB"        TEXT NOT NULL,                        -- JSON array of userIds
        "labelA"       TEXT NOT NULL,
        "labelB"       TEXT NOT NULL,
        "priceA"       DOUBLE PRECISION NOT NULL DEFAULT 0.5,-- side A's share of the bar; B = 1 - A
        "lastExchange" INTEGER NOT NULL DEFAULT 0,
        "status"       TEXT NOT NULL DEFAULT 'open',         -- 'open' | 'settled'
        "winningSide"  TEXT,                                 -- 'A' | 'B' | null (draw)
        "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
        "settledAt"    TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "MatchProposition" ("id","roomName","matchType","sideA","sideB","labelA","labelB","priceA","lastExchange","status","winningSide","createdAt","settledAt")
      SELECT "id","roomName","matchType","sideA","sideB","labelA","labelB","priceA","lastExchange","status","winningSide","createdAt","settledAt"
      FROM "BetMarket"
      ON CONFLICT ("roomName") DO NOTHING
    `).catch(() => { /* no legacy table — nothing to carry over */ });
    console.log("[DB] Proposition table ready");
  } catch (e) {
    console.error("[DB] Proposition table setup failed:", e);
  }

  // Drop the retired betting feature's storage.
  try {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "BetPosition"`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "GavelTxn"`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "BetMarket"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" DROP COLUMN IF EXISTS "gavels"`);
    console.log("[DB] Betting storage removed");
  } catch (e) {
    console.error("[DB] Betting teardown failed:", e);
  }

  httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
