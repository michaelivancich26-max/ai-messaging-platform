import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { generateToken, expiresAt } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";
import { AGREEMENTS_VERSION } from "@/lib/legal";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  const { username, email, password, agreed } = await req.json();

  if (!username || !email || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  // Acceptance of the Terms, Privacy Policy, and Community Guidelines is required
  // to create an account.
  if (!agreed) {
    return NextResponse.json({ error: "You must accept the Terms, Privacy Policy, and Community Guidelines." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });

  if (existing) {
    const field = existing.username === username ? "Username" : "Email";
    return NextResponse.json({ error: `${field} is already taken.` }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, email, password: hashed },
  });

  // Record which version of the agreements was accepted at sign-up. The column is
  // added at runtime (raw SQL) rather than via the Prisma schema, matching the
  // rest of the app's additive columns.
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "acceptedAgreementsVersion" = $1, "acceptedAgreementsAt" = NOW() WHERE id = $2`,
    AGREEMENTS_VERSION, user.id,
  ).catch((e) => console.error("[register] failed to record agreement acceptance:", e));

  // Send verification email (non-blocking — don't fail signup if email fails)
  try {
    const token = generateToken();
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, token, expiresAt: expiresAt(24 * 60) },
    });
    await sendVerificationEmail(email, token);
  } catch (err) {
    console.error("[register] Failed to send verification email:", err);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
