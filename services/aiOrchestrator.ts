import type { Server } from "socket.io";
import type { RedisClientType } from "redis";
import type { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import { SenderType } from "@prisma/client";

const client = new Anthropic();

const WINDOW_KEY = (roomId: string) => `chat:${roomId}:window`;
const SCAN_INTERVAL_MS = 5_000;
const STREAM_CHUNK_SIZE = 3;   // characters per emit
const STREAM_DELAY_MS = 18;    // ms between chunks (~55 chars/sec — readable typing speed)

type Deps = {
  redis: RedisClientType | ReturnType<typeof import("redis").createClient>;
  io: Server;
  prisma: PrismaClient;
  settings: { factualCorrection: boolean; ambiguityResolution: boolean };
  emitRoom?: string; // socket room to emit AI messages to (defaults to roomId)
};

type Issue =
  | { type: "factual"; text: string; sarcasm: boolean }
  | { type: "ambiguity"; pronoun: string; referent: string; quote: string };

type AIResponse = {
  issues: Array<{
    type: "FACTUAL_UNCERTAINTY" | "RESOLVE_AMBIGUITY";
    sarcasm?: boolean;
    factual_correction?: string;
    ambiguity?: { pronoun: string; referent: string; quote: string };
  }>;
};

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

// Stream the human-readable text portion of an issue, then save and emit the real message.
// Ambiguity issues have no text to stream — they go through normal emit.
async function streamAndSave(payload: Issue, roomId: string, prisma: PrismaClient, io: Server, emitRoom: string) {
  const room = await prisma.room.findUnique({ where: { name: roomId } });
  if (!room) return;

  if (payload.type === "ambiguity") {
    const msg = await prisma.message.create({
      data: { content: JSON.stringify(payload), senderType: SenderType.AI, roomId: room.id, userId: null },
    });
    io.to(emitRoom).emit("message", { ...msg, type: "ai_interjection" });
    return;
  }

  const tempId = `ai-stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const text = payload.text;

  io.to(emitRoom).emit("aiStreamStart", { tempId, sarcasm: payload.sarcasm });

  for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
    io.to(emitRoom).emit("aiStreamChunk", { tempId, chunk: text.slice(i, i + STREAM_CHUNK_SIZE) });
    await sleep(STREAM_DELAY_MS);
  }

  const msg = await prisma.message.create({
    data: { content: JSON.stringify(payload), senderType: SenderType.AI, roomId: room.id, userId: null },
  });

  io.to(emitRoom).emit("aiStreamEnd", { tempId, message: { ...msg, type: "ai_interjection" } });
}

async function runScan(roomId: string, { redis, io, prisma, settings, emitRoom }: Deps) {
  pendingTimers.delete(roomId);

  const wantFactual = settings.factualCorrection;
  const wantAmbiguity = settings.ambiguityResolution;
  if (!wantFactual && !wantAmbiguity) return;

  const context = await getChatContext(roomId, redis);
  if (!context.trim()) return;

  const systemPrompt = [
    "You are a real-time chat assistant monitoring a group conversation.",
    "Scan ALL messages below and return ONLY valid JSON with this shape:",
    '{ "issues": [] }',
    "",
    "Each element of \"issues\" is one of:",
    wantFactual  ? '- { "type": "FACTUAL_UNCERTAINTY", "sarcasm": boolean, "factual_correction": "<polite 1-2 sentence correction>" }' : "",
    wantAmbiguity ? '- { "type": "RESOLVE_AMBIGUITY", "ambiguity": { "pronoun": "<exact word>", "referent": "<what it refers to>", "quote": "<full message text>" } }' : "",
    "",
    "Rules:",
    "FACTUAL_UNCERTAINTY: a message contains a demonstrably incorrect factual claim (wrong date, location, attribution). Set sarcasm:true if the claim is intentionally ironic/joking.",
    "RESOLVE_AMBIGUITY: a message uses a pronoun (it, he, she, they, there, that, this) whose referent is genuinely unclear but resolvable from context.",
    "Report every issue you find — there may be 0, 1, or several across different messages.",
    "Ignore opinions, greetings, and statements that are correct or simply informal.",
    'Return { "issues": [] } if nothing stands out.',
  ].filter(Boolean).join("\n");

  let parsed: AIResponse;
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: `CONVERSATION:\n${context}` }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    console.log("[AI] Scan response:", raw);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.issues)) return;
  } catch (e) {
    console.error("[AI] Scan error:", e);
    return;
  }

  // Clear the window so the next scan only sees new messages
  await (redis as any).del(WINDOW_KEY(roomId));

  console.log(`[AI] Found ${parsed.issues.length} issue(s) in room ${roomId}`);

  // Stream issues sequentially so bubbles don't all start at once
  for (const issue of parsed.issues) {
    let payload: Issue | null = null;
    if (issue.type === "FACTUAL_UNCERTAINTY" && wantFactual && issue.factual_correction) {
      payload = { type: "factual", text: issue.factual_correction, sarcasm: issue.sarcasm ?? false };
    } else if (issue.type === "RESOLVE_AMBIGUITY" && wantAmbiguity && issue.ambiguity) {
      payload = { type: "ambiguity", ...issue.ambiguity };
    }
    if (payload) await streamAndSave(payload, roomId, prisma, io, emitRoom ?? roomId);
  }
}

export function scheduleAI(roomId: string, deps: Deps) {
  if (pendingTimers.has(roomId)) return;
  const timer = setTimeout(() => runScan(roomId, deps), SCAN_INTERVAL_MS);
  pendingTimers.set(roomId, timer);
}
