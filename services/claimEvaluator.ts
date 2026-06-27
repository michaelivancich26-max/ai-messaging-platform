import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type ClaimVerdict = "SUPPORTED" | "REFUTED" | "CONTESTED";

export interface CredScore {
  userId: string;
  score: number;
  supported: number;
  refuted: number;
  contested: number;
  total: number;
}

export async function evaluateClaim(
  claimText: string,
  context: string,
  proposition?: string | null,
): Promise<{ verdict: ClaimVerdict; reasoning: string; relevance: number }> {
  const parts: string[] = [];
  if (proposition) parts.push(`DEBATE PROPOSITION: "${proposition}"`);
  parts.push(`CLAIM: "${claimText.slice(0, 500)}"`);
  if (context) parts.push(`\nCONTEXT:\n${context.slice(0, 800)}`);

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: [
      "You are a fact-checking system for a structured debate platform.",
      'Return ONLY valid JSON: { "verdict": "SUPPORTED" | "REFUTED" | "CONTESTED", "reasoning": "<one blunt sentence>", "relevance": <integer 1-10> }',
      "",
      "SUPPORTED: Factually accurate and verifiable.",
      "REFUTED: Demonstrably false based on established facts.",
      "CONTESTED: Opinion, estimate, or has significant counter-evidence.",
      "",
      "relevance: How central is this claim to the debate proposition? 10 = directly argues for or against the proposition; 1 = tangentially true but barely related to what is actually being debated. If no proposition is given, score relevance relative to the conversation context.",
      "",
      "Write reasoning as a raw fact — no preamble, no 'you are wrong because'. E.g.: 'The Great Wall of China is not visible from space with the naked eye.'",
    ].join("\n"),
    messages: [{ role: "user", content: parts.join("\n") }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in claim evaluation response");
  const parsed = JSON.parse(match[0]);
  const rawRelevance = Math.min(10, Math.max(1, Number(parsed.relevance) || 5));

  return {
    verdict: parsed.verdict as ClaimVerdict,
    reasoning: (parsed.reasoning as string).slice(0, 300),
    relevance: rawRelevance / 10,
  };
}

export async function computeCredibility(userId: string, prisma: any): Promise<CredScore> {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'SUPPORTED') AS supported,
       COUNT(*) FILTER (WHERE status = 'REFUTED')   AS refuted,
       COUNT(*) FILTER (WHERE status = 'CONTESTED') AS contested,
       COUNT(*) FILTER (WHERE status != 'PENDING')  AS total,
       COALESCE(SUM(relevance) FILTER (WHERE status = 'SUPPORTED'), 0) AS supported_weight
     FROM "Claim"
     WHERE "claimantId" = $1`,
    userId,
  );

  const row = rows[0] ?? {};
  const supported        = Number(row.supported        ?? 0);
  const refuted          = Number(row.refuted          ?? 0);
  const contested        = Number(row.contested        ?? 0);
  const total            = Number(row.total            ?? 0);
  const supportedWeight  = Number(row.supported_weight ?? 0);
  const score            = Math.round(Math.max(0, supportedWeight * 2 - refuted * 3) * 10) / 10;

  return { userId, score, supported, refuted, contested, total };
}
