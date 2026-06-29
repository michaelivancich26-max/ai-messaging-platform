import crypto from "crypto";

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function expiresAt(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
