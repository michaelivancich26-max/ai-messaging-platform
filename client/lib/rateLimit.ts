import { NextResponse } from "next/server";

// Best-effort in-memory rate limiter for Next.js route handlers (auth, email,
// vibe-search). On serverless (Vercel) module memory is per-instance and not shared
// across cold starts, so this is a baseline brake against a single sustained source
// — not a hard distributed limit. For production-grade limits back it with a shared
// store (Upstash/Redis). It still meaningfully raises the bar on the paid-AI,
// credential brute-force, and email-bomb routes, which are otherwise wide open.
type Bucket = { count: number; reset: number };
const store = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  // Opportunistic prune so a long-lived instance's map can't grow unbounded.
  if (store.size > 5000) for (const [k, b] of store) if (b.reset <= now) store.delete(k);
  const b = store.get(key);
  if (!b || now >= b.reset) { store.set(key, { count: 1, reset: now + windowMs }); return { ok: true, retryAfter: 0 }; }
  if (b.count < max) { b.count++; return { ok: true, retryAfter: 0 }; }
  return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
}

// Client IP from the proxy headers (Vercel/Railway sit behind a proxy, so req has
// no direct socket IP). Prefer x-real-ip: the platform sets it to the true client
// and overwrites any client-supplied value, so it can't be spoofed to mint fresh
// buckets — unlike the leftmost x-forwarded-for entry, which a client can supply.
// Falls back to "unknown", which buckets such callers together (fails toward MORE
// limiting, not less).
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "unknown";
}

export function tooMany(retryAfter: number, message = "Too many requests. Please slow down.") {
  return NextResponse.json({ error: message }, { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } });
}

// Run several [key, max, windowMs] limits; return a 429 for the first one exceeded,
// or null if all pass. Lets a route enforce e.g. a per-minute and a per-hour cap.
export function checkLimits(checks: [string, number, number][], message?: string): NextResponse | null {
  for (const [key, max, windowMs] of checks) {
    const { ok, retryAfter } = rateLimit(key, max, windowMs);
    if (!ok) return tooMany(retryAfter, message);
  }
  return null;
}
