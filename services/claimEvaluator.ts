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

export interface ClaimRubric {
  verdict: ClaimVerdict;
  reasoning: string;
  relevance: number;  // stored as 0–1 (raw /10)
  evidence: number;   // 1–10
  logic: number;      // 1–10
  impact: number;     // 1–10
  score: number;      // 0–100 composite
}

// Score formula weights (must sum to 100)
export const SCORE_WEIGHTS = {
  accuracy:  35,   // derived from verdict: SUPPORTED=10, CONTESTED=5, REFUTED=0
  relevance: 25,
  evidence:  20,
  logic:     15,
  impact:     5,
};

export function computeClaimScore(verdict: ClaimVerdict, relevanceRaw: number, evidence: number, logic: number, impact: number): number {
  const accuracyPts = verdict === "SUPPORTED" ? 10 : verdict === "CONTESTED" ? 5 : 0;
  const raw =
    accuracyPts  * SCORE_WEIGHTS.accuracy  +
    relevanceRaw * SCORE_WEIGHTS.relevance +
    evidence     * SCORE_WEIGHTS.evidence  +
    logic        * SCORE_WEIGHTS.logic     +
    impact       * SCORE_WEIGHTS.impact;
  return Math.round(raw / 10 * 10) / 10; // divide by 10 → 0–100 scale, one decimal
}

export async function evaluateClaim(
  claimText: string,
  context: string,
  proposition?: string | null,
): Promise<ClaimRubric> {
  const parts: string[] = [];
  if (proposition) parts.push(`DEBATE PROPOSITION: "${proposition}"`);
  parts.push(`CLAIM: "${claimText.slice(0, 500)}"`);
  if (context) parts.push(`\nCONTEXT:\n${context.slice(0, 800)}`);

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 800,
    system: [
      "You are a fact-checking and argument-quality system for a structured debate platform.",
      "Return ONLY valid JSON with exactly these keys:",
      '{ "verdict": "SUPPORTED"|"REFUTED"|"CONTESTED", "reasoning": "<one blunt sentence>", "relevance": <1-10>, "evidence": <1-10>, "logic": <1-10>, "impact": <1-10> }',
      "",
      "VERDICT:",
      "  SUPPORTED — Factually accurate and verifiable.",
      "  REFUTED   — Demonstrably false based on established facts.",
      "  CONTESTED — Opinion, estimate, or has significant counter-evidence.",
      "",
      "DIMENSIONS (rate each 1–10):",
      "  relevance — How directly does this claim argue for or against the proposition? 10 = central, 1 = barely related.",
      "  evidence  — Is the claim backed by data, studies, or expert consensus? 10 = well-evidenced, 1 = no backing.",
      "  logic     — Is the reasoning free of fallacies and logically valid? 10 = airtight, 1 = fundamentally flawed.",
      "  impact    — How much does this point affect the debate outcome? 10 = decisive, 1 = trivial.",
      "",
      "Write reasoning as a raw fact — no preamble. E.g.: 'The Great Wall of China is not visible from space with the naked eye.'",
    ].join("\n"),
    messages: [{ role: "user", content: parts.join("\n") }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in claim evaluation response");
  const parsed = JSON.parse(match[0]);

  const verdict    = parsed.verdict as ClaimVerdict;
  const relevanceR = Math.min(10, Math.max(1, Number(parsed.relevance) || 5));
  const evidence   = Math.min(10, Math.max(1, Number(parsed.evidence)  || 5));
  const logic      = Math.min(10, Math.max(1, Number(parsed.logic)     || 5));
  const impact     = Math.min(10, Math.max(1, Number(parsed.impact)    || 5));
  const score      = computeClaimScore(verdict, relevanceR, evidence, logic, impact);

  return {
    verdict,
    reasoning: parsed.reasoning as string,
    relevance: relevanceR / 10,
    evidence,
    logic,
    impact,
    score,
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

  const row            = rows[0] ?? {};
  const supported      = Number(row.supported        ?? 0);
  const refuted        = Number(row.refuted          ?? 0);
  const contested      = Number(row.contested        ?? 0);
  const total          = Number(row.total            ?? 0);
  const supportedWeight = Number(row.supported_weight ?? 0);
  const score          = Math.round(Math.max(0, supportedWeight * 2 - refuted * 3) * 10) / 10;

  return { userId, score, supported, refuted, contested, total };
}
