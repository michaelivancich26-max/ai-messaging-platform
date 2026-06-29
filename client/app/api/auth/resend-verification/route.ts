import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { generateToken, expiresAt } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";

const prisma = new PrismaClient();

export async function POST() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (user.emailVerified) return NextResponse.json({ error: "Email already verified." }, { status: 400 });

  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
  const token = generateToken();
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, token, expiresAt: expiresAt(24 * 60) },
  });
  await sendVerificationEmail(user.email, token);

  return NextResponse.json({ ok: true });
}
