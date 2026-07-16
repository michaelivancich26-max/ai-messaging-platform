"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { findSeries } from "../content";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

const COLOR = {
  red:     { text: "text-red-600 dark:text-red-400",     bar: "bg-red-500",     ring: "ring-red-900/40",     bg: "bg-red-100 dark:bg-red-950/30",     pill: "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"     },
  blue:    { text: "text-blue-600 dark:text-blue-400",    bar: "bg-blue-500",    ring: "ring-blue-900/40",    bg: "bg-blue-100 dark:bg-blue-950/30",    pill: "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"    },
  emerald: { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", ring: "ring-emerald-900/40", bg: "bg-emerald-100 dark:bg-emerald-950/30", pill: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" },
  amber:   { text: "text-amber-600 dark:text-amber-400",   bar: "bg-amber-500",   ring: "ring-amber-900/40",   bg: "bg-amber-100 dark:bg-amber-950/30",   pill: "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"   },
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

  if (status === "loading") return <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 text-sm">Loading…</div>;
  if (!series) return <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-500 text-sm">Series not found.</div>;

  const c = COLOR[series.color];
  const seriesCompleted = series.lessons.filter(l => completed.has(`${series.slug}/${l.slug}`)).length;
  const pct = series.lessons.length > 0 ? Math.round((seriesCompleted / series.lessons.length) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-950/95 px-4 py-3 backdrop-blur-sm pt-safe">
        <button onClick={() => router.push("/learn")} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-500">Learn</span>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-400 dark:text-gray-700 shrink-0"><path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{series.title}</span>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* Series header */}
        <div className={`rounded-2xl border ${c.ring} ${c.bg} p-5 space-y-3`}>
          <div>
            <h1 className={`text-xl font-bold ${c.text}`}>{series.title}</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{series.description}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{seriesCompleted} of {series.lessons.length} lessons completed</span>
              <span className={`font-semibold ${c.text}`}>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100/80 dark:bg-gray-800/80 overflow-hidden">
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
                className="group w-full flex items-center gap-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-left transition-all hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-100/60 dark:hover:bg-gray-800/60"
              >
                {/* Number / check */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${isDone ? "bg-emerald-500 text-white" : `border-2 border-gray-300 dark:border-gray-700 text-gray-500 group-hover:border-gray-300 dark:hover:border-gray-500`}`}>
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
                  <p className="text-xs text-gray-500 mt-0.5">{lesson.subtitle}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">{lesson.readingTime}</span>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-gray-400 dark:text-gray-700 group-hover:text-gray-500 transition-colors">
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
