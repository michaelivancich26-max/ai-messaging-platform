"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { findSeries } from "../content";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// Per-series identity, reseated as data accents (eyebrow, progress). Light-mode
// text uses -700 for AA on white; dark mode uses -400.
const COLOR = {
  red:     { accent: "text-red-700 dark:text-red-400",         bar: "bg-red-500"     },
  blue:    { accent: "text-blue-700 dark:text-blue-400",       bar: "bg-blue-500"    },
  emerald: { accent: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500" },
  amber:   { accent: "text-amber-700 dark:text-amber-400",     bar: "bg-amber-500"   },
} as const;

export default function SeriesPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const params = useParams<{ series: string }>();
  const userId: string = (session?.user as any)?.id ?? "";
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const series = findSeries(params.series);

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
      <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
        <div className="border-b border-gray-200 px-4 py-3 pt-safe dark:border-gray-800">
          <div className="h-5 w-40 rounded bg-gray-200 shimmer-track dark:bg-gray-800" />
        </div>
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
          <div className="h-40 rounded-2xl bg-gray-200 shimmer-track dark:bg-gray-800" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-gray-200 shimmer-track dark:bg-gray-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center dark:bg-gray-950">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 dark:bg-gray-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 text-gray-400 dark:text-gray-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <div>
          <p className="font-display text-lg font-bold text-gray-900 dark:text-white">Series not found</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">That series doesn&rsquo;t exist or may have moved.</p>
        </div>
        <button
          onClick={() => router.push("/learn")}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600"
        >
          Back to Academy
        </button>
      </div>
    );
  }

  const c = COLOR[series.color];
  const seriesCompleted = series.lessons.filter(l => completed.has(`${series.slug}/${l.slug}`)).length;
  const pct = series.lessons.length > 0 ? Math.round((seriesCompleted / series.lessons.length) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-950/95 px-4 py-3 backdrop-blur-sm pt-safe">
        <button onClick={() => router.push("/learn")} className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-500 dark:text-gray-400">Learn</span>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-400 dark:text-gray-600 shrink-0"><path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{series.title}</span>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* Series header */}
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900 animate-fadeInUp">
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-widest ${c.accent}`}>{series.lessons.length} lessons</p>
            <h1 className="mt-1 font-display text-xl font-bold tracking-tight text-gray-900 dark:text-white md:text-2xl">{series.title}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{series.description}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">{seriesCompleted} of {series.lessons.length} lessons completed</span>
              <span className={`font-semibold ${c.accent}`}>{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className={`h-full rounded-full transition-all duration-500 ${c.bar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Lesson list */}
        <div className="space-y-2">
          {series.lessons.map((lesson, idx) => {
            const isDone = completed.has(`${series.slug}/${lesson.slug}`);
            return (
              <button
                key={lesson.slug}
                onClick={() => router.push(`/learn/${series.slug}/${lesson.slug}`)}
                className="group flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated active:scale-[0.99] motion-reduce:active:scale-100 dark:border-gray-800 dark:bg-gray-900"
              >
                {/* Number / check */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${isDone ? "bg-emerald-500 text-white" : "border-2 border-gray-300 text-gray-500 dark:text-gray-400 dark:border-gray-700"}`}>
                  {isDone ? (
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{lesson.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{lesson.subtitle}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{lesson.readingTime}</span>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-gray-400 transition-colors group-hover:text-gray-600 dark:text-gray-600 dark:group-hover:text-gray-400">
                    <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
