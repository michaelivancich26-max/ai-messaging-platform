"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePro } from "@/lib/usePro";
import { api } from "@/lib/api";
import { Sparkles, Check, TrendingUp, AlertTriangle, Lightbulb, type LucideIcon } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface CoachReport {
  summary: string;
  strengths: string[];
  improvements: string[];
  fallacies: string[];
  nextTime: string;
}

const TONE = {
  emerald: { text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  amber: { text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  rose: { text: "text-rose-700 dark:text-rose-400", dot: "bg-rose-500" },
} as const;

function Section({ Icon, title, items, tone }: { Icon: LucideIcon; title: string; items: string[]; tone: keyof typeof TONE }) {
  if (!items.length) return null;
  const t = TONE[tone];
  return (
    <div>
      <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${t.text}`}><Icon className="h-3.5 w-3.5" />{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${t.dot}`} />{it}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Pro-gated AI breakdown of how YOU argued in this match. Non-Pro see an upsell.
export default function MatchCoach({ roomName }: { roomName: string }) {
  const router = useRouter();
  const { isPro, loading: proLoading } = usePro();
  const [report, setReport] = useState<CoachReport | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "none">("idle");
  const [err, setErr] = useState("");

  async function getCoaching(refresh = false) {
    setState("loading"); setErr("");
    try {
      const res = await api(`${SERVER}/api/coach/${encodeURIComponent(roomName)}${refresh ? "?refresh=1" : ""}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setReport(data as CoachReport); setState("idle"); }
      else if (res.status === 422) { setState("none"); }        // not enough of the round to coach
      else if (res.status === 402) { router.push("/pro"); }     // safety net (UI already gates)
      else { setErr(data.error ?? "Couldn't generate coaching."); setState("error"); }
    } catch { setErr("Network error. Try again."); setState("error"); }
  }

  if (proLoading) return null;

  // Too little of the user's own argument to coach (the endpoint's 422). This
  // used to return null, which meant the card the user had just clicked simply
  // vanished — indistinguishable from a broken button. It bites Rapid hardest,
  // since a fast round can end with one message each and the coach needs two.
  if (state === "none") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-card dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"><Sparkles className="h-4 w-4" /></span>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">AI coach</h3>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          That round was too short to coach — there needs to be a couple of your own
          arguments to work from. Play a longer one and the breakdown will be here.
        </p>
      </div>
    );
  }

  // Non-Pro: upsell.
  if (!isPro) {
    return (
      <button onClick={() => router.push("/pro")}
        className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-amber-900/50 dark:from-amber-950/25 dark:to-orange-950/25">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-orange-700 dark:text-amber-300"><Sparkles className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">AI coach</span>
            <span className="rounded-full bg-orange-600/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-orange-800 dark:text-orange-300">Pro</span>
          </span>
          <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">Get a breakdown of how you argued this round — what landed, what to sharpen.</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-orange-700 dark:text-amber-300">Upgrade&nbsp;→</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"><Sparkles className="h-4 w-4" /></span>
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">AI coach</h3>
        {report && (
          <button onClick={() => getCoaching(true)} disabled={state === "loading"}
            className="ml-auto text-[11px] font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200">
            {state === "loading" ? "…" : "Regenerate"}
          </button>
        )}
      </div>

      {!report ? (
        <div className="mt-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">See where your argument was strong, where it slipped, and what to try next time.</p>
          <button onClick={() => getCoaching()} disabled={state === "loading"}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-orange-700 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-50">
            {state === "loading" ? "Analyzing your round…" : "Get AI coaching"}
          </button>
          {state === "error" && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{err}</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {state === "error" && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
          {report.summary && <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">{report.summary}</p>}
          <Section Icon={Check} title="What worked" items={report.strengths} tone="emerald" />
          <Section Icon={TrendingUp} title="To sharpen" items={report.improvements} tone="amber" />
          <Section Icon={AlertTriangle} title="Watch for" items={report.fallacies} tone="rose" />
          {report.nextTime && (
            <div className="flex gap-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
              <Lightbulb className="h-4 w-4 shrink-0 text-orange-700 dark:text-amber-300" />
              <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-300"><span className="font-semibold">Next time:</span> {report.nextTime}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
