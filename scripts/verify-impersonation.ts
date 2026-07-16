// Can a signed-in user act as someone ELSE by naming them in the request?
//
// The /api gate only proves you are *somebody*. On its own it leaves the
// original hole half-open: every route used to read `userId` out of the query
// or body, so any authenticated caller could still name a victim and act as
// them. This asserts the other half — that identity comes from the token and
// the body is ignored.
//
// Needs the server running.
//
//   npm run auth:impersonation

import { verifySessionToken } from "../services/auth";
import { PrismaClient } from "@prisma/client";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { encode } = require("../client/node_modules/next-auth/jwt");

const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const ATTACKER = "attacker-probe-id";
const VICTIM = "victim-probe-id";

const prisma = new PrismaClient();

// Both ends, not just the end. This asserts an exact position count, so a row
// left behind by a previous run doesn't just linger — it fails the next run for
// the wrong reason and sends you hunting a bug that isn't there.
async function clean() {
  await prisma.$executeRawUnsafe(`DELETE FROM "UserBelief" WHERE "userId" = ANY($1::text[])`, [ATTACKER, VICTIM]);
  await prisma.$executeRawUnsafe(`DELETE FROM "BeliefChange" WHERE "userId" = ANY($1::text[])`, [ATTACKER, VICTIM]);
}

async function main() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) { console.error("FAIL: NEXTAUTH_SECRET not set"); process.exit(1); }

  await clean();

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  };

  const token = await encode({
    token: { id: ATTACKER, username: "attacker", isAdmin: false },
    secret, maxAge: 300,
  });
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Sanity: the token works at all.
  const mine = await fetch(`${SERVER}/api/deck?limit=3`, { headers: auth });
  check("authenticated request succeeds", mine.status === 200, `HTTP ${mine.status}`);
  const deck = await mine.json();
  const card = deck?.cards?.[0]?.id;
  if (!card) { console.error("FAIL: no live propositions to test against"); process.exit(1); }

  // THE ATTACK: signed in as ATTACKER, claim to be VICTIM in the query string.
  const q = await fetch(`${SERVER}/api/deck?userId=${VICTIM}&limit=3`, { headers: auth });
  check("query-string userId does not change identity", q.status === 200, `HTTP ${q.status}`);

  // THE ATTACK, in a body: write a belief while claiming to be VICTIM. The row
  // must land on the attacker — who actually sent it — not the victim.
  const w = await fetch(`${SERVER}/api/deck/position`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ userId: VICTIM, propositionId: card, stance: "agree", confidence: 2 }),
  });
  check("body userId accepted without error", w.status === 200, `HTTP ${w.status}`);

  // Read it back as the attacker: if the write was correctly attributed to the
  // attacker, that card is now absent from THEIR deck.
  const after = await fetch(`${SERVER}/api/deck?limit=50`, { headers: auth });
  const d2 = await after.json();
  const gone = !d2.cards.some((c: { id: string }) => c.id === card);
  check("the write landed on the CALLER, not the named victim", gone && d2.positioned === 1,
    `positioned=${d2.positioned}, card gone=${gone}`);

  // And an unauthenticated request is refused outright.
  const anon = await fetch(`${SERVER}/api/deck?userId=${VICTIM}`);
  check("unauthenticated request rejected", anon.status === 401, `HTTP ${anon.status}`);

  // Proving the write landed means a real row exists; take it back out.
  await clean();
  const left = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM "UserBelief" WHERE "userId" = ANY($1::text[])`, [ATTACKER, VICTIM]);
  check("probe data removed", left[0].n === 0, `${left[0].n} left`);
  await prisma.$disconnect();

  console.log(failures ? `\n${failures} FAILED` : "\nall passed — identity comes from the token only");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await clean().catch(() => {});
  process.exit(1);
});
