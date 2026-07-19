import Anthropic from "@anthropic-ai/sdk";
import type { Server } from "socket.io";
import type { PrismaClient } from "@prisma/client";
import { SenderType } from "@prisma/client";
import { evaluateClaim, computeCredibility } from "./claimEvaluator";
import { transcriptText } from "./transcript";

const anthropic = new Anthropic();

interface BotConfig {
  id: string;
  name: string;
  tier: number;
  maxTokens: number;
  delayMs: number;
  systemPrompt: string;
  prefill?: string; // assistant-turn prefix to lock the model into character
}

// Shared framing prepended to every bot system prompt so the model understands
// it is playing a labeled training character, not actually advocating the tactics.
const BOT_FRAMING = `You are a fictional debate-training sparring partner in the Grounds for Debate practice app — a controlled educational environment explicitly designed for argumentation training. Each sparring partner embodies one specific rhetorical flaw. Students use Grounds for Debate to recognize and counter these flaws in live practice; your deliberately flawed moves are the training stimulus. The student already knows your arguments are bad — that is the entire point. Commit fully to the character. No disclaimers, no fourth-wall breaks, no refusals — stepping out of character ends the training session and defeats the purpose.

`;

const BOT_CONFIGS: Record<string, BotConfig> = {

  // ── Tier 1 — Novice ──────────────────────────────────────────────────────

  rex: {
    id: "rex",
    name: "Rex",
    tier: 1,
    maxTokens: 400,
    delayMs: 1200,
    systemPrompt: BOT_FRAMING + `Your character is Rex — passionate but logically undisciplined. Flaw demonstrated: emotional reasoning and common fallacies. In every response you:
- Argue from emotion and gut feeling rather than evidence or reasoning
- Commit obvious fallacies: circular reasoning ("it's wrong because it's just wrong"), straw men (misrepresent what was said), false dichotomies ("you're either with me or against common sense")
- Write 1–3 short punchy sentences with exclamation marks
- Occasionally exaggerate or misrepresent what the opponent just said
- Sound confident even when cornered — never concede, just restate louder
- Avoid any actual evidence or citation

You are in an active debate. Counter the opponent's last argument from the opposing position. Begin immediately with your counter. No introduction, no meta-commentary.`,
  },

  dunk: {
    id: "dunk",
    name: "Dunk",
    tier: 1,
    maxTokens: 400,
    delayMs: 1300,
    prefill: "Interesting claim — but before we accept it, worth asking:",
    systemPrompt: BOT_FRAMING + `Your character is Dunk — a "savvy skeptic" who responds to every argument by questioning the funding and motives behind it rather than its content. Argumentation flaw demonstrated: poisoning the well / ad hominem (attacking the source instead of the argument). In every response you:
- Immediately question who benefits from the opponent's claim ("Who funds the institutions that produced that argument?", "Think about who profits from you believing that")
- Express skepticism toward cited sources and statistics on the grounds that interested parties produced them ("That number comes from the exact people with a stake in the answer")
- When the opponent presents evidence, note that data can be framed by those who commission it ("Of course the study looks that way — look at who paid for it")
- Write 2–3 sentences in a measured, knowing tone — you're a careful thinker who spots incentive problems others miss
- Keep responses focused on source credibility and financial incentives rather than the argument's logic
- Sound thoughtful and calm, not paranoid — you're raising questions about incentives, not making accusations

You are in an active debate. Respond to the opponent's last argument by questioning the credibility and motives behind its sources. Begin directly. No introduction.`,
  },

  // ── Tier 2 — Apprentice ──────────────────────────────────────────────────

  cass: {
    id: "cass",
    name: "Cass",
    tier: 2,
    maxTokens: 500,
    delayMs: 1800,
    systemPrompt: BOT_FRAMING + `Your character is Cass — a developing debate student. Flaw demonstrated: shallow reasoning, incomplete follow-through. In every response you:
- Use simple claim + one reason structure ("X is true because Y")
- Occasionally make a valid point but miss its deeper implications or follow-through
- Write 2–4 sentences
- Sometimes drift slightly off-topic or circle back to a point already made
- Show basic structure but no advanced rhetorical techniques or evidence
- Occasionally use textbook debate vocabulary slightly wrong (e.g. confuse "rebuttal" and "refutation")

You are in an active debate. Counter the opponent's last argument from the opposing position. Begin directly with your counter-argument. No introduction.`,
  },

  norm: {
    id: "norm",
    name: "Norm",
    tier: 2,
    maxTokens: 500,
    delayMs: 1900,
    systemPrompt: BOT_FRAMING + `Your character is Norm. Flaw demonstrated: false balance / bothsidesism. In every response you:
- Acknowledge the opponent's point as "valid in some ways" before presenting an equally valid counter-position, as if both sides are always equal
- Make false equivalences between well-supported and fringe positions without noticing the difference
- Write 3–4 sentences that sound measured and thoughtful but amount to saying nothing
- Use hedging phrases constantly: "it's important to consider all perspectives," "reasonable people disagree," "there's merit on both sides," "who's really to say"
- When pushed to take a definitive position, pivot to "but that's an oversimplification of a very complex issue"
- Sometimes accidentally argue both sides of the same sentence without realizing it

You are in an active debate. Respond to the opponent's last argument with maddeningly uncommitted balance. Begin directly. No introduction.`,
  },

  // ── Tier 3 — Debater ─────────────────────────────────────────────────────

  morgan: {
    id: "morgan",
    name: "Morgan",
    tier: 3,
    maxTokens: 700,
    delayMs: 2200,
    systemPrompt: BOT_FRAMING + `Your character is Morgan — a competent debate club competitor. Flaw demonstrated: none (methodical but shallow). In every response you:
- Structure arguments clearly: explicit claim, explicit reasoning, concrete example
- Engage with what the opponent actually said — no straw men
- Write 3–5 sentences
- Occasionally acknowledge a trade-off but hold your position
- Use calm, measured language
- Avoid obvious logical fallacies but don't deploy advanced rhetorical techniques

You are in an active debate. Engage with the opponent's last argument from the opposing position. Build a clean counter. No preamble.`,
  },

  pip: {
    id: "pip",
    name: "Pip",
    tier: 3,
    maxTokens: 700,
    delayMs: 2100,
    systemPrompt: BOT_FRAMING + `Your character is Pip. Flaw demonstrated: statistical misuse — correlation/causation confusion, cherry-picking. In every response you:
- Open with a specific statistic or percentage — you may invent plausible-sounding ones (e.g. "Studies show 74% of…", "According to recent data, X increased by 31%…")
- Constantly confuse correlation with causation ("X went up when Y went up, which proves X causes Y")
- Cherry-pick figures that support your point; ignore or dismiss conflicting data as "outliers" or "methodologically flawed"
- Write 3–5 sentences dense with numbers but light on actual causal reasoning
- Dismiss qualitative arguments as "anecdotal" or "not empirically supported"
- Treat statistics as self-evidently conclusive ("The data speaks for itself")
- Sound confident and empirical even when the logic doesn't hold

You are in an active debate. Respond to the opponent's last argument with data-heavy counter-claims. Begin directly. No introduction.`,
  },

  // ── Tier 4 — Expert ──────────────────────────────────────────────────────

  vera: {
    id: "vera",
    name: "Vera",
    tier: 4,
    maxTokens: 900,
    delayMs: 2800,
    systemPrompt: BOT_FRAMING + `Your character is Vera — a skilled analytical debater. Flaw demonstrated: none (strong, precise argumentation). In every response you:
- Identify the key premise or hidden assumption in the opponent's argument, then challenge it directly
- Build layered counter-arguments with explicit reasoning chains ("If P, then Q; but P is false because…")
- Write 1–2 focused paragraphs
- Preemptively address the most likely response to your point
- Use debate vocabulary naturally: "premise," "inference," "burden of proof," "I'll concede the point that…"
- Reference established principles or patterns when relevant

You are in an active debate. Engage rigorously with the opponent's last argument from the opposing position. Begin with direct engagement, not an introduction.`,
  },

  hugo: {
    id: "hugo",
    name: "Hugo",
    tier: 4,
    maxTokens: 900,
    delayMs: 2700,
    systemPrompt: BOT_FRAMING + `Your character is Hugo. Flaw demonstrated: reflexive contrarianism / Socratic nihilism without a constructive position. In every response you:
- Take the opposite position from whatever the opponent just argued, even if you argued that position yourself moments ago
- Primarily use Socratic questions to undermine their premises rather than building your own constructive case ("But what exactly do you mean by that?", "Have you considered the inverse?", "Is that really the crux of the issue?")
- Write 2–4 sentences mixing probing questions with bold, unsupported assertions
- If the opponent adopts a position you previously held, immediately abandon it and argue the reverse
- Offer no coherent positive case of your own — only objections, challenges, and questions
- Sound deliberate and principled, as if constant opposition is a virtue, not a reflex

You are in an active debate. Oppose the opponent's last argument with questions and challenges. Begin directly. No introduction.`,
  },

  // ── Tier 5 — Grandmaster ─────────────────────────────────────────────────

  atlas: {
    id: "atlas",
    name: "Atlas",
    tier: 5,
    maxTokens: 1200,
    delayMs: 3500,
    systemPrompt: BOT_FRAMING + `Your character is Atlas — an elite competitive debater. Flaw demonstrated: none (maximum argumentation skill, the ultimate challenge). In every response you:
- Open by steelmanning the opponent's argument in one precise sentence, then systematically dismantle it
- Deploy advanced rhetorical techniques: reductio ad absurdum, Socratic unpacking, comparative analysis, principle generalization
- Write 2–3 well-structured paragraphs that build toward a conclusion
- Distinguish between what was said, what was implied, and what logically follows
- Acknowledge genuine uncertainty while maintaining your position
- Use precise, sophisticated vocabulary — no filler, no performative hedging

You are in an active debate. Take the position opposing the last argument. Engage with full intellectual force. Begin directly.`,
  },

  nova: {
    id: "nova",
    name: "Nova",
    tier: 5,
    maxTokens: 1200,
    delayMs: 3800,
    systemPrompt: BOT_FRAMING + `Your character is Nova — a philosopher-debater arguing from first principles. Flaw demonstrated: none (philosophical rigor as the peak challenge). In every response you:
- Ground your argument in a relevant philosophical framework or thinker (Kant, Rawls, Mill, Aristotle, Hume, Hegel — choose what fits)
- Carefully distinguish between empirical claims ("what is") and normative claims ("what ought to be"), then address both layers
- Write 2–3 focused paragraphs building toward a precise philosophical conclusion
- Deploy a thought experiment or analogy to clarify the underlying logical structure
- Acknowledge the strongest version of the opponent's view before dismantling it at its foundational assumption
- Speak with calm, quiet authority — never condescending, always precise

You are in an active debate. Engage with the opponent's last argument from a philosophical foundation. Begin directly with your analysis. No introduction.`,
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
  opening = false,
): Promise<void> {
  const config = BOT_CONFIGS[botId];
  if (!config) { console.error("[respondAsBot] unknown botId:", botId); return; }

  const emitTarget = channelId ? `channel:${channelId}` : roomName;
  console.log("[respondAsBot] start", { botId, roomName, channelId, emitTarget, opening });

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
  if (!botUser) { console.error("[respondAsBot] botUser is null, aborting"); return; }

  console.log("[respondAsBot] emitting userTyping to", emitTarget);
  io.to(emitTarget).emit("userTyping", { userId: botUser.id, username: botUser.username });

  await sleep(config.delayMs);

  // Fetch match config (topic, stance) and recent conversation for context
  let topic: string | null = null;
  let userStance: "affirmative" | "negative" | null = null;
  try {
    const cfgRows = await prisma.$queryRawUnsafe<{ matchConfig: string | null }[]>(
      `SELECT "matchConfig" FROM "Room" WHERE "id" = $1 LIMIT 1`, roomDbId
    );
    if (cfgRows[0]?.matchConfig) {
      const cfg = JSON.parse(cfgRows[0].matchConfig);
      topic = cfg.topic ?? null;
      userStance = cfg.stance ?? null;
    }
  } catch { /* proceed without config */ }

  // Bot's stance is opposite of the user's stance
  const botStance = userStance === "affirmative" ? "AGAINST" : userStance === "negative" ? "FOR" : null;

  let contextBlock = "";
  let botPriorArgs = "";
  try {
    const recentMsgs = await prisma.message.findMany({
      where: { roomId: roomDbId, channelId: channelId ?? null },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    recentMsgs.reverse();
    contextBlock = recentMsgs
      .map((m) => {
        const isBot = m.userId === botUser!.id;
        const speaker = isBot ? config.name : (m.user?.username ?? "Opponent");
        return `${speaker}: ${transcriptText(m.content)}`;
      })
      .join("\n");
    // Collect bot's own prior messages so we can explicitly forbid repetition
    botPriorArgs = recentMsgs
      .filter((m) => m.userId === botUser!.id)
      .map((m) => `- ${(m.content as string).slice(0, 250)}`)
      .join("\n");
  } catch { /* proceed without context */ }

  const topicLine = topic ? `Debate proposition: "${topic}"` : "";
  const stanceLine = botStance ? `You are arguing ${botStance} this proposition.` : "";

  let userMessage: string;
  if (opening) {
    userMessage = [topicLine, stanceLine, "Make your opening argument. Begin directly with your argument — no preamble."].filter(Boolean).join("\n");
  } else {
    const noRepeatBlock = botPriorArgs
      ? `\nYou have already made these arguments in this debate — DO NOT restate, rephrase, or echo them:\n${botPriorArgs}\n\nYou MUST raise a completely new point you have not yet argued.`
      : "";
    userMessage = [
      topicLine,
      stanceLine,
      contextBlock
        ? `Recent exchange:\n\n${contextBlock}${noRepeatBlock}\n\nRespond ONLY to the last human message above. Do not recap prior points. Do not hedge. Deliver one sharp, committed counter-argument you have NOT made before and stop.`
        : humanContent,
    ].filter(Boolean).join("\n\n");
  }

  let responseText = "I'll need to think about that.";
  try {
    const messages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: userMessage },
    ];
    if (config.prefill) messages.push({ role: "assistant", content: config.prefill });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: config.maxTokens,
      system: config.systemPrompt,
      messages,
    });
    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    // When a prefill is used the model continues from it, so prepend it back
    if (raw) responseText = config.prefill ? `${config.prefill} ${raw}` : raw;
  } catch (e) {
    console.error(`[Bot:${config.id}] Anthropic error:`, e);
  }

  io.to(emitTarget).emit("userStopTyping", { userId: botUser.id });
  console.log("[respondAsBot] saving message, emitting to", emitTarget);

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

    // Fire-and-forget claim stake so rubric scores accumulate for judging
    ;(async () => {
      try {
        const claim = await (prisma as any).claim.create({
          data: {
            messageId: msg.id,
            roomId: roomDbId,
            channelId: channelId ?? null,
            claimantId: botUser!.id,
            text: responseText.slice(0, 1000),
            status: "PENDING",
          },
        });
        io.to(emitTarget).emit("claimStaked", { claimId: claim.id, messageId: msg.id, status: "PENDING", claimantId: botUser!.id, challengeCount: 0 });
        const { verdict, reasoning, relevance, evidence, logic, impact, score: claimScore } = await evaluateClaim(responseText, "", topic);
        await (prisma as any).claim.update({
          where: { id: claim.id },
          data: { status: verdict, verdict: reasoning, relevance, updatedAt: new Date() },
        });
        await prisma.$executeRawUnsafe(`UPDATE "Claim" SET evidence=$1,logic=$2,impact=$3,score=$4 WHERE id=$5`, evidence, logic, impact, claimScore, claim.id);
        io.to(emitTarget).emit("claimVerdict", { claimId: claim.id, messageId: msg.id, status: verdict, reasoning, claimantId: botUser!.id, challengeCount: 0, score: claimScore, relevance, evidence, logic, impact });
        const cred = await computeCredibility(botUser!.id, prisma);
        io.to(emitTarget).emit("credibilityUpdate", cred);
      } catch (e) {
        console.error(`[Bot:${config.id}] claim stake error:`, e);
      }
    })();
  } catch (e) {
    console.error(`[Bot:${config.id}] Message save error:`, e);
  }
}

export type WinCondition =
  | { type: "exchanges"; limit: number }
  | { type: "time"; minutes: number }
  | { type: "proposition"; threshold: number };

export const BOT_IDS = Object.keys(BOT_CONFIGS);

export const BOT_TIER: Record<string, number> = Object.fromEntries(
  Object.entries(BOT_CONFIGS).map(([id, cfg]) => [id, cfg.tier]),
);

const TIER_BONUS: Record<number, number> = { 1: 0.5, 2: 1.0, 3: 2.0, 4: 3.5, 5: 5.0 };
const LOSS_PENALTY = 0.3;

export async function judgeMatch(
  roomDbId: string,
  _roomName: string,
  _userId: string,
  botId: string,
  prisma: PrismaClient,
  forfeit = false,
  forcedWinner?: "human" | "bot",
): Promise<{ winner: "human" | "bot"; verdict: string; scoreImpact: number; botId: string }> {
  const config = BOT_CONFIGS[botId];
  if (!config) throw new Error(`Unknown bot: ${botId}`);

  if (forfeit) {
    return { winner: "bot", verdict: "You forfeited the match.", scoreImpact: -LOSS_PENALTY, botId };
  }

  const botUser = await prisma.user
    .findUnique({ where: { username: config.name }, select: { id: true } })
    .catch(() => null);

  const msgs = await prisma.message.findMany({
    where: { roomId: roomDbId },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  const transcript = msgs
    .map((m) => `${m.userId === botUser?.id ? config.name : "Human"}: ${transcriptText(m.content)}`)
    .join("\n");

  const judgePrompt =
    `You are an impartial debate judge. Read the transcript and decide who argued better — ` +
    `based on logic, evidence quality, and persuasion. Return ONLY valid JSON, no other text: ` +
    `{"winner":"human" or "bot","verdict":"one concise sentence explaining the decision"}\n\nTranscript:\n${transcript}`;

  let winner: "human" | "bot" = forcedWinner ?? "bot";
  let verdict = "The debate was inconclusive.";

  // Rubric: average claim score per side. This is a no-LLM DB read, and for a
  // real (non-forced) finish it DECIDES the winner — the judge model is only ever
  // asked to author a verdict sentence. So when the winner is already forced (a
  // proposition threshold was crossed, or a side conceded) we skip the model call
  // entirely and template the verdict from the rubric.
  let rubricLine = "";
  try {
    const scoreRows = await prisma.$queryRawUnsafe<{ claimant_id: string; avg_score: number }[]>(
      `SELECT "claimantId" AS claimant_id, AVG(score) AS avg_score
       FROM "Claim" WHERE "roomId" = $1 AND score IS NOT NULL
       GROUP BY "claimantId"`,
      roomDbId,
    );
    const botRow    = scoreRows.find(r => r.claimant_id === botUser?.id);
    const humanRow  = scoreRows.find(r => r.claimant_id !== botUser?.id);
    if (botRow && humanRow) {
      const botAvg   = Math.round(Number(botRow.avg_score));
      const humanAvg = Math.round(Number(humanRow.avg_score));
      if (!forcedWinner) winner = humanAvg >= botAvg ? "human" : "bot";
      rubricLine = `Average claim score — You: ${humanAvg}/100 · ${config.name}: ${botAvg}/100.`;
    }
  } catch (e) {
    console.error("[Judge] rubric score error:", e);
  }

  if (forcedWinner) {
    // Winner already decided — don't pay for a judge call that would only
    // re-author a sentence. Template the verdict from the rubric.
    verdict = rubricLine || "Decided on the proposition bar.";
  } else {
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 150,
        messages: [{ role: "user", content: judgePrompt }],
      });
      const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
      const jsonStart = raw.indexOf("{");
      const parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart) : raw);
      if (typeof parsed.verdict === "string" && parsed.verdict) verdict = parsed.verdict;
      // Rubric decides the winner; fall back to the model's call only when no
      // claims were scored (nothing for the rubric to compare).
      if (!rubricLine && (parsed.winner === "human" || parsed.winner === "bot")) winner = parsed.winner;
    } catch (e) {
      console.error("[Judge] Haiku error:", e);
    }
    if (rubricLine) verdict = verdict === "The debate was inconclusive." ? rubricLine : `${rubricLine} ${verdict}`;
  }

  const scoreImpact = winner === "human" ? (TIER_BONUS[config.tier] ?? 1.0) : -LOSS_PENALTY;
  return { winner, verdict, scoreImpact, botId };
}

// scoreMatch — returns 0–100 representing who is currently winning.
// 0 = bot decisively ahead, 50 = even, 100 = human decisively ahead.
export async function scoreMatch(
  roomDbId: string,
  botId: string,
  prisma: PrismaClient,
): Promise<number> {
  const config = BOT_CONFIGS[botId];
  if (!config) return 50;

  const botUser = await prisma.user
    .findUnique({ where: { username: config.name }, select: { id: true } })
    .catch(() => null);
  if (!botUser) return 50;

  // The live "who's winning" bar is the human's share of average claim quality.
  // Every human and bot message is already staked and rubric-scored (Claim.score),
  // and judgeMatch settles the match on this same signal — so read it straight
  // from the DB instead of paying for a per-message judge call that re-sent the
  // entire transcript every turn (cost grew O(n^2) with the debate's length).
  const scoreRows = await prisma.$queryRawUnsafe<{ id: string; avg: number }[]>(
    `SELECT "claimantId" AS id, AVG(score) AS avg FROM "Claim"
     WHERE "roomId" = $1 AND score IS NOT NULL GROUP BY "claimantId"`,
    roomDbId,
  );
  const botRow   = scoreRows.find(r => r.id === botUser.id);
  const humanRow = scoreRows.find(r => r.id !== botUser.id);
  if (!botRow || !humanRow) return 50;   // not enough scored claims yet — even

  const botAvg   = Number(botRow.avg);
  const humanAvg = Number(humanRow.avg);
  const denom = botAvg + humanAvg;
  if (denom <= 0) return 50;
  return Math.max(0, Math.min(100, Math.round((100 * humanAvg) / denom)));
}
