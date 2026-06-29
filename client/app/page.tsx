"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type View = "login" | "signup" | "forgot";

export default function AuthPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

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
    router.push("/lobby");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
    router.push("/lobby");
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

  // ── Forgot password view ──────────────────────────────────────────────────
  if (view === "forgot") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-gray-900 p-8 shadow-xl">
          <button
            onClick={() => switchView("login")}
            className="mb-5 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            Back to sign in
          </button>

          <h1 className="mb-1 text-xl font-bold tracking-tight text-gray-100">Forgot password?</h1>
          <p className="mb-6 text-sm text-gray-500">
            Enter your email and we'll send you a reset link.
          </p>

          {forgotSent ? (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-4 text-center space-y-1">
              <p className="text-sm font-medium text-emerald-400">Check your inbox</p>
              <p className="text-xs text-gray-500">
                If <span className="text-gray-300">{forgotEmail}</span> is registered, a reset link is on its way. It expires in 1 hour.
              </p>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-400">
                Email address
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  required
                  placeholder="alice@example.com"
                  className="rounded-lg bg-gray-800 px-3 py-2 text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
                />
              </label>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="mt-1 rounded-lg bg-indigo-600 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 p-8 shadow-xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">AI Messaging</h1>

        {/* Tabs */}
        <div className="mb-6 flex rounded-lg bg-gray-800 p-1">
          {(["login", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchView(t)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition-colors ${
                view === t ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Signup success — email verification notice */}
        {signupDone && (
          <div className="mb-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3">
            <p className="text-xs text-indigo-300">
              Account created! We sent a verification link to <span className="font-medium text-indigo-200">{form.email}</span>. Check your inbox to verify your account.
            </p>
          </div>
        )}

        <form onSubmit={view === "login" ? handleLogin : handleSignup} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Username
            <input value={form.username} onChange={set("username")} placeholder="alice" autoComplete="username"
              className="rounded-lg bg-gray-800 px-3 py-2 text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          </label>

          {view === "signup" && (
            <label className="flex flex-col gap-1 text-sm text-gray-400">
              Email
              <input value={form.email} onChange={set("email")} type="email" placeholder="alice@example.com"
                className="rounded-lg bg-gray-800 px-3 py-2 text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Password
            <div className="relative">
              <input
                value={form.password}
                onChange={set("password")}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete={view === "login" ? "current-password" : "new-password"}
                className="w-full rounded-lg bg-gray-800 px-3 py-2 pr-10 text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                tabIndex={-1}
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
            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={() => switchView("forgot")}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button type="submit" disabled={loading}
            className="mt-2 rounded-lg bg-indigo-600 py-2 font-semibold hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            {loading ? "Please wait…" : view === "login" ? "Sign in →" : "Create account →"}
          </button>
        </form>
      </div>
    </main>
  );
}
