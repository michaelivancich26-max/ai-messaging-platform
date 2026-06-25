import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const raw = await getToken({ req, raw: true, secret: process.env.NEXTAUTH_SECRET });
  if (!raw) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ token: raw });
}
