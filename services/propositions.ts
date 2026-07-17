// The belief layer: the claims people take sides on, and the sides they take.
//
// A Proposition is the primitive the site is built on. A topic ("Technology")
// has no opposite, so you cannot match two people against it — only a claim
// does. Rapid used to pair on category and then deal sides with a coin flip,
// which meant nobody argued what they believed. These rows are what let the
// server pair on a real disagreement instead.

import Anthropic from "@anthropic-ai/sdk";
import { TOPIC_CATALOG, categoryLabel } from "./topics";

// Generation is a rare batch job and proposition quality is the ceiling on
// everything downstream, so it does not use the haiku the realtime paths run on.
const GENERATOR_MODEL = "claude-sonnet-5";

export type Stance = "agree" | "disagree" | "skip";

export interface DeckCard {
  id: string;
  text: string;
  categoryId: string;
}

// Anything with $queryRawUnsafe/$executeRawUnsafe — the server's client, or a
// script's own. Typed loosely so this module doesn't pull in a second
// PrismaClient at import time.
type Db = {
  $queryRawUnsafe<T = unknown>(q: string, ...a: unknown[]): Promise<T>;
  $executeRawUnsafe(q: string, ...a: unknown[]): Promise<number>;
};

// ── Reading ──────────────────────────────────────────────────────────────────

// Cards this user hasn't taken a side on yet.
//
// Ordered by how many OTHER people have already taken a side. This is the
// liquidity mechanism, and it's the whole reason the deck works: matching needs
// two users with opposed beliefs on the SAME claim, so a deck of uniformly
// random cards would spread positions thin across the catalog and almost never
// produce an overlap. Showing well-answered claims first concentrates everyone
// on shared ground, and the random tiebreak keeps the head of the deck from
// going stale.
export async function getDeck(db: Db, userId: string, limit = 20): Promise<DeckCard[]> {
  // Clamp to a sane integer BEFORE it reaches the query. This value is
  // interpolated straight into the SQL (LIMIT can't be a bind parameter here),
  // so a NaN or a float from a bad ?limit= would be a syntax error, not a
  // harmless default. Math.min(50, NaN) is NaN, so the guard has to catch NaN
  // explicitly rather than lean on min/max.
  const n = Math.floor(Number(limit));
  const take = Number.isFinite(n) ? Math.max(1, Math.min(50, n)) : 20;
  return db.$queryRawUnsafe<DeckCard[]>(
    `SELECT p."id", p."text", p."categoryId"
     FROM "Proposition" p
     LEFT JOIN (
       SELECT "propositionId", COUNT(*) AS n FROM "UserBelief"
       WHERE stance <> 'skip' GROUP BY "propositionId"
     ) taken ON taken."propositionId" = p."id"
     WHERE p."status" = 'live'
       AND NOT EXISTS (
         SELECT 1 FROM "UserBelief" b
         WHERE b."userId" = $1 AND b."propositionId" = p."id"
       )
     ORDER BY COALESCE(taken.n, 0) DESC, RANDOM()
     LIMIT ${take}`,
    userId,
  );
}

// Positions that count toward the queue gate. Skips deliberately don't —
// they're "no opinion", which is exactly what pairing can't use.
export async function beliefCount(db: Db, userId: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n FROM "UserBelief" WHERE "userId" = $1 AND stance <> 'skip'`,
    userId,
  );
  return Number(rows[0]?.n ?? 0);
}

// ── Writing ──────────────────────────────────────────────────────────────────

// Record a position, and log it if it moved.
//
// The BeliefChange row is the point of the product, so it's written for any
// real movement — a flip (agree -> disagree) and a softening (strongly agree ->
// agree) are both minds changing, and the second is much the commoner. Readers
// filter on fromStance <> toStance when they want flips only. Data not logged
// is data you don't have.
// `log` is false when the user is correcting a mistap in the deck rather than
// revising a view. Both write the same row; only one of them is a mind changing,
// and BeliefChange is only worth anything if it means the second.
export async function recordBelief(
  db: Db,
  userId: string,
  propositionId: string,
  stance: Stance,
  confidence: number | null,
  roomName: string | null = null,
  log = true,
): Promise<{ changed: boolean; flipped: boolean }> {
  const conf = stance === "skip" ? null : confidence;

  const prior = await db.$queryRawUnsafe<{ stance: Stance; confidence: number | null }[]>(
    `SELECT "stance", "confidence" FROM "UserBelief" WHERE "userId" = $1 AND "propositionId" = $2`,
    userId, propositionId,
  );
  const before = prior[0];

  await db.$executeRawUnsafe(
    `INSERT INTO "UserBelief" ("userId","propositionId","stance","confidence")
     VALUES ($1,$2,$3,$4)
     ON CONFLICT ("userId","propositionId")
     DO UPDATE SET "stance" = $3, "confidence" = $4, "updatedAt" = NOW()`,
    userId, propositionId, stance, conf,
  );

  // Arriving at or leaving "no opinion" isn't a mind changing, so it isn't logged.
  const real = !!before && before.stance !== "skip" && stance !== "skip";
  const changed = real && (before.stance !== stance || before.confidence !== conf);
  if (!changed || !log) return { changed: false, flipped: false };

  await db.$executeRawUnsafe(
    `INSERT INTO "BeliefChange"
       ("userId","propositionId","fromStance","toStance","fromConfidence","toConfidence","roomName")
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    userId, propositionId, before!.stance, stance, before!.confidence, conf, roomName,
  );
  return { changed: true, flipped: before!.stance !== stance };
}

// ── Authoring ────────────────────────────────────────────────────────────────

// The 30 entries already in the catalog are propositions in everything but
// name ("Free will is an illusion", not "Philosophy"), so they seed straight in
// as live and the deck has something to show on day one.
export async function seedFromCatalog(db: Db): Promise<number> {
  let n = 0;
  for (const cat of TOPIC_CATALOG) {
    for (const text of cat.topics) {
      const done = await db.$executeRawUnsafe(
        `INSERT INTO "Proposition" ("text","categoryId","status","source")
         VALUES ($1,$2,'live','seed') ON CONFLICT ("text") DO NOTHING`,
        text, cat.id,
      );
      n += done;
    }
  }
  return n;
}

// What separates a claim worth arguing from a claim that just starts a fight.
// This is the product's character, so it is spelled out rather than left to
// taste: the failure mode of "generate divisive claims" is a tribal shibboleth
// that sorts people by team and teaches them nothing.
const GENERATOR_PROMPT = `You write propositions for a debate platform. Users are shown one claim
at a time and asked whether they agree or disagree; the platform then matches
people who took opposite sides so they can argue it out.

A good proposition:
- Is ONE claim, not a bundle. "Nuclear power is safe and cheap" is two claims.
- Is contested among reasonable, informed people. Not a settled fact, not a
  tautology, not a claim only a fringe would deny.
- Splits opinion. Aim for something a room would divide roughly 40/60 on. A
  claim 95% agree with is dead weight in the deck.
- Is arguable from reasons and evidence, NOT from group identity. This is the
  most important rule. "Carbon taxes cut emissions more effectively than
  renewable subsidies" is arguable. "Conservatives don't care about the
  planet" is a shibboleth — it sorts people by team and produces heat instead
  of an argument. Never write the second kind.
- Is concrete enough to attack. "Society is too individualistic" gives a
  debater nothing to grab. "Remote work makes junior employees worse at their
  jobs" does.
- Needs no specialist knowledge. An interested adult should have an intuition
  about it within seconds of reading it.
- Is a declarative statement, never a question. No hedging: write "X is Y",
  not "Some argue X might be Y".

Keep each under 90 characters where you can. Plain language, no jargon, no
rhetorical flourish.`;

// Generate candidate claims for a category. They land as 'draft' — nothing
// reaches the deck without a human passing over it.
export async function generatePropositions(
  categoryId: string,
  count: number,
  existing: string[],
): Promise<string[]> {
  const anthropic = new Anthropic();
  const label = categoryLabel(categoryId);

  const avoid = existing.length
    ? `\n\nThe deck already contains these. Do not repeat them, and do not write
near-duplicates that differ only in wording:\n${existing.map((t) => `- ${t}`).join("\n")}`
    : "";

  const response = await anthropic.messages.create({
    model: GENERATOR_MODEL,
    // Generous on purpose: an array cut off by the token limit has no closing
    // bracket and fails to parse, losing the whole batch. Overshooting costs
    // nothing — output is billed on what's produced, not what's allowed.
    max_tokens: 8000,
    system: GENERATOR_PROMPT,
    messages: [{
      role: "user",
      content: `Write ${count} propositions for the category "${label}".${avoid}

Return ONLY a JSON array of strings. No commentary, no markdown fence.`,
    }],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text).join("").trim();

  // Models sometimes fence the array despite instructions; take the outermost
  // bracket pair rather than trusting the response to be bare JSON.
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) {
    // The tail is what diagnoses this, not the head: an array that opens and
    // never closes was cut off by max_tokens, and only the end of the string
    // shows it. stop_reason says so outright.
    throw new Error(
      `No parseable JSON array (stop_reason=${response.stop_reason}, ${raw.length} chars). ` +
      `Ends: …${raw.slice(-120)}`,
    );
  }

  const parsed = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Response was not an array");
  return parsed.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
}

export async function insertDrafts(db: Db, categoryId: string, texts: string[]): Promise<number> {
  let n = 0;
  for (const text of texts) {
    n += await db.$executeRawUnsafe(
      `INSERT INTO "Proposition" ("text","categoryId","status","source")
       VALUES ($1,$2,'draft','ai') ON CONFLICT ("text") DO NOTHING`,
      text.trim(), categoryId,
    );
  }
  return n;
}
