"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { usePro } from "@/lib/usePro";
import { Check, Dumbbell, Sparkles, Layers, Bot, BarChart3, Trophy, BadgeCheck, type LucideIcon } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// `live` marks features that actually ship today; the rest show a "Rolling out"
// chip so we never imply a paid feature works before it does.
const BENEFITS: { Icon: LucideIcon; title: string; blurb: string; live: boolean }[] = [
  { Icon: Dumbbell, title: "Unlimited Arena practice", blurb: "No daily cap on matches against the AI opponents.", live: true },
  { Icon: Sparkles, title: "AI post-match coach", blurb: "A breakdown after every match — what landed, what to fix, the rebuttal you missed.", live: false },
  { Icon: Layers, title: "Belief Map", blurb: "See where you stand across topics, and how your positions have shifted over time.", live: false },
  { Icon: Bot, title: "Custom AI opponents", blurb: "Describe an opponent and the AI plays that persona.", live: false },
  { Icon: BarChart3, title: "Advanced analytics", blurb: "Rubric trends, win-rate by topic, head-to-head records, rank history.", live: false },
  { Icon: Trophy, title: "Tournaments & private rooms", blurb: "Host bracketed tournaments and large or private debate rooms.", live: false },
  { Icon: BadgeCheck, title: "Pro badge", blurb: "A mark on your profile and in chat.", live: false },
];

// useSearchParams() forces a client-render bailout, which Next requires be wrapped
// in a Suspense boundary or the production build fails to prerender this route.
export default function ProPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>}>
      <ProContent />
    </Suspense>
  );
}

function ProContent() {
  const router = useRouter();
  const params = useSearchParams();
  useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const { isPro, pro, loading } = usePro();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canceled = params.get("canceled") === "1";
  const configured = pro?.configured !== false;   // treat unknown as configured until we hear otherwise

  async function post(path: string) {
    setBusy(true); setErr("");
    try {
      const res = await api(`${SERVER}${path}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setErr(data.error ?? "Something went wrong. Try again."); setBusy(false);
    } catch { setErr("Network error. Try again."); setBusy(false); }
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-10 space-y-6">
        <header className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-orange-700 ring-1 ring-orange-500/30 dark:text-orange-300">
            <Sparkles className="h-3.5 w-3.5" /> Grounds Pro
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-white md:text-4xl">Get better, faster.</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            Pro is about improving your argument — coaching, analytics, unlimited practice, and power tools.
            Debating itself stays free; Pro sharpens it.
          </p>
        </header>

        {canceled && !isPro && (
          <p className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-center text-sm text-gray-600 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            Checkout canceled — no charge was made. You can upgrade whenever you're ready.
          </p>
        )}

        {/* Benefits */}
        <div className="grid gap-3 sm:grid-cols-2">
          {BENEFITS.map(b => (
            <div key={b.title} className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-card dark:border-gray-800 dark:bg-gray-900">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                <b.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{b.title}</h2>
                  {b.live
                    ? <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Check className="h-2.5 w-2.5" />Live</span>
                    : <span className="rounded-full bg-gray-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-400">Rolling out</span>}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{b.blurb}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-elevated dark:border-gray-800 dark:bg-gray-900">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Checking your plan…</p>
          ) : isPro ? (
            <div className="space-y-3">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green-ink dark:text-brand-green"><BadgeCheck className="h-4 w-4" /> You're on Grounds Pro</p>
              {pro?.currentPeriodEnd && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Renews {new Date(pro.currentPeriodEnd).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
              )}
              {pro?.manageable && (
                <button onClick={() => post("/api/billing/portal")} disabled={busy}
                  className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  {busy ? "Opening…" : "Manage subscription"}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <button onClick={() => post("/api/billing/checkout")} disabled={busy || !configured}
                className="inline-flex items-center gap-2 rounded-2xl bg-orange-700 px-7 py-3.5 text-base font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50 motion-reduce:active:scale-100">
                {busy ? "Starting checkout…" : "Upgrade to Pro"}
                {!busy && <span aria-hidden>→</span>}
              </button>
              {!configured && <p className="text-xs text-gray-500 dark:text-gray-400">Billing isn&rsquo;t switched on yet — check back shortly.</p>}
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Cancel anytime. Debating stays free — Pro just adds the extras above.</p>
            </div>
          )}
          {err && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{err}</p>}
        </div>
      </div>
    </div>
  );
}
