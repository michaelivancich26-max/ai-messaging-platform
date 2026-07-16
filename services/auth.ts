// Verifying the caller's identity.
//
// Until this existed the server had no authentication at all: every REST route
// read `userId` out of the query or body and believed it, and the socket
// handshake checked only that an identity object had been SENT, never that it
// was real. Anyone could act as anyone by editing a fetch.
//
// The client signs in through NextAuth, which issues a session token. This
// module is the server's half: it opens that token and tells you who is
// actually calling.

import { jwtDecrypt } from "jose";
import { hkdfSync } from "node:crypto";

export interface Actor {
  id: string;
  username: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Who the caller actually is, per their verified token. Null when the
      // request carried no valid one. NEVER read identity from the body.
      actor?: Actor | null;
    }
  }
}

let cachedKey: Uint8Array | null = null;

// NextAuth v4 doesn't sign its session token, it ENCRYPTS it (A256GCM, "dir"),
// so there's no public key to check against — the server has to derive the
// identical key from the shared secret and decrypt.
//
// These arguments mirror next-auth's own getDerivedEncryptionKey (v4
// src/jwt/index.ts) exactly. The empty salt and that precise info string are
// load-bearing verbatim: change any of them and you derive a valid-looking key
// that decrypts nothing, which surfaces as every user being logged out rather
// than as an obvious error.
function derivedKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set on the server");
  cachedKey = new Uint8Array(
    hkdfSync("sha256", secret, "", "NextAuth.js Generated Encryption Key", 32),
  );
  return cachedKey;
}

// Decrypt a NextAuth session token. Returns null for anything not provably
// good — absent, expired, tampered with, or encrypted under a different secret.
// They're deliberately indistinguishable to the caller: "who are you" has
// exactly one wrong answer, and telling an attacker which kind of wrong they
// got is free information.
export async function verifySessionToken(raw: string | null | undefined): Promise<Actor | null> {
  if (!raw) return null;
  try {
    const { payload } = await jwtDecrypt(raw, derivedKey(), { clockTolerance: 15 });
    const id = payload.id as string | undefined;
    const username = payload.username as string | undefined;
    if (!id || !username) return null;
    return { id, username, isAdmin: payload.isAdmin === true };
  } catch {
    return null;
  }
}

export function bearerToken(headers: { authorization?: string }): string | null {
  const h = headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

// Both origins must hold the same NEXTAUTH_SECRET or every token fails to
// decrypt and the whole site reads as signed out. Called at boot so that
// arrives as one clear line in the log rather than as a flood of 401s.
export function assertAuthConfigured(): void {
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error(
      "NEXTAUTH_SECRET is not set on the server. It must be the SAME value the " +
      "Next.js client uses (client/.env.local locally; the Vercel env var in " +
      "production) or no session token will verify and every request will 401.",
    );
  }
  derivedKey();
}
