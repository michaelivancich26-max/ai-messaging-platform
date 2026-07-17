"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LiveMatches from "@/components/LiveMatches";
import type { Medal } from "@/components/MedalsPanel";
import type { CredScore } from "@/lib/types";
import { SERIES, TOTAL_LESSONS } from "@/app/learn/content";
import { PUZZLES } from "@/app/learn/puzzles/content";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface LessonDone { seriesSlug: string; lessonSlug: string; completedAt: string }

// Every lesson in reading order, flattened across series.
const LESSON_ORDER = SERIES.flatMap(s => s.lessons.map(l => ({
  seriesSlug: s.slug, seriesTitle: s.title, lessonSlug: l.slug, title: l.title, readingTime: l.readingTime,
})));

// Rapid is no longer one of these — it's the hero. These are the secondary
// destinations, styled quiet so the front door stays dominant.
const MODES: { href: string; label: string; blurb: string; accent: string; icon: React.ReactNode }[] = [
  { href: "/lobby", label: "Common Grounds", blurb: "Join live rooms", accent: "text-indigo-600 dark:text-indigo-400",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M10 3c-4.31 0-8 2.69-8 6 0 1.56.83 2.98 2.17 4.04L3 17l3.86-1.6c.98.38 2.05.6 3.14.6 4.31 0 8-2.69 8-6s-3.69-6-8-6Z" clipRule="evenodd" /></svg> },
  { href: "/compete", label: "Battle Grounds", blurb: "1v1, AI judged", accent: "text-violet-600 dark:text-violet-400",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h4.017l-1.75 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 14.25 8h-4.017l1.75-6.093Z" /></svg> },
  { href: "/arena", label: "Training Grounds", blurb: "Beat the bots, learn the theory", accent: "text-amber-600 dark:text-amber-400",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M15.5 3H14V2a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v1H4.5A1.5 1.5 0 0 0 3 4.5v1A2.5 2.5 0 0 0 5.5 8h.28A4.01 4.01 0 0 0 9 10.9V13H7a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.1A4.01 4.01 0 0 0 14.22 8h.28A2.5 2.5 0 0 0 17 5.5v-1A1.5 1.5 0 0 0 15.5 3ZM5.5 6.5A.5.5 0 0 1 5 6V5h1v1.5h-.5Zm10 0H15V5h1v1a.5.5 0 0 1-.5.5Z" /></svg> },
];

function StatChip({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-left shadow-card transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700">
      {children}
    </button>
  );
}

export default function HomePage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";
  const userId: string = (session?.user as any)?.id ?? "";

  const [streak, setStreak] = useState<{ current: number; longest: number } | null>(null);
  const [cred, setCred] = useState<CredScore | null>(null);
  const [medals, setMedals] = useState<Medal[]>([]);
  const [lessonsDone, setLessonsDone] = useState<LessonDone[] | null>(null);
  const [puzzlesDone, setPuzzlesDone] = useState<string[]>([]);
  // Rapid loop state — the two reads the old dashboard never made.
  const [deck, setDeck] = useState<{ positioned: number; gate: number } | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    api(`${SERVER}/api/users/${userId}/profile`).then(r => r.json())
      .then(d => {
        setStreak({ current: d?.stats?.dailyStreak ?? 0, longest: d?.stats?.longestStreak ?? 0 });
        setCred(d?.cred ?? null);
        setMedals(Array.isArray(d?.medals) ? d.medals : []);
      }).catch(() => {});
    api(`${SERVER}/api/lessons/progress?userId=${userId}`).then(r => r.json())
      .then(d => setLessonsDone(Array.isArray(d?.completed) ? d.completed : [])).catch(() => setLessonsDone([]));
    api(`${SERVER}/api/puzzles/progress?userId=${userId}`).then(r => r.json())
      .then(d => setPuzzlesDone(Array.isArray(d?.completed) ? d.completed : [])).catch(() => {});
    // Deck progress drives the hero's on-ramp; limit=1 because we only need the counts.
    api(`${SERVER}/api/deck?userId=${encodeURIComponent(userId)}&limit=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setDeck({ positioned: d.positioned ?? 0, gate: d.gate ?? 10 }); })
      .catch(() => {});
  }, [userId]);

  // Live queue size — polled so the hero shows real momentum, not a static number.
  useEffect(() => {
    let live = true;
    const pull = () => api(`${SERVER}/api/rapid/queue-size`).then(r => r.json())
      .then(d => { if (live) setWaiting(typeof d?.waiting === "number" ? d.waiting : 0); })
      .catch(() => {});
    pull();
    const t = setInterval(pull, 5000);
    return () => { live = false; clearInterval(t); };
  }, []);

  // The unearned medal you're closest to. Medals already carry progress 0-1.
  const nextMedal = useMemo(() => {
    const unearned = medals.filter(m => !m.earned && m.progress > 0);
    if (!unearned.length) return null;
    return unearned.reduce((best, m) => (m.progress > best.progress ? m : best));
  }, [medals]);

  // Where to pick the academy back up: the first unfinished lesson at or after
  // your most recent completion, wrapping to the start if you skipped around.
  const nextLesson = useMemo(() => {
    if (!lessonsDone) return undefined;                     // still loading
    const doneKeys = new Set(lessonsDone.map(d => `${d.seriesSlug}/${d.lessonSlug}`));
    if (doneKeys.size >= LESSON_ORDER.length) return null;  // finished everything
    const last = lessonsDone[0];                            // server orders completedAt DESC
    const from = last
      ? LESSON_ORDER.findIndex(l => l.seriesSlug === last.seriesSlug && l.lessonSlug === last.lessonSlug) + 1
      : 0;
    for (let i = from; i < LESSON_ORDER.length; i++) {
      const l = LESSON_ORDER[i];
      if (!doneKeys.has(`${l.seriesSlug}/${l.lessonSlug}`)) return l;
    }
    return LESSON_ORDER.find(l => !doneKeys.has(`${l.seriesSlug}/${l.lessonSlug}`)) ?? null;
  }, [lessonsDone]);

  const rated = !!cred && cred.total >= 3;
  const lessonCount = lessonsDone?.length ?? 0;
  const lessonPct = TOTAL_LESSONS > 0 ? Math.round((lessonCount / TOTAL_LESSONS) * 100) : 0;
  const puzzlePct = PUZZLES.length > 0 ? Math.round((puzzlesDone.length / PUZZLES.length) * 100) : 0;

  // Hero on-ramp. While deck is null we don't know the gate yet, so the CTA points
  // at the deck (which reads correctly whether or not you're ready) and the meter
  // shows a resting state — never a dead end.
  const gate = deck?.gate ?? 10;
  const positioned = deck?.positioned ?? 0;
  const deckPct = Math.min(100, Math.round((positioned / Math.max(1, gate)) * 100));
  const remaining = Math.max(0, gate - positioned);
  const ready = !!deck && remaining === 0;
  const ctaHref = ready ? "/rapid" : "/deck";
  const ctaLabel = ready
    ? "Find someone who disagrees"
    : positioned > 0
      ? `${remaining} more to unlock Rapid`
      : "Build your belief deck";

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 text-sm">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8 space-y-8">

        {/* Greeting + at-a-glance standing — subordinate to the hero below it. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Welcome back{username ? <>, <span className="font-semibold text-gray-900 dark:text-gray-100">{username}</span></> : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatChip onClick={() => router.push("/dashboard")} title="Days in a row you've been active">
              <span className="text-sm leading-none">🔥</span>
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{streak ? `${streak.current}d` : "—"}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{streak && streak.longest > 0 ? `best ${streak.longest}` : "streak"}</span>
            </StatChip>
            {/* Unrated below 3 scored claims — a bare 0 reads as "you scored zero". */}
            <StatChip onClick={() => router.push("/dashboard")} title={rated ? "Your Grounds Score, from how your claims hold up" : "Make at least 3 verified claims to earn a score"}>
              <span className="text-sm leading-none">⚖️</span>
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{rated ? cred!.score : "—"}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{rated ? "score" : "unrated"}</span>
            </StatChip>
            {nextMedal && (
              <StatChip onClick={() => router.push("/dashboard")} title={nextMedal.description}>
                <span className="text-sm leading-none">{nextMedal.icon}</span>
                <span className="max-w-[9rem] truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{nextMedal.name}</span>
              </StatChip>
            )}
          </div>
        </div>

        {/* ── Rapid hero — the front door ─────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white bg-hero-glow shadow-hero dark:border-gray-800 dark:bg-gray-900">
          <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V1.75A.75.75 0 0 1 10 1ZM5.05 3.05a.75.75 0 0 1 1.06 0l1.062 1.06A.75.75 0 1 1 6.11 5.173L5.05 4.11a.75.75 0 0 1 0-1.06Zm9.9 0a.75.75 0 0 1 0 1.06l-1.06 1.062a.75.75 0 0 1-1.062-1.061l1.061-1.06a.75.75 0 0 1 1.06 0ZM10 6a4 4 0 0 0-3.446 6.032l.311.51a.75.75 0 0 1-1.28.782l-.312-.51A5.5 5.5 0 1 1 15.5 11.5a5.47 5.47 0 0 1-.773 2.814l-.311.51a.75.75 0 1 1-1.28-.782l.31-.51A4 4 0 0 0 10 6Zm-2 11.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>
                Rapid Fire
              </p>
              <h1 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight text-balance text-gray-900 dark:text-white md:text-4xl">
                Find someone who<br className="hidden sm:block" /> actually disagrees.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-pretty text-gray-600 dark:text-gray-300 md:text-base">
                Get matched with a stranger who holds the opposite view on a claim you&rsquo;ve both taken a side on — then argue the side you actually hold, live.
              </p>

              {/* On-ramp meter */}
              <div className="mt-6 max-w-md">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Your belief deck</span>
                  <span className={ready ? "font-semibold text-brand-green-ink dark:text-brand-green" : "text-gray-500 dark:text-gray-400"}>
                    {ready ? "Ready to queue" : `${positioned} / ${gate} positions`}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${ready ? "bg-brand-green" : "bg-orange-500"}`}
                    style={{ width: `${ready ? 100 : Math.max(6, deckPct)}%` }}
                  />
                </div>
              </div>

              {/* CTA row */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => router.push(ctaHref)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-orange-700 px-6 py-3.5 text-base font-semibold text-white shadow-glow transition-transform duration-150 hover:bg-orange-600 active:scale-[0.98] motion-reduce:active:scale-100"
                >
                  {ctaLabel}
                  <span aria-hidden>→</span>
                </button>
                <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                  </span>
                  {waiting === null
                    ? "checking the queue…"
                    : waiting > 0
                      ? <><span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">{waiting}</span> {waiting === 1 ? "person" : "people"} in the queue</>
                      : "be the first in the queue"}
                </span>
              </div>
            </div>

            {/* Proposition-bar teaser — a static preview of the room's decisive element. */}
            <div className="hidden shrink-0 md:block md:w-64">
              <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 shadow-card dark:border-gray-800 dark:bg-gray-950/50">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">The proposition</p>
                <p className="mt-1.5 text-sm font-semibold leading-snug text-gray-800 dark:text-gray-100">
                  &ldquo;Social media does more harm than good.&rdquo;
                </p>
                <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                  <div className="bg-emerald-500" style={{ width: "58%" }} />
                  <div className="bg-rose-500" style={{ width: "42%" }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] font-semibold">
                  <span className="text-emerald-700 dark:text-emerald-400">Agree 58</span>
                  <span className="text-rose-700 dark:text-rose-400">42 Disagree</span>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  The bar shifts as the argument lands. Whoever leads when you both move on wins.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Live now — momentum, right under the hero ───────────────────── */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-red opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-red" />
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">Live now</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">— watch a debate in progress</span>
          </div>
          <LiveMatches variant="grid" />
        </section>

        {/* ── Explore — the other modes, quieter than Rapid ───────────────── */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Explore</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MODES.map(m => (
              <button key={m.href} onClick={() => router.push(m.href)}
                className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 dark:bg-gray-800 ${m.accent}`}>{m.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{m.label}</span>
                  <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{m.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Continue learning ───────────────────────────────────────────── */}
        {nextLesson !== undefined && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Keep sharpening</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                onClick={() => router.push(nextLesson ? `/learn/${nextLesson.seriesSlug}/${nextLesson.lessonSlug}` : "/learn")}
                className="group flex flex-col justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900 sm:col-span-2">
                <div className="min-w-0">
                  {nextLesson ? (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">{nextLesson.seriesTitle}</p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{nextLesson.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{lessonCount === 0 ? "Start the academy" : "Pick up where you left off"} · {nextLesson.readingTime}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">All lessons complete</p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Revisit any series in the academy.</p>
                    </>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
                    <span>{lessonCount} of {TOTAL_LESSONS} lessons</span>
                    <span className="font-semibold text-teal-600 dark:text-teal-400">{lessonPct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${lessonPct}%` }} />
                  </div>
                </div>
              </button>

              <button onClick={() => router.push("/learn/puzzles")}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">Puzzles</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-gray-100">Spot the flaw</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
                    <span>{puzzlesDone.length} of {PUZZLES.length}</span>
                    <span className="font-semibold text-violet-600 dark:text-violet-400">{puzzlePct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${puzzlePct}%` }} />
                  </div>
                </div>
              </button>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
