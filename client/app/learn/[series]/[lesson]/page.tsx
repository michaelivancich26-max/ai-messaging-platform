"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { findSeries, findLesson } from "../../content";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

const COLOR = {
  red:     { text: "text-red-400",     border: "border-red-900/40",     bg: "bg-red-950/20",     btn: "bg-red-600 hover:bg-red-500",     pill: "bg-red-950/40 text-red-400"     },
  blue:    { text: "text-blue-400",    border: "border-blue-900/40",    bg: "bg-blue-950/20",    btn: "bg-blue-600 hover:bg-blue-500",    pill: "bg-blue-950/40 text-blue-400"    },
  emerald: { text: "text-emerald-400", border: "border-emerald-900/40", bg: "bg-emerald-950/20", btn: "bg-emerald-600 hover:bg-emerald-500", pill: "bg-emerald-950/40 text-emerald-400" },
  amber:   { text: "text-amber-400",   border: "border-amber-900/40",   bg: "bg-amber-950/20",   btn: "bg-amber-600 hover:bg-amber-500",   pill: "bg-amber-950/40 text-amber-400"   },
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
    fetch(`${SERVER}/api/lessons/progress?userId=${userId}`)
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
      const res = await fetch(`${SERVER}/api/lessons/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, seriesSlug: params.series, lessonSlug: params.lesson }),
      });
      if (res.ok) setIsCompleted(true);
    } catch { /* ignore */ } finally {
      setCompleting(false);
    }
  }

  if (status === "loading") return <div className="flex h-full items-center justify-center bg-gray-950 text-gray-600 text-sm">Loading…</div>;
  if (!series || !lesson) return <div className="flex h-full items-center justify-center bg-gray-950 text-gray-500 text-sm">Lesson not found.</div>;

  const c = COLOR[series.color];
  const allQuizzed = lesson.quiz.every((_, i) => submitted.has(i));
  const allCorrect = lesson.quiz.every((q, i) => selected[i] === q.correctIndex);

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-800 bg-gray-950/95 px-4 py-3 backdrop-blur-sm pt-safe">
        <button onClick={() => router.push(`/learn/${series.slug}`)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex items-center gap-1.5 text-xs min-w-0 flex-1">
          <span className="text-gray-600 truncate hidden sm:block">Learn</span>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-700 shrink-0 hidden sm:block"><path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
          <button onClick={() => router.push(`/learn/${series.slug}`)} className={`truncate hover:underline ${c.text} hidden sm:block`}>{series.title}</button>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-700 shrink-0 hidden sm:block"><path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
          <span className="text-gray-300 font-semibold truncate">{lesson.title}</span>
        </div>
        {isCompleted && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-950/60 px-2.5 py-1 ring-1 ring-emerald-900/40">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-emerald-400">
              <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
            </svg>
            <span className="text-[10px] font-semibold text-emerald-400">Completed</span>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        {/* Lesson header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${c.pill}`}>{series.title}</span>
            <span className="text-[10px] text-gray-600">{lesson.readingTime}</span>
          </div>
          <h1 className="text-2xl font-bold text-white leading-tight">{lesson.title}</h1>
          <p className={`text-base font-medium ${c.text}`}>{lesson.subtitle}</p>
        </div>

        {/* Intro */}
        <p className="text-sm leading-relaxed text-gray-300">{lesson.intro}</p>

        {/* Sections */}
        <div className="space-y-8">
          {lesson.sections.map((section) => (
            <div key={section.heading} className="space-y-4">
              <h2 className="text-base font-bold text-white">{section.heading}</h2>
              <div className="space-y-2">
                {section.body.split("\n\n").map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed text-gray-400">{para}</p>
                ))}
              </div>
              {section.examples && section.examples.length > 0 && (
                <div className="space-y-2">
                  {section.examples.map((ex, i) => (
                    <div key={i} className={`rounded-xl border p-4 space-y-1 ${ex.type === "bad" ? "border-red-900/40 bg-red-950/10" : "border-emerald-900/40 bg-emerald-950/10"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${ex.type === "bad" ? "text-red-500" : "text-emerald-500"}`}>
                          {ex.type === "bad" ? "✗ Fallacy" : "✓ Better"}
                        </span>
                        <span className="text-[10px] text-gray-600">{ex.label}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-gray-300 italic">"{ex.text}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Takeaways */}
        <div className={`rounded-xl border ${c.border} ${c.bg} p-5 space-y-3`}>
          <h3 className={`text-xs font-bold uppercase tracking-wider ${c.text}`}>Key Takeaways</h3>
          <ul className="space-y-2">
            {lesson.takeaways.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${c.text} bg-current`} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Quiz */}
        <div className="space-y-6">
          <h2 className="text-base font-bold text-white">Check Your Understanding</h2>
          {lesson.quiz.map((q, qi) => {
            const isSubmitted = submitted.has(qi);
            const sel = selected[qi];
            const isCorrect = sel === q.correctIndex;
            return (
              <div key={qi} className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
                <p className="text-sm font-semibold text-gray-100 leading-snug">
                  <span className="text-gray-600 mr-2">{qi + 1}.</span>{q.question}
                </p>
                <div className="space-y-2">
                  {q.options.map((opt, oi) => {
                    let cls = "border-gray-800 bg-gray-800/40 text-gray-400 hover:border-gray-700 hover:text-gray-300";
                    if (isSubmitted) {
                      if (oi === q.correctIndex) cls = "border-emerald-700 bg-emerald-950/30 text-emerald-300";
                      else if (oi === sel) cls = "border-red-700 bg-red-950/30 text-red-300";
                      else cls = "border-gray-800 bg-gray-800/20 text-gray-600";
                    } else if (sel === oi) {
                      cls = `border-current ${c.text} bg-gray-800/60`;
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
                    className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${c.btn}`}
                  >
                    Submit Answer
                  </button>
                )}
                {isSubmitted && (
                  <div className={`rounded-lg p-3 text-xs leading-relaxed ${isCorrect ? "bg-emerald-950/30 text-emerald-300" : "bg-red-950/20 text-red-300"}`}>
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
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-white">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="flex-1 text-sm text-emerald-300">Perfect score! Mark this lesson complete to track your progress.</p>
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex flex-col gap-3 pb-10">
          {!isCompleted ? (
            <button
              onClick={markComplete}
              disabled={completing}
              className="w-full rounded-xl bg-gray-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-600 disabled:opacity-50"
            >
              {completing ? "Saving…" : "Mark as Complete"}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-800/40 bg-emerald-950/20 py-3">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-emerald-400">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold text-emerald-400">Lesson Complete</span>
            </div>
          )}

          {/* Practice in Arena */}
          {lesson.practice && (
            <button
              onClick={() => router.push(`/arena?challenge=${lesson.practice!.botId}`)}
              className={`w-full rounded-xl border ${c.border} ${c.bg} py-3 text-sm font-semibold ${c.text} transition-colors hover:brightness-125`}
            >
              Practice in Arena — {lesson.practice.cta}
            </button>
          )}

          {/* Next lesson */}
          {nextLesson && (
            <button
              onClick={() => router.push(`/learn/${series.slug}/${nextLesson.slug}`)}
              className="flex items-center justify-center gap-2 rounded-xl border border-gray-800 py-3 text-sm text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-300"
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
              className="flex items-center justify-center gap-2 rounded-xl border border-gray-800 py-3 text-sm text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-300"
            >
              Back to {series.title}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
