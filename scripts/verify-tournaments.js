// Tournaments, and the promise that makes them sellable.
//
// The product rule is that Pro sells improvement, insight, convenience and
// status — never outcomes. So hosting is paid, entering is free, and a bracket
// match must move NO rating on any ladder and count toward NO ranked record.
// If a bracket win showed up as a Battle Grounds win, a Pro subscription would
// be a way to buy standing, which is the one thing this product doesn't sell.
//
// Run: NEXTAUTH_SECRET=<secret> node scripts/verify-tournaments.js
const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET;
if (!SECRET) { console.error("NEXTAUTH_SECRET required"); process.exit(1); }

const P = "vtn-";
const HOST = `${P}host`;
const PLAYERS = [`${P}p1`, `${P}p2`, `${P}p3`];
const ALL = [HOST, ...PLAYERS];

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const tok = (id) => encode({ token: { id, username: id }, secret: SECRET });
async function call(id, path, method = "GET", body) {
  const t = await tok(id);
  const r = await fetch(`${SERVER}${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function clean() {
  const ts = await prisma.$queryRawUnsafe(`SELECT id FROM "Tournament" WHERE "hostId" LIKE $1`, `${P}%`).catch(() => []);
  for (const { id } of ts) {
    const ms = await prisma.$queryRawUnsafe(`SELECT "roomName" FROM "TournamentMatch" WHERE "tournamentId"=$1 AND "roomName" IS NOT NULL`, id).catch(() => []);
    for (const { roomName } of ms) {
      for (const tbl of ["MatchPropositionPoint", "MatchProposition", "JudgeShadow"]) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "roomName"=$1`, roomName).catch(() => {});
      }
      await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName"=$1`, roomName).catch(() => {});
      for (const tbl of ["Claim", "Message", "RoomMember"]) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "roomId"=$1`, roomName).catch(() => {});
      }
      await prisma.$executeRawUnsafe(`DELETE FROM "Room" WHERE id=$1`, roomName).catch(() => {});
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "TournamentMatch" WHERE "tournamentId"=$1`, id).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "TournamentEntrant" WHERE "tournamentId"=$1`, id).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "Tournament" WHERE id=$1`, id).catch(() => {});
  }
  await prisma.$executeRawUnsafe(`DELETE FROM "ArenaMatch" WHERE "userId" LIKE $1`, `${P}%`).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`).catch(() => {});
}

async function main() {
  await clean();

  // Four eligible players. Eligibility = a Grounds Score plus a ranked practice win.
  for (const id of ALL) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id,username,email,password,elo,"claimsRated") VALUES ($1,$1,$1||'@t.local','x',1500,5)`, id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ArenaMatch" ("roomName","userId","botId",winner,verdict,"scoreImpact",ranked)
       VALUES ($1,$2,'rex','human','x',0.5,TRUE)`, `${P}arena-${id}`, id);
  }

  // ── Hosting is the paid half ──────────────────────────────────────────────
  const prop = await prisma.$queryRawUnsafe(`SELECT id FROM "Proposition" WHERE status='live' LIMIT 1`);
  const create = { name: "Verify Cup", propositionId: prop[0].id, size: 4, winCondition: { type: "exchanges", limit: 4 } };

  const free = await call(HOST, "/api/tournaments", "POST", create);
  check("a free account cannot host", free.status === 402 && free.body.code === "pro_only",
    `status=${free.status} code=${free.body.code ?? "-"}`);

  await prisma.$executeRawUnsafe(`UPDATE "User" SET "isPro"=true WHERE id=$1`, HOST);
  const made = await call(HOST, "/api/tournaments", "POST", create);
  check("a Pro account can host", made.status === 200 && !!made.body.id, `status=${made.status}`);
  const id = made.body.id;

  // ── Entering is free ───────────────────────────────────────────────────────
  const joins = [];
  for (const p of PLAYERS) joins.push(await call(p, `/api/tournaments/${id}/join`, "POST"));
  check("free accounts can enter", joins.every(j => j.status === 200),
    joins.map(j => j.status).join(","));

  const dup = await call(PLAYERS[0], `/api/tournaments/${id}/join`, "POST");
  check("you can't take two seats", dup.status === 409, `status=${dup.status}`);

  const stranger = await call(PLAYERS[0], `/api/tournaments/${id}/start`, "POST");
  check("only the host can start it", stranger.status === 403, `status=${stranger.status}`);

  // ── Starting builds a full bracket ─────────────────────────────────────────
  const started = await call(HOST, `/api/tournaments/${id}/start`, "POST");
  check("the host can start a full bracket", started.status === 200, `status=${started.status}`);

  const twice = await call(HOST, `/api/tournaments/${id}/start`, "POST");
  check("starting twice is refused", twice.status === 409, `status=${twice.status}`);

  const detail = await call(HOST, `/api/tournaments/${id}`);
  const ms = detail.body.matches ?? [];
  check("every fixture exists up front", ms.length === 3, `${ms.length} fixtures for a 4-player bracket`);
  const r1 = ms.filter(m => m.round === 1);
  check("round 1 is paired and playable", r1.length === 2 && r1.every(m => m.playerA && m.playerB && m.roomName),
    r1.map(m => m.roomName ?? "no room").join(", "));
  check("the final is waiting, not paired", ms.some(m => m.round === 2 && !m.playerA));

  // ── The promise: a bracket match moves no rating ───────────────────────────
  const eloBefore = Object.fromEntries((await prisma.$queryRawUnsafe(
    `SELECT id, elo, "rapidElo" FROM "User" WHERE id LIKE $1`, `${P}%`)).map(u => [u.id, [u.elo, u.rapidElo]]));

  const m1 = r1[0];
  const winner = m1.playerA;
  // Settle it the way a forfeit does: the loser hands it over.
  const settled = await call(m1.playerB, "/api/competitive/complete", "POST",
    { roomName: m1.roomName, forcedWinner: winner });
  check("a bracket match can be settled", settled.status === 200, `status=${settled.status}`);

  const eloAfter = Object.fromEntries((await prisma.$queryRawUnsafe(
    `SELECT id, elo, "rapidElo" FROM "User" WHERE id LIKE $1`, `${P}%`)).map(u => [u.id, [u.elo, u.rapidElo]]));
  const moved = ALL.filter(u => String(eloBefore[u]) !== String(eloAfter[u]));
  check("NO rating moved on any ladder", moved.length === 0,
    moved.length ? moved.map(u => `${u}: ${eloBefore[u]} -> ${eloAfter[u]}`).join("; ") : "elo and rapidElo unchanged");

  // ── and counts toward no ranked record ─────────────────────────────────────
  const board = await call(winner, "/api/leaderboards/battle?limit=50");
  const row = (board.body.rows ?? []).find(r => r.id === winner);
  check("a bracket win is not a Battle Grounds win",
    !row || !/[1-9]/.test(String(row.detail ?? "").split("–")[0] ?? ""),
    row ? `board says ${row.detail}` : "not on the board at all");

  const ranked = await call(winner, `/api/users/${winner}/matches?mode=ranked`);
  check("and doesn't appear in the ranked history", (ranked.body ?? []).length === 0,
    `${(ranked.body ?? []).length} ranked matches`);

  // ── Advancement waits for BOTH halves of the pairing ───────────────────────
  await new Promise(r => setTimeout(r, 1200));
  const halfway = await call(HOST, `/api/tournaments/${id}`);
  const pending = (halfway.body.matches ?? []).find(m => m.round === 2);
  check("one semi decided does not open the final", !pending?.playerA && !pending?.roomName,
    `final has ${pending?.playerA ?? "-"} vs ${pending?.playerB ?? "-"}`);

  const m2 = r1[1];
  const winner2 = m2.playerA;
  await call(m2.playerB, "/api/competitive/complete", "POST", { roomName: m2.roomName, forcedWinner: winner2 });
  await new Promise(r => setTimeout(r, 1500));

  const after = await call(HOST, `/api/tournaments/${id}`);
  const finalM = (after.body.matches ?? []).find(m => m.round === 2);
  const pair = [finalM?.playerA, finalM?.playerB];
  check("both winners are carried into the final",
    pair.includes(winner) && pair.includes(winner2),
    `final has ${finalM?.playerAName ?? "-"} vs ${finalM?.playerBName ?? "-"}`);
  check("and the final is open to play", !!finalM?.roomName, finalM?.roomName ?? "no room");

  // ── Taking the final crowns a champion ─────────────────────────────────────
  const champ = finalM.playerA;
  await call(finalM.playerB, "/api/competitive/complete", "POST", { roomName: finalM.roomName, forcedWinner: champ });
  await new Promise(r => setTimeout(r, 1500));
  const ended = await call(HOST, `/api/tournaments/${id}`);
  check("the tournament completes with a champion",
    ended.body.status === "complete" && ended.body.championId === champ,
    `status=${ended.body.status} champion=${ended.body.championName ?? "-"}`);

  // and STILL no rating moved, after three full matches
  const eloEnd = Object.fromEntries((await prisma.$queryRawUnsafe(
    `SELECT id, elo, "rapidElo" FROM "User" WHERE id LIKE $1`, `${P}%`)).map(u => [u.id, [u.elo, u.rapidElo]]));
  const movedEnd = ALL.filter(u => String(eloBefore[u]) !== String(eloEnd[u]));
  check("a whole tournament moves nobody's rating", movedEnd.length === 0,
    movedEnd.length ? movedEnd.join(", ") : "three matches, zero ELO change");

  await clean();
  console.log(failures ? `\n${failures} FAILURE(S)` : `\ntournaments hold: Pro hosts, anyone enters, and nobody's rating moves`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean(); await prisma.$disconnect(); process.exit(1); });
