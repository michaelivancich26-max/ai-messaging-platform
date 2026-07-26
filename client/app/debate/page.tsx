"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Zap, MessagesSquare, Trophy, Layers, ChevronRight, type LucideIcon } from "lucide-react";

// The Debate hub — the landing page for the "Debate" section. Clicking Debate in
// the rail used to jump straight to Rapid, burying the other modes; this lists all
// four with equal weight, over a blurred mock-debate backdrop for atmosphere.

interface Mode {
  href: string; label: string; blurb: string; Icon: LucideIcon;
  tile: string; ring: string; live?: boolean;
}

const MODES: Mode[] = [
  { href: "/rapid", label: "Rapid Fire", blurb: "Get matched with a stranger who holds the opposite view and argue it out live.", Icon: Zap, live: true,
    tile: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300", ring: "hover:border-orange-300 dark:hover:border-orange-900/70" },
  { href: "/lobby", label: "Common Grounds", blurb: "Join open, many-sided debate rooms on the topics people are arguing right now.", Icon: MessagesSquare,
    tile: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300", ring: "hover:border-indigo-300 dark:hover:border-indigo-900/70" },
  { href: "/compete", label: "Battle Grounds", blurb: "Ranked 1v1 and team matches, scored by an AI judge. Climb the ELO ladder.", Icon: Trophy,
    tile: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300", ring: "hover:border-violet-300 dark:hover:border-violet-900/70" },
  { href: "/deck", label: "Where You Stand", blurb: "Swipe through sharp claims and take a side — it's what pairing matches you on.", Icon: Layers,
    tile: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300", ring: "hover:border-teal-300 dark:hover:border-teal-900/70" },
];

// Decorative sample exchange — rendered blurred, so the text only needs plausible shape.
const MOCK = [
  { side: "for" as const, name: "maya_v", text: "Every large cohort study since 2012 points the same direction — the correlation isn't subtle." },
  { side: "against" as const, name: "d_okafor", text: "Correlation, sure. You still haven't ruled out the dozen confounders that track with screen time." },
  { side: "for" as const, name: "maya_v", text: "We controlled for household income and prior diagnoses and the effect held." },
  { side: "against" as const, name: "d_okafor", text: "Held at an effect size within measurement noise. That's a rounding error, not a harm." },
];

export default function DebateHubPage() {
  const router = useRouter();
  const { status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:py-8">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-widest text-brand-green-ink dark:text-brand-green">Debate</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:text-3xl">Choose how you want to argue</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-600 dark:text-gray-400">Four ways in — a live match with a stranger, an open room, a ranked bout, or building the belief deck that pairs you.</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Modes — four equal cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {MODES.map(m => (
              <button key={m.href} onClick={() => router.push(m.href)}
                className={`group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900 ${m.ring}`}>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${m.tile}`}>
                  <m.Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{m.label}</h2>
                    {m.live && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-60 motion-safe:animate-ping" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
                        </span>
                        Live
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{m.blurb}</p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-green-ink transition-transform group-hover:translate-x-0.5 dark:text-brand-green">
                  Enter <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>

          {/* Blurred mock-debate preview — atmosphere, not real data */}
          <aside className="flex flex-col gap-3">
            {/* Entire preview card is decorative (fabricated status + vote counts) — hidden
                from assistive tech. The real "Watch" button below stays exposed. */}
            <div aria-hidden="true" className="relative flex-1 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-hero dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2.5 dark:border-gray-800">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">A debate, in progress</span>
              </div>

              {/* Mock chat — blurred + scrimmed, purely decorative */}
              <div className="relative px-4 py-4">
                <p className="mb-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-200">&ldquo;Social media does more harm than good.&rdquo;</p>
                <div className="space-y-2.5 select-none blur-[3px]">
                  {MOCK.map((m, i) => (
                    <div key={i} className={`flex ${m.side === "for" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${m.side === "for"
                        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                        : "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-100"}`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-white dark:to-gray-900" />
              </div>

              {/* Proposition bar — crisp, the recognizable element */}
              <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                  <div className="bg-emerald-500" style={{ width: "58%" }} />
                  <div className="bg-rose-500" style={{ width: "42%" }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] font-semibold">
                  <span className="text-emerald-700 dark:text-emerald-400">Agree 58</span>
                  <span className="text-rose-700 dark:text-rose-400">42 Disagree</span>
                </div>
              </div>
            </div>

            <button onClick={() => router.push("/watch")}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 shadow-card transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
              Watch real debates live <ChevronRight className="h-4 w-4" />
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
