import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { generateToken, expiresAt } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";
import { checkLimits } from "@/lib/rateLimit";

const prisma = new PrismaClient();

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  // Anti email-bomb: cap resends per account (goes to the user's own address).
  const limited = checkLimits([[`resend:m:${session.user.email}`, 1, 60_000], [`resend:h:${session.user.email}`, 5, 3_600_000]],
    "You've requested this recently — check your inbox, or try again shortly.");
  if (limited) return limited;

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (user.emailVerified) return NextResponse.json({ error: "Email already verified." }, { status: 400 });

  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
  const token = generateToken();
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, token, expiresAt: expiresAt(24 * 60) },
  });

  try {
    await sendVerificationEmail(user.email, token);
  } catch (err: any) {
    const detail = err?.message ?? String(err);
    console.error("[resend-verification] Resend error:", detail);
    return NextResponse.json({ error: `Email failed: ${detail}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
