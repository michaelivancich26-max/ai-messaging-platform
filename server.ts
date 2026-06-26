import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { PrismaClient, SenderType } from "@prisma/client";
import { createClient } from "redis";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { orchestrateAI } from "./services/aiOrchestrator";
import { summarizeConversation } from "./services/summarizer";
import { containsSlur } from "./services/contentFilter";

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
const WINDOW_SIZE = 15;

io.on("connection", (socket) => {
  socket.on("joinRoom", async (payload: { roomId: string; roomName: string }) => {
    const { roomId, roomName } = payload;
    try {
      const existing = await prisma.room.findUnique({ where: { name: roomName } });
      if (!existing) {
        await prisma.room.create({ data: { name: roomName } }).catch(() => {});
      }
      const room = await prisma.room.findUniqueOrThrow({ where: { name: roomName } });
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

        // Ensure room exists
        let room = await prisma.room.findUnique({ where: { name: roomId } });
        if (!room) {
          room = await prisma.room.create({ data: { name: roomId } })
            .catch(() => prisma.room.findUniqueOrThrow({ where: { name: roomId } }));
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

        // Fire-and-forget AI orchestration — does not block chat
        orchestrateAI({ roomId, redis, io, prisma, settings: settings ?? { factualCorrection: true, ambiguityResolution: true } }).catch(console.error);
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
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { messages: true } } },
  });
  res.json(rooms);
});

app.post("/api/rooms", async (req, res) => {
  const name = req.body?.name?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
  const creatorId = req.body?.creatorId as string | undefined;
  if (!name) return res.status(400).json({ error: "Invalid room name" });
  if (containsSlur(name)) return res.status(400).json({ error: "Room name contains prohibited language." });
  try {
    const existing = await prisma.room.findUnique({ where: { name } });
    if (existing) return res.status(409).json({ error: "Room already exists" });
    const room = await prisma.room.create({ data: { name, creatorId: creatorId ?? null } });
    res.json(room);
  } catch {
    res.status(500).json({ error: "Failed to create room" });
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
