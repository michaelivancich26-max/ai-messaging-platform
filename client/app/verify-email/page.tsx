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
      <div className="text-center space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 mx-auto">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-emerald-600 dark:text-emerald-400">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email verified!</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">Your email address has been confirmed. You're all set.</p>
        <button
          onClick={() => router.push("/lobby")}
          className="mt-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Go to lobby
        </button>
      </div>
    );
  }

  if (status === "expired" || status === "invalid") {
    return (
      <div className="text-center space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 mx-auto">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-red-600 dark:text-red-400">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {status === "expired" ? "Link expired" : "Invalid link"}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {status === "expired"
            ? "This verification link has expired. Request a new one below."
            : "This link is invalid. Try requesting a new verification email."}
        </p>
        {resendDone ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Verification email sent — check your inbox.</p>
        ) : (
          <>
            {resendError && <p className="text-xs text-red-600 dark:text-red-400">{resendError}</p>}
            <button
              onClick={handleResend}
              disabled={resending}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
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
    <div className="text-center space-y-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/20 mx-auto">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-indigo-600 dark:text-indigo-400">
          <path d="M3 4a2 2 0 0 0-2 2v1.161l8.441 4.221a1.25 1.25 0 0 0 1.118 0L19 7.162V6a2 2 0 0 0-2-2H3Z" />
          <path d="m19 8.839-7.77 3.885a2.75 2.75 0 0 1-2.46 0L1 8.839V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.839Z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Check your email</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        We sent a verification link to your email address. Click it to verify your account.
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-600">Didn't receive it?</p>
      {resendDone ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Email resent — check your inbox.</p>
      ) : (
        <>
          {resendError && <p className="text-xs text-red-600 dark:text-red-400">{resendError}</p>}
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 underline underline-offset-2 disabled:opacity-50 transition-colors"
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
    <main className="flex min-h-screen items-center justify-center px-4 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 shadow-xl">
        <Suspense fallback={<p className="text-sm text-gray-500 text-center">Loading…</p>}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </main>
  );
}
