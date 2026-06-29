import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { generateToken, expiresAt } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/email";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  const { email } = await req.json();

  // Always return ok — never reveal whether an email is registered
  if (!email) return NextResponse.json({ ok: true });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      const token = generateToken();
      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt: expiresAt(60) },
      });
      await sendPasswordResetEmail(user.email, token);
    }
  } catch (err) {
    console.error("[forgot-password]", err);
  }

  return NextResponse.json({ ok: true });
}
