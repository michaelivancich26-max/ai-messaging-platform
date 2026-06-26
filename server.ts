import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { PrismaClient, SenderType } from "@prisma/client";
import { createClient } from "redis";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { scheduleAI } from "./services/aiOrchestrator";
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
      socket.emit("roomMeta", roomMeta);

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
    } catch (err) {
      console.error("joinChannel error:", err);
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

        const message = await prisma.message.create({
          data: { content, senderType: SenderType.HUMAN, roomId: room.id, userId: user.id, channelId: channelId ?? null },
          include: { user: true },
        });

        const emitTarget = channelId ? `channel:${channelId}` : roomId;
        io.to(emitTarget).emit("message", { ...message, type: "human" });

        if (!isImage) {
          const windowKey = WINDOW_KEY(channelId ?? roomId);
          await redis.lPush(windowKey, JSON.stringify({ role: "human", content, username }));
          await redis.lTrim(windowKey, 0, WINDOW_SIZE - 1);
          scheduleAI(channelId ?? roomId, { redis, io, prisma, settings: settings ?? { factualCorrection: true, ambiguityResolution: true }, emitRoom: emitTarget, aiPersona: room.aiPersona ?? undefined, roomName: room.name, channelId: channelId ?? null });
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
        include: { room: { include: { _count: { select: { messages: true } } } } },
        orderBy: { joinedAt: "desc" },
      }),
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
    const rooms = memberships.map(({ room: { password: _pw, ...r } }) => r);
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
    res.json(user);
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
      data: { name, description, creatorId: creatorId ?? null, isPrivate, password, maxMembers, aiPersona },
    });
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
    const [sections, channels] = await Promise.all([
      prisma.section.findMany({ where: { roomId: room.id }, orderBy: { order: "asc" } }),
      prisma.channel.findMany({ where: { roomId: room.id }, orderBy: { order: "asc" } }),
    ]);
    res.json({ sections, channels });
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
  const { userId, name: newName, sectionId } = req.body as { userId: string; name?: string; sectionId?: string | null };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const room = await prisma.room.findUnique({ where: { name: req.params.name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const requestingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (room.creatorId !== userId && !requestingUser?.isAdmin) return res.status(403).json({ error: "Unauthorized" });
    const data: any = {};
    if (newName) data.name = newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    if (sectionId !== undefined) data.sectionId = sectionId;
    const channel = await prisma.channel.update({ where: { id: req.params.id }, data });
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
  const { userId, description, maxMembers, isPrivate, password: newPassword, aiPersona } = req.body as {
    userId: string;
    description?: string;
    maxMembers?: number | null;
    isPrivate?: boolean;
    password?: string;
    aiPersona?: string | null;
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
    if (maxMembers !== undefined) data.maxMembers = maxMembers;
    if (isPrivate !== undefined) {
      data.isPrivate = isPrivate;
      if (!isPrivate) data.password = null;
    }
    if (newPassword) data.password = await bcrypt.hash(newPassword, 10);
    if (aiPersona !== undefined) data.aiPersona = aiPersona?.trim().slice(0, 500) || null;

    const updated = await prisma.room.update({ where: { name }, data });
    const { password: _pw, ...rest } = updated as any;
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

  httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
