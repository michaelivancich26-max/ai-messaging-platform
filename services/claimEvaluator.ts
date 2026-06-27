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
): Promise<{ verdict: ClaimVerdict; reasoning: string }> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    system: [
      "You are a fact-checking system. Evaluate the claim below.",
      'Return ONLY valid JSON: { "verdict": "SUPPORTED" | "REFUTED" | "CONTESTED", "reasoning": "<one blunt sentence — state the fact, no preamble, no hedging>" }',
      "",
      "SUPPORTED: Factually accurate and verifiable.",
      "REFUTED: Demonstrably false based on established facts.",
      "CONTESTED: Opinion, estimate, or has significant counter-evidence — not clearly true or false.",
      "",
      "Write the reasoning as a raw fact. E.g.: 'The Great Wall of China is not visible from space with the naked eye.' — not 'You are wrong because...'",
    ].join("\n"),
    messages: [
      { role: "user", content: `CLAIM: "${claimText.slice(0, 500)}"${context ? `\n\nCHAT CONTEXT:\n${context.slice(0, 800)}` : ""}` },
    ],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in claim evaluation response");
  const parsed = JSON.parse(match[0]);
  return {
    verdict: parsed.verdict as ClaimVerdict,
    reasoning: (parsed.reasoning as string).slice(0, 300),
  };
}

export async function computeCredibility(userId: string, prisma: any): Promise<CredScore> {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'SUPPORTED') AS supported,
       COUNT(*) FILTER (WHERE status = 'REFUTED')   AS refuted,
       COUNT(*) FILTER (WHERE status = 'CONTESTED') AS contested,
       COUNT(*) FILTER (WHERE status != 'PENDING')  AS total
     FROM "Claim"
     WHERE "claimantId" = $1`,
    userId,
  );

  const row = rows[0] ?? {};
  const supported = Number(row.supported ?? 0);
  const refuted   = Number(row.refuted   ?? 0);
  const contested = Number(row.contested ?? 0);
  const total     = Number(row.total     ?? 0);
  const score     = Math.max(0, supported * 2 - refuted * 3);

  return { userId, score, supported, refuted, contested, total };
}
