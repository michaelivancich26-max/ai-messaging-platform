import { signOut } from "next-auth/react";
import { clearSessionToken } from "./api";
import { resetSocket } from "./socket";

// Sign out, and take the session with you.
//
// next-auth's signOut only clears its cookie. It knows nothing about the token
// we cache in memory to authorise server calls, or about the socket already
// connected under the old identity — both would otherwise survive into whoever
// signs in next on this tab.
//
// Lives here rather than in api.ts because socket.ts imports from that, and
// api.ts importing back would be a cycle.
export async function signOutEverywhere(callbackUrl = "/"): Promise<void> {
  clearSessionToken();
  resetSocket();
  await signOut({ callbackUrl });
}
