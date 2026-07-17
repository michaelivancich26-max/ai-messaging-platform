"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const status = searchParams.get("status");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResend() {
    setResending(true);
    setResendError(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setResendError(data.error ?? "Something went wrong.");
      else setResendDone(true);
    } finally {
      setResending(false);
    }
  }

  if (status === "success") {
    return (
      <div className="animate-fadeIn space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-green/15">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-brand-green-ink dark:text-brand-green">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Email verified!</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">Your email address has been confirmed. You're all set.</p>
        <button
          onClick={() => router.push("/lobby")}
          className="mt-2 rounded-xl bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.99] motion-reduce:active:scale-100"
        >
          Go to lobby
        </button>
      </div>
    );
  }

  if (status === "expired" || status === "invalid") {
    return (
      <div className="animate-fadeIn space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-red-600 dark:text-red-400">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {status === "expired" ? "Link expired" : "Invalid link"}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {status === "expired"
            ? "This verification link has expired. Request a new one below."
            : "This link is invalid. Try requesting a new verification email."}
        </p>
        {resendDone ? (
          <p className="text-sm font-medium text-brand-green-ink dark:text-brand-green">Verification email sent — check your inbox.</p>
        ) : (
          <>
            {resendError && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{resendError}</p>}
            <button
              onClick={handleResend}
              disabled={resending}
              className="rounded-xl bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50 motion-reduce:active:scale-100"
            >
              {resending ? "Sending…" : "Resend verification email"}
            </button>
          </>
        )}
      </div>
    );
  }

  // No status param — user landed here directly (e.g. from a "check your email" prompt)
  return (
    <div className="animate-fadeIn space-y-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/15">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-orange-700 dark:text-orange-400">
          <path d="M3 4a2 2 0 0 0-2 2v1.161l8.441 4.221a1.25 1.25 0 0 0 1.118 0L19 7.162V6a2 2 0 0 0-2-2H3Z" />
          <path d="m19 8.839-7.77 3.885a2.75 2.75 0 0 1-2.46 0L1 8.839V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.839Z" />
        </svg>
      </div>
      <h2 className="font-display text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Check your email</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        We sent a verification link to your email address. Click it to verify your account.
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">Didn't receive it?</p>
      {resendDone ? (
        <p className="text-sm font-medium text-brand-green-ink dark:text-brand-green">Email resent — check your inbox.</p>
      ) : (
        <>
          {resendError && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{resendError}</p>}
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-sm font-semibold text-orange-700 underline underline-offset-2 transition-colors hover:text-orange-800 disabled:opacity-50 dark:text-orange-400 dark:hover:text-orange-300"
          >
            {resending ? "Sending…" : "Resend verification email"}
          </button>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 bg-hero-glow px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm animate-fadeInUp rounded-2xl border border-gray-200 bg-white p-8 shadow-hero dark:border-gray-800 dark:bg-gray-900">
        <Suspense fallback={<p className="text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </main>
  );
}
