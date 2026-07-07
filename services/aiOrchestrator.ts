import type { Server } from "socket.io";
import type { RedisClientType } from "redis";
import type { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import { SenderType } from "@prisma/client";

const client = new Anthropic();

const WINDOW_KEY = (roomId: string) => `chat:${roomId}:window`;
const COOLDOWN_KEY = (roomId: string) => `chat:${roomId}:ai-cooldown`;
const SCAN_INTERVAL_MS = 20_000;
const SCAN_COOLDOWN_SEC = 30;
const MIN_WINDOW_MESSAGES = 3;
const STREAM_CHUNK_SIZE = 3;
const STREAM_DELAY_MS = 18;

type Deps = {
  redis: RedisClientType | ReturnType<typeof import("redis").createClient>;
  io: Server;
  prisma: PrismaClient;
  emitRoom?: string;
  aiPersona?: string;
  roomName: string;
  channelId?: string | null;
};

type Issue = { type: "mention_response"; text: string };

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function getChatContext(roomId: string, redis: Deps["redis"]): Promise<string> {
  const raw = await (redis as any).lRange(WINDOW_KEY(roomId), 0, -1);
  const messages: Array<{ role: string; content: string; username?: string }> = raw
    .map((s: string) => JSON.parse(s))
    .reverse();
  return messages.map((m) => `[${m.username ?? m.role}]: ${m.content}`).join("\n");
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function streamAndSave(
  payload: Issue,
  roomId: string,
  prisma: PrismaClient,
  io: Server,
  emitRoom: string,
  channelId?: string | null,
) {
  const room = await prisma.room.findUnique({ where: { name: roomId } });
  if (!room) return;

  const msgData = {
    content: JSON.stringify(payload),
    senderType: SenderType.AI,
    roomId: room.id,
    userId: null,
    channelId: channelId ?? null,
  };

  const tempId = `ai-stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const text = payload.text;

  io.to(emitRoom).emit("aiStreamStart", { tempId, sarcasm: false, isMention: true });

  for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
    io.to(emitRoom).emit("aiStreamChunk", { tempId, chunk: text.slice(i, i + STREAM_CHUNK_SIZE) });
    await sleep(STREAM_DELAY_MS);
  }

  const msg = await prisma.message.create({ data: msgData });
  io.to(emitRoom).emit("aiStreamEnd", { tempId, message: { ...msg, type: "ai_interjection" } });
}

async function runScan(roomId: string, { redis, io, prisma, emitRoom }: Deps) {
  pendingTimers.delete(roomId);

  const messageCount = await (redis as any).lLen(WINDOW_KEY(roomId));
  if (messageCount < MIN_WINDOW_MESSAGES) return;

  const context = await getChatContext(roomId, redis);
  if (!context.trim()) return;

  const systemPrompt = [
    "You are a debate moderation assistant.",
    "Scan the conversation and return ONLY valid JSON: { \"issues\": [] }",
    "",
    "\"issues\" — only one type allowed:",
    '- { "type": "SUGGEST_POLL", "poll": { "question": "<concise poll question>", "options": ["<option 1>", "<option 2>"] } }',
    "",
    "SUGGEST_POLL: the group is actively debating between 2-4 specific options and a vote would help. Only suggest when the debate is live and unresolved. Extract the real options (2-4 max). Never suggest for hypotheticals or resolved topics.",
    "",
    'Return { "issues": [] } if nothing applies.',
  ].join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `CONVERSATION:\n${context}` }],
    } as any);

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.issues)) return;

    await (redis as any).del(WINDOW_KEY(roomId));
    await (redis as any).set(COOLDOWN_KEY(roomId), "1", { EX: SCAN_COOLDOWN_SEC });

    for (const issue of parsed.issues) {
      if (issue.type === "SUGGEST_POLL" && issue.poll?.question && issue.poll.options?.length >= 2) {
        io.to(emitRoom ?? roomId).emit("pollSuggested", {
          question: issue.poll.question,
          options: issue.poll.options.slice(0, 4),
        });
      }
    }
  } catch (e) {
    console.error("[AI] Scan error:", e);
  }
}

export async function scheduleAI(roomId: string, deps: Deps) {
  if (pendingTimers.has(roomId)) return;
  const cooldown = await (deps.redis as any).get(COOLDOWN_KEY(roomId));
  if (cooldown) return;
  const timer = setTimeout(() => runScan(roomId, deps), SCAN_INTERVAL_MS);
  pendingTimers.set(roomId, timer);
}

export async function respondToMention(question: string, roomId: string, deps: Deps) {
  const { redis, io, prisma, emitRoom, aiPersona, roomName, channelId } = deps;
  const emitTarget = emitRoom ?? roomId;
  const context = await getChatContext(roomId, redis);

  // Poll creation intent
  if (/\b(create|make|start|run|add)\b.{0,30}\bpoll\b/i.test(question)) {
    try {
      const res = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        system: "Extract a poll from the user's request. Return ONLY valid JSON: { \"question\": \"...\", \"options\": [\"...\", \"...\"] } with 2-4 concise options. Nothing else.",
        messages: [{ role: "user", content: `Request: ${question}\n\nConversation context:\n${context}` }],
      });
      const raw = res.content[0].type === "text" ? res.content[0].text : "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const poll = JSON.parse(match[0]);
        if (poll.question && Array.isArray(poll.options) && poll.options.length >= 2) {
          io.to(emitTarget).emit("pollSuggested", { question: poll.question, options: poll.options.slice(0, 4) });
          await streamAndSave({ type: "mention_response", text: `Poll ready: "${poll.question}"` }, roomName, prisma, io, emitTarget, channelId);
          return;
        }
      }
    } catch (e) {
      console.error("[AI] Mention poll error:", e);
    }
  }

  const personaLine = aiPersona
    ? `You are playing the role of: ${aiPersona}. Stay in character.`
    : "You are @Claude, a helpful AI assistant participating in a chat room.";

  const systemPrompt = [
    personaLine,
    "A user has directly @mentioned you. Respond helpfully and conversationally.",
    "Be concise — 1–3 sentences unless the user explicitly asks for more detail.",
    context.trim() ? `\nRecent conversation:\n${context}` : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "I'm here! How can I help?";
    await streamAndSave({ type: "mention_response", text }, roomName, prisma, io, emitTarget, channelId);
  } catch (e) {
    console.error("[AI] Mention response error:", e);
  }
}
