// /api/analytics/me is Pro-gated, self-only, and returns numbers that must survive
// res.json — the two ways this breaks are a BigInt escaping an un-cast COUNT and a
// win rate presented off one match. Real HTTP with real NextAuth tokens.

const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET;
const P = "anaprobe-";
const FREE = `${P}free`, PRO = `${P}pro`, OPP = `${P}opp`, GONE = `${P}gone`;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function clean() {
  await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName" LIKE $1`, `${P}%`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Claim" WHERE "claimantId" LIKE $1`, `${P}%`);
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`);
}

const get = async (id, path) => {
  const token = await encode({ token: { id, username: id, isAdmin: false }, secret: SECRET });
  const r = await fetch(`${SERVER}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

// Walks the payload for any value that would have thrown on res.json, and for
// numbers that arrived as strings (the shape of a missed ::int / ::float8 cast).
function scanNumbers(node, path, bad) {
  if (node == null) return;
  if (typeof node === "bigint") { bad.push(`${path}: BigInt`); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => scanNumbers(v, `${path}[${i}]`, bad)); return; }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && !/At$|week|Id$|name|label|format/i.test(k)) {
        bad.push(`${path}.${k}: numeric string "${v}"`);
      }
      scanNumbers(v, `${path}.${k}`, bad);
    }
  }
}

async function main() {
  if (!SECRET) { console.log("NEXTAUTH_SECRET missing"); process.exit(1); }
  await clean();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" (id,username,email,password,"isPro") VALUES
       ($1,$1,$1||'@x.local','x',false),
       ($2,$2,$2||'@x.local','x',true),
       ($3,$3,$3||'@x.local','x',false),
       ($4,$4,$4||'@x.local','x',false)`, FREE, PRO, OPP, GONE);
  await prisma.$executeRawUnsafe(`UPDATE "User" SET "deletedAt" = NOW() WHERE id = $1`, GONE)
    .catch(() => console.log("  note: no deletedAt column — skipping the deleted-opponent case"));

  // Four Battle Grounds matches vs OPP (3 wins), and one vs a deleted account.
  for (let i = 0; i < 4; i++) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CompetitiveMatch"
         (id,"challengerId","challengedId","challengerStance","challengedStance","roomName",status,"winnerId",
          "challengerEloBefore","challengedEloBefore","challengerEloAfter","challengedEloAfter","completedAt","isRapid")
       VALUES (gen_random_uuid()::text,$1,$2,'affirmative','negative',$3,'complete',$4,1200,1200,1216,1184,NOW(),FALSE)`,
      PRO, OPP, `${P}m${i}`, i < 3 ? PRO : OPP);
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompetitiveMatch"
       (id,"challengerId","challengedId","challengerStance","challengedStance","roomName",status,"winnerId",
        "challengerEloBefore","challengedEloBefore","challengerEloAfter","challengedEloAfter","completedAt","isRapid")
     VALUES (gen_random_uuid()::text,$1,$2,'affirmative','negative',$3,'complete',$1,1200,1200,1216,1184,NOW(),FALSE)`,
    PRO, GONE, `${P}mg`);

  const anon = await fetch(`${SERVER}/api/analytics/me`);
  check("unauthenticated is refused", anon.status === 401, `status=${anon.status}`);

  const free = await get(FREE, "/api/analytics/me");
  check("non-Pro gets 402 pro_only", free.status === 402 && free.body?.code === "pro_only", `status=${free.status}`);

  const pro = await get(PRO, "/api/analytics/me?refresh=1");
  check("Pro gets 200", pro.status === 200, `status=${pro.status}`);
  const b = pro.body ?? {};

  check("payload has every panel key",
    ["ratings", "rubric", "formats", "byCategory", "headToHead", "bots", "minRateN"].every(k => k in b),
    Object.keys(b).join(","));

  const bad = [];
  scanNumbers(b, "body", bad);
  check("no BigInt or un-cast numeric strings", bad.length === 0, bad.slice(0, 4).join("; "));

  const battle = (b.formats ?? []).find(f => f.format === "battle");
  check("battle format counts the 5 completed matches", battle?.played === 5, JSON.stringify(battle));
  check("win rate computed above the floor", battle?.winRate === 80, `winRate=${battle?.winRate}`);

  const rapid = (b.formats ?? []).find(f => f.format === "rapid");
  check("a format under the floor reports null, not 0%", rapid?.played === 0 && rapid?.winRate === null,
    JSON.stringify(rapid));

  const named = (b.headToHead ?? []).find(h => h.opponentName === OPP);
  check("head-to-head aggregates the right opponent", named?.played === 4 && named?.wins === 3, JSON.stringify(named));

  const deleted = (b.headToHead ?? []).find(h => h.opponentName === "Former member");
  check("deleted opponent is de-identified", !!deleted && deleted.opponentId === null,
    deleted ? "id withheld" : "no Former member row");

  check("rapid is excluded from head-to-head entirely",
    (b.headToHead ?? []).every(h => h.played > 0) && b.ratings?.rapid?.points?.length === 0,
    `h2h=${(b.headToHead ?? []).length}`);

  await clean();
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nanalytics endpoint holds");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async e => { console.error(e); await clean().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
