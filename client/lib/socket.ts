import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(user?: { id: string; username: string }): Socket {
  // Reuse if connected or mid-connection (disconnected=false covers both states).
  // Only destroy and recreate when the socket has been fully closed.
  if (socket && !socket.disconnected) return socket;
  if (socket) { socket.disconnect(); socket = null; }

  socket = io(process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001", {
    transports: ["websocket"],
    auth: { user },
  });

  return socket;
}

export function resetSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
