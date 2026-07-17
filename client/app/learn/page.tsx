"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import TrainingTabs from "@/components/TrainingTabs";
import { SERIES, TOTAL_LESSONS } from "./content";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// Per-series identity colors — kept as data accents but reseated inside the
// unified card system (icon tile, progress fill, percentage). Light-mode text
// uses -700 so small labels clear AA on white; dark mode uses -400 on the card.
const COLOR = {
  red:     { tile: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",         bar: "bg-red-500",     pct: "text-red-700 dark:text-red-400"     },
  blue:    { tile: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",      bar: "bg-blue-500",    pct: "text-blue-700 dark:text-blue-400"    },
  emerald: { tile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400", bar: "bg-emerald-500", pct: "text-emerald-700 dark:text-emerald-400" },
  amber:   { tile: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",  bar: "bg-amber-500",   pct: "text-amber-700 dark:text-amber-400"   },
} as const;

const SERIES_ICONS: Record<string, React.ReactNode> = {
  fallacies: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  ),
  structures: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  ),
  tactics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  rebuttals: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  ),
};

export default function LearnPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId: string = (session?.user as any)?.id ?? "";
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    api(`${SERVER}/api/lessons/progress?userId=${userId}`)
      .then(r => r.json())
      .then(d => {
        const keys = (d.completed ?? []).map((c: { seriesSlug: string; lessonSlug: string }) => `${c.seriesSlug}/${c.lessonSlug}`);
        setCompleted(new Set(keys));
      })
      .catch(() => {});
  }, [userId]);

  if (status === "loading") {
    return (
      <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-950">
        <div className="pt-safe">
          <TrainingTabs />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
            <div className="h-44 rounded-3xl bg-gray-200 shimmer-track dark:bg-gray-800" />
            <div className="h-20 rounded-2xl bg-gray-200 shimmer-track dark:bg-gray-800" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-44 rounded-2xl bg-gray-200 shimmer-track dark:bg-gray-800" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalCompleted = completed.size;
  const overallPct = TOTAL_LESSONS > 0 ? Math.round((totalCompleted / TOTAL_LESSONS) * 100) : 0;

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-950">
      <div className="pt-safe">
        <TrainingTabs />
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white bg-hero-glow p-6 shadow-hero dark:border-gray-800 dark:bg-gray-900 md:p-8 animate-fadeInUp">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gray-100 text-brand-green-ink dark:bg-gray-800 dark:text-brand-green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">Learn</p>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:text-3xl">Debate Academy</h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">{SERIES.length} series · {TOTAL_LESSONS} lessons on fallacies, argument structures, tactics, and rebuttals</p>

          {/* Overall progress */}
          {totalCompleted > 0 && (
            <div className="mt-5 max-w-sm space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">{totalCompleted} of {TOTAL_LESSONS} lessons completed</span>
                <span className="font-semibold text-brand-green-ink dark:text-brand-green">{overallPct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-full rounded-full bg-brand-green transition-all duration-500" style={{ width: `${overallPct}%` }} />
              </div>
            </div>
          )}
        </section>

        {/* Puzzles CTA */}
        <button
          onClick={() => router.push("/learn/puzzles")}
          className="group flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated active:scale-[0.99] motion-reduce:active:scale-100 dark:border-gray-800 dark:bg-gray-900 animate-fadeInUp"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Debate Puzzles</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Spot the fallacy or weak point — 20 puzzles, daily challenge</p>
          </div>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300">
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Series cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 animate-fadeInUp">
          {SERIES.map(series => {
            const c = COLOR[series.color];
            const seriesCompleted = series.lessons.filter(l => completed.has(`${series.slug}/${l.slug}`)).length;
            const pct = series.lessons.length > 0 ? Math.round((seriesCompleted / series.lessons.length) * 100) : 0;
            const done = seriesCompleted === series.lessons.length;
            return (
              <button
                key={series.slug}
                onClick={() => router.push(`/learn/${series.slug}`)}
                className="group relative flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated active:scale-[0.99] motion-reduce:active:scale-100 dark:border-gray-800 dark:bg-gray-900"
              >
                {done && (
                  <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-white">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${c.tile}`}>
                    {SERIES_ICONS[series.slug]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight text-gray-900 dark:text-white">{series.title}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{series.lessons.length} lessons</p>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">{series.description}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500 dark:text-gray-400">{seriesCompleted}/{series.lessons.length} completed</span>
                    <span className={`font-semibold ${c.pct}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div className={`h-full rounded-full transition-all duration-500 ${c.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
