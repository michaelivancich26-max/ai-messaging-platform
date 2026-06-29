import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { generateToken, expiresAt } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  const { username, email, password } = await req.json();

  if (!username || !email || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
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
