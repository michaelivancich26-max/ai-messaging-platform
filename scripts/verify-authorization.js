// Authentication proves you're SOMEBODY. These four endpoints also needed to
// check you're the RIGHT somebody — that you're in the match you're settling,
// or the owner of the profile you're editing/reading privately. Authn was
// fixed earlier; this is authz, and it's what stops any signed-in user from
// handing themselves a win or rewriting a stranger's profile.
//
// Real HTTP with real NextAuth tokens. Needs the server up.

const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const P = "authz-probe-";
const A = `${P}a`, B = `${P}b`, C = `${P}c`;   // A vs B in a match; C an outsider
const ROOM = `${P}room`;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function clean() {
  await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "roomName"=$1`, ROOM);
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`);
}

async function main() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) { console.error("NEXTAUTH_SECRET not set"); process.exit(1); }
  await clean();

  for (const [id, name, email] of [
    [A, "authzalpha", "alpha@probe.local"],
    [B, "authzbeta", "beta@probe.local"],
    [C, "authzcee", "cee@probe.local"],
  ]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id, username, email, password, "emailVerified") VALUES ($1,$2,$3,'',NOW())`, id, name, email);
  }
  const tok = async (id, u) => encode({ token: { id, username: u }, secret, maxAge: 300 });
  const hdr = (t) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
  const [tA, tB, tC] = [await tok(A, "authzalpha"), await tok(B, "authzbeta"), await tok(C, "authzcee")];

  // A 1v1 competitive match between A and B (status active).
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompetitiveMatch"
       ("id","challengeId","challengerId","challengedId","challengerStance","challengedStance","roomName","status")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,'active')`,
    null, A, B, "affirmative", "negative", ROOM);

  const complete = (t, body) => fetch(`${SERVER}/api/competitive/complete`, {
    method: "POST", headers: hdr(t), body: JSON.stringify(body),
  });

  // 1. An outsider cannot settle someone else's match.
  const outsider = await complete(tC, { roomName: ROOM, forcedWinner: C });
  check("outsider cannot complete a match", outsider.status === 403, `HTTP ${outsider.status}`);

  // 2. A participant cannot declare THEMSELVES the winner.
  const selfWin = await complete(tA, { roomName: ROOM, forcedWinner: A });
  check("a participant can't name themselves winner", selfWin.status === 403, `HTTP ${selfWin.status}`);

  // 3. A participant CAN forfeit to their opponent — gets past the auth gate
  //    (not 403; it may 404/err later inside completion, which is fine here).
  const forfeit = await complete(tA, { roomName: ROOM, forcedWinner: B });
  check("a participant may forfeit to their opponent (passes auth)", forfeit.status !== 403, `HTTP ${forfeit.status}`);

  // Reset the match to active (case 3 may have completed/void'd it).
  await prisma.$executeRawUnsafe(`UPDATE "CompetitiveMatch" SET status='active', "winnerId"=NULL WHERE "roomName"=$1`, ROOM);

  // 4. Profile privacy: a stranger doesn't get account fields; the owner does.
  const asStranger = await fetch(`${SERVER}/api/users/${A}/profile`, { headers: hdr(tC) }).then((r) => r.json());
  check("a stranger's profile view hides email", !asStranger.email && !asStranger.emailVerified, JSON.stringify({ email: asStranger.email }));
  const asOwner = await fetch(`${SERVER}/api/users/${A}/profile`, { headers: hdr(tA) }).then((r) => r.json());
  check("the owner's own view includes email", asOwner.email === "alpha@probe.local", asOwner.email);

  // 5. Profile edit: only the owner.
  const editOther = await fetch(`${SERVER}/api/users/${A}/profile`, {
    method: "PATCH", headers: hdr(tC), body: JSON.stringify({ bio: "hacked" }),
  });
  check("a stranger cannot edit your profile", editOther.status === 403, `HTTP ${editOther.status}`);
  const editSelf = await fetch(`${SERVER}/api/users/${A}/profile`, {
    method: "PATCH", headers: hdr(tA), body: JSON.stringify({ bio: "mine" }),
  });
  check("the owner can edit their own profile", editSelf.status === 200, `HTTP ${editSelf.status}`);
  const bio = await prisma.$queryRawUnsafe(`SELECT bio FROM "User" WHERE id=$1`, A);
  check("the edit stuck (and the stranger's did not)", bio[0].bio === "mine", bio[0].bio);

  await clean();
  const left = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "User" WHERE id LIKE $1`, `${P}%`);
  check("fixture removed", left[0].n === 0);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} FAILED` : "\nall passed — only the right somebody can act");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean().catch(() => {}); await prisma.$disconnect().catch(() => {}); process.exit(1); });
