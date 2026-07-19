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
  since: string | null;
  channelId: string | null;
  socketId: string;
};

export async function summarizeConversation({ roomId, io, prisma, since, channelId, socketId }: Params) {
  const room = await prisma.room.findUnique({ where: { name: roomId } });
  if (!room) return;

  try {
    // Bound the input. With no `since`, "All messages" would otherwise send a
    // busy room's entire human history verbatim in a single call — the app's only
    // unbounded prompt. Take the most recent slice and cap the total characters,
    // truncating any single over-long message.
    const MAX_MSGS = 300;
    const MAX_MSG_CHARS = 2000;
    const MAX_TOTAL_CHARS = 60_000;

    const messages = await prisma.message.findMany({
      where: {
        roomId: room.id,
        senderType: SenderType.HUMAN,
        ...(channelId ? { channelId } : {}),
        ...(since ? { createdAt: { gte: new Date(since) } } : {}),
      },
      include: { user: true },
      orderBy: { createdAt: "desc" },   // newest first, so the cap keeps recent history
      take: MAX_MSGS,
    });

    // Filter out image messages — base64 content is huge and meaningless to summarize
    const textMessages = messages.filter(m => !m.content.startsWith('{"type":"image"'));
    if (textMessages.length === 0) return;

    // Accumulate newest-first within the char budget, then restore chronological order.
    const lines: string[] = [];
    let total = 0;
    for (const m of textMessages) {
      const body = m.content.length > MAX_MSG_CHARS ? `${m.content.slice(0, MAX_MSG_CHARS)}…` : m.content;
      const line = `[${m.user?.username ?? "unknown"}]: ${body}`;
      if (total + line.length > MAX_TOTAL_CHARS) break;
      lines.push(line);
      total += line.length;
    }
    lines.reverse();
    const context = lines.join("\n");

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

    const payload = {
      id: `summary-${Date.now()}`,
      content: JSON.stringify({ type: "summary", text }),
      senderType: SenderType.AI,
      type: "summary",
      createdAt: new Date().toISOString(),
      userId: null,
      roomId: room.id,
      user: null,
    };

    io.to(socketId).emit("message", payload);
  } catch (err) {
    console.error("[Summarizer] Error:", err);
  }
}
