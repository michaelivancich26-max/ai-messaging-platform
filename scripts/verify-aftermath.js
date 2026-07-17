// Does the loop actually close? deck -> match -> "did that move you?" -> deck.
//
// This is the one place a post-debate BeliefChange gets written, and until it
// existed NO path could write one at all (getDeck never re-serves an answered
// card; the deck's Back is a correction). So this asserts the whole point of
// the product is reachable: after a rapid round, the two debaters are asked
// where they now stand, and a real change is logged with the room it happened
// in — while an unchanged answer is not.
//
// Runs the real HTTP endpoints with real NextAuth tokens. Needs the server up.

const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const A = "aftermath-probe-a";
const B = "aftermath-probe-b";
const ROOM = "aftermath-probe-room";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function clean() {
  await prisma.$executeRawUnsafe(`DELETE FROM "BeliefChange" WHERE "userId" = ANY($1::text[])`, [A, B]);
  await prisma.$executeRawUnsafe(`DELETE FROM "UserBelief" WHERE "userId" = ANY($1::text[])`, [A, B]);
  await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName"=$1`, ROOM);
  await prisma.$executeRawUnsafe(`DELETE FROM "MatchProposition" WHERE "roomName"=$1`, ROOM);
  await prisma.$executeRawUnsafe(`DELETE FROM "RoomMember" WHERE "roomId" IN (SELECT id FROM "Room" WHERE name=$1)`, ROOM);
  await prisma.$executeRawUnsafe(`DELETE FROM "Room" WHERE name=$1`, ROOM);
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [A, B]);
}

async function main() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) { console.error("NEXTAUTH_SECRET not set"); process.exit(1); }
  await clean();

  // Two users. A holds "agree/2" on a live proposition; B the opposite.
  for (const [id, name] of [[A, "aftalpha"], [B, "aftbeta"]]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id, username, email, password) VALUES ($1,$2,$3,'')`, id, name, `${name}@probe.local`);
  }
  const props = await prisma.$queryRawUnsafe(
    `SELECT id, text FROM "Proposition" WHERE status='live' ORDER BY id LIMIT 1`);
  if (!props.length) { console.error("no live propositions"); process.exit(1); }
  const prop = props[0];

  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserBelief" ("userId","propositionId","stance","confidence") VALUES ($1,$2,'agree',2)`, A, prop.id);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserBelief" ("userId","propositionId","stance","confidence") VALUES ($1,$2,'disagree',2)`, B, prop.id);

  // A finished rapid round between them, carrying the propositionId — exactly
  // what startRapidMatch writes into matchConfig.
  const room = await prisma.room.create({ data: { name: ROOM, isPrivate: false, creatorId: A } });
  await prisma.$executeRawUnsafe(`UPDATE "Room" SET "matchConfig"=$1 WHERE id=$2`,
    JSON.stringify({ isRapid: true, challengerId: A, challengedId: B, propositionId: prop.id }), room.id);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompetitiveMatch"
       ("id","challengeId","challengerId","challengedId","challengerStance","challengedStance","roomName","status","isRapid","winnerId")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,'complete',TRUE,$2)`,
    null, A, B, "affirmative", "negative", ROOM);

  const tokA = await encode({ token: { id: A, username: "aftalpha" }, secret, maxAge: 300 });
  const authA = { Authorization: `Bearer ${tokA}`, "Content-Type": "application/json" };

  // 1. Aftermath tells A what was argued and where A stood.
  const af = await fetch(`${SERVER}/api/rapid/aftermath/${ROOM}`, { headers: authA }).then((r) => r.json());
  check("aftermath returns the argued proposition", af?.proposition?.id === prop.id, af?.proposition?.text);
  check("aftermath returns A's prior stance", af?.before?.stance === "agree" && af?.before?.confidence === 2,
    JSON.stringify(af?.before));

  // 2. A's mind is unchanged (agree/2 -> agree/2): NO BeliefChange logged.
  await fetch(`${SERVER}/api/deck/position`, {
    method: "POST", headers: authA,
    body: JSON.stringify({ propositionId: prop.id, stance: "agree", confidence: 2, roomName: ROOM, correction: false }),
  });
  let changes = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "BeliefChange" WHERE "userId"=$1`, A);
  check("an unchanged position logs nothing", changes[0].n === 0, `${changes[0].n} rows`);

  // 3. A is persuaded (agree/2 -> disagree/2): a BeliefChange IS logged, tagged
  //    with the room the debate happened in.
  const flip = await fetch(`${SERVER}/api/deck/position`, {
    method: "POST", headers: authA,
    body: JSON.stringify({ propositionId: prop.id, stance: "disagree", confidence: 2, roomName: ROOM, correction: false }),
  }).then((r) => r.json());
  check("the API reports the change", flip?.changed === true && flip?.flipped === true, JSON.stringify(flip));

  const row = await prisma.$queryRawUnsafe(
    `SELECT "fromStance","toStance","roomName" FROM "BeliefChange" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1`, A);
  check("a BeliefChange row is written", row.length === 1);
  check("it records the flip", row[0]?.fromStance === "agree" && row[0]?.toStance === "disagree",
    `${row[0]?.fromStance} -> ${row[0]?.toStance}`);
  check("it's tagged with the debate room", row[0]?.roomName === ROOM, row[0]?.roomName);

  // 4. A non-participant can't peek at the round.
  const tokC = await encode({ token: { id: "aftermath-probe-c", username: "aftcee" }, secret, maxAge: 300 });
  const outsider = await fetch(`${SERVER}/api/rapid/aftermath/${ROOM}`,
    { headers: { Authorization: `Bearer ${tokC}` } });
  check("a non-participant is refused", outsider.status === 403, `HTTP ${outsider.status}`);

  await clean();
  const left = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "User" WHERE id = ANY($1::text[])`, [A, B]);
  check("fixture removed", left[0].n === 0);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} FAILED` : "\nall passed — the loop closes and a changed mind is logged");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean().catch(() => {}); await prisma.$disconnect().catch(() => {}); process.exit(1); });
