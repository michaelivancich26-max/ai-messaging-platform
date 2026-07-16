import { io, Socket } from "socket.io-client";
import { sessionToken, clearSessionToken } from "./api";

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

  // A handshake the server REJECTS is terminal: socket.io treats a middleware
  // error as non-retryable and never reconnects on its own. That's right for a
  // genuinely invalid session and wrong for the common case — one transient
  // failure fetching the token sends `undefined`, gets refused, and realtime is
  // dead for the rest of the tab's life with no way back but a reload.
  //
  // So: drop the cached token (it's the likeliest culprit) and retry, backing
  // off, a few times. Bounded on purpose — if the session really is gone, the
  // right outcome is to stop knocking, not to hammer the server forever.
  let attempts = 0;
  socket.on("connect_error", (err) => {
    if (err?.message !== "Authentication required") return;   // transport errors retry themselves
    if (++attempts > 3) return;
    clearSessionToken();
    setTimeout(() => socket?.connect(), attempts * 1000);
  });
  socket.on("connect", () => { attempts = 0; });

  return socket;
}

export function resetSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
