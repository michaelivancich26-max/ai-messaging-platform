// Can two ways of ending the same rapid round both win the right to end it?
//
// forfeitRapidRound, settleRapidOnBar, and their void sub-paths all now pass
// through claimRapidRound first: a single UPDATE that flips status 'active' ->
// 'closing'. This asserts the guarantee that rests on — that of any number of
// concurrent claims against one active round, EXACTLY ONE gets rowcount 1.
// That is the whole reason two disconnects can no longer race opposite winners
// into the ELO table.
//
// Tests the SQL directly rather than the socket flow, because the claim SQL IS
// the correctness argument; the callers are one-liners the typecheck covers.
// Needs Postgres up (docker compose) — does not need the server running.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ROOM = "race-probe-room";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// The exact statement claimRapidRound runs.
const CLAIM = `UPDATE "CompetitiveMatch" SET status='closing'
  WHERE "roomName"=$1 AND status='active' AND "isRapid"=TRUE`;
// The exact statement voidRapidRound runs.
const VOID = `UPDATE "CompetitiveMatch" SET status='void', "completedAt"=NOW()
  WHERE "roomName"=$1 AND status IN ('active','closing')`;

async function seedActive() {
  await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName"=$1`, ROOM);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompetitiveMatch"
       ("id","challengeId","challengerId","challengedId","challengerStance","challengedStance","roomName","status","isRapid")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,'active',TRUE)`,
    null, "race-A", "race-B", "affirmative", "negative", ROOM,
  );
}

async function main() {
  // 1. Many concurrent claims, one active round -> exactly one winner.
  await seedActive();
  const claims = await Promise.all(
    Array.from({ length: 8 }, () => prisma.$executeRawUnsafe(CLAIM, ROOM)),
  );
  const won = claims.filter((n) => n === 1).length;
  check("exactly one of 8 concurrent claims wins", won === 1, `${won} won`);

  const after = await prisma.$queryRawUnsafe(
    `SELECT status FROM "CompetitiveMatch" WHERE "roomName"=$1`, ROOM);
  check("round is now 'closing'", after[0]?.status === "closing", after[0]?.status);

  // 2. Two full enders race, EXACTLY as the real functions run: each claims,
  //    and only the winner acts (here, voids). This is the scenario that used to
  //    corrupt ELO — a forfeit and a settle both reaching completion. Only one
  //    must get past its claim.
  await seedActive();
  const ender = async () => {
    const won = (await prisma.$executeRawUnsafe(CLAIM, ROOM)) === 1;
    if (!won) return false;
    await prisma.$executeRawUnsafe(VOID, ROOM);   // the winner alone ends it
    return true;
  };
  const acted = (await Promise.all([ender(), ender()])).filter(Boolean).length;
  check("of two full enders racing, exactly one acts", acted === 1, `${acted} acted`);
  const final = await prisma.$queryRawUnsafe(
    `SELECT status FROM "CompetitiveMatch" WHERE "roomName"=$1`, ROOM);
  check("round ended exactly once (void)", final[0]?.status === "void", final[0]?.status);

  // 3. A claim on an ALREADY-closing round loses — a second ender arriving after
  //    the first has taken it.
  await seedActive();
  await prisma.$executeRawUnsafe(CLAIM, ROOM);            // first ender takes it
  const late = await prisma.$executeRawUnsafe(CLAIM, ROOM);
  check("a claim on a non-active round loses", late === 0, `rowcount ${late}`);

  await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName"=$1`, ROOM);
  const left = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "CompetitiveMatch" WHERE "roomName"=$1`, ROOM);
  check("probe row removed", left[0].n === 0);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} FAILED` : "\nall passed — the round can only be claimed once");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => {}); process.exit(1); });
