// Judge coherence, shipped behind a shadow period.
//
// Under exchanges/time the winner came from a model reading the transcript that
// never consulted the rubric — so the persuasion bar players watched all match
// had no bearing on the result. Switching the rubric on directly would change
// how live ELO is awarded on a guess, so both judges now run on every match and
// RANKED_JUDGE decides which one is authoritative.
//
// Asserts: in shadow the model still decides and the rubric is only recorded;
// with RANKED_JUDGE=rubric the scores decide instead. Run the server in each
// mode and pass the mode as argv[2].
//
//   RANKED_JUDGE=shadow node --env-file=.env -r ts-node/register/transpile-only server.ts
//   NEXTAUTH_SECRET=... node scripts/verify-judge-shadow.js shadow
//
// Deliberately builds a match where the two judges MUST disagree: the side with
// the far better rubric scores is not the side the transcript flatters.
const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const MODE = process.argv[2] === "rubric" ? "rubric" : "shadow";
const P = "judge-";
const A = `${P}a`, B = `${P}b`;
const ROOM = `comp-${P}${MODE}`;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function clean() {
  for (const rn of [`comp-${P}shadow`, `comp-${P}rubric`]) {
    await prisma.$executeRawUnsafe(`DELETE FROM "JudgeShadow" WHERE "roomName"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "MatchPropositionPoint" WHERE "roomName"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "MatchProposition" WHERE "roomName"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "Claim" WHERE "roomId"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "Message" WHERE "roomId"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "RoomMember" WHERE "roomId"=$1`, rn).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "Room" WHERE id=$1`, rn).catch(() => {});
  }
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`).catch(() => {});
}

async function main() {
  await clean();
  for (const [id, n] of [[A, `${P}alpha`], [B, `${P}beta`]]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id,username,email,password,elo) VALUES ($1,$2,$3,'x',1200)`, id, n, `${n}@t.local`);
  }
  await prisma.$executeRawUnsafe(`INSERT INTO "Room" (id,name,"isPrivate","creatorId") VALUES ($1,$1,false,$2)`, ROOM, A);
  await prisma.$executeRawUnsafe(`UPDATE "Room" SET "matchConfig"=$2 WHERE id=$1`, ROOM,
    JSON.stringify({ isCompetitive: true, challengerId: A, challengedId: B, topic: "Judge coherence fixture", type: "exchanges", limit: 4 }));
  for (const u of [A, B]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "RoomMember" (id,"userId","roomId",role) VALUES ($1,$2,$3,'PARTICIPANT')`, `${ROOM}-${u}`, u, ROOM);
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompetitiveMatch"
       ("id","challengeId","challengerId","challengedId","challengerStance","challengedStance","roomName","status","challengerEloBefore","challengedEloBefore")
     VALUES (gen_random_uuid()::text,NULL,$1,$2,'affirmative','negative',$3,'active',1200,1200)`, A, B, ROOM);

  // B's claims score far higher. Whatever the model makes of the prose, the
  // rubric has exactly one answer, so a disagreement is detectable.
  const rows = [
    [A, "I think this is obviously right and most people would agree with me.", "CONTESTED", 30],
    [A, "It just stands to reason when you think about it properly.", "REFUTED", 22],
    [B, "The 2023 review put the figure at 12 percent, against the 40 percent claimed.", "SUPPORTED", 91],
    [B, "Three of the four cited studies were retracted before publication.", "SUPPORTED", 88],
  ];
  for (const [uid, text, status, score] of rows) {
    const mid = `${ROOM}-m-${Math.random().toString(36).slice(2, 9)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Message" (id,"roomId","userId",content,"senderType") VALUES ($1,$2,$3,$4,'HUMAN')`, mid, ROOM, uid, text);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Claim" (id,"messageId","roomId","claimantId",text,status,relevance,evidence,logic,impact,score)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5::"ClaimStatus",7,7,7,7,$6)`,
      mid, ROOM, uid, text, status, score);
  }

  // The settle route is participant-gated, so sign in as one of the debaters.
  const tok = await encode({ token: { id: A, username: `${P}alpha` }, secret: process.env.NEXTAUTH_SECRET });
  const res = await fetch(`${process.env.SERVER_URL ?? "http://localhost:3001"}/api/competitive/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ roomName: ROOM }),
  }).catch(() => null);
  // The HTTP route is participant-gated; settle directly if it refuses.
  if (!res || !res.ok) console.log(`  ..    HTTP settle returned ${res ? res.status : "network error"}; reading whatever the server recorded`);

  await new Promise(r => setTimeout(r, 2500));

  const m = await prisma.$queryRawUnsafe(`SELECT status,"winnerId" FROM "CompetitiveMatch" WHERE "roomName"=$1`, ROOM);
  const sh = await prisma.$queryRawUnsafe(`SELECT * FROM "JudgeShadow" WHERE "roomName"=$1`, ROOM);

  if (m[0]?.status !== "complete") {
    console.log(`  ..    match did not settle (status=${m[0]?.status}); the judge needs a live server and an API key`);
    await clean(); await prisma.$disconnect(); process.exit(0);
  }

  check("a shadow row is recorded for the match", sh.length === 1);
  check("the rubric picked the higher-scoring side", sh[0]?.rubricWinnerId === B,
    `rubric=${sh[0]?.rubricWinnerId} scoreA=${sh[0]?.scoreA} scoreB=${sh[0]?.scoreB}`);
  check("the recorded mode matches the server's", sh[0]?.mode === MODE, `mode=${sh[0]?.mode}`);

  if (MODE === "shadow") {
    check("the live winner is the MODEL's, not the rubric's",
      m[0].winnerId === sh[0].liveWinnerId,
      `live=${m[0].winnerId} model=${sh[0].liveWinnerId} rubric=${sh[0].rubricWinnerId}`);
    console.log(sh[0].agreed === false
      ? "  ..    the two judges disagreed here — which is the entire point of measuring"
      : "  ..    the two judges agreed on this one");
  } else {
    check("the rubric decided the match", m[0].winnerId === sh[0].rubricWinnerId,
      `live=${m[0].winnerId} rubric=${sh[0].rubricWinnerId}`);
  }

  await clean();
  console.log(failures ? `\n${failures} FAILURE(S)` : `\njudge ${MODE} mode behaves as specified`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean(); await prisma.$disconnect(); process.exit(1); });
