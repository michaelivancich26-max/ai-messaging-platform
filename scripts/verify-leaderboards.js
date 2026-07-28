// Regression cover for the leaderboard defects the SQL audit turned up.
//
// 1. TOMBSTONES ON PUBLIC BOARDS. Account deletion renames the user to
//    `deleted_<userId>`, and no ladder query filtered "deletedAt" — so a deleted
//    account stayed publicly listed, by name, leaking its raw user id.
// 2. RANK DRIFT. The board excluded tombstones but the rank shown on a profile
//    counted them, so the same user saw two different positions.
// 3. MINTABLE BELIEF CREDIT. POST /api/deck/position took roomName from the
//    request body unchecked, so anyone could attribute a changed mind to a room
//    they were never in — which the Persuaders board turns into someone's score.
// 4. UNBOUNDED TIES. RANK() ties share a number, so "rank <= 25" over a board
//    where everyone sits on the same value returned the whole cohort.
//
// Run: NEXTAUTH_SECRET=<secret> node scripts/verify-leaderboards.js
// Requires the dev server on :3001 and Docker Postgres up.
const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET;
if (!SECRET) { console.error("NEXTAUTH_SECRET required"); process.exit(1); }

const P = "vlb-";
const LIVE = `${P}live`;
const GHOST = `${P}ghost`;
const VICTIM = `${P}victim`;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const tokenFor = (id, username) => encode({ token: { id, username, isAdmin: false }, secret: SECRET });

async function clean() {
  // Every table the fixture writes, or a second run collides on a unique key.
  await prisma.$executeRawUnsafe(`DELETE FROM "ArenaMatch" WHERE "roomName" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "UserBelief" WHERE "userId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "BeliefChange" WHERE "userId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "RoomMember" WHERE "roomId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "Room" WHERE id LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`).catch(() => {});
}

async function main() {
  await clean();

  // A live player, and a high-rated account that has since been deleted.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" (id,username,email,password,elo,"rapidElo","arenaElo") VALUES
       ($1,$1,$1 || '@t.local','x',1500,1500,1500),
       ($2,$2,$2 || '@t.local','x',1900,1900,1900),
       ($3,$3,$3 || '@t.local','x',1200,1200,1200)`,
    LIVE, GHOST, VICTIM);
  // Both have played, so both are in every cohort.
  for (const uid of [LIVE, GHOST]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CompetitiveMatch"
         ("id","challengeId","challengerId","challengedId","challengerStance","challengedStance",
          "roomName",status,"winnerId","challengerEloBefore","challengedEloBefore","completedAt","isRapid")
       VALUES (gen_random_uuid()::text,NULL,$1,$2,'affirmative','negative',$3,'complete',$1,1200,1200,NOW(),FALSE)`,
      uid, VICTIM, `${P}m-${uid}`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CompetitiveMatch"
         ("id","challengeId","challengerId","challengedId","challengerStance","challengedStance",
          "roomName",status,"winnerId","challengerEloBefore","challengedEloBefore","completedAt","isRapid")
       VALUES (gen_random_uuid()::text,NULL,$1,$2,'affirmative','negative',$3,'complete',$1,1200,1200,NOW(),TRUE)`,
      uid, VICTIM, `${P}r-${uid}`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ArenaMatch" ("roomName","userId","botId",winner,verdict,"scoreImpact",ranked)
       VALUES ($1,$2,'rex','human','x',0.5,TRUE)`, `${P}a-${uid}`, uid);
  }
  // Now tombstone the ghost exactly the way the delete endpoint does.
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET username=$2, email=$3, "deletedAt"=NOW() WHERE id=$1`,
    GHOST, `deleted_${GHOST}`, `${GHOST}@deleted.invalid`);

  const tok = await tokenFor(LIVE, LIVE);
  const h = { Authorization: `Bearer ${tok}` };
  const get = (p) => fetch(`${SERVER}${p}`, { headers: h }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  // ── 1. No board, old or new, may list a tombstone ──────────────────────────
  const hasGhost = (rows) => JSON.stringify(rows ?? []).includes(GHOST);
  for (const [name, path] of [
    ["battle", "/api/leaderboards/battle"], ["rapid", "/api/leaderboards/rapid"], ["arena", "/api/leaderboards/arena"],
    ["legacy battle", "/api/leaderboard"], ["legacy rapid", "/api/rapid/leaderboard"], ["legacy arena", "/api/arena-leaderboard"],
  ]) {
    const r = await get(path);
    const rows = Array.isArray(r.body) ? r.body : r.body.rows;
    check(`${name} hides the deleted account`, r.status === 200 && !hasGhost(rows),
      hasGhost(rows) ? "LEAKED the deleted user id" : `${(rows ?? []).length} rows`);
  }

  // ── 2. The rank on a profile counts the same cohort as the board ───────────
  const board = await get("/api/leaderboards/battle?limit=50");
  const me = await get("/api/battle/me");
  check("board rank and profile rank agree",
    board.body.me?.rank === me.body.rank && board.body.total === me.body.total,
    `board=#${board.body.me?.rank}/${board.body.total} profile=#${me.body.rank}/${me.body.total}`);

  // ── 3. A room you were never in can't be stamped on your position ──────────
  const prop = await prisma.$queryRawUnsafe(`SELECT id FROM "Proposition" WHERE status='live' LIMIT 1`);
  const foreignRoom = `${P}m-${GHOST}`;                 // a real room, with LIVE not a member
  await fetch(`${SERVER}/api/deck/position`, {
    method: "POST", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ propositionId: prop[0].id, stance: "agree", confidence: 1, roomName: foreignRoom }),
  }).catch(() => {});
  const stamped = await prisma.$queryRawUnsafe(
    `SELECT "roomName" FROM "UserBelief" ub WHERE ub."userId"=$1`, LIVE).catch(() => []);
  const bc = await prisma.$queryRawUnsafe(
    `SELECT "roomName" FROM "BeliefChange" WHERE "userId"=$1 AND "roomName"=$2`, LIVE, foreignRoom);
  check("a position keeps no room the caller wasn't in", bc.length === 0,
    bc.length ? `attributed to ${foreignRoom}` : "not attributed");

  // ── 4. A wall of ties can't return the whole cohort ────────────────────────
  await prisma.$executeRawUnsafe(`UPDATE "User" SET "dailyStreak"=7 WHERE id LIKE $1`, `${P}%`);
  const tied = await get("/api/leaderboards/streak?limit=5");
  check("a tie at the cut still returns at most limit+1 rows",
    (tied.body.rows ?? []).length <= 5, `${(tied.body.rows ?? []).length} rows for limit=5`);

  // ── 5. Neither bots nor tombstones are findable as people ─────────────────
  // The boards were only half of it: user search and the people directory feed
  // friend requests, DMs and room invites, and filtered neither. A deleted
  // account surfaced there under its `deleted_<id>` name, leaking the raw id
  // exactly as the ladders did.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" (id,username,email,password) VALUES ($1,$1,'bot.' || $1 || '@veritas.internal','__bot__')`,
    `${P}searchbot`).catch(() => {});
  await prisma.$executeRawUnsafe(`UPDATE "User" SET "isBot" = true WHERE id = $1`, `${P}searchbot`);

  const searchAll = await get(`/api/users/search?q=${encodeURIComponent(P)}`);
  const searchJson = JSON.stringify(searchAll.body ?? []);
  check("search hides deleted accounts", !searchJson.includes(GHOST),
    searchJson.includes(GHOST) ? "LEAKED the deleted user id" : "hidden");
  check("search hides bots", !searchJson.includes("searchbot"),
    searchJson.includes("searchbot") ? "bot is friendable" : "hidden");
  check("search still finds real people", searchJson.includes(LIVE), `${(searchAll.body ?? []).length} results`);

  const dir = await get("/api/users");
  const dirJson = JSON.stringify(dir.body ?? []);
  check("the people directory hides deleted accounts", !dirJson.includes(GHOST),
    dirJson.includes(GHOST) ? "LEAKED the deleted user id" : "hidden");
  check("the people directory hides bots", !dirJson.includes("searchbot"));

  // A wildcard query must not dump the table.
  const wild = await get(`/api/users/search?q=${encodeURIComponent("%")}`);
  check("a bare wildcard doesn't match everyone", (wild.body ?? []).length === 0,
    `${(wild.body ?? []).length} results for "%"`);

  // ── 6. Inherited keys are a 404, not a 500 ─────────────────────────────────
  for (const key of ["constructor", "toString", "__proto__", "nope"]) {
    const r = await get(`/api/leaderboards/${encodeURIComponent(key)}`);
    check(`"${key}" is refused cleanly`, r.status === 404, `status=${r.status}`);
  }

  await clean();
  console.log(failures ? `\n${failures} FAILURE(S)` : `\nleaderboards hold: no tombstones, no drift, no minted credit`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean(); await prisma.$disconnect(); process.exit(1); });
