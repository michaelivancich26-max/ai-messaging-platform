// Messages must never carry the author's credentials.
//
// Messages are loaded with `include: { user: true }` — the whole User row — and
// that object was spread straight onto the wire. Every message in a room shipped
// the author's bcrypt password hash and email address to every other client in
// it, over REST and over the socket. This asserts the author projection holds on
// both, and that isPro (which the Pro badge needs) still comes through.
//
// Run: NEXTAUTH_SECRET=<secret> node scripts/verify-message-author.js
const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { io } = require(`${CLIENT}/socket.io-client`);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const SERVER = process.env.SERVER_URL ?? "http://localhost:3001";
const SECRET = process.env.NEXTAUTH_SECRET;
if (!SECRET) { console.error("NEXTAUTH_SECRET required"); process.exit(1); }

const P = "author-probe-";
const AUTHOR = `${P}author`;
const READER = `${P}reader`;
const ROOM = `${P}room`;

const FORBIDDEN = ["password", "email", "emailVerified", "isAdmin", "bio", "createdAt"];
const REQUIRED = ["id", "username", "avatarUrl", "isPro"];

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const tokenFor = (id, username) => encode({ token: { id, username, isAdmin: false }, secret: SECRET });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function clean() {
  await prisma.$executeRawUnsafe(`DELETE FROM "Message" WHERE "roomId" = $1`, ROOM).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "Channel" WHERE "roomId" = $1`, ROOM).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "RoomMember" WHERE "roomId" = $1`, ROOM).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "Room" WHERE id = $1`, ROOM).catch(() => {});
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`).catch(() => {});
}

function auditAuthor(label, user) {
  if (!user) { check(`${label}: author object present`, false, "(missing)"); return; }
  const leaked = FORBIDDEN.filter(k => k in user);
  check(`${label}: no credential fields`, leaked.length === 0,
    leaked.length ? `LEAKED ${leaked.join(", ")}` : `keys: ${Object.keys(user).sort().join(",")}`);
  const missing = REQUIRED.filter(k => !(k in user));
  check(`${label}: still has what the UI needs`, missing.length === 0,
    missing.length ? `missing ${missing.join(", ")}` : `isPro=${user.isPro}`);
}

async function main() {
  await clean();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" (id,username,email,password,"isPro") VALUES ($1,$2,$3,'super-secret-hash',true),($4,$5,$6,'x',false)`,
    AUTHOR, `${P}author`, `${P}author@secret.local`,
    READER, `${P}reader`, `${P}reader@secret.local`);
  await prisma.$executeRawUnsafe(`INSERT INTO "Room" (id,name,"isPrivate") VALUES ($1,$1,false)`, ROOM);
  await prisma.$executeRawUnsafe(`INSERT INTO "Channel" (id,"roomId",name,"order") VALUES ($1,$2,'general',0)`, `${P}chan`, ROOM);
  for (const u of [AUTHOR, READER]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "RoomMember" (id,"userId","roomId",role) VALUES ($1,$2,$3,'PARTICIPANT')`, `${P}m-${u}`, u, ROOM);
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Message" (id,"roomId","channelId","userId",content,"senderType")
     VALUES ($1,$2,$3,$4,'seeded','HUMAN')`, `${P}msg`, ROOM, `${P}chan`, AUTHOR);

  const readerToken = await tokenFor(READER, `${P}reader`);

  // 1. REST history
  const rest = await fetch(`${SERVER}/api/channels/${P}chan/messages`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  const body = await rest.json().catch(() => null);
  const first = Array.isArray(body) ? body[0] : null;
  check("REST history returns the message", !!first, `status=${rest.status}`);
  if (first) auditAuthor("REST", first.user);

  // 2. Live socket broadcast — the hot path, which does not use mapMessages.
  const authorSock = io(SERVER, { auth: { token: await tokenFor(AUTHOR, `${P}author`) }, transports: ["websocket"], reconnection: false });
  const readerSock = io(SERVER, { auth: { token: readerToken }, transports: ["websocket"], reconnection: false });
  await Promise.all([
    new Promise((res, rej) => { authorSock.on("connect", res); authorSock.on("connect_error", rej); }),
    new Promise((res, rej) => { readerSock.on("connect", res); readerSock.on("connect_error", rej); }),
  ]);

  const received = [];
  readerSock.on("message", m => received.push(m));
  authorSock.emit("joinRoom", { roomId: ROOM, roomName: ROOM });
  readerSock.emit("joinRoom", { roomId: ROOM, roomName: ROOM });
  await sleep(1200);
  authorSock.emit("sendMessage", { roomId: ROOM, content: "live probe" });
  await sleep(2500);

  const live = received.find(m => m?.content === "live probe");
  check("socket broadcast delivers the message", !!live, `${received.length} received`);
  if (live) auditAuthor("socket", live.user);

  authorSock.close(); readerSock.close();
  await clean();
  console.log(failures ? `\n${failures} FAILURE(S) — author projection is leaking` : "\nauthor projection holds");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await clean(); await prisma.$disconnect(); process.exit(1); });
