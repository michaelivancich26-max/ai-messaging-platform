"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { WordmarkFull } from "@/components/Wordmark";

type View = "login" | "signup" | "forgot";

// Shared field + label styling — clean input, brand-green focus ring.
const FIELD =
  "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-brand-green focus:ring-2 focus:ring-brand-green/40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500";
const LABEL = "flex flex-col gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300";

export default function AuthPage() {
  const router = useRouter();
  const { status } = useSession();
  const [view, setView] = useState<View>("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Already signed in? Skip the login screen and go straight to the app.
  useEffect(() => {
    if (status === "authenticated") router.replace("/home");
  }, [status, router]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function switchView(v: View) {
    setView(v);
    setError("");
    setForgotSent(false);
    setSignupDone(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      username: form.username,
      password: form.password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) return setError("Invalid username or password.");
    router.push("/home");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!agreed) return setError("Please accept the Terms, Privacy Policy, and Community Guidelines to continue.");
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, agreed }),
    });
    const data = await res.json();
    if (!res.ok) { setLoading(false); return setError(data.error); }
    setSignupDone(true);
    const login = await signIn("credentials", {
      username: form.username,
      password: form.password,
      redirect: false,
    });
    setLoading(false);
    if (login?.error) return setError("Account created — please log in.");
    router.push("/home");
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotSent(true);
    } finally {
      setLoading(false);
    }
  }

  // While the session resolves — or once we know the user is signed in and are
  // redirecting — show a placeholder instead of flashing the login form.
  if (status === "loading" || status === "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 bg-hero-glow px-4 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <WordmarkFull className="text-2xl opacity-90" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
      </main>
    );
  }

  // ── Forgot password view ──────────────────────────────────────────────────
  if (view === "forgot") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 bg-hero-glow px-4 dark:bg-gray-950">
        <div className="w-full max-w-sm animate-fadeInUp rounded-2xl border border-gray-200 bg-white p-8 shadow-hero dark:border-gray-800 dark:bg-gray-900">
          <button
            onClick={() => switchView("login")}
            className="mb-6 flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            Back to sign in
          </button>

          <h1 className="mb-1.5 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Forgot password?</h1>
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
            Enter your email and we'll send you a reset link.
          </p>

          {forgotSent ? (
            <div className="space-y-1 rounded-xl border border-brand-green/30 bg-brand-green/10 px-4 py-4 text-center">
              <p className="text-sm font-semibold text-brand-green-ink dark:text-brand-green">Check your inbox</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                If <span className="font-medium text-gray-700 dark:text-gray-200">{forgotEmail}</span> is registered, a reset link is on its way. It expires in 1 hour.
              </p>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="flex flex-col gap-4">
              <label className={LABEL}>
                Email address
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  required
                  placeholder="alice@example.com"
                  className={FIELD}
                />
              </label>
              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50 motion-reduce:active:scale-100"
              >
                {loading ? "Sending…" : "Send reset link →"}
              </button>
            </form>
          )}
        </div>
      </main>
    );
  }

  // ── Login / Signup view ───────────────────────────────────────────────────
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gray-50 bg-hero-glow px-4 py-10 dark:bg-gray-950">
      <div className="grid w-full max-w-4xl items-center gap-10 lg:grid-cols-2 lg:gap-14">

        {/* Brand hero — the confident first impression. */}
        <div className="animate-fadeInUp text-center lg:text-left">
          <WordmarkFull className="text-3xl md:text-4xl" />
          <h1 className="mt-6 font-display text-3xl font-bold leading-[1.05] tracking-tight text-balance text-gray-900 dark:text-white md:text-4xl">
            Find someone who<br className="hidden sm:block" /> actually disagrees.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-sm leading-relaxed text-gray-600 dark:text-gray-300 md:text-base lg:mx-0">
            Get matched on a claim you&rsquo;ve both taken a side on, then argue the side you actually hold — live, judged by the room.
          </p>
          <ul className="mx-auto mt-6 hidden max-w-md flex-col gap-2.5 text-left text-sm text-gray-700 dark:text-gray-300 lg:flex">
            {[
              "Matched by belief, never just a topic",
              "Argue your real side in real time",
              "Win the room as opinion shifts",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-green/15 text-brand-green-ink dark:text-brand-green">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Auth card */}
        <div className="mx-auto w-full max-w-sm animate-fadeInUp rounded-2xl border border-gray-200 bg-white p-8 shadow-hero dark:border-gray-800 dark:bg-gray-900">
          {/* Tabs */}
          <div className="mb-6 flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchView(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-colors ${
                  view === t
                    ? "bg-white text-brand-green-ink shadow-sm dark:bg-gray-900 dark:text-brand-green"
                    : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Signup success — email verification notice */}
          {signupDone && (
            <div className="mb-4 rounded-xl border border-brand-green/30 bg-brand-green/10 px-4 py-3">
              <p className="text-xs leading-relaxed text-brand-green-ink dark:text-brand-green">
                Account created! We sent a verification link to <span className="font-semibold">{form.email}</span>. Check your inbox to verify your account.
              </p>
            </div>
          )}

          <form onSubmit={view === "login" ? handleLogin : handleSignup} className="flex flex-col gap-4">
            <label className={LABEL}>
              Username
              <input value={form.username} onChange={set("username")} placeholder="alice" autoComplete="username"
                className={FIELD} />
            </label>

            {view === "signup" && (
              <label className={LABEL}>
                Email
                <input value={form.email} onChange={set("email")} type="email" placeholder="alice@example.com"
                  className={FIELD} />
              </label>
            )}

            <label className={LABEL}>
              Password
              <div className="relative">
                <input
                  value={form.password}
                  onChange={set("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete={view === "login" ? "current-password" : "new-password"}
                  className={`${FIELD} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-gray-500 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                      <path d="M10.748 13.93l2.523 2.523a10.006 10.006 0 0 1-8.512-4.865 1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 5.51 8.187l1.52 1.52a4 4 0 0 0 5.208 5.208l-1.49-1.486Z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41Z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {/* Forgot password link — login only */}
            {view === "login" && (
              <div className="-mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => switchView("forgot")}
                  className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Agreement consent — required to create an account */}
            {view === "signup" && (
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-orange-700 focus:ring-2 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-800"
                />
                <span>
                  I am at least 13 years old and I agree to the{" "}
                  <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-orange-700 underline dark:text-orange-400">Terms of Service</a>,{" "}
                  <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-orange-700 underline dark:text-orange-400">Privacy Policy</a>, and{" "}
                  <a href="/legal/guidelines" target="_blank" rel="noopener noreferrer" className="font-medium text-orange-700 underline dark:text-orange-400">Community Guidelines</a>.
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="mt-1 w-full rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50 motion-reduce:active:scale-100">
              {loading ? "Please wait…" : view === "login" ? "Sign in →" : "Create account →"}
            </button>
          </form>
          <p className="mt-5 text-center text-[11px] text-gray-400 dark:text-gray-500">
            <a href="/legal/terms" className="underline hover:text-gray-600 dark:hover:text-gray-300">Terms</a>
            {" · "}
            <a href="/legal/privacy" className="underline hover:text-gray-600 dark:hover:text-gray-300">Privacy</a>
            {" · "}
            <a href="/legal/guidelines" className="underline hover:text-gray-600 dark:hover:text-gray-300">Guidelines</a>
          </p>
        </div>
      </div>
    </main>
  );
}
