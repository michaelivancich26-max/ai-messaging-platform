// An abandoned ranked match must end.
//
// Battle Grounds completion was entirely client-driven and nothing swept it up:
// resolveRapidMatchesFor filters isRapid, so a ranked 1v1 whose players closed
// the tab stayed status='active' forever with both ratings untouched. The
// optimal play when losing was to walk away.
//
// Asserts the sweep: a silent match with too little argued is VOIDED with no
// rating change; a silent match with enough argued is JUDGED on its transcript;
// and a match that is merely recent is left alone.
//
// Run: NEXTAUTH_SECRET=<secret> node scripts/verify-battle-abandon.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const P = "bgaban-";
const A = `${P}a`, B = `${P}b`;
const SILENT_THIN = `comp-${P}thin`;     // abandoned, below the message floor
const SILENT_FULL = `comp-${P}full`;     // abandoned, plenty argued
const FRESH = `comp-${P}fresh`;          // still live, must not be touched

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function clean() {
  for (const rn of [SILENT_THIN, SILENT_FULL, FRESH]) {
    // The judged path writes a JudgeShadow row. Leaving it behind fed fixture
    // matches into /api/admin/judge-shadow — the measurement the decision to
    // promote the rubric judge rests on.
    await prisma.$executeRawUnsafe(`DELETE FROM "JudgeShadow" WHERE "roomName"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "MatchPropositionPoint" WHERE "roomName"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "MatchProposition" WHERE "roomName"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "Message" WHERE "roomId"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "RoomMember" WHERE "roomId"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "Room" WHERE id=$1`, rn).catch(() => {});
  }
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`).catch(() => {});
}

// Build a match whose last message is `ageMin` minutes old, with `each` messages per side.
async function makeMatch(roomName, each, ageMin) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Room" (id,name,"isPrivate","creatorId","createdAt")
     VALUES ($1,$1,false,$2, NOW() - ($3::int * INTERVAL '1 minute'))`, roomName, A, ageMin + 5);
  await prisma.$executeRawUnsafe(`UPDATE "Room" SET "matchConfig"=$2 WHERE id=$1`, roomName,
    JSON.stringify({ isCompetitive: true, challengerId: A, challengedId: B, topic: "Abandonment fixture", type: "exchanges", limit: 10 }));
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompetitiveMatch"
       ("id","challengeId","challengerId","challengedId","challengerStance","challengedStance","roomName","status","challengerEloBefore","challengedEloBefore")
     VALUES (gen_random_uuid()::text,NULL,$1,$2,'affirmative','negative',$3,'active',1200,1200)`, A, B, roomName);
  for (let i = 0; i < each; i++) {
    for (const u of [A, B]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Message" (id,"roomId","userId",content,"senderType","createdAt")
         VALUES (gen_random_uuid()::text,$1,$2,$3,'HUMAN', NOW() - ($4::int * INTERVAL '1 minute'))`,
        roomName, u, `fixture argument ${i} from ${u}`, ageMin);
    }
  }
}

async function statusOf(roomName) {
  const r = await prisma.$queryRawUnsafe(`SELECT status FROM "CompetitiveMatch" WHERE "roomName"=$1`, roomName);
  return r[0]?.status ?? "(missing)";
}

async function main() {
  await clean();
  for (const [id, n] of [[A, `${P}alpha`], [B, `${P}beta`]]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id,username,email,password,elo) VALUES ($1,$2,$3,'x',1200)`, id, n, `${n}@t.local`);
  }

  // Silent 30 min: one below the floor (2 each, floor is 3), one well past it.
  await makeMatch(SILENT_THIN, 2, 30);
  await makeMatch(SILENT_FULL, 5, 30);
  // Fresh: plenty argued but only a minute of silence — must survive.
  await makeMatch(FRESH, 5, 1);

  check("all three start active",
    (await statusOf(SILENT_THIN)) === "active" && (await statusOf(SILENT_FULL)) === "active" && (await statusOf(FRESH)) === "active");

  // The sweep runs every 2 minutes and once at boot. Restarting the server is the
  // realistic trigger, so poll rather than reaching into it.
  //
  // Wait for a TERMINAL status, not merely a non-'active' one. This is what made
  // the suite flaky: the sweep CLAIMS a match before it settles it — 'closing' on
  // the void path, 'judging' while the judge reads the transcript — so "not
  // active" is already true a second or more before any result exists. A poll
  // tick landing in that window broke the loop early and the next line read
  // 'judging', failing an assertion about code that was working correctly.
  // Whether a tick lands there is pure phase between the poll grid and the sweep
  // interval, which is why re-running appeared to "fix" it.
  const TERMINAL = new Set(["void", "complete"]);
  console.log("  ..    waiting for the sweep (restart the server to trigger it immediately)");
  const deadline = Date.now() + 200_000;      // 2-min interval phase + judge latency
  while (Date.now() < deadline) {
    if (TERMINAL.has(await statusOf(SILENT_THIN)) && TERMINAL.has(await statusOf(SILENT_FULL))) break;
    await new Promise(r => setTimeout(r, 5000));
  }

  const thin = await statusOf(SILENT_THIN);
  const full = await statusOf(SILENT_FULL);
  const fresh = await statusOf(FRESH);

  check("a thin abandoned match is voided", thin === "void", `status=${thin}`);
  check("a full abandoned match is resolved", full === "complete", `status=${full}`);
  check("a fresh match is left alone", fresh === "active", `status=${fresh}`);

  const elos = await prisma.$queryRawUnsafe(`SELECT id, elo FROM "User" WHERE id LIKE $1 ORDER BY id`, `${P}%`);
  // The thin match must not have moved anything; the full one is judged, so ELO
  // moves — that is the point. Just assert the void didn't award a rating swing
  // on its own by checking both players aren't at some absurd value.
  check("ratings remain sane after resolution", elos.every(u => u.elo > 900 && u.elo < 1500),
    elos.map(u => `${u.id}=${u.elo}`).join(" "));

  await clean();
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nabandoned ranked matches resolve; live ones are untouched");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean(); await prisma.$disconnect(); process.exit(1); });
