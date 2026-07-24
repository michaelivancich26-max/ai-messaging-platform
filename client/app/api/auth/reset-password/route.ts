import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { checkLimits, clientIp } from "@/lib/rateLimit";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  // Throttle reset-token guessing (each valid-length try runs a bcrypt-12 hash).
  const limited = checkLimits([[`reset:${clientIp(req)}`, 10, 60_000]], "Too many attempts. Please wait a minute.");
  if (limited) return limited;

  const { token, password } = await req.json();

  if (!token || !password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "This reset link has expired or is invalid." }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: resetToken.userId }, data: { password: hashed } });
  await prisma.passwordResetToken.delete({ where: { id: resetToken.id } });

  return NextResponse.json({ ok: true });
}
