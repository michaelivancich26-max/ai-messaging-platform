"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Zap, Trophy } from "@/lib/icons";
import { ChevronRight, Layers, Radio, type LucideIcon } from "lucide-react";
import { useLiveMatches } from "@/components/LiveMatches";
import { useRapidQueue, RapidTakeover, CategoryChips, ANY } from "@/components/RapidFire";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Standing { elo: number; wins: number; losses: number; rank: number | null; total: number | null }
interface Round {
  roomName: string; topic: string; opponentName: string;
  won: boolean; drawn: boolean; eloDelta: number; completedAt: string | null;
}
interface BoardRow { id: string; username: string; elo: number; wins: number; losses: number }

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : `${Math.floor(d / 7)}w ago`;
}

// The Rapid home. This used to be a single card that queued you and nothing
// else — the whole ladder, your record and every round you'd played lived
// somewhere else or nowhere at all. The queue is still the point of the page,
// so it keeps the top; everything under it is the evidence that the mode has a
// history you're part of.
export default function RapidPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";

  const q = useRapidQueue(userId, username);
  const [deck, setDeck] = useState<{ positioned: number; gate: number } | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const { matches } = useLiveMatches();

  useEffect(() => {
    if (!userId) return;
    api(`${SERVER}/api/deck?userId=${encodeURIComponent(userId)}&limit=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setDeck({ positioned: d.positioned ?? 0, gate: d.gate ?? 10 }); }).catch(() => {});
    api(`${SERVER}/api/rapid/me`).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setStanding(d); }).catch(() => {});
    api(`${SERVER}/api/users/${userId}/matches?mode=rapid`).then(r => (r.ok ? r.json() : []))
      .then(d => setRounds(Array.isArray(d) ? d : [])).catch(() => setRounds([]));
    api(`${SERVER}/api/rapid/leaderboard`).then(r => (r.ok ? r.json() : []))
      .then(d => setBoard(Array.isArray(d) ? d : [])).catch(() => setBoard([]));
  }, [userId]);

  // Rapid rounds only — a Battle Grounds match advertised here would send
  // someone to a mode with different rules under a Rapid heading.
  const liveRapid = useMemo(() => matches.filter(m => m.isRapid), [matches]);

  const gate = deck?.gate ?? 10;
  const positioned = deck?.positioned ?? 0;
  const remaining = Math.max(0, gate - positioned);
  // Only claim someone isn't ready once the deck has actually loaded — a null
  // deck must not turn the primary action into a detour.
  const ready = !deck || remaining === 0;
  const deckPct = Math.min(100, Math.round((positioned / Math.max(1, gate)) * 100));

  const played = (standing?.wins ?? 0) + (standing?.losses ?? 0);

  if (status === "loading" || !userId || !username) {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  // Searching, matched, or short of positions: the page gets out of the way.
  if (q.phase !== "idle") {
    return (
      <div className="h-full overflow-y-auto bg-gray-50 px-4 dark:bg-gray-950">
        <RapidTakeover
          username={username} phase={q.phase} found={q.found} needsDeck={q.needsDeck}
          since={q.since} waiting={q.waiting} selected={q.selected} categories={q.categories}
          onCancel={q.leave} onFixDeck={() => router.push("/deck")}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:py-8">

        {/* ── The queue console ───────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white bg-hero-glow shadow-hero dark:border-gray-800 dark:bg-gray-900">
          <div className="grid gap-7 p-5 sm:p-6 md:p-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">
                  <Zap className="h-4 w-4" aria-hidden />
                  Rapid Fire
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] shadow-card dark:border-gray-800 dark:bg-gray-950/60">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-70 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                  </span>
                  {q.waiting > 0
                    ? <><span className="font-semibold tabular-nums text-gray-800 dark:text-gray-100">{q.waiting}</span> <span className="text-gray-500 dark:text-gray-400">waiting</span></>
                    : <span className="text-gray-500 dark:text-gray-400">Queue is empty</span>}
                </span>
              </div>

              <h1 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight text-balance text-gray-900 dark:text-white md:text-4xl">
                Argue it out, live.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-pretty text-gray-600 dark:text-gray-300">
                We find someone who holds the opposite view on a claim you&rsquo;ve both taken a side on.
                You argue the side you actually hold — when you both agree to move on, whoever leads
                the proposition bar takes it.
              </p>

              <div className="mt-6">
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Category</p>
                <CategoryChips categories={q.categories} selected={q.selected} onSelect={q.setSelected} />
                <p className="mt-2.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {q.selected === ANY
                    ? "Any topic matches fastest — you'll be paired with whoever is waiting."
                    : "A category only pairs you with someone who chose it, or chose any topic."}
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                {ready ? (
                  <button onClick={q.join}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-orange-700 px-6 py-3.5 text-base font-semibold text-white shadow-glow transition-transform duration-150 hover:bg-orange-600 active:scale-[0.99] motion-reduce:active:scale-100">
                    Find an opponent <span aria-hidden>→</span>
                  </button>
                ) : (
                  <Link href="/deck"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-orange-700 px-6 py-3.5 text-base font-semibold text-white shadow-glow transition-transform duration-150 hover:bg-orange-600 active:scale-[0.99] motion-reduce:active:scale-100">
                    {remaining} more {remaining === 1 ? "position" : "positions"} to queue <span aria-hidden>→</span>
                  </Link>
                )}
                <div className="flex flex-wrap gap-2">
                  <Stake tone="rose" title="You can't bank a lead by walking away.">Leaving forfeits</Stake>
                  <Stake tone="gray" title="Under 3 messages each and the round is void — no winner, no rating change.">Under 3 messages voids</Stake>
                </div>
              </div>
            </div>

            {/* Your standing — the number this mode moves */}
            <StandingCard standing={standing} played={played} rounds={rounds} />
          </div>
        </section>

        {/* ── The gate: your belief deck ──────────────────────────────────── */}
        {deck && (remaining > 0 ? (
          <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5 shadow-card dark:border-orange-900/50 dark:bg-orange-950/25">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 font-display text-base font-bold text-gray-900 dark:text-gray-100">
                  <Layers className="h-4 w-4 text-orange-700 dark:text-orange-400" aria-hidden />
                  Where you stand
                </h2>
                <p className="mt-1 max-w-lg text-sm text-gray-600 dark:text-gray-300">
                  Pairing needs a claim you&rsquo;ve both taken a side on. Take {remaining} more
                  {remaining === 1 ? " position" : " positions"} and the queue opens.
                </p>
              </div>
              <Link href="/deck"
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-orange-700 px-4 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600">
                Set your positions <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">{positioned} / {gate}</span>
                <span className="text-gray-500 dark:text-gray-400">{deckPct}%</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-orange-200/70 dark:bg-orange-900/40">
                <div className="h-full rounded-full bg-orange-500 transition-[width] duration-500" style={{ width: `${Math.max(6, deckPct)}%` }} />
              </div>
            </div>
          </section>
        ) : (
          <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-card dark:border-gray-800 dark:bg-gray-900">
            <Layers className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{positioned}</span> positions
              taken — that&rsquo;s what we match you on.
            </p>
            <Link href="/deck" className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-700 transition-colors hover:text-orange-600 dark:text-orange-400">Add more</Link>
            <Link href="/beliefs" className="inline-flex min-h-11 items-center text-sm font-semibold text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Belief Map</Link>
          </section>
        ))}

        {/* ── First-timer explainer. Retires itself once you've played. ───── */}
        {rounds !== null && rounds.length === 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">How a round works</h2>
            <ol className="grid gap-3 sm:grid-cols-3">
              <Step n={1} title="Take positions">Say where you stand on claims from the library. Nothing pairs without them.</Step>
              <Step n={2} title="Get matched">We find someone who answered the opposite way, and hand you both the same claim.</Step>
              <Step n={3} title="Move the bar">Every message is scored. Whoever leads the bar when you both move on takes the round.</Step>
            </ol>
          </section>
        )}

        {/* ── Your rounds + the ladder ────────────────────────────────────── */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Your last rounds</h2>
              {rounds && rounds.length > 0 && (
                <Link href="/profile" className="-my-3 inline-flex min-h-11 items-center py-3 text-xs font-semibold text-orange-700 transition-colors hover:text-orange-600 dark:text-orange-400">Full history</Link>
              )}
            </div>
            <div className="space-y-2.5">
              {rounds === null
                ? [0, 1, 2].map(i => <div key={i} className="shimmer-track h-[4.5rem] rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />)
                : rounds.length === 0
                  ? <EmptyCard>Your finished rounds land here, each one with the tape — the bar&rsquo;s trajectory, every claim you made, and what the coach saw.</EmptyCard>
                  : rounds.slice(0, 5).map(r => <RoundRow key={r.roomName} r={r} />)}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Rapid ladder</h2>
              {standing?.rank && standing.total && (
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">You&rsquo;re #{standing.rank} of {standing.total}</span>
              )}
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900">
              {board === null
                ? <div className="shimmer-track h-64" />
                : board.length === 0
                  ? <p className="p-5 text-sm text-gray-600 dark:text-gray-400">Nobody has finished a rapid round yet. Win one and you&rsquo;ll open the ladder.</p>
                  : (
                    <ol>
                      {board.slice(0, 8).map((row, i) => <LadderRow key={row.id} row={row} place={i + 1} me={row.id === userId} />)}
                      {/* Your own row, when you're on the board but below the fold. */}
                      {standing?.rank && standing.rank > 8 && (
                        <LadderRow
                          row={{ id: userId, username, elo: standing.elo, wins: standing.wins, losses: standing.losses }}
                          place={standing.rank} me separated />
                      )}
                    </ol>
                  )}
            </div>
          </div>
        </section>

        {/* ── Rounds in progress. Hidden when there are none — a permanently
             empty "live" shelf makes a mode look abandoned. ──────────────── */}
        {liveRapid.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-brand-red opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-red" />
              </span>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">Rounds in progress</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {liveRapid.slice(0, 3).map(m => (
                <Link key={m.roomName} href={`/room/${m.roomName}${m.participantIds.includes(userId) ? "" : "?spectate=1"}`}
                  className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                    </span>
                    <span className="font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Live</span>
                    <span className="ml-auto tabular-nums">{m.viewers} watching</span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">&ldquo;{m.topic}&rdquo;</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {m.sideA[0]?.username} vs {m.sideB[0]?.username}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Where else to go ────────────────────────────────────────────── */}
        <section className="grid gap-3 sm:grid-cols-2">
          <SideDoor href="/compete" Icon={Trophy} title="Battle Grounds"
            blurb="Slower, rated, and you pick your opponent. Same judging, higher stakes." />
          <SideDoor href="/watch" Icon={Radio} title="Watch a debate"
            blurb="Follow a live round and see how the bar moves before you queue." />
        </section>

      </div>
    </div>
  );
}

// ── Standing ───────────────────────────────────────────────────────────────
function StandingCard({ standing, played, rounds }: { standing: Standing | null; played: number; rounds: Round[] | null }) {
  const winPct = played > 0 ? Math.round(((standing?.wins ?? 0) / played) * 100) : 0;
  // Oldest-to-newest left to right, so the run reads like a timeline.
  const form = (rounds ?? []).slice(0, 5).reverse();
  const last = rounds?.[0];

  return (
    <aside className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 shadow-card dark:border-gray-800 dark:bg-gray-950/50">
      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Your rapid rating</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-4xl font-bold tabular-nums text-gray-900 dark:text-white">
          {standing ? standing.elo : "—"}
        </span>
        {last && last.eloDelta !== 0 && (
          <span className={`text-sm font-semibold tabular-nums ${last.eloDelta > 0
            ? "text-brand-green-ink dark:text-brand-green" : "text-brand-red-ink dark:text-brand-red"}`}>
            {last.eloDelta > 0 ? "+" : ""}{last.eloDelta}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {standing?.rank && standing.total
          ? <><span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">#{standing.rank}</span> of {standing.total} on the ladder</>
          : "Unranked — finish a round to join the ladder"}
      </p>

      <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
        {played > 0 ? (
          <>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                {standing!.wins}W · {standing!.losses}L
              </span>
              <span className="text-gray-500 dark:text-gray-400 tabular-nums">{winPct}% won</span>
            </div>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
              <div className="bg-brand-green transition-[width] duration-500" style={{ width: `${winPct}%` }} />
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">No rounds yet — your record starts with the first one.</p>
        )}

        {form.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Form</span>
            <span className="flex gap-1">
              {form.map(r => (
                // The -700 fills, not the brand greens: white on brand-green is
                // 2:1, which fails AA badly at this size.
                <span key={r.roomName}
                  title={`${r.drawn ? "Drew" : r.won ? "Beat" : "Lost to"} ${r.opponentName}`}
                  className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold text-white ${r.drawn
                    ? "bg-gray-500 dark:bg-gray-600" : r.won ? "bg-emerald-700" : "bg-rose-700"}`}>
                  {r.drawn ? "D" : r.won ? "W" : "L"}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── A finished round ───────────────────────────────────────────────────────
function RoundRow({ r }: { r: Round }) {
  const tone = r.drawn
    ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
    : r.won ? "bg-emerald-50 text-brand-green-ink dark:bg-emerald-950/40 dark:text-brand-green"
      : "bg-rose-50 text-brand-red-ink dark:bg-rose-950/40 dark:text-brand-red";
  return (
    <Link href={`/match/${encodeURIComponent(r.roomName)}/review`}
      className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold ${tone}`}>
        {r.drawn ? "D" : r.won ? "W" : "L"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-sm font-medium text-gray-900 dark:text-gray-100">&ldquo;{r.topic}&rdquo;</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="truncate">vs {r.opponentName}</span>
          {r.completedAt && <><span aria-hidden>·</span><span className="shrink-0">{ago(r.completedAt)}</span></>}
        </span>
      </span>
      {r.eloDelta !== 0 && (
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${r.eloDelta > 0
          ? "text-brand-green-ink dark:text-brand-green" : "text-brand-red-ink dark:text-brand-red"}`}>
          {r.eloDelta > 0 ? "+" : ""}{r.eloDelta}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" aria-hidden />
      <span className="sr-only">Review the tape</span>
    </Link>
  );
}

// ── Ladder ─────────────────────────────────────────────────────────────────
function LadderRow({ row, place, me, separated }: { row: BoardRow; place: number; me?: boolean; separated?: boolean }) {
  return (
    <li className={`${separated ? "border-t-4" : "border-t first:border-t-0"} border-gray-100 dark:border-gray-800 ${
      me ? "bg-orange-50 dark:bg-orange-950/25" : ""}`}>
      {/* The whole row is the target — a bare username link is a 20px tap. */}
      <Link href={`/u/${encodeURIComponent(row.username)}`}
        className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
        <span className={`w-6 shrink-0 text-center text-xs font-bold tabular-nums ${place <= 3
          ? "text-orange-700 dark:text-orange-400" : "text-gray-500 dark:text-gray-400"}`}>{place}</span>
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${
          me ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-300"}`}>
          {row.username}{me && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">you</span>}
        </span>
        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{row.wins}–{row.losses}</span>
        <span className="w-12 shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{row.elo}</span>
      </Link>
    </li>
  );
}

// ── Small parts ────────────────────────────────────────────────────────────
function Stake({ children, title, tone }: { children: React.ReactNode; title: string; tone: "rose" | "gray" }) {
  return (
    <span title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
      <span className={`h-1.5 w-1.5 rounded-full ${tone === "rose" ? "bg-rose-500" : "bg-gray-400"}`} aria-hidden />
      {children}
    </span>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card dark:border-gray-800 dark:bg-gray-900">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-100 text-xs font-bold text-orange-800 dark:bg-orange-950/50 dark:text-orange-300">{n}</span>
      <p className="mt-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{children}</p>
    </li>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-5 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
      {children}
    </div>
  );
}

function SideDoor({ href, Icon, title, blurb }: {
  href: string; Icon: LucideIcon; title: string; blurb: string;
}) {
  return (
    <Link href={href}
      className="group flex items-center gap-3.5 rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
        <span className="block text-xs text-gray-500 dark:text-gray-400">{blurb}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" aria-hidden />
    </Link>
  );
}
