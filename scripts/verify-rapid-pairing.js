// Does Rapid pair on real disagreement, and does each side get their OWN view?
//
// The fixture is the test: the two probes AGREE on nine claims and disagree on
// exactly one. If pairing matched on anything looser — a shared category, any
// shared proposition, a coin flip — it would pick one of the nine and this
// fails. It can only pass by finding the single genuine disagreement.
//
// Runs against the live server over real sockets, so it exercises the actual
// path: handshake auth, the deck gate, the pairing query, side assignment.

const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { io } = require(`${CLIENT}/socket.io-client`);
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { PrismaClient } = require("C:/Users/micha/SetupforClaude/ai-messaging-platform/node_modules/@prisma/client");

const prisma = new PrismaClient();
const SERVER = "http://localhost:3001";
const A = "rapid-probe-a";
const B = "rapid-probe-b";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function cleanup() {
  const ids = [A, B];
  await prisma.$executeRawUnsafe(`DELETE FROM "DebateQueue" WHERE "userId" = ANY($1::text[])`, ids);
  await prisma.$executeRawUnsafe(`DELETE FROM "UserBelief" WHERE "userId" = ANY($1::text[])`, ids);
  await prisma.$executeRawUnsafe(`DELETE FROM "BeliefChange" WHERE "userId" = ANY($1::text[])`, ids);
  await prisma.$executeRawUnsafe(
    `DELETE FROM "MatchProposition" WHERE "roomName" IN (SELECT "roomName" FROM "CompetitiveMatch" WHERE $1 IN ("challengerId","challengedId"))`, A);
  await prisma.$executeRawUnsafe(`DELETE FROM "CompetitiveMatch" WHERE "challengerId" = ANY($1::text[]) OR "challengedId" = ANY($1::text[])`, ids);
  await prisma.$executeRawUnsafe(`DELETE FROM "RoomMember" WHERE "userId" = ANY($1::text[])`, ids);
  await prisma.$executeRawUnsafe(`DELETE FROM "Room" WHERE "creatorId" = ANY($1::text[])`, ids);
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id = ANY($1::text[])`, ids);
}

async function main() {
  await cleanup();

  for (const [id, name] of [[A, "probealpha"], [B, "probebeta"]]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id, username, email, password) VALUES ($1,$2,$3,'')`,
      id, name, `${name}@probe.local`,
    );
  }

  const props = await prisma.$queryRawUnsafe(
    `SELECT id, text FROM "Proposition" WHERE status='live' ORDER BY id LIMIT 10`);
  if (props.length < 10) { console.error("need 10 live propositions"); process.exit(1); }

  // Nine shared views...
  for (const p of props.slice(0, 9)) {
    for (const u of [A, B]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "UserBelief" ("userId","propositionId","stance","confidence") VALUES ($1,$2,'agree',2)`,
        u, p.id);
    }
  }
  // ...and one real fight.
  const contested = props[9];
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserBelief" ("userId","propositionId","stance","confidence") VALUES ($1,$2,'agree',2)`, A, contested.id);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserBelief" ("userId","propositionId","stance","confidence") VALUES ($1,$2,'disagree',2)`, B, contested.id);

  console.log(`  fixture: agree on 9, disagree on "${contested.text}"\n`);

  const secret = process.env.NEXTAUTH_SECRET;
  const connect = async (id, username) => {
    const token = await encode({ token: { id, username }, secret, maxAge: 300 });
    const s = io(SERVER, { transports: ["websocket"], auth: (cb) => cb({ token }), reconnection: false });
    await new Promise((res, rej) => { s.on("connect", res); s.on("connect_error", rej); });
    return s;
  };

  const sa = await connect(A, "probealpha");
  const sb = await connect(B, "probebeta");

  const found = {};
  const gotBoth = new Promise((resolve) => {
    let n = 0;
    const on = (who) => (m) => { found[who] = m; if (++n === 2) resolve(); };
    sa.on("rapidMatchFound", on("a"));
    sb.on("rapidMatchFound", on("b"));
    sa.on("rapidNeedsDeck", (d) => { check("A was not gated", false, JSON.stringify(d)); resolve(); });
    sb.on("rapidNeedsDeck", (d) => { check("B was not gated", false, JSON.stringify(d)); resolve(); });
    setTimeout(resolve, 8000);
  });

  sa.emit("rapidQueueJoin", { categoryId: null });
  await new Promise((r) => setTimeout(r, 400));   // let A land in the pool first
  sb.emit("rapidQueueJoin", { categoryId: null });
  await gotBoth;

  // Drop the "must not be gated" guards before the gate test below deliberately
  // triggers exactly that event on this same socket.
  sa.off("rapidNeedsDeck"); sb.off("rapidNeedsDeck");

  check("both were matched", !!found.a && !!found.b);
  if (found.a && found.b) {
    check("matched on the ONE claim they disagree about", found.a.topic === contested.text,
      `got "${found.a.topic}"`);
    check("same room", found.a.roomName === found.b.roomName);
    check("opposite sides", found.a.stance !== found.b.stance,
      `${found.a.stance} vs ${found.b.stance}`);
    // A agrees -> affirmative. B disagrees -> negative. Not a coin flip.
    check("A argues the side A actually holds (agree -> FOR)", found.a.stance === "affirmative", found.a.stance);
    check("B argues the side B actually holds (disagree -> AGAINST)", found.b.stance === "negative", found.b.stance);

    const cfg = await prisma.$queryRawUnsafe(
      `SELECT "matchConfig" FROM "Room" WHERE name = $1`, found.a.roomName);
    const parsed = JSON.parse(cfg[0]?.matchConfig ?? "{}");
    check("propositionId recorded on the round", parsed.propositionId === contested.id);
  }

  // The gate: a user with no positions can't queue.
  await prisma.$executeRawUnsafe(`DELETE FROM "UserBelief" WHERE "userId" = $1`, A);
  const gated = await new Promise((resolve) => {
    sa.once("rapidNeedsDeck", (d) => resolve(d));
    sa.emit("rapidQueueJoin", { categoryId: null });
    setTimeout(() => resolve(null), 4000);
  });
  check("a user with no positions is turned away", gated !== null && gated.gate === 10,
    gated ? `${gated.positioned}/${gated.gate}` : "no rapidNeedsDeck received");

  sa.close(); sb.close();
  await new Promise((r) => setTimeout(r, 600));   // let disconnect handlers settle
  await cleanup();

  const left = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "User" WHERE id LIKE 'rapid-probe-%'`);
  check("fixture removed", left[0].n === 0, `${left[0].n} users left`);

  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
