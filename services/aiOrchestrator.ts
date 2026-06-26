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
  emitRoom?: string;
  aiPersona?: string;
  roomName: string; // actual room slug for DB lookups (roomId key may be a channelId cuid)
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
    relatedEntities?: string[]; // entity names from this scan that this issue is about
  }>;
  entities?: Array<{ name: string; type: "person" | "place" | "topic" | "concept" }>;
  relations?: Array<{ from: string; to: string; label: string }>;
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

async function linkMessageToEntities(
  messageId: string,
  roomId: string,
  relatedEntities: string[],
  prisma: PrismaClient,
) {
  if (!relatedEntities?.length) return;
  for (const label of relatedEntities) {
    const node = await prisma.graphNode.findUnique({
      where: { label_roomId: { label: label.trim().slice(0, 100), roomId } },
    });
    if (!node) continue;
    // Raw upsert — bypasses generated-client relation types which may be stale on Railway
    await prisma.$executeRaw`
      INSERT INTO "GraphNodeMessage" (id, "nodeId", "messageId", "createdAt")
      VALUES (gen_random_uuid()::text, ${node.id}, ${messageId}, NOW())
      ON CONFLICT ("nodeId", "messageId") DO NOTHING
    `;
  }
}

async function streamAndSave(
  payload: Issue,
  roomId: string,
  prisma: PrismaClient,
  io: Server,
  emitRoom: string,
  relatedEntities: string[] = [],
) {
  const room = await prisma.room.findUnique({ where: { name: roomId } });
  if (!room) return;

  if (payload.type === "ambiguity") {
    const msg = await prisma.message.create({
      data: { content: JSON.stringify(payload), senderType: SenderType.AI, roomId: room.id, userId: null },
    });
    await linkMessageToEntities(msg.id, room.id, relatedEntities, prisma);
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
  await linkMessageToEntities(msg.id, room.id, relatedEntities, prisma);

  io.to(emitRoom).emit("aiStreamEnd", { tempId, message: { ...msg, type: "ai_interjection" } });
}

async function runScan(roomId: string, { redis, io, prisma, settings, emitRoom, aiPersona, roomName }: Deps) {
  pendingTimers.delete(roomId);

  const wantFactual = settings.factualCorrection;
  const wantAmbiguity = settings.ambiguityResolution;
  if (!wantFactual && !wantAmbiguity) return;

  const context = await getChatContext(roomId, redis);
  if (!context.trim()) return;

  const personaLine = aiPersona
    ? `You are playing the role of: ${aiPersona}. Stay in character in your corrections and tone, but remain helpful and concise.`
    : "You are a real-time chat assistant monitoring a group conversation.";

  const systemPrompt = [
    personaLine,
    "Scan ALL messages below and return ONLY valid JSON with this exact shape:",
    '{ "issues": [], "entities": [], "relations": [] }',
    "",
    "\"issues\" — each element is one of:",
    wantFactual  ? '- { "type": "FACTUAL_UNCERTAINTY", "sarcasm": boolean, "factual_correction": "<polite 1-2 sentence correction>", "relatedEntities": ["<entity name>", ...] }' : "",
    wantAmbiguity ? '- { "type": "RESOLVE_AMBIGUITY", "ambiguity": { "pronoun": "<exact word>", "referent": "<what it refers to>", "quote": "<full message text>" }, "relatedEntities": ["<entity name>", ...] }' : "",
    "",
    "FACTUAL_UNCERTAINTY: a message contains a demonstrably incorrect factual claim. Set sarcasm:true if intentionally ironic.",
    "RESOLVE_AMBIGUITY: a pronoun whose referent is unclear but resolvable from context.",
    "relatedEntities: names from the \"entities\" array that this specific issue is about. Use exact same names.",
    "",
    "\"entities\" — named things explicitly mentioned: people, places, topics, or concepts. Each:",
    '- { "name": "<1-3 word label>", "type": "person" | "place" | "topic" | "concept" }',
    "Only include clearly named entities. Skip pronouns, generic words, and filler.",
    "",
    "\"relations\" — connections between two entities you extracted:",
    '- { "from": "<entity name>", "to": "<entity name>", "label": "<short verb phrase>" }',
    "Only create relations where both entities appear in \"entities\".",
    "",
    'Return { "issues": [], "entities": [], "relations": [] } if nothing applies.',
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

  // Persist graph entities first so nodes exist when we link corrections to them
  if (parsed.entities?.length || parsed.relations?.length) {
    await persistGraph(roomName, parsed.entities ?? [], parsed.relations ?? [], prisma);
  }

  // Stream issues sequentially so bubbles don't all start at once
  for (const issue of parsed.issues) {
    let payload: Issue | null = null;
    if (issue.type === "FACTUAL_UNCERTAINTY" && wantFactual && issue.factual_correction) {
      payload = { type: "factual", text: issue.factual_correction, sarcasm: issue.sarcasm ?? false };
    } else if (issue.type === "RESOLVE_AMBIGUITY" && wantAmbiguity && issue.ambiguity) {
      payload = { type: "ambiguity", ...issue.ambiguity };
    }
    if (payload) await streamAndSave(payload, roomName, prisma, io, emitRoom ?? roomId, issue.relatedEntities ?? []);
  }
}

async function persistGraph(
  roomName: string,
  entities: NonNullable<AIResponse["entities"]>,
  relations: NonNullable<AIResponse["relations"]>,
  prisma: PrismaClient,
) {
  try {
    const room = await prisma.room.findUnique({ where: { name: roomName } });
    if (!room) return;

    // Upsert nodes (deduped by label+roomId)
    const nodeMap = new Map<string, string>(); // label → id
    for (const e of entities) {
      if (!e.name?.trim()) continue;
      const label = e.name.trim().slice(0, 100);
      const node = await prisma.graphNode.upsert({
        where: { label_roomId: { label, roomId: room.id } },
        update: {},
        create: { label, type: e.type ?? "concept", roomId: room.id },
      });
      nodeMap.set(label.toLowerCase(), node.id);
    }

    // Create edges where both endpoints exist
    for (const r of relations) {
      const fromId = nodeMap.get(r.from?.trim().toLowerCase());
      const toId = nodeMap.get(r.to?.trim().toLowerCase());
      if (!fromId || !toId || fromId === toId) continue;
      // Skip duplicate edges (same from/to/label in same room)
      const exists = await prisma.graphEdge.findFirst({
        where: { fromNodeId: fromId, toNodeId: toId, label: r.label.slice(0, 100), roomId: room.id },
      });
      if (!exists) {
        await prisma.graphEdge.create({
          data: { fromNodeId: fromId, toNodeId: toId, label: r.label.slice(0, 100), roomId: room.id },
        });
      }
    }

    console.log(`[Graph] Persisted ${nodeMap.size} nodes, ${relations.length} relation(s) for room ${roomName}`);
  } catch (err) {
    console.error("[Graph] Persist error:", err);
  }
}

export function scheduleAI(roomId: string, deps: Deps) {
  if (pendingTimers.has(roomId)) return;
  const timer = setTimeout(() => runScan(roomId, deps), SCAN_INTERVAL_MS);
  pendingTimers.set(roomId, timer);
}
