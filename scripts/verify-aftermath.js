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
  await prisma.$executeRawUnsafe(`DELETE FROM "RapidAftermathAnswered" WHERE "roomName"=$1`, ROOM);
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

  const postAftermath = (auth, body) => fetch(`${SERVER}/api/rapid/aftermath/${ROOM}`, {
    method: "POST", headers: auth, body: JSON.stringify(body),
  });

  // 2. A is persuaded (agree/2 -> disagree/2) through the AFTERMATH endpoint:
  //    a BeliefChange IS logged, tagged with the room the debate happened in.
  const flip = await postAftermath(authA, { stance: "disagree", confidence: 2 }).then((r) => r.json());
  check("the aftermath reports the change", flip?.changed === true, JSON.stringify(flip));

  const row = await prisma.$queryRawUnsafe(
    `SELECT "fromStance","toStance","roomName" FROM "BeliefChange" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1`, A);
  check("a BeliefChange row is written", row.length === 1);
  check("it records the flip", row[0]?.fromStance === "agree" && row[0]?.toStance === "disagree",
    `${row[0]?.fromStance} -> ${row[0]?.toStance}`);
  check("it's tagged with the debate room", row[0]?.roomName === ROOM, row[0]?.roomName);

  // 3. IDEMPOTENCY — the review's finding. Answering again (a re-opened modal
  //    remounts the component) must NOT log a second BeliefChange for one debate.
  const again = await postAftermath(authA, { stance: "agree", confidence: 1 }).then((r) => r.json());
  check("a second answer is refused as already-answered", again?.alreadyAnswered === true, JSON.stringify(again));
  const total = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "BeliefChange" WHERE "userId"=$1`, A);
  check("still exactly one BeliefChange after re-answering", total[0].n === 1, `${total[0].n} rows`);

  // 4. And the GET now reports the round as answered, so a remount renders nothing.
  const afAfter = await fetch(`${SERVER}/api/rapid/aftermath/${ROOM}`, { headers: authA }).then((r) => r.json());
  check("GET reports answered after submitting", afAfter?.answered === true && afAfter?.proposition === null,
    JSON.stringify(afAfter));

  // 5. B, unchanged (disagree/2 -> disagree/2): answered once, NO BeliefChange.
  const tokB = await encode({ token: { id: B, username: "aftbeta" }, secret, maxAge: 300 });
  const authB = { Authorization: `Bearer ${tokB}`, "Content-Type": "application/json" };
  const held = await postAftermath(authB, { stance: "disagree", confidence: 2 }).then((r) => r.json());
  check("an unchanged answer reports no change", held?.changed === false && !held?.alreadyAnswered, JSON.stringify(held));
  const bChanges = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "BeliefChange" WHERE "userId"=$1`, B);
  check("an unchanged answer logs nothing", bChanges[0].n === 0, `${bChanges[0].n} rows`);

  // 6. A non-participant can neither peek nor post.
  const tokC = await encode({ token: { id: "aftermath-probe-c", username: "aftcee" }, secret, maxAge: 300 });
  const authC = { Authorization: `Bearer ${tokC}`, "Content-Type": "application/json" };
  const outsiderGet = await fetch(`${SERVER}/api/rapid/aftermath/${ROOM}`, { headers: authC });
  check("a non-participant GET is refused", outsiderGet.status === 403, `HTTP ${outsiderGet.status}`);
  const outsiderPost = await postAftermath(authC, { stance: "agree", confidence: 1 });
  check("a non-participant POST is refused", outsiderPost.status === 403, `HTTP ${outsiderPost.status}`);

  await clean();
  const left = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "User" WHERE id = ANY($1::text[])`, [A, B]);
  check("fixture removed", left[0].n === 0);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} FAILED` : "\nall passed — the loop closes and a changed mind is logged");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean().catch(() => {}); await prisma.$disconnect().catch(() => {}); process.exit(1); });
