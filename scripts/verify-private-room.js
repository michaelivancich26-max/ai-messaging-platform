// Proof for the private-room socket bypass.
//
// joinRoom authorises the room found by payload.roomName, then joins the socket
// channel named by the SEPARATE payload.roomId. userMayAccessRoom() treats
// socket.rooms membership as proof the password was cleared, so joining a channel
// we never authorised granted read AND write on a private password room.
//
// Attack: roomName = a public room we may join freely, roomId = the private room.
// Expect BEFORE the fix: attacker receives messages broadcast to the private room.
// Expect AFTER  the fix: attacker is never in that channel and receives nothing.

const CLIENT = "C:/Users/micha/SetupforClaude/ai-messaging-platform/client/node_modules";
const { encode } = require(`${CLIENT}/next-auth/jwt`);
const { io } = require(`${CLIENT}/socket.io-client`);
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("C:/Users/micha/SetupforClaude/ai-messaging-platform/node_modules/bcryptjs");
const prisma = new PrismaClient();

const SERVER = "http://localhost:3001";
const P = "privprobe-";
const OWNER = `${P}owner`, ATTACKER = `${P}attacker`;
const PRIVATE_ROOM = `${P}private`, PUBLIC_ROOM = `${P}public`;
const SECRET = process.env.NEXTAUTH_SECRET;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function clean() {
  await prisma.$executeRawUnsafe(`DELETE FROM "Message" WHERE "roomId" IN (SELECT id FROM "Room" WHERE name LIKE $1)`, `${P}%`);
  await prisma.$executeRawUnsafe(`DELETE FROM "RoomMember" WHERE "roomId" IN (SELECT id FROM "Room" WHERE name LIKE $1)`, `${P}%`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Room" WHERE name LIKE $1`, `${P}%`);
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, `${P}%`);
}

const tokenFor = (id, username) =>
  encode({ token: { id, username, isAdmin: false }, secret: SECRET });

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(SERVER, { auth: { token }, transports: ["websocket"], reconnection: false });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
    setTimeout(() => reject(new Error("socket connect timeout")), 8000);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!SECRET) { console.log("NEXTAUTH_SECRET missing"); process.exit(1); }
  await clean();

  const hash = bcrypt.hashSync("hunter2", 12);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" (id,username,email,password) VALUES ($1,$1,$1||'@x.local','x'),($2,$2,$2||'@x.local','x')`,
    OWNER, ATTACKER);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Room" (id,name,"creatorId","isPrivate",password) VALUES ($1,$1,$2,true,$3)`,
    PRIVATE_ROOM, OWNER, hash);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Room" (id,name,"creatorId","isPrivate") VALUES ($1,$1,$2,false)`,
    PUBLIC_ROOM, OWNER);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "RoomMember" (id,"userId","roomId",role) VALUES ($1,$2,$3,'PARTICIPANT')`,
    `${P}m1`, OWNER, PRIVATE_ROOM);

  const ownerSock = await connect(await tokenFor(OWNER, OWNER));
  const attackerSock = await connect(await tokenFor(ATTACKER, ATTACKER));

  // Owner legitimately enters the private room with the password.
  ownerSock.emit("joinRoom", { roomId: PRIVATE_ROOM, roomName: PRIVATE_ROOM, password: "hunter2" });
  await sleep(1500);

  // THE ATTACK: authorise the public room, join the private room's channel.
  const leaked = [];
  attackerSock.on("message", m => leaked.push(m?.content ?? ""));
  attackerSock.emit("joinRoom", { roomId: PRIVATE_ROOM, roomName: PUBLIC_ROOM });
  await sleep(1500);

  // Owner speaks in the private room.
  ownerSock.emit("sendMessage", { roomId: PRIVATE_ROOM, content: "SECRET-CANARY-9f3a private room contents" });
  await sleep(4000);

  const readLeak = leaked.some(c => String(c).includes("SECRET-CANARY-9f3a"));
  check("attacker CANNOT read private room messages", !readLeak,
    readLeak ? "LEAKED: attacker received the canary" : "no canary received");

  // Write side: can the attacker post into the private room?
  attackerSock.emit("sendMessage", { roomId: PRIVATE_ROOM, content: "ATTACKER-WROTE-HERE" });
  await sleep(4000);
  const wrote = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "Message" WHERE "roomId"=$1 AND content LIKE '%ATTACKER-WROTE-HERE%'`, PRIVATE_ROOM);
  check("attacker CANNOT write into private room", (wrote[0]?.n ?? 0) === 0, `rows=${wrote[0]?.n}`);

  ownerSock.close(); attackerSock.close();
  await clean();
  console.log(failures ? `\n${failures} FAILURE(S) — bypass is OPEN` : "\nprivate-room boundary holds");
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async e => { console.error(e); await clean().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
