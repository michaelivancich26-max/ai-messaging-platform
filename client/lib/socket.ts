import { io, Socket } from "socket.io-client";
import { sessionToken } from "./api";

let socket: Socket | null = null;

// The socket used to be handed `{ id, username }` straight from the client and
// the server took it at face value — it only ever checked that the object had
// been sent, never that it was true. Anyone could connect as anyone, and every
// event downstream inherited that identity. Now we send the session token and
// the server decides who we are.
//
// `auth` is passed as a callback because fetching the token is async and
// socket.io supports exactly this: it defers the handshake until we call back.
// That keeps getSocket() synchronous for its callers, and it re-runs on every
// reconnect, so a token refreshed mid-session is picked up for free.
export function getSocket(): Socket {
  // Reuse if connected or mid-connection (disconnected=false covers both states).
  // Only destroy and recreate when the socket has been fully closed.
  if (socket && !socket.disconnected) return socket;
  if (socket) { socket.disconnect(); socket = null; }

  socket = io(process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001", {
    transports: ["websocket"],
    auth: (cb) => { sessionToken().then((token) => cb({ token })); },
  });

  return socket;
}

export function resetSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
