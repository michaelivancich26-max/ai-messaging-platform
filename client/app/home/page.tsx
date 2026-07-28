"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LiveMatches from "@/components/LiveMatches";
import { MedalIcon, type Medal } from "@/components/MedalsPanel";
import type { CredScore } from "@/lib/types";
import { SERIES, TOTAL_LESSONS } from "@/app/learn/content";
import { PUZZLES } from "@/app/learn/puzzles/content";
import { api } from "@/lib/api";
import { Flame, Scale, Zap } from "@/lib/icons";
import { MessagesSquare, Dumbbell, Trophy, BookOpen, Puzzle, Radio, ChevronRight, Sparkles, type LucideIcon } from "lucide-react";
import { usePro } from "@/lib/usePro";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface LessonDone { seriesSlug: string; lessonSlug: string; completedAt: string }

// Every lesson in reading order, flattened across series.
const LESSON_ORDER = SERIES.flatMap(s => s.lessons.map(l => ({
  seriesSlug: s.slug, seriesTitle: s.title, lessonSlug: l.slug, title: l.title, readingTime: l.readingTime,
})));

export default function HomePage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";
  const userId: string = (session?.user as any)?.id ?? "";
  const { isPro, loading: proLoading } = usePro();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [streak, setStreak] = useState<{ current: number; longest: number } | null>(null);
  const [cred, setCred] = useState<CredScore | null>(null);
  const [arenaBonus, setArenaBonus] = useState(0);
  const [medals, setMedals] = useState<Medal[]>([]);
  const [lessonsDone, setLessonsDone] = useState<LessonDone[] | null>(null);
  const [puzzlesDone, setPuzzlesDone] = useState<string[]>([]);
  // Rapid loop state — deck progress drives the hero on-ramp; queue size shows momentum.
  const [deck, setDeck] = useState<{ positioned: number; gate: number } | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    api(`${SERVER}/api/users/${userId}/profile`).then(r => r.json())
      .then(d => {
        setAvatarUrl(d?.avatarUrl ?? null);
        setStreak({ current: d?.stats?.dailyStreak ?? 0, longest: d?.stats?.longestStreak ?? 0 });
        setCred(d?.cred ?? null);
        setArenaBonus(Number(d?.stats?.arenaBonus ?? 0));
        setMedals(Array.isArray(d?.medals) ? d.medals : []);
      }).catch(() => {});
    api(`${SERVER}/api/lessons/progress?userId=${userId}`).then(r => r.json())
      .then(d => setLessonsDone(Array.isArray(d?.completed) ? d.completed : [])).catch(() => setLessonsDone([]));
    api(`${SERVER}/api/puzzles/progress?userId=${userId}`).then(r => r.json())
      .then(d => setPuzzlesDone(Array.isArray(d?.completed) ? d.completed : [])).catch(() => {});
    api(`${SERVER}/api/deck?userId=${encodeURIComponent(userId)}&limit=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setDeck({ positioned: d.positioned ?? 0, gate: d.gate ?? 10 }); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    let live = true;
    const pull = () => api(`${SERVER}/api/rapid/queue-size`).then(r => r.json())
      .then(d => { if (live) setWaiting(typeof d?.waiting === "number" ? d.waiting : 0); })
      .catch(() => {});
    pull();
    const t = setInterval(pull, 5000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const nextMedal = useMemo(() => {
    const unearned = medals.filter(m => !m.earned && m.progress > 0);
    if (!unearned.length) return null;
    return unearned.reduce((best, m) => (m.progress > best.progress ? m : best));
  }, [medals]);

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

  // The same arithmetic the dashboard, the public profile and the Grounds Score
  // board use. This page showed the bare claim score, so a player with arena
  // wins read a different headline number here than everywhere else.
  const groundsScore = Math.round(((cred && cred.total >= 3 ? cred.score : 0) + arenaBonus) * 10) / 10;
  const rated = (!!cred && cred.total >= 3) || arenaBonus !== 0;
  const lessonCount = lessonsDone?.length ?? 0;
  const lessonPct = TOTAL_LESSONS > 0 ? Math.round((lessonCount / TOTAL_LESSONS) * 100) : 0;
  const puzzlePct = PUZZLES.length > 0 ? Math.round((puzzlesDone.length / PUZZLES.length) * 100) : 0;

  // Hero on-ramp. While deck is null we don't know the gate yet, so the CTA points at
  // the deck (which reads correctly whether or not you're ready) and the meter rests.
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
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:py-8">

        {/* ── Identity header — you, front and center ─────────────────────── */}
        <header className="flex items-center gap-4">
          {avatarUrl
            ? <img src={avatarUrl} alt={username} className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-gray-300 dark:ring-gray-700 md:h-20 md:w-20" />
            : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gray-200 text-2xl font-bold text-gray-700 ring-1 ring-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 md:h-20 md:w-20">{username[0]?.toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:text-4xl">{username || "Welcome"}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
              <button onClick={() => router.push("/dashboard")} title={rated ? "Your Grounds Score" : "Make 3 verified claims to earn a score"}
                className="-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-200">
                <Scale className="h-4 w-4 shrink-0" aria-hidden />
                {rated ? <><span className="font-semibold text-gray-900 dark:text-gray-100">{groundsScore}</span> Grounds Score</> : "Unrated"}
              </button>
              <button onClick={() => router.push("/dashboard")} title="Days in a row you've been active"
                className="-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-200">
                <Flame className="h-4 w-4 shrink-0" aria-hidden />
                <span className="font-semibold text-gray-900 dark:text-gray-100">{streak ? streak.current : 0}</span> day streak
              </button>
              {nextMedal && (
                <button onClick={() => router.push("/dashboard")} title={nextMedal.description}
                  className="-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-200">
                  <MedalIcon name={nextMedal.icon} className="h-4 w-4 shrink-0" />
                  <span className="max-w-[10rem] truncate">{nextMedal.name}</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* ── Rapid promo — the front-door banner ─────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white bg-hero-glow shadow-hero dark:border-gray-800 dark:bg-gray-900">
          <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">
                <Zap className="h-4 w-4" aria-hidden />
                Rapid Fire
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight text-balance text-gray-900 dark:text-white md:text-4xl">
                Find someone who<br className="hidden sm:block" /> actually disagrees.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-pretty text-gray-600 dark:text-gray-300 md:text-base">
                Get matched with a stranger who holds the opposite view on a claim you&rsquo;ve both taken a side on — then argue the side you actually hold, live.
              </p>

              <div className="mt-6 max-w-md">
                <div className="flex items-baseline justify-between text-xs">
                  {/* Second way into the Belief Map, mirroring the deck's own
                      progress row — the front door reaches both breakpoints. */}
                  <Link href="/beliefs"
                    className="group -my-2 inline-flex min-h-11 items-center gap-1 py-2 font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100">
                    Your belief deck
                    <span aria-hidden className="opacity-50 transition-opacity group-hover:opacity-100">›</span>
                    <span className="sr-only">— see your Belief Map</span>
                  </Link>
                  <span className={ready ? "font-semibold text-brand-green-ink dark:text-brand-green" : "text-gray-500 dark:text-gray-400"}>
                    {ready ? "Ready to queue" : `${positioned} / ${gate} positions`}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                  <div className={`h-full rounded-full transition-[width] duration-500 ${ready ? "bg-brand-green" : "bg-orange-500"}`}
                    style={{ width: `${ready ? 100 : Math.max(6, deckPct)}%` }} />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button onClick={() => router.push(ctaHref)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-orange-700 px-6 py-3.5 text-base font-semibold text-white shadow-glow transition-transform duration-150 hover:bg-orange-600 active:scale-[0.98] motion-reduce:active:scale-100">
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

        {/* ── Grounds Pro — upgrade / manage ──────────────────────────────── */}
        {!proLoading && (isPro ? (
          <button onClick={() => router.push("/pro")}
            className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left shadow-card transition-colors hover:bg-amber-100/70 dark:border-amber-900/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/40">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"><Sparkles className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">You&rsquo;re on Grounds Pro</span>
              <span className="block text-xs text-gray-600 dark:text-gray-400">Manage your subscription</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400" />
          </button>
        ) : (
          <button onClick={() => router.push("/pro")}
            className="group flex w-full items-center gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-amber-900/50 dark:from-amber-950/25 dark:to-orange-950/25">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-orange-700 dark:text-amber-300"><Sparkles className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Grounds Pro</span>
                <span className="rounded-full bg-orange-600/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-orange-800 dark:text-orange-300">Upgrade</span>
              </span>
              <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">Unlimited Arena, AI coaching, analytics, and more.</span>
            </span>
            <span className="hidden shrink-0 items-center gap-1 rounded-xl bg-orange-700 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-colors group-hover:bg-orange-600 sm:inline-flex">Upgrade <ChevronRight className="h-4 w-4" /></span>
            <ChevronRight className="h-5 w-5 shrink-0 text-orange-700 dark:text-amber-300 sm:hidden" />
          </button>
        ))}

        {/* ── Jump in — the quick-start list (chess.com's play column) ─────── */}
        <section className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Jump in</h3>
            <div className="space-y-2.5">
              <QuickAction primary Icon={Zap} label={ready ? "Find a debate" : "Build your deck"} sub={ready ? "Rapid Fire — argue live now" : `${remaining} positions to unlock Rapid`} onClick={() => router.push(ctaHref)} />
              <QuickAction Icon={MessagesSquare} label="Common Grounds" sub="Join an open debate room" onClick={() => router.push("/lobby")} />
              <QuickAction Icon={Dumbbell} label="Practice a bot" sub="Train against 10 AI opponents" onClick={() => router.push("/arena")} />
              <QuickAction Icon={Trophy} label="Challenge someone" sub="Ranked 1v1, AI judged" onClick={() => router.push("/compete")} />
            </div>
          </div>

          {/* ── Feature cards (streak / puzzles / next lesson / watch) ─────── */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Keep sharpening</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard Icon={Flame} accent="text-orange-600 dark:text-orange-400" label="Streak"
                value={streak ? `${streak.current}d` : "—"} note={streak && streak.longest > 0 ? `best ${streak.longest}` : "day streak"}
                onClick={() => router.push("/dashboard")} />
              <StatCard Icon={Puzzle} accent="text-violet-600 dark:text-violet-400" label="Puzzles"
                value={`${puzzlesDone.length}`} note={`of ${PUZZLES.length} · ${puzzlePct}%`} pct={puzzlePct} pctClass="bg-violet-500"
                onClick={() => router.push("/learn/puzzles")} />
              <StatCard Icon={BookOpen} accent="text-teal-600 dark:text-teal-400" label="Next lesson"
                value={nextLesson ? nextLesson.title : nextLesson === null ? "All done" : "—"}
                note={nextLesson ? nextLesson.seriesTitle : `${lessonPct}% complete`} pct={lessonPct} pctClass="bg-teal-500" small
                onClick={() => router.push(nextLesson ? `/learn/${nextLesson.seriesSlug}/${nextLesson.lessonSlug}` : "/learn")} />
              <StatCard Icon={Radio} accent="text-red-600 dark:text-red-400" label="Watch"
                value="Live debates" note="Spectate in progress" small
                onClick={() => router.push("/watch")} />
            </div>
          </div>
        </section>

        {/* ── Live now — momentum ─────────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-red opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-red" />
            </span>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">Live now</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">— watch a debate in progress</span>
          </div>
          <LiveMatches variant="grid" />
        </section>

      </div>
    </div>
  );
}

// ── Quick-start row ────────────────────────────────────────────────────────
function QuickAction({ Icon, label, sub, onClick, primary }: {
  Icon: LucideIcon; label: string; sub: string; onClick: () => void; primary?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`group flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated ${primary
        ? "border-orange-300 bg-orange-50 dark:border-orange-900/60 dark:bg-orange-950/30"
        : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${primary
        ? "bg-orange-600 text-white shadow-glow"
        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${primary ? "text-orange-900 dark:text-orange-100" : "text-gray-900 dark:text-gray-100"}`}>{label}</span>
        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{sub}</span>
      </span>
      <ChevronRight className={`h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 ${primary ? "text-orange-500" : "text-gray-300 dark:text-gray-600"}`} />
    </button>
  );
}

// ── Feature / stat card ────────────────────────────────────────────────────
function StatCard({ Icon, accent, label, value, note, pct, pctClass, onClick, small }: {
  Icon: LucideIcon; accent: string; label: string; value: string; note: string;
  pct?: number; pctClass?: string; onClick: () => void; small?: boolean;
}) {
  return (
    <button onClick={onClick}
      className="flex flex-col justify-between gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className={`truncate font-display font-bold text-gray-900 dark:text-white ${small ? "text-sm" : "text-2xl"}`}>{value}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{note}</p>
      </div>
      {typeof pct === "number" && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div className={`h-full rounded-full transition-all duration-500 ${pctClass ?? "bg-gray-400"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </button>
  );
}
