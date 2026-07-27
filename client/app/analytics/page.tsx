"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "@/lib/api";
import { usePro } from "@/lib/usePro";
import { BarChart3, Sparkles, TrendingUp, Swords, Bot } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Point { at: string; elo: number; delta: number }
interface Ladder { current: number; points: Point[]; startedAt?: string | null }
interface Week { week: string; n: number; score: number; accuracy: number; relevance: number; evidence: number; logic: number; impact: number }
interface Format { format: string; label: string; played: number; wins: number; losses: number; winRate: number | null }
interface Category { categoryId: string; label: string; played: number; wins: number; winRate: number | null; fromRapid: number; fromArena: number }
interface H2H { opponentId: string | null; opponentName: string; played: number; wins: number; losses: number; lastPlayedAt: string }
interface BotRow { botId: string; name: string | null; played: number; wins: number; losses: number; ranked: number }
interface Analytics {
  minRateN: number;
  ratings: { battle: Ladder; rapid: Ladder; arena: Ladder };
  rubric: { lifetime: any; weeks: Week[]; weeksWithData: number; ratedTotal: number };
  formats: Format[];
  byCategory: Category[];
  uncategorised: { played: number };
  headToHead: H2H[];
  bots: BotRow[];
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Stat({ value, label, hint }: { value: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card dark:border-gray-800 dark:bg-gray-900">
      <p className="font-display text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

// A rating curve. Deliberately unlabelled on the x-axis: the points are matches,
// not evenly spaced time, and pretending otherwise would misread as a time series.
function TrendLine({ points, stroke, label }: { points: number[]; stroke: string; label: string }) {
  if (points.length < 2) return null;
  const W = 600, H = 90, PAD = 6;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="h-20 w-full">
      <path d={area} fill={stroke} opacity="0.10" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Ladder({ name, ladder, stroke, note }: { name: string; ladder: Ladder; stroke: string; note?: string }) {
  const pts = ladder.points.map(p => p.elo);
  const change = pts.length >= 2 ? pts[pts.length - 1] - pts[0] : 0;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{name}</span>
        <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {ladder.current}
          {pts.length >= 2 && (
            <span className={`ml-1.5 text-xs font-semibold ${change >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {change >= 0 ? "+" : ""}{change}
            </span>
          )}
        </span>
      </div>
      {pts.length >= 2 ? (
        <div className="mt-2"><TrendLine points={pts} stroke={stroke} label={`${name} rating over ${pts.length} matches`} /></div>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          {note ?? `Play a couple of ${name} matches and the curve fills in.`}
        </p>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { status: authStatus } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const { isPro, loading: proLoading } = usePro();

  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (authStatus !== "authenticated" || proLoading || !isPro) { if (!proLoading) setLoading(false); return; }
    let alive = true;
    setLoading(true);
    api(`${SERVER}/api/analytics/me`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok) setData(d as Analytics); else setErr(d.error ?? "Couldn't load your analytics.");
      })
      .catch(() => { if (alive) setErr("Network error. Try again."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [authStatus, isPro, proLoading]);

  const played = useMemo(
    () => (data?.formats ?? []).reduce((s, f) => s + f.played, 0), [data]);

  const shell = (children: React.ReactNode) => (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:py-10">{children}</div>
    </div>
  );

  const header = (
    <header className="text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-orange-800 ring-1 ring-orange-500/30 dark:text-orange-300">
        <BarChart3 className="h-3.5 w-3.5" /> Analytics
      </span>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-white md:text-4xl">How you&rsquo;re arguing</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        Your rubric over time, where you win, and who you&rsquo;ve played. The numbers
        themselves stay free on your profile &mdash; this is the shape behind them.
      </p>
    </header>
  );

  if (proLoading || (loading && isPro)) {
    return shell(<p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Loading your analytics&hellip;</p>);
  }

  if (!isPro) {
    return shell(
      <>
        {header}
        <button onClick={() => router.push("/pro")}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-amber-900/50 dark:from-amber-950/25 dark:to-orange-950/25">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-orange-800 dark:text-amber-300"><Sparkles className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Advanced analytics is a Pro feature</span>
              <span className="rounded-full bg-orange-600/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-orange-800 dark:text-orange-300">Pro</span>
            </span>
            <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">
              Rubric trends over time, win rate by format and topic, head-to-head records, and your rating curves.
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-orange-800 dark:text-amber-300">Upgrade&nbsp;&rarr;</span>
        </button>
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          Your ratings, Grounds Score and record stay free on{" "}
          <Link href="/dashboard" className="font-semibold text-brand-green-ink hover:underline dark:text-brand-green">your profile</Link>.
        </p>
      </>,
    );
  }

  if (err) {
    return shell(<>{header}<p className="rounded-2xl border border-gray-200 bg-white p-5 text-center text-sm text-red-600 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:text-red-400">{err}</p></>);
  }
  if (!data) return shell(<>{header}</>);

  const rated = data.rubric.ratedTotal;
  const showTrend = rated >= 12 && data.rubric.weeksWithData >= 3;

  if (played === 0 && rated === 0) {
    return shell(
      <>
        {header}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-card dark:border-gray-800 dark:bg-gray-900">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Nothing to chart yet.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Debate a few rounds and this fills in — rubric trends need a dozen scored claims before a line means anything.
          </p>
          <Link href="/rapid" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-orange-700 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600">
            Find a debate
          </Link>
        </div>
      </>,
    );
  }

  return shell(
    <>
      {header}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={played} label="Matches" hint="all formats" />
        <Stat value={rated} label="Scored claims" hint="the rubric sample" />
        <Stat value={data.byCategory.length} label="Topics" hint="with a record" />
        <Stat value={data.headToHead.length} label="Opponents" hint="in Battle Grounds" />
      </div>

      {/* Rating curves */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Rating over time</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Ladder name="Battle Grounds" ladder={data.ratings.battle} stroke="#8b5cf6" />
          <Ladder name="Rapid Fire" ladder={data.ratings.rapid} stroke="#0ea5e9" />
          <Ladder name="Training Grounds" ladder={data.ratings.arena} stroke="#f59e0b"
            note={data.ratings.arena.startedAt
              ? "Only one ranked match recorded so far — the curve needs two."
              : "We only started recording your Training Grounds rating recently, so this fills in from your next ranked match."} />
        </div>
      </section>

      {/* Rubric over time */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"><TrendingUp className="h-4 w-4" /></span>
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Argument quality over time</h2>
        </div>
        {showTrend ? (
          <>
            <div className="mt-3">
              <TrendLine points={data.rubric.weeks.map(w => w.score)} stroke="#10b981"
                label={`Average claim score across ${data.rubric.weeksWithData} weeks`} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
              <span>{shortDate(data.rubric.weeks[0].week)}</span>
              <span>Average claim score, by week</span>
              <span>{shortDate(data.rubric.weeks[data.rubric.weeks.length - 1].week)}</span>
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {rated} scored {rated === 1 ? "claim" : "claims"} so far. A trend line needs at least
            12 across 3 different weeks — below that it reads as noise, so we don&rsquo;t draw one.
          </p>
        )}
      </section>

      {/* Win rate by format */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"><Swords className="h-4 w-4" /></span>
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Where you win</h2>
        </div>
        <ul className="mt-4 space-y-3">
          {data.formats.filter(f => f.played > 0).map(f => (
            <li key={f.format}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{f.label}</span>
                <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                  {f.wins}W · {f.losses}L{f.winRate != null && <> · <span className="font-semibold text-gray-900 dark:text-gray-100">{f.winRate}%</span></>}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-full rounded-full bg-brand-green transition-[width]"
                  style={{ width: `${f.winRate ?? (f.played ? (f.wins / f.played) * 100 : 0)}%` }} />
              </div>
              {f.winRate == null && (
                <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                  Under {data.minRateN} matches — too few for a win rate.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* By topic */}
      {data.byCategory.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">By topic</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Rapid rounds and ranked Training Grounds matches — the only two that carry a claim.
          </p>
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
            {data.byCategory.map(c => (
              <li key={c.categoryId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-gray-800 dark:text-gray-200">{c.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {c.wins}/{c.played}
                  {c.winRate != null && <span className="ml-1.5 font-semibold text-gray-900 dark:text-gray-100">{c.winRate}%</span>}
                </span>
              </li>
            ))}
          </ul>
          {data.uncategorised.played > 0 && (
            <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
              {data.uncategorised.played} more {data.uncategorised.played === 1 ? "match has" : "matches have"} no topic
              attached — Battle Grounds, team and practice matches aren&rsquo;t tied to a claim.
            </p>
          )}
        </section>
      )}

      {/* Head to head */}
      {data.headToHead.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Head to head</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Battle Grounds only, most played first.</p>
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
            {data.headToHead.map((h, i) => (
              <li key={h.opponentId ?? `gone-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate text-sm text-gray-800 dark:text-gray-200">
                  {h.opponentId
                    ? <Link href={`/u/${h.opponentName}`} className="hover:underline">{h.opponentName}</Link>
                    : <span className="italic text-gray-500 dark:text-gray-400">{h.opponentName}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">{h.wins}W</span>
                  <span aria-hidden className="text-gray-500 dark:text-gray-400"> · </span>
                  <span className="font-semibold text-red-700 dark:text-red-400">{h.losses}L</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Per bot */}
      {data.bots.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"><Bot className="h-4 w-4" /></span>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Against each opponent</h2>
          </div>
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
            {data.bots.map(b => (
              <li key={b.botId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate text-sm capitalize text-gray-800 dark:text-gray-200">{b.name ?? b.botId}</span>
                <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {b.wins}W · {b.losses}L{b.ranked > 0 && <> · {b.ranked} ranked</>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="pb-2 text-center text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
        Two things this can&rsquo;t see: Training Grounds transcripts are pruned after five
        matches, so older practice claims are gone from the rubric sample, and a claim shows
        its current verdict rather than the one it had at the time. Leaderboard position over
        time isn&rsquo;t shown at all &mdash; rank is computed live against everyone else, so a
        past rank can&rsquo;t be reconstructed honestly.
      </p>
    </>,
  );
}
