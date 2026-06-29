import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${origin}/verify-email?status=invalid`);
  }

  const record = await prisma.emailVerificationToken.findUnique({ where: { token } });

  if (!record || record.expiresAt < new Date()) {
    return NextResponse.redirect(`${origin}/verify-email?status=expired`);
  }

  await prisma.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } });
  await prisma.emailVerificationToken.delete({ where: { id: record.id } });

  return NextResponse.redirect(`${origin}/verify-email?status=success`);
}
