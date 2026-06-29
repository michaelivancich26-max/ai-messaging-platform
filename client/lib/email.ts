import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
const APP_NAME = "Veritas";
const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = `${BASE_URL}/reset-password?token=${token}`;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Reset your ${APP_NAME} password`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:32px;border-radius:12px">
        <h1 style="color:#818cf8;margin:0 0 8px">Reset your password</h1>
        <p style="color:#94a3b8;margin:0 0 24px">You requested a password reset for your ${APP_NAME} account. Click the button below to choose a new password. This link expires in <strong style="color:#e2e8f0">1 hour</strong>.</p>
        <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Reset password</a>
        <p style="color:#475569;font-size:12px;margin:24px 0 0">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
        <p style="color:#334155;font-size:11px;margin:8px 0 0;word-break:break-all">Or copy this link: ${url}</p>
      </div>
    `,
  });
}

export async function sendVerificationEmail(to: string, token: string) {
  const url = `${BASE_URL}/api/auth/verify-email?token=${token}`;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Verify your ${APP_NAME} email`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:32px;border-radius:12px">
        <h1 style="color:#818cf8;margin:0 0 8px">Verify your email</h1>
        <p style="color:#94a3b8;margin:0 0 24px">Welcome to ${APP_NAME}! Click the button below to verify your email address. This link expires in <strong style="color:#e2e8f0">24 hours</strong>.</p>
        <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Verify email</a>
        <p style="color:#475569;font-size:12px;margin:24px 0 0">If you didn't create a ${APP_NAME} account, you can ignore this email.</p>
        <p style="color:#334155;font-size:11px;margin:8px 0 0;word-break:break-all">Or copy this link: ${url}</p>
      </div>
    `,
  });
}
