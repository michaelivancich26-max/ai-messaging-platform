import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/authOptions";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const handler = NextAuth(authOptions);

export const GET = handler;

// Throttle credential-login attempts (brute-force / credential-stuffing) by IP —
// each attempt runs a bcrypt-12 compare. Only the credentials callback is gated;
// session/csrf reads go through GET and stay unthrottled.
export async function POST(req: NextRequest, ctx: any) {
  if (req.nextUrl.pathname.endsWith("/callback/credentials")) {
    // 20/min per IP — brakes automated credential-stuffing while leaving headroom
    // for several people behind one office/campus NAT. (A per-username lockout would
    // be a stronger brute-force brake but needs to read the POST body NextAuth owns.)
    if (!rateLimit(`login:${clientIp(req)}`, 20, 60_000).ok) {
      return NextResponse.json({ error: "Too many login attempts. Please wait a minute." }, { status: 429 });
    }
  }
  return handler(req, ctx);
}
