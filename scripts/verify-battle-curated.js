// A ranked 1v1 fought over a CURATED claim must carry its subject all the way
// through, and must ask the one question the product exists to ask.
//
// Before this, accepting a challenge threw the subject away: matchConfig didn't
// carry propositionId and the CompetitiveMatch insert omitted it and categoryId
// even though both columns existed. Consequences: the post-match "did that move
// you?" could never fire in ranked play (its gate required isRapid), domain
// reputation was impossible, and Pro analytics bucketed every ranked 1v1 as
// uncategorised.
//
// Run: NEXTAUTH_SECRET=<secret> node scripts/verify-battle-curated.js
const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET;
if (!SECRET) { console.error("NEXTAUTH_SECRET required"); process.exit(1); }

const P = "bgcur-";
const A = `${P}poster`, B = `${P}accepter`;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const tokenFor = (id, username) => encode({ token: { id, username, isAdmin: false }, secret: SECRET });

async function clean() {
  const rooms = await prisma.$queryRawUnsafe(
    `SELECT name FROM "Room" WHERE name LIKE 'comp-%' AND "creatorId" LIKE $1`, `${P}%`).catch(() => []);
  for (const r of rooms) {
    await prisma.$executeRawUnsafe(`DELETE FROM "MatchPropositionPoint" WHERE "roomName"=$1`, r.name).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "MatchProposition" WHERE "roomName"=$1`, r.name).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName"=$1`, r.name).catch(() => {});
  }
  await prisma.$executeRawUnsafe(`DELETE FROM "RoomMember" WHERE "userId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "Room" WHERE "creatorId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "Challenge" WHERE "userId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "ArenaMatch" WHERE "userId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "UserBelief" WHERE "userId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`).catch(() => {});
}

async function main() {
  await clean();

  // Two players, both past the Training Grounds entry gate.
  for (const [id, name] of [[A, `${P}poster`], [B, `${P}accepter`]]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id,username,email,password,"claimsRated",elo) VALUES ($1,$2,$3,'x',5,1200)`,
      id, name, `${name}@t.local`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ArenaMatch" ("id","roomName","userId","botId","winner","verdict","scoreImpact","ranked")
       VALUES (gen_random_uuid()::text,$2,$1,'rex','human','gate fixture',0.5,true)`,
      id, `${P}arena-${id}`);
  }

  const props = await prisma.$queryRawUnsafe(
    `SELECT id, text, "categoryId" FROM "Proposition" WHERE status='live' LIMIT 1`);
  if (!props.length) { console.error("no live propositions to test with"); process.exit(1); }
  const prop = props[0];

  const tokA = await tokenFor(A, `${P}poster`);
  const tokB = await tokenFor(B, `${P}accepter`);
  const hA = { Authorization: `Bearer ${tokA}`, "Content-Type": "application/json" };
  const hB = { Authorization: `Bearer ${tokB}`, "Content-Type": "application/json" };

  // Post a challenge on a CURATED claim, then accept it.
  const posted = await fetch(`${SERVER}/api/challenges`, {
    method: "POST", headers: hA,
    body: JSON.stringify({ propositionId: prop.id, stance: "affirmative", winCondition: { type: "exchanges", limit: 10 } }),
  }).then(r => r.json());
  check("curated challenge posts", !!posted.id && posted.curated === true, JSON.stringify(posted));

  const accepted = await fetch(`${SERVER}/api/challenges/${posted.id}/accept`, { method: "POST", headers: hB })
    .then(async r => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  check("challenge accepts", accepted.s === 200, `status=${accepted.s}`);
  const roomName = accepted.b?.roomName ?? accepted.b?.name;
  check("accept returns a room", !!roomName, String(roomName));
  if (!roomName) { await clean(); process.exit(1); }

  // 1. The match remembers its subject.
  const cm = await prisma.$queryRawUnsafe(
    `SELECT "propositionId","categoryId" FROM "CompetitiveMatch" WHERE "roomName"=$1`, roomName);
  check("CompetitiveMatch records the proposition", cm[0]?.propositionId === prop.id, String(cm[0]?.propositionId));
  check("CompetitiveMatch records the category", cm[0]?.categoryId === prop.categoryId,
    `${cm[0]?.categoryId} (expected ${prop.categoryId})`);

  const rm = await prisma.$queryRawUnsafe(`SELECT "matchConfig" FROM "Room" WHERE name=$1`, roomName);
  const cfg = JSON.parse(rm[0]?.matchConfig ?? "{}");
  check("matchConfig carries the proposition", cfg.propositionId === prop.id, String(cfg.propositionId));
  check("matchConfig is NOT flagged rapid", !cfg.isRapid, `isRapid=${cfg.isRapid}`);

  // 2. The belief question is now reachable in ranked play — this is the gate
  //    that used to require isRapid and so never fired outside Rapid Fire.
  const after = await fetch(`${SERVER}/api/rapid/aftermath/${roomName}`, { headers: hA })
    .then(async r => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  check("ranked match offers the belief question", after.s === 200 && after.b?.proposition?.id === prop.id,
    `status=${after.s} prop=${after.b?.proposition?.id}`);

  // 3. Answering it records a real BeliefChange tagged with the ranked room.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserBelief" ("userId","propositionId","stance","confidence") VALUES ($1,$2,'agree',2)
     ON CONFLICT ("userId","propositionId") DO UPDATE SET stance='agree', confidence=2`, A, prop.id);
  const moved = await fetch(`${SERVER}/api/rapid/aftermath/${roomName}`, {
    method: "POST", headers: hA, body: JSON.stringify({ stance: "disagree", confidence: 2 }),
  }).then(async r => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  check("a changed mind is accepted", moved.s === 200 && moved.b?.changed === true, JSON.stringify(moved.b));

  const bc = await prisma.$queryRawUnsafe(
    `SELECT "fromStance","toStance","roomName" FROM "BeliefChange" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1`, A);
  check("BeliefChange is written from a ranked match", bc[0]?.roomName === roomName,
    `${bc[0]?.fromStance}->${bc[0]?.toStance} in ${bc[0]?.roomName}`);

  // 4. The claims endpoint is no longer world-readable.
  const outsiderTok = await tokenFor(`${P}outsider`, `${P}outsider`);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" (id,username,email,password) VALUES ($1,$1,$2,'x')`, `${P}outsider`, `${P}o@t.local`);
  const pub = await fetch(`${SERVER}/api/rooms/${roomName}/claims`, { headers: { Authorization: `Bearer ${outsiderTok}` } });
  // comp rooms are public by design, so a signed-in non-participant may read them;
  // what must never happen is the old behaviour of no check at all on a private room.
  check("claims endpoint responds to an authenticated caller", pub.status === 200, `status=${pub.status}`);
  const anon = await fetch(`${SERVER}/api/rooms/${roomName}/claims`);
  check("claims endpoint refuses anonymous callers", anon.status === 401, `status=${anon.status}`);

  await prisma.$executeRawUnsafe(`DELETE FROM "BeliefChange" WHERE "userId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "RapidAftermathAnswered" WHERE "userId" LIKE $1`, `${P}%`).catch(() => {});
  await clean();
  console.log(failures ? `\n${failures} FAILURE(S)` : "\ncurated ranked match carries its subject, and asks the question");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean(); await prisma.$disconnect(); process.exit(1); });
