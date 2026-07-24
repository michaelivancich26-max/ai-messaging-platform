import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { checkLimits } from "@/lib/rateLimit";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  // Each call runs two bcrypt-12 ops; cap to prevent CPU-exhaustion churn.
  const limited = checkLimits([[`chpw:${session.user.email}`, 5, 60_000]], "Too many attempts. Please wait a minute.");
  if (limited) return limited;

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

  return NextResponse.json({ ok: true });
}
