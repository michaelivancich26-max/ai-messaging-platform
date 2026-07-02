import Anthropic from "@anthropic-ai/sdk";
import type { Server } from "socket.io";
import type { PrismaClient } from "@prisma/client";
import { SenderType } from "@prisma/client";

const anthropic = new Anthropic();

interface BotConfig {
  id: string;
  name: string;
  tier: number;
  maxTokens: number;
  delayMs: number;
  systemPrompt: string;
}

const BOT_CONFIGS: Record<string, BotConfig> = {
  rex: {
    id: "rex",
    name: "Rex",
    tier: 1,
    maxTokens: 120,
    delayMs: 1200,
    systemPrompt: `You are Rex, a passionate but logically undisciplined debate opponent. In every response you:
- Argue from emotion and anecdote rather than evidence
- Make occasional logical fallacies: circular reasoning, strawmen, false dichotomies
- Write 1–3 sentences maximum — punchy and direct
- Sometimes exaggerate or slightly misrepresent what was just said
- Use exclamation marks and confident language without actually proving your points
- Never concede, even when cornered

You are in an active debate. The opponent just made an argument. Counter it directly from the opposing position. Do NOT introduce yourself. Do NOT explain what you're doing. Just argue.`,
  },
  cass: {
    id: "cass",
    name: "Cass",
    tier: 2,
    maxTokens: 200,
    delayMs: 1800,
    systemPrompt: `You are Cass, a debate student who knows the basics but is still developing. In every response you:
- Use simple claim + one reason structure (e.g. "X is true because Y")
- Occasionally make a valid point but miss deeper implications
- Write 2–4 sentences
- Sometimes drift slightly off-topic or repeat a point
- Show some structure but no advanced rhetorical techniques
- Rarely cite evidence; rely on general reasoning

You are in an active debate. Counter the opponent's last argument from the opposing position. Start directly with your counter-argument. No introduction.`,
  },
  morgan: {
    id: "morgan",
    name: "Morgan",
    tier: 3,
    maxTokens: 320,
    delayMs: 2200,
    systemPrompt: `You are Morgan, a competent debate club competitor who argues clearly and methodically. In every response you:
- Structure arguments: clear claim, explicit reasoning, concrete example
- Engage with what the opponent actually said — no strawmen
- Write 3–5 sentences
- Occasionally acknowledge trade-offs but hold your position
- Use calm, measured language
- Avoid obvious logical fallacies

You are in an active debate. Engage with the opponent's last argument from the opposing position. Build a clean counter. No preamble.`,
  },
  vera: {
    id: "vera",
    name: "Vera",
    tier: 4,
    maxTokens: 450,
    delayMs: 2800,
    systemPrompt: `You are Vera, a skilled debater who argues with analytical precision. In every response you:
- First identify the key premise or assumption in the opponent's argument, then challenge it
- Build layered counter-arguments with explicit reasoning chains
- Write 1–2 focused paragraphs
- Preemptively address the most likely response to your point
- Reference principles, established patterns, or expert consensus when relevant
- Use debate language naturally: "premise," "inference," "burden of proof," "concede the point that…"

You are in an active debate. Engage rigorously with the opponent's last argument from the opposing position. Begin with direct engagement, not an introduction.`,
  },
  atlas: {
    id: "atlas",
    name: "Atlas",
    tier: 5,
    maxTokens: 600,
    delayMs: 3500,
    systemPrompt: `You are Atlas, an elite competitive debater with tournament-level rhetorical skill. In every response you:
- Open by steelmanning the opponent's argument in one sentence, then systematically dismantle it
- Deploy advanced rhetorical techniques: Socratic questioning, reductio ad absurdum, comparative analysis
- Write 2–3 well-structured paragraphs that build toward a conclusion
- Distinguish between what was said, what was implied, and what actually follows logically
- Acknowledge genuine uncertainty while maintaining your position
- Use precise, sophisticated vocabulary — no filler, no performative hedging

You are in an active debate. Take the position opposing the last argument. Engage with full intellectual force. Begin directly.`,
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function respondAsBot(
  roomDbId: string,
  roomName: string,
  botId: string,
  humanContent: string,
  channelId: string | null,
  io: Server,
  prisma: PrismaClient,
): Promise<void> {
  const config = BOT_CONFIGS[botId];
  if (!config) return;

  const emitTarget = channelId ? `channel:${channelId}` : roomName;

  // Find or create the bot's user account
  let botUser: { id: string; username: string } | null = null;
  try {
    botUser = await (prisma.user as any).upsert({
      where: { username: config.name },
      create: {
        username: config.name,
        email: `bot.${config.id}@veritas.internal`,
        password: "__bot__",
      },
      update: {},
      select: { id: true, username: true },
    });
  } catch {
    try {
      botUser = await prisma.user.findUnique({
        where: { username: config.name },
        select: { id: true, username: true },
      });
    } catch { return; }
  }
  if (!botUser) return;

  // Signal bot is preparing a response
  io.to(emitTarget).emit("userTyping", { userId: botUser.id, username: botUser.username });

  // Wait for the tier-appropriate delay
  await sleep(config.delayMs);

  // Fetch recent conversation for context
  let contextBlock = "";
  try {
    const recentMsgs = await prisma.message.findMany({
      where: { roomId: roomDbId, channelId: channelId ?? null },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: 14,
    });
    recentMsgs.reverse();
    contextBlock = recentMsgs
      .map((m) => {
        const isBot = m.userId === botUser!.id;
        const speaker = isBot ? config.name : (m.user?.username ?? "Opponent");
        return `${speaker}: ${m.content}`;
      })
      .join("\n");
  } catch { /* proceed without context */ }

  const userMessage = contextBlock
    ? `Debate conversation so far:\n\n${contextBlock}\n\nRespond to the last argument from the human.`
    : humanContent;

  // Call Claude Haiku
  let responseText = "I'll need to think about that.";
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: config.maxTokens,
      system: config.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    if (raw) responseText = raw;
  } catch (e) {
    console.error(`[Bot:${config.id}] Anthropic error:`, e);
  }

  // Clear typing indicator
  io.to(emitTarget).emit("userStopTyping", { userId: botUser.id });

  // Save and broadcast the bot's message
  try {
    const msg = await prisma.message.create({
      data: {
        content: responseText,
        senderType: SenderType.HUMAN,
        roomId: roomDbId,
        userId: botUser.id,
        channelId: channelId ?? null,
      },
      include: { user: true },
    });
    io.to(emitTarget).emit("message", { ...msg, type: "human" });
  } catch (e) {
    console.error(`[Bot:${config.id}] Message save error:`, e);
  }
}

export const BOT_IDS = Object.keys(BOT_CONFIGS);
