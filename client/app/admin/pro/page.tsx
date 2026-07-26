"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Sparkles } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// Admin-only: grant / revoke Grounds Pro without a Stripe round-trip (comps + testing).
// The server route is admin-gated too, so this page is just the convenient front end.
export default function AdminProPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const isAdmin: boolean = (session?.user as any)?.isAdmin ?? false;

  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function setPro(makePro: boolean) {
    const name = username.trim();
    if (!name || busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await api(`${SERVER}/api/admin/set-pro`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, isPro: makePro }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setMsg({ type: "ok", text: `${name} is now ${makePro ? "on Grounds Pro" : "off Grounds Pro"}.` });
      else setMsg({ type: "err", text: data.error ?? "Something went wrong." });
    } catch { setMsg({ type: "err", text: "Network error. Try again." }); }
    finally { setBusy(false); }
  }

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-gray-50 px-4 text-center dark:bg-gray-950">
        <p className="font-display text-lg font-bold text-gray-900 dark:text-white">Admins only</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">This page is for administrators.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-md px-4 py-8 md:py-10">
        <header className="mb-5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">
            <Sparkles className="h-3.5 w-3.5" /> Admin
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Grant Grounds Pro</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Comp or revoke Pro for a user by username — no payment involved.</p>
        </header>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
            Username
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="alice" autoComplete="off"
              onKeyDown={e => { if (e.key === "Enter") setPro(true); }}
              className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-brand-green focus:ring-2 focus:ring-brand-green/40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500" />
          </label>

          <div className="mt-4 flex gap-2">
            <button onClick={() => setPro(true)} disabled={busy || !username.trim()}
              className="flex-1 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-50">
              {busy ? "Working…" : "Grant Pro"}
            </button>
            <button onClick={() => setPro(false)} disabled={busy || !username.trim()}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              Revoke Pro
            </button>
          </div>

          {msg && (
            <p className={`mt-3 text-xs ${msg.type === "ok" ? "text-brand-green-ink dark:text-brand-green" : "text-red-600 dark:text-red-400"}`}>{msg.text}</p>
          )}
        </div>

        <button onClick={() => router.push("/admin/propositions")}
          className="mt-4 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
          → Proposition review
        </button>
      </div>
    </div>
  );
}
