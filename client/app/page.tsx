"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type Tab = "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
    // Auto-login after signup
    const login = await signIn("credentials", {
      username: form.username,
      password: form.password,
      redirect: false,
    });
    setLoading(false);
    if (login?.error) return setError("Account created — please log in.");
    router.push("/lobby");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 p-8 shadow-xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">AI Messaging</h1>

        {/* Tabs */}
        <div className="mb-6 flex rounded-lg bg-gray-800 p-1">
          {(["login", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={tab === "login" ? handleLogin : handleSignup} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Username
            <input value={form.username} onChange={set("username")} placeholder="alice" autoComplete="username"
              className="rounded-lg bg-gray-800 px-3 py-2 text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          </label>

          {tab === "signup" && (
            <label className="flex flex-col gap-1 text-sm text-gray-400">
              Email
              <input value={form.email} onChange={set("email")} type="email" placeholder="alice@example.com"
                className="rounded-lg bg-gray-800 px-3 py-2 text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Password
            <input value={form.password} onChange={set("password")} type="password" placeholder="••••••••" autoComplete={tab === "login" ? "current-password" : "new-password"}
              className="rounded-lg bg-gray-800 px-3 py-2 text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500" />
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button type="submit" disabled={loading}
            className="mt-2 rounded-lg bg-indigo-600 py-2 font-semibold hover:bg-indigo-500 disabled:opacity-50">
            {loading ? "Please wait…" : tab === "login" ? "Sign in →" : "Create account →"}
          </button>
        </form>
      </div>
    </main>
  );
}
