"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { findSeries, findLesson } from "../../content";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// Per-series identity, reseated as data accents (pill, subtitle, takeaways).
// Light-mode text uses -700 for AA on white; dark mode uses -400.
const COLOR = {
  red:     { text: "text-red-700 dark:text-red-400",         pill: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"         },
  blue:    { text: "text-blue-700 dark:text-blue-400",       pill: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"       },
  emerald: { text: "text-emerald-700 dark:text-emerald-400", pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  amber:   { text: "text-amber-700 dark:text-amber-400",     pill: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"     },
} as const;

export default function LessonPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const params = useParams<{ series: string; lesson: string }>();
  const userId: string = (session?.user as any)?.id ?? "";

  const series = findSeries(params.series);
  const lesson = findLesson(params.series, params.lesson);
  const lessonIndex = series?.lessons.findIndex(l => l.slug === params.lesson) ?? -1;
  const nextLesson = series && lessonIndex >= 0 ? series.lessons[lessonIndex + 1] : null;

  const [isCompleted, setIsCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Quiz state
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!userId || !lesson) return;
    api(`${SERVER}/api/lessons/progress?userId=${userId}`)
      .then(r => r.json())
      .then(d => {
        const done = (d.completed ?? []).some(
          (c: { seriesSlug: string; lessonSlug: string }) => c.seriesSlug === params.series && c.lessonSlug === params.lesson
        );
        setIsCompleted(done);
      })
      .catch(() => {});
  }, [userId, params.series, params.lesson]);

  async function markComplete() {
    if (!userId || completing || isCompleted) return;
    setCompleting(true);
    try {
      const res = await api(`${SERVER}/api/lessons/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, seriesSlug: params.series, lessonSlug: params.lesson }),
      });
      if (res.ok) setIsCompleted(true);
    } catch { /* ignore */ } finally {
      setCompleting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
        <div className="border-b border-gray-200 px-4 py-3 pt-safe dark:border-gray-800">
          <div className="h-5 w-56 rounded bg-gray-200 shimmer-track dark:bg-gray-800" />
        </div>
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
          <div className="h-24 rounded-2xl bg-gray-200 shimmer-track dark:bg-gray-800" />
          <div className="h-64 rounded-2xl bg-gray-200 shimmer-track dark:bg-gray-800" />
          <div className="h-40 rounded-2xl bg-gray-200 shimmer-track dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (!series || !lesson) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center dark:bg-gray-950">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 dark:bg-gray-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 text-gray-400 dark:text-gray-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <div>
          <p className="font-display text-lg font-bold text-gray-900 dark:text-white">Lesson not found</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">That lesson doesn&rsquo;t exist or may have moved.</p>
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
  const allQuizzed = lesson.quiz.every((_, i) => submitted.has(i));
  const allCorrect = lesson.quiz.every((q, i) => selected[i] === q.correctIndex);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-950/95 px-4 py-3 backdrop-blur-sm pt-safe">
        <button onClick={() => router.push(`/learn/${series.slug}`)} className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex items-center gap-1.5 text-xs min-w-0 flex-1">
          <span className="text-gray-500 dark:text-gray-400 truncate hidden sm:block">Learn</span>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-400 dark:text-gray-600 shrink-0 hidden sm:block"><path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
          <button onClick={() => router.push(`/learn/${series.slug}`)} className={`truncate hover:underline ${c.text} hidden sm:block`}>{series.title}</button>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-400 dark:text-gray-600 shrink-0 hidden sm:block"><path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
          <span className="text-gray-700 dark:text-gray-300 font-semibold truncate">{lesson.title}</span>
        </div>
        {isCompleted && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-emerald-600 dark:text-emerald-400">
              <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
            </svg>
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Completed</span>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        {/* Lesson header */}
        <div className="space-y-2 animate-fadeInUp">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.pill}`}>{series.title}</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">{lesson.readingTime}</span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">{lesson.title}</h1>
          <p className={`text-base font-medium ${c.text}`}>{lesson.subtitle}</p>
        </div>

        {/* Intro */}
        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{lesson.intro}</p>

        {/* Sections */}
        <div className="space-y-8">
          {lesson.sections.map((section) => (
            <div key={section.heading} className="space-y-4">
              <h2 className="font-display text-base font-bold text-gray-900 dark:text-white">{section.heading}</h2>
              <div className="space-y-2">
                {section.body.split("\n\n").map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">{para}</p>
                ))}
              </div>
              {section.examples && section.examples.length > 0 && (
                <div className="space-y-2">
                  {section.examples.map((ex, i) => (
                    <div key={i} className={`rounded-xl border p-4 space-y-1 ${ex.type === "bad" ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/10" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/10"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${ex.type === "bad" ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                          {ex.type === "bad" ? "✗ Fallacy" : "✓ Better"}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">{ex.label}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-300 italic">"{ex.text}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Takeaways */}
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
          <h3 className={`text-xs font-bold uppercase tracking-wider ${c.text}`}>Key Takeaways</h3>
          <ul className="space-y-2">
            {lesson.takeaways.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current ${c.text}`} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Quiz */}
        <div className="space-y-6">
          <h2 className="font-display text-base font-bold text-gray-900 dark:text-white">Check Your Understanding</h2>
          {lesson.quiz.map((q, qi) => {
            const isSubmitted = submitted.has(qi);
            const sel = selected[qi];
            const isCorrect = sel === q.correctIndex;
            return (
              <div key={qi} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900 space-y-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                  <span className="text-gray-500 dark:text-gray-400 mr-2">{qi + 1}.</span>{q.question}
                </p>
                <div className="space-y-2">
                  {q.options.map((opt, oi) => {
                    let cls = "border-gray-200 dark:border-gray-800 bg-gray-100/40 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-700 dark:hover:text-gray-300";
                    if (isSubmitted) {
                      if (oi === q.correctIndex) cls = "border-emerald-700 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300";
                      else if (oi === sel) cls = "border-red-700 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300";
                      else cls = "border-gray-200 dark:border-gray-800 bg-gray-100/20 dark:bg-gray-800/20 text-gray-500 dark:text-gray-400";
                    } else if (sel === oi) {
                      cls = `border-current ${c.text} bg-gray-100/60 dark:bg-gray-800/60`;
                    }
                    return (
                      <button
                        key={oi}
                        disabled={isSubmitted}
                        onClick={() => !isSubmitted && setSelected(s => ({ ...s, [qi]: oi }))}
                        className={`w-full rounded-lg border px-3.5 py-2.5 text-left text-xs leading-snug transition-colors disabled:cursor-default ${cls}`}
                      >
                        <span className="font-semibold mr-2">{String.fromCharCode(65 + oi)}.</span>{opt}
                      </button>
                    );
                  })}
                </div>
                {!isSubmitted && (
                  <button
                    disabled={sel === undefined}
                    onClick={() => setSubmitted(s => new Set([...s, qi]))}
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    Submit Answer
                  </button>
                )}
                {isSubmitted && (
                  <div className={`rounded-lg p-3 text-xs leading-relaxed ${isCorrect ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" : "bg-red-100 dark:bg-red-950/20 text-red-700 dark:text-red-300"}`}>
                    <span className="font-semibold mr-1">{isCorrect ? "Correct." : "Not quite."}</span>
                    {q.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Quiz result banner */}
        {allQuizzed && allCorrect && !isCompleted && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-white">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-300">Perfect score! Mark this lesson complete to track your progress.</p>
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex flex-col gap-3 pb-10">
          {!isCompleted ? (
            <button
              onClick={markComplete}
              disabled={completing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-700 py-3 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.99] motion-reduce:active:scale-100 disabled:opacity-50"
            >
              {completing ? "Saving…" : "Mark as Complete"}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-emerald-600 dark:text-emerald-400">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Lesson Complete</span>
            </div>
          )}

          {/* Practice in Arena */}
          {lesson.practice && (
            <button
              onClick={() => router.push(`/arena?challenge=${lesson.practice!.botId}`)}
              className={`w-full rounded-xl border border-gray-300 bg-white py-3 text-sm font-semibold shadow-card transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800/50 ${c.text}`}
            >
              Practice in Training Grounds — {lesson.practice.cta}
            </button>
          )}

          {/* Next lesson */}
          {nextLesson && (
            <button
              onClick={() => router.push(`/learn/${series.slug}/${nextLesson.slug}`)}
              className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 shadow-card transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/50"
            >
              Next: {nextLesson.title}
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {!nextLesson && isCompleted && (
            <button
              onClick={() => router.push(`/learn/${series.slug}`)}
              className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 shadow-card transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/50"
            >
              Back to {series.title}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
