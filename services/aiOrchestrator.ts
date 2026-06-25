import type { Server } from "socket.io";
import type { RedisClientType } from "redis";
import type { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import { SenderType } from "@prisma/client";

const client = new Anthropic();

const WINDOW_KEY = (roomId: string) => `chat:${roomId}:window`;

type OrchestratorParams = {
  roomId: string;
  redis: RedisClientType | ReturnType<typeof import("redis").createClient>;
  io: Server;
  prisma: PrismaClient;
  settings: { factualCorrection: boolean; ambiguityResolution: boolean };
};

type OrchestratorResponse = {
  intents: Array<"FACTUAL_UNCERTAINTY" | "RESOLVE_AMBIGUITY" | "SARCASM_DETECTED">;
  confidence: number;
  factual_correction?: string;
  ambiguity?: { pronoun: string; referent: string; quote: string };
};

async function getChatContext(roomId: string, redis: OrchestratorParams["redis"]): Promise<{ context: string; latestMessage: string }> {
  const raw = await (redis as any).lRange(WINDOW_KEY(roomId), 0, -1);
  const messages: Array<{ role: string; content: string; username?: string }> = raw
    .map((s: string) => JSON.parse(s))
    .reverse();

  const lines = messages.map((m) => `[${m.username ?? m.role}]: ${m.content}`);
  const latest = messages[messages.length - 1];
  return {
    context: lines.join("\n"),
    latestMessage: latest ? `[${latest.username ?? latest.role}]: ${latest.content}` : "",
  };
}

async function emitAIMessage(content: string, roomId: string, prisma: PrismaClient, io: Server) {
  const room = await prisma.room.findUnique({ where: { name: roomId } });
  if (!room) return;
  const aiMessage = await prisma.message.create({
    data: { content, senderType: SenderType.AI, roomId: room.id, userId: null },
  });
  io.to(roomId).emit("message", { ...aiMessage, type: "ai_interjection" });
}

export async function orchestrateAI({ roomId, redis, io, prisma, settings }: OrchestratorParams) {
  const { context, latestMessage } = await getChatContext(roomId, redis);

  const wantFactual = settings.factualCorrection;
  const wantAmbiguity = settings.ambiguityResolution;
  if (!wantFactual && !wantAmbiguity) return;

  // Single Haiku call: detect intents AND generate responses in one shot
  const systemPrompt = [
    "You are a real-time chat assistant. Analyze the LATEST MESSAGE and return ONLY valid JSON matching this exact shape:",
    '{',
    '  "intents": [],',
    '  "confidence": 0.0,',
    wantFactual  ? '  "factual_correction": null,' : '',
    wantAmbiguity ? '  "ambiguity": null' : '',
    '}',
    '',
    'Rules:',
    '- intents: array of applicable tags from ["FACTUAL_UNCERTAINTY", "RESOLVE_AMBIGUITY", "SARCASM_DETECTED"]. Empty array if none apply.',
    '- confidence: 0.0–1.0 reflecting how certain you are.',
    wantFactual  ? '- factual_correction: if FACTUAL_UNCERTAINTY is in intents, a single polite 1-2 sentence correction. Otherwise null.' : '',
    wantAmbiguity ? '- ambiguity: if RESOLVE_AMBIGUITY is in intents, an object {"pronoun":"<exact word>","referent":"<what it refers to>","quote":"<full latest message text>"}. Otherwise null.' : '',
    '',
    'FACTUAL_UNCERTAINTY: latest message contains a demonstrably incorrect factual claim (wrong location, date, attribution).',
    'RESOLVE_AMBIGUITY: latest message uses a pronoun (it, he, she, they, there, that, this) whose referent is genuinely unclear without prior messages AND history resolves it.',
    'SARCASM_DETECTED: latest message is clearly sarcastic, ironic, or joking — the speaker does not literally mean what they wrote. Include this alongside FACTUAL_UNCERTAINTY when the incorrect claim is intentionally ironic.',
    'Return empty intents for opinions, greetings, and clear statements.',
  ].filter(Boolean).join("\n");

  let parsed: OrchestratorResponse;
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: `CONVERSATION HISTORY:\n${context}\n\nLATEST MESSAGE:\n${latestMessage}` }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    console.log("[AI] Raw response:", raw);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.intents)) parsed.intents = [];
  } catch (e) {
    console.error("[AI] Parse error:", e);
    return;
  }

  console.log("[AI] Intents:", parsed.intents, "Confidence:", parsed.confidence);
  if (parsed.intents.length === 0 || parsed.confidence < 0.7) return;

  const isSarcastic = parsed.intents.includes("SARCASM_DETECTED");

  // Emit results in parallel — DB writes are independent
  await Promise.all([
    parsed.intents.includes("FACTUAL_UNCERTAINTY") && wantFactual && parsed.factual_correction
      ? emitAIMessage(JSON.stringify({ type: "factual", text: parsed.factual_correction, sarcasm: isSarcastic }), roomId, prisma, io)
      : Promise.resolve(),

    parsed.intents.includes("RESOLVE_AMBIGUITY") && wantAmbiguity && parsed.ambiguity
      ? emitAIMessage(JSON.stringify({ type: "ambiguity", ...parsed.ambiguity }), roomId, prisma, io)
      : Promise.resolve(),
  ]);
}
