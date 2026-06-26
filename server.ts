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

io.on("connection", (socket) => {
  socket.on("joinRoom", async (payload: { roomId: string; roomName: string; password?: string }) => {
    const { roomId, roomName, password } = payload;
    try {
      const room = await prisma.room.findUnique({ where: { name: roomName } });
      if (!room) {
        socket.emit("roomDeleted");
        return;
      }
      const socketUser = (socket as any).user as { id: string; username: string };
      if (room.isDM && room.participant1Id !== socketUser.id && room.participant2Id !== socketUser.id) {
        socket.emit("roomDeleted");
        return;
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

      const history = await prisma.message.findMany({
        where: { roomId: room.id },
        orderBy: { createdAt: "asc" },
        take: 50,
        include: { user: true },
      });

      const mapped = history.map((m) => {
        let type: string = "human";
        if (m.senderType === "AI") {
          if (m.content.startsWith('{"type":"summary"')) type = "summary";
          else type = "ai_interjection";
        }
        return { ...m, type };
      });

      socket.emit("history", mapped);
    } catch (err) {
      console.error("joinRoom error:", err);
    }
    socket.join(roomId);
  });

  socket.on(
    "sendMessage",
    async (payload: { roomId: string; userId: string; username: string; content: string; settings?: { factualCorrection: boolean; ambiguityResolution: boolean } }) => {
      const { roomId, userId, username, settings } = payload;
      const content = payload.content?.trim().replace(/\0/g, "").slice(0, 2000);
      if (!content) return;
      if (containsSlur(content)) {
        socket.emit("error", { message: "Message contains prohibited language and was not sent." });
        return;
      }

      try {
        // Ensure user exists
        let user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
          user = await prisma.user.create({
            data: { username, email: `${username}@chat.local`, password: "" },
          }).catch(() => prisma.user.findUniqueOrThrow({ where: { username } }));
        }

        // Room must already exist — never auto-create on message send
        const room = await prisma.room.findUnique({ where: { name: roomId } });
        if (!room) {
          socket.emit("roomDeleted");
          return;
        }

        const message = await prisma.message.create({
          data: {
            content,
            senderType: SenderType.HUMAN,
            roomId: room.id,
            userId: user.id,
          },
          include: { user: true },
        });

        const windowKey = WINDOW_KEY(roomId);
        await redis.lPush(windowKey, JSON.stringify({ role: "human", content, username }));
        await redis.lTrim(windowKey, 0, WINDOW_SIZE - 1);

        io.to(roomId).emit("message", { ...message, type: "human" });

        // Schedule a 30s batch scan — first message starts the timer, the rest accumulate
        scheduleAI(roomId, { redis, io, prisma, settings: settings ?? { factualCorrection: true, ambiguityResolution: true } });
      } catch (err) {
        console.error("sendMessage error:", err);
      }
    }
  );

  socket.on("summarize", async ({ roomId, since }: { roomId: string; since: string | null }) => {
    await summarizeConversation({ roomId, redis, io, prisma, since, socketId: socket.id });
    socket.emit("summarizeDone");
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/rooms", async (_req, res) => {
  const rooms = await prisma.room.findMany({
    where: { isDM: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { messages: true } } },
  });
  res.json(rooms.map(({ password: _pw, ...r }) => r));
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

  if (!name) return res.status(400).json({ error: "Invalid room name" });
  if (containsSlur(name)) return res.status(400).json({ error: "Room name contains prohibited language." });
  if (isPrivate && !rawPassword) return res.status(400).json({ error: "Private rooms require a password." });
  if (maxMembers !== null && (maxMembers < 2 || maxMembers > 500)) return res.status(400).json({ error: "Max members must be between 2 and 500." });

  try {
    const existing = await prisma.room.findUnique({ where: { name } });
    if (existing) return res.status(409).json({ error: "Room already exists" });
    const password = isPrivate && rawPassword ? await bcrypt.hash(rawPassword, 10) : null;
    const room = await prisma.room.create({
      data: { name, description, creatorId: creatorId ?? null, isPrivate, password, maxMembers },
    });
    res.json({ ...room, password: undefined });
  } catch {
    res.status(500).json({ error: "Failed to create room" });
  }
});

app.post("/api/rooms/:name/auth", async (req, res) => {
  const { name } = req.params;
  const { password } = req.body as { password: string };
  if (!password) return res.status(400).json({ error: "Password required" });
  try {
    const room = await prisma.room.findUnique({ where: { name } });
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!room.isPrivate || !room.password) return res.json({ ok: true });
    const valid = await bcrypt.compare(password, room.password);
    res.json({ ok: valid });
  } catch {
    res.status(500).json({ error: "Server error" });
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

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
