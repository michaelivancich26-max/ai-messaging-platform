import type { Server } from "socket.io";
import type { RedisClientType } from "redis";
import type { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import { SenderType } from "@prisma/client";

const client = new Anthropic();

type Params = {
  roomId: string;
  redis: RedisClientType | ReturnType<typeof import("redis").createClient>;
  io: Server;
  prisma: PrismaClient;
  since: string | null; // ISO string or null for all messages
};

export async function summarizeConversation({ roomId, io, prisma, since }: Params) {
  const room = await prisma.room.findUnique({ where: { name: roomId } });
  if (!room) return;

  const messages = await prisma.message.findMany({
    where: {
      roomId: room.id,
      senderType: SenderType.HUMAN,
      ...(since ? { createdAt: { gte: new Date(since) } } : {}),
    },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  if (messages.length === 0) return;

  const context = messages
    .map((m) => `[${m.user?.username ?? "unknown"}]: ${m.content}`)
    .join("\n");

  const timeLabel = since
    ? `since ${new Date(since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "of the full conversation";

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    system:
      "You are a chat summarizer. Write a concise 2-4 sentence summary of the conversation provided. Focus on the key topics discussed and any conclusions reached. Be neutral and factual.",
    messages: [{ role: "user", content: `Summarize this conversation ${timeLabel}:\n\n${context}` }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : null;
  if (!text) return;

  const aiMessage = await prisma.message.create({
    data: {
      content: JSON.stringify({ type: "summary", text }),
      senderType: SenderType.AI,
      roomId: room.id,
      userId: null,
    },
  });

  io.to(roomId).emit("message", { ...aiMessage, type: "summary" });
}
