// Talking to the Express server.
//
// Every request carries our NextAuth session token so the server can establish
// who is calling. It used to simply believe a `userId` we put in the query
// string, which meant anyone could act as anyone by editing a fetch.
//
// Use `api()` for anything hitting the server. A bare `fetch()` to it will be
// treated as anonymous and 401 on any route that needs a caller.

// A cookie is not an option: in production the client (Vercel) and the server
// (Railway) are different origins, and a session cookie set by one is never
// sent to the other. So the token travels in an Authorization header, which is
// exactly what /api/auth/socket-token was built to hand out.
let cached: { token: string; at: number } | null = null;

// Well under the 30-day token lifetime. This isn't about expiry — it's so that
// signing out and back in as someone else takes effect promptly rather than
// leaving a stale identity in memory.
const TTL_MS = 5 * 60 * 1000;

export async function sessionToken(): Promise<string | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.token;
  try {
    // Same-origin Next.js route — it reads the session cookie we DO have here
    // and hands back the raw token to forward on.
    const r = await fetch("/api/auth/socket-token");
    if (!r.ok) { cached = null; return null; }
    const { token } = await r.json();
    if (!token) { cached = null; return null; }
    cached = { token, at: Date.now() };
    return token;
  } catch {
    cached = null;
    return null;
  }
}

// Drop the cached token. Call on sign-out, or the next user inherits it.
export function clearSessionToken(): void {
  cached = null;
}

async function send(url: string, init: RequestInit): Promise<Response> {
  const token = await sessionToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

// fetch(), with the caller's identity attached. Same signature, so call sites
// read the same.
export async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await send(url, init);
  if (res.status !== 401) return res;

  // One retry on 401: the cached token may just be stale (signed out and back
  // in, or the session rotated). If a freshly fetched one is also rejected then
  // the session is genuinely gone and the 401 is the honest answer.
  //
  // Safe to replay because every body we send is a string; a stream would
  // already be consumed.
  cached = null;
  return send(url, init);
}
