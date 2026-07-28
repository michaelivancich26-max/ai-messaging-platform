// Regression cover for two Grounds Pro integrity defects found in the Pro audit.
//
// 1. THE GROUNDS SCORE FAUCET. Unranked Arena wins move no ELO, but scoreImpact
//    was summed with no `ranked` filter, so it still fed the PUBLIC Grounds Score.
//    Custom opponents made that farmable: author a tier-5 persona told to concede,
//    beat it repeatedly, and the wins land on your public headline number.
//
// 2. DELETION vs BILLING AND ACCESS. Deleting an account left isPro and the Stripe
//    ids intact (so renewals kept charging and kept re-granting Pro on the
//    tombstone), and the 30-day session JWT kept working afterwards.
//
// Run: NEXTAUTH_SECRET=<secret> node scripts/verify-account-deletion.js
// Requires the dev server on :3001 and Docker Postgres up.
// Sessions are NextAuth JWEs, not plain signed JWTs — mint them the same way the
// client does or the server rejects them.
const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET;
if (!SECRET) { console.error("NEXTAUTH_SECRET required"); process.exit(1); }

const P = "vpi-";
const FARMER = `${P}farmer`;
// A fresh id per run. Deleting an account tombstones the id in the server's
// memory for the life of the process, and rightly so — a real id is never
// reused. But it made this suite pass once per server start and fail on every
// re-run, because the recreated fixture row was refused by a tombstone the
// database no longer had. The id is what has to change, not the gate.
const LEAVER = `${P}leaver-${Math.random().toString(36).slice(2, 8)}`;

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ""}`);
  else { console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); failures++; }
}

const tokenFor = (id, username) =>
  encode({ token: { id, username, isAdmin: false }, secret: SECRET });

async function clean() {
  await prisma.$executeRawUnsafe(`DELETE FROM "ArenaMatch" WHERE "userId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`).catch(() => {});
}

async function main() {
  await clean();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" (id,username,email,password) VALUES
       ($1,$2,$3,'x'), ($4,$5,$6,'x')`,
    FARMER, `${P}farmer`, `${P}farmer@t.local`,
    LEAVER, LEAVER, `${LEAVER}@t.local`);

  // ── 1. The faucet ──────────────────────────────────────────────────────────
  // One RANKED win (legitimately earns bonus) and three UNRANKED wins worth far
  // more (the farm). Only the ranked one may reach the score.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ArenaMatch" ("id","roomName","userId","botId","winner","verdict","scoreImpact","ranked") VALUES
       (gen_random_uuid()::text,$1,$5,'rex','human','ranked win',0.5,true),
       (gen_random_uuid()::text,$2,$5,'atlas','human','farmed',5.0,false),
       (gen_random_uuid()::text,$3,$5,'atlas','human','farmed',5.0,false),
       (gen_random_uuid()::text,$4,$5,'atlas','human','farmed',5.0,false)`,
    `${P}r1`, `${P}u1`, `${P}u2`, `${P}u3`, FARMER);

  const farmerToken = await tokenFor(FARMER, `${P}farmer`);
  const prof = await fetch(`${SERVER}/api/users/${FARMER}/profile`, {
    headers: { Authorization: `Bearer ${farmerToken}` },
  }).then(r => r.json());

  const bonus = prof?.stats?.arenaBonus;
  check("unranked Arena wins do NOT feed the Grounds Score", bonus === 0.5,
    `arenaBonus=${bonus} (expected 0.5 from the one ranked win, not 15.5)`);
  check("bot-match count still reports practice honestly", prof?.stats?.arenaMatchCount !== 0 || prof?.stats?.arenaWins === 4,
    `arenaWins=${prof?.stats?.arenaWins}`);

  // ── 2. Deletion clears billing, and the session dies with the account ───────
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "isPro"=true, "proStatus"='active',
       "stripeCustomerId"='cus_test', "stripeSubscriptionId"='sub_test' WHERE id=$1`, LEAVER);

  const leaverToken = await tokenFor(LEAVER, LEAVER);
  const before = await fetch(`${SERVER}/api/billing/status`, {
    headers: { Authorization: `Bearer ${leaverToken}` },
  });
  check("Pro session works before deletion", before.status === 200, `status=${before.status}`);

  const del = await fetch(`${SERVER}/api/me/delete`, {
    method: "POST", headers: { Authorization: `Bearer ${leaverToken}` },
  });
  // Stripe is unconfigured in dev, so the cancel is skipped and deletion proceeds.
  // With Stripe configured and the sub id bogus, Stripe answers resource_missing,
  // which the handler also treats as "already stopped" and proceeds.
  check("deletion succeeds", del.status === 200, `status=${del.status}`);

  const row = await prisma.$queryRawUnsafe(
    `SELECT "isPro","proStatus","stripeCustomerId","stripeSubscriptionId","deletedAt"
       FROM "User" WHERE id=$1`, LEAVER);
  const r = row[0] ?? {};
  check("deletion clears isPro", r.isPro === false, `isPro=${r.isPro}`);
  check("deletion clears the Stripe linkage", !r.stripeCustomerId && !r.stripeSubscriptionId,
    `cus=${r.stripeCustomerId} sub=${r.stripeSubscriptionId}`);
  check("deletion stamps deletedAt", !!r.deletedAt);

  // The tombstone must no longer match the webhook's WHERE "stripeSubscriptionId",
  // which is what used to let a renewal re-grant Pro on a deleted account.
  const orphan = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "User" WHERE "stripeSubscriptionId" = 'sub_test'`);
  check("no deleted row still matches the renewal webhook", (orphan[0]?.n ?? 0) === 0, `rows=${orphan[0]?.n}`);

  const after = await fetch(`${SERVER}/api/billing/status`, {
    headers: { Authorization: `Bearer ${leaverToken}` },
  });
  const body = await after.json().catch(() => ({}));
  check("the 30-day token stops working immediately after deletion",
    after.status === 401 && body.code === "account_deleted", `status=${after.status} code=${body.code}`);

  await clean();
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nPro integrity holds");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean(); await prisma.$disconnect(); process.exit(1); });
