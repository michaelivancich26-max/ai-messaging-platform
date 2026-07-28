// Bots are real User rows, and every bot message stakes and evaluates a Claim
// under that row — which is exactly what the Grounds Score is computed from. So
// the practice opponents accumulated a public score and appeared on the
// leaderboard beside the humans, and on the rank cohorts behind profiles.
//
// Also covers the AI coach's missing post-match guard: /api/coach was gated on
// Pro and membership but never on the match being OVER, so a Pro player could
// pull an AI reading of a ranked debate that was still running.
//
// Run: NEXTAUTH_SECRET=<secret> node scripts/verify-bot-exclusion.js
const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET;
if (!SECRET) { console.error("NEXTAUTH_SECRET required"); process.exit(1); }

const P = "vbx-";
const BOT = `${P}bot`;
const HUMAN = `${P}human`;
const OPP = `${P}opp`;
const ROOM = `${P}room`;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function clean() {
  await prisma.$executeRawUnsafe(`DELETE FROM "Claim" WHERE "claimantId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "Message" WHERE "roomId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "ArenaMatch" WHERE "roomName" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "RoomMember" WHERE "roomId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "Room" WHERE id LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`).catch(() => {});
}

async function main() {
  await clean();

  // A bot minted the way resolveBotUser mints one, and two humans.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" (id,username,email,password) VALUES
       ($1,$1,'bot.' || $1 || '@veritas.internal','__bot__'),
       ($2,$2,$2 || '@t.local','x'),
       ($3,$3,$3 || '@t.local','x')`, BOT, HUMAN, OPP);
  // The boot backfill only runs at start-up, so mark it the way the running
  // server would have.
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "isBot" = true WHERE email LIKE '%@veritas.internal' AND id = $1`, BOT);

  await prisma.$executeRawUnsafe(`INSERT INTO "Room" (id,name,"isPrivate","creatorId") VALUES ($1,$1,false,$2)`, ROOM, HUMAN);
  for (const u of [HUMAN, OPP]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "RoomMember" (id,"userId","roomId",role) VALUES ($1,$2,$3,'PARTICIPANT')`, `${ROOM}-${u}`, u, ROOM);
  }
  const mid = `${ROOM}-msg`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Message" (id,"roomId","userId",content,"senderType") VALUES ($1,$2,$3,'x','HUMAN')`, mid, ROOM, HUMAN);

  // A big Grounds Score for the bot — exactly what a few arena rounds produce.
  for (let i = 0; i < 6; i++) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Claim" (id,"messageId","roomId","claimantId",text,status,relevance,evidence,logic,impact,score)
       VALUES ($1,$2,$3,$4,'bot claim','SUPPORTED'::"ClaimStatus",9,9,9,9,90)`,
      `${P}c${i}`, mid, ROOM, BOT);
  }

  const tok = await encode({ token: { id: HUMAN, username: HUMAN }, secret: SECRET });
  const h = { Authorization: `Bearer ${tok}` };
  const get = (p) => fetch(`${SERVER}${p}`, { headers: h }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  // ── 1. The bot has a score, and is still kept off the board ────────────────
  const raw = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(relevance) FILTER (WHERE status='SUPPORTED'),0)::float8 * 2 AS s,
            COUNT(*) FILTER (WHERE status <> 'PENDING')::int AS n
     FROM "Claim" WHERE "claimantId" = $1`, BOT);
  check("the bot really does earn a Grounds Score", Number(raw[0].s) > 0 && Number(raw[0].n) >= 3,
    `score=${raw[0].s} over ${raw[0].n} claims`);

  const grounds = await get("/api/leaderboards/grounds?limit=50");
  const listed = JSON.stringify(grounds.body.rows ?? []).includes(BOT);
  check("the Grounds Score board excludes it", grounds.status === 200 && !listed,
    listed ? "BOT IS ON THE PUBLIC BOARD" : `${(grounds.body.rows ?? []).length} rows, none of them bots`);

  const standings = await get(`/api/users/${BOT}/standings`);
  const anyRank = (standings.body ?? []).some(s => s.rank !== null);
  check("a bot profile shows no rank on any board", !anyRank,
    anyRank ? "ranked somewhere" : "unranked across all boards");

  // ── 2. Coaching is refused while the match is still running ────────────────
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompetitiveMatch"
       ("id","challengeId","challengerId","challengedId","challengerStance","challengedStance",
        "roomName",status,"challengerEloBefore","challengedEloBefore")
     VALUES (gen_random_uuid()::text,NULL,$1,$2,'affirmative','negative',$3,'active',1200,1200)`,
    HUMAN, OPP, ROOM);
  await prisma.$executeRawUnsafe(`UPDATE "User" SET "isPro" = true WHERE id = $1`, HUMAN);

  const during = await get(`/api/coach/${ROOM}`);
  check("coaching is refused mid-match", during.status === 409 && during.body.code === "in_progress",
    `status=${during.status} code=${during.body.code ?? "-"}`);

  await prisma.$executeRawUnsafe(
    `UPDATE "CompetitiveMatch" SET status='complete', "completedAt"=NOW() WHERE "roomName"=$1`, ROOM);
  const after = await get(`/api/coach/${ROOM}`);
  check("and allowed once it's over", after.status !== 409,
    `status=${after.status}${after.body.code ? ` code=${after.body.code}` : ""} (422/500 fine — needs an API key)`);

  await clean();
  console.log(failures ? `\n${failures} FAILURE(S)` : `\nbots stay off the boards, and coaching stays post-match`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean(); await prisma.$disconnect(); process.exit(1); });
