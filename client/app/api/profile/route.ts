import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { PrismaClient } from "@prisma/client";
import { generateToken, expiresAt } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";

const prisma = new PrismaClient();

// PATCH — update email for the current user
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { email } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (normalized === user.email) {
    return NextResponse.json({ error: "That's already your current email." }, { status: 400 });
  }

  const conflict = await prisma.user.findUnique({ where: { email: normalized } });
  if (conflict) return NextResponse.json({ error: "That email is already in use." }, { status: 409 });

  await prisma.user.update({
    where: { id: user.id },
    data: { email: normalized, emailVerified: null },
  });

  // Send new verification email
  try {
    await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    const token = generateToken();
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, token, expiresAt: expiresAt(24 * 60) },
    });
    await sendVerificationEmail(normalized, token);
  } catch (err) {
    console.error("[profile/email] Failed to send verification:", err);
  }

  return NextResponse.json({ ok: true, email: normalized });
}
