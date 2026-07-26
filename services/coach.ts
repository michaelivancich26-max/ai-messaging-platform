import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { SenderType } from "@prisma/client";

const client = new Anthropic();

export interface CoachReport {
  summary: string;
  strengths: string[];
  improvements: string[];
  fallacies: string[];
  nextTime: string;
}

// Coach ONE participant (the requesting user, labelled YOU in the transcript) on
// how THEY argued in a finished match — not who won. Reads only human messages,
// bounded like the summarizer so a long room can't blow up the prompt. Returns
// null when there's too little of the user's own argument to coach, or on a bad
// model response.
export async function coachMatch(params: {
  prisma: PrismaClient;
  roomId: string;
  userId: string;
  topic?: string | null;
}): Promise<CoachReport | null> {
  const { prisma, roomId, userId, topic } = params;

  const MAX_MSGS = 200, MAX_MSG_CHARS = 1500, MAX_TOTAL = 40_000;
  const messages = await prisma.message.findMany({
    // Debate messages only — never spectator chat (a spectator's chatter must not
    // count toward the requester's own messages, nor pollute the transcript).
    where: { roomId, senderType: SenderType.HUMAN, NOT: { channel: { isSpectatorChat: true } } },
    include: { user: true },
    orderBy: { createdAt: "desc" },   // newest first, so the cap keeps recent history
    take: MAX_MSGS,
  });
  const textMsgs = messages.filter((m) => !m.content.startsWith('{"type":"image"'));

  const lines: string[] = [];
  let total = 0, mineKept = 0;
  for (const m of textMsgs) {
    const isMine = m.userId === userId;
    const who = isMine ? "YOU" : (m.user?.username ?? "opponent");
    const body = m.content.length > MAX_MSG_CHARS ? `${m.content.slice(0, MAX_MSG_CHARS)}…` : m.content;
    const line = `[${who}]: ${body}`;
    if (total + line.length > MAX_TOTAL) break;
    lines.push(line);
    total += line.length;
    if (isMine) mineKept++;
  }
  // Guard on what actually survived truncation, so the transcript we send always
  // contains the user's own arguments to coach.
  if (mineKept < 2) return null;
  lines.reverse();   // restore chronological order
  const transcript = lines.join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 700,
    system:
      "You are a sharp, encouraging debate coach reviewing ONE participant (labelled YOU) in a debate transcript. " +
      "Coach how THEY argued — not who won. Be specific and ground each point in what YOU actually said. Good faith and " +
      "changing your mind on evidence are strengths, never weaknesses; never coach toward bad faith or point-scoring. " +
      "Respond with ONLY a JSON object, no prose, matching exactly: " +
      `{"summary": "1-2 sentences on YOUR overall performance", "strengths": ["1-3 short points"], ` +
      `"improvements": ["1-3 short, concrete points"], "fallacies": ["0-3 logical fallacies or rhetorical traps YOU used; [] if none"], ` +
      `"nextTime": "one concrete thing to try next time"}. Keep every string to a single sentence.`,
    messages: [{
      role: "user",
      content: `${topic ? `Proposition: "${topic}"\n\n` : ""}Transcript:\n${transcript}\n\nCoach "YOU". Return only the JSON object.`,
    }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) return null;
  let parsed: any;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch { return null; }

  const arr = (v: any) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).slice(0, 3).map((s: string) => s.trim()) : [];
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    strengths: arr(parsed.strengths),
    improvements: arr(parsed.improvements),
    fallacies: arr(parsed.fallacies),
    nextTime: typeof parsed.nextTime === "string" ? parsed.nextTime.trim() : "",
  };
}
