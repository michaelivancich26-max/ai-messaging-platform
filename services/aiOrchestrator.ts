import type { Server } from "socket.io";
import type { RedisClientType } from "redis";
import type { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import { SenderType } from "@prisma/client";

const client = new Anthropic();

const WINDOW_KEY = (roomId: string) => `chat:${roomId}:window`;
const SCAN_INTERVAL_MS = 30_000;

type Deps = {
  redis: RedisClientType | ReturnType<typeof import("redis").createClient>;
  io: Server;
  prisma: PrismaClient;
  settings: { factualCorrection: boolean; ambiguityResolution: boolean };
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

// In-memory timers: roomId → NodeJS.Timeout
// When the first message arrives in a quiet room, we start a 30s timer.
// Subsequent messages in that window just add to the Redis context — no new timer.
// After 30s, AI scans everything that came in and emits corrections.
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function getChatContext(roomId: string, redis: Deps["redis"]): Promise<string> {
  const raw = await (redis as any).lRange(WINDOW_KEY(roomId), 0, -1);
  const messages: Array<{ role: string; content: string; username?: string }> = raw
    .map((s: string) => JSON.parse(s))
    .reverse();
  return messages.map((m) => `[${m.username ?? m.role}]: ${m.content}`).join("\n");
}

async function emitAIMessage(content: string, roomId: string, prisma: PrismaClient, io: Server) {
  const room = await prisma.room.findUnique({ where: { name: roomId } });
  if (!room) return;
  const aiMessage = await prisma.message.create({
    data: { content, senderType: SenderType.AI, roomId: room.id, userId: null },
  });
  io.to(roomId).emit("message", { ...aiMessage, type: "ai_interjection" });
}

async function runScan(roomId: string, { redis, io, prisma, settings }: Deps) {
  pendingTimers.delete(roomId);

  const wantFactual = settings.factualCorrection;
  const wantAmbiguity = settings.ambiguityResolution;
  if (!wantFactual && !wantAmbiguity) return;

  const context = await getChatContext(roomId, redis);
  if (!context.trim()) return;

  const systemPrompt = [
    "You are a real-time chat assistant monitoring a group conversation.",
    "Scan ALL messages below and return ONLY valid JSON with this shape:",
    '{',
    '  "issues": []',
    '}',
    '',
    'Each element of "issues" is one of:',
    wantFactual  ? '- { "type": "FACTUAL_UNCERTAINTY", "sarcasm": boolean, "factual_correction": "<polite 1-2 sentence correction>" }' : '',
    wantAmbiguity ? '- { "type": "RESOLVE_AMBIGUITY", "ambiguity": { "pronoun": "<exact word>", "referent": "<what it refers to>", "quote": "<full message text>" } }' : '',
    '',
    'Rules:',
    'FACTUAL_UNCERTAINTY: a message contains a demonstrably incorrect factual claim (wrong date, location, attribution). Set sarcasm:true if the claim is intentionally ironic/joking.',
    'RESOLVE_AMBIGUITY: a message uses a pronoun (it, he, she, they, there, that, this) whose referent is genuinely unclear but resolvable from context.',
    'Report every issue you find — there may be 0, 1, or several across different messages.',
    'Ignore opinions, greetings, and statements that are correct or simply informal.',
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

  console.log(`[AI] Found ${parsed.issues.length} issue(s) in room ${roomId}`);

  // Emit one message per issue, in parallel
  await Promise.all(
    parsed.issues.map((issue) => {
      let payload: Issue | null = null;
      if (issue.type === "FACTUAL_UNCERTAINTY" && wantFactual && issue.factual_correction) {
        payload = { type: "factual", text: issue.factual_correction, sarcasm: issue.sarcasm ?? false };
      } else if (issue.type === "RESOLVE_AMBIGUITY" && wantAmbiguity && issue.ambiguity) {
        payload = { type: "ambiguity", ...issue.ambiguity };
      }
      return payload ? emitAIMessage(JSON.stringify(payload), roomId, prisma, io) : Promise.resolve();
    })
  );
}

// Called from server.ts on every incoming human message.
// Starts a 30s timer the first time; subsequent messages in the window just extend the context.
export function scheduleAI(roomId: string, deps: Deps) {
  if (pendingTimers.has(roomId)) return; // timer already running, context will accumulate
  const timer = setTimeout(() => runScan(roomId, deps), SCAN_INTERVAL_MS);
  pendingTimers.set(roomId, timer);
}
