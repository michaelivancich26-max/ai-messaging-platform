"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "@/lib/api";
import { usePro } from "@/lib/usePro";
import { Layers, Sparkles, ArrowRight, Anchor, RefreshCw } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Totals {
  positions: number; skipped: number; categories: number;
  flips: number; shifts: number; firstPositionAt: string | null; gate: number;
}
interface Aftermath { answered: number; moved: number; held: number; flipped: number }
interface CategoryRow {
  categoryId: string; label: string; positions: number; agrees: number;
  disagrees: number; strong: number; moved: number; lean: number;
}
interface Claim {
  propositionId: string; text: string; categoryId: string; label: string;
  stance: string; confidence: number | null; axis: number | null;
  changes: number; createdAt: string; updatedAt: string;
}
interface Shift {
  id: string; propositionId: string; text: string; categoryId: string; label: string;
  fromStance: string; toStance: string; fromConfidence: number | null;
  toConfidence: number | null; flipped: boolean; inDebate: boolean; createdAt: string;
}
interface BeliefMap {
  totals: Totals; aftermath: Aftermath;
  byCategory: CategoryRow[]; claims: Claim[]; timeline: Shift[];
}

// "agree"/2 → "Strongly agree". The stored pair is a side plus how firmly it's
// held, never a signed number, so the wording is rebuilt rather than derived.
function stanceLabel(stance: string, confidence: number | null): string {
  const side = stance === "agree" ? "Agree" : "Disagree";
  return confidence === 2 ? `Strongly ${side.toLowerCase()}` : side;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Stat({ value, label, hint }: { value: number | string; label: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card dark:border-gray-800 dark:bg-gray-900">
      <p className="font-display text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

// A diverging bar: disagree runs left of centre, agree right. `lean` is the mean
// of the -2..+2 axis for that category, so the length reads as "how far, how firmly".
function LeanBar({ lean }: { lean: number }) {
  const pct = Math.min(Math.abs(lean) / 2, 1) * 50;
  const side = lean === 0 ? "even" : lean > 0 ? "agree" : "disagree";
  return (
    <div
      role="img"
      aria-label={`Average position ${lean > 0 ? "agree" : lean < 0 ? "disagree" : "even"}, ${Math.abs(lean).toFixed(1)} of 2`}
      className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-300 dark:bg-gray-600" />
      {side !== "even" && (
        <span
          className={`absolute inset-y-0 rounded-full ${side === "agree" ? "bg-brand-green" : "bg-brand-red"}`}
          style={side === "agree" ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
        />
      )}
    </div>
  );
}

export default function BeliefsPage() {
  const router = useRouter();
  const { status: authStatus } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const { isPro, loading: proLoading } = usePro();

  const [map, setMap] = useState<BeliefMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (authStatus !== "authenticated" || proLoading || !isPro) { if (!proLoading) setLoading(false); return; }
    let alive = true;
    setLoading(true);
    api(`${SERVER}/api/beliefs/map`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok) setMap(data as BeliefMap);
        else setErr(data.error ?? "Couldn't load your belief map.");
      })
      .catch(() => { if (alive) setErr("Network error. Try again."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [authStatus, isPro, proLoading]);

  const claims = useMemo(
    () => (map?.claims ?? []).filter((c) => filter === "all" || c.categoryId === filter),
    [map, filter],
  );

  const shell = (children: React.ReactNode) => (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:py-10">{children}</div>
    </div>
  );

  const header = (
    <header className="text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-orange-700 ring-1 ring-orange-500/30 dark:text-orange-300">
        <Layers className="h-3.5 w-3.5" /> Belief Map
      </span>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-white md:text-4xl">Where you stand</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        Every position you&rsquo;ve taken, and every time one of them moved. Changing
        your mind on the evidence is the point &mdash; this is the record of it.
      </p>
    </header>
  );

  if (proLoading || (loading && isPro)) {
    return shell(<p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Loading your belief map&hellip;</p>);
  }

  // Non-Pro: upsell rather than an empty shell.
  if (!isPro) {
    return shell(
      <>
        {header}
        <button
          onClick={() => router.push("/pro")}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-amber-900/50 dark:from-amber-950/25 dark:to-orange-950/25"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-orange-700 dark:text-amber-300"><Sparkles className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">The Belief Map is a Pro feature</span>
              <span className="rounded-full bg-orange-600/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">Pro</span>
            </span>
            <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">
              See your positions across every topic, which ones a debate has moved, and where you tend to hold firm.
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-orange-700 dark:text-amber-300">Upgrade&nbsp;&rarr;</span>
        </button>
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          Your positions are still being recorded either way &mdash; keep going in{" "}
          <Link href="/deck" className="font-semibold text-brand-green-ink underline-offset-2 hover:underline dark:text-brand-green">the deck</Link>.
        </p>
      </>,
    );
  }

  if (err) {
    return shell(<>{header}<p className="rounded-2xl border border-gray-200 bg-white p-5 text-center text-sm text-red-600 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:text-red-400">{err}</p></>);
  }

  const t = map?.totals;
  const after = map?.aftermath;

  // Nothing to map yet — send them to the deck rather than showing five zeroes.
  if (!t || t.positions === 0) {
    return shell(
      <>
        {header}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-card dark:border-gray-800 dark:bg-gray-900">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">You haven&rsquo;t taken a side yet.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Swipe through some claims and the map fills in as you go.
          </p>
          <Link href="/deck" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-green-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-green-ink/90">
            Open the deck <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </>,
    );
  }

  const heldPct = after && after.answered > 0 ? Math.round((after.held / after.answered) * 100) : 0;

  return shell(
    <>
      {header}

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={t.positions} label="Positions" hint={`across ${t.categories} ${t.categories === 1 ? "topic" : "topics"}`} />
        <Stat value={t.shifts} label="Times moved" hint="recorded changes" />
        <Stat value={t.flips} label="Full flips" hint="side actually switched" />
        <Stat value={t.firstPositionAt ? shortDate(t.firstPositionAt) : "—"} label="Mapping since" />
      </div>

      {t.positions < t.gate && (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-center text-xs text-gray-600 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          {t.gate - t.positions} more {t.gate - t.positions === 1 ? "position" : "positions"} and Rapid can start matching you.{" "}
          <Link href="/deck" className="font-semibold text-brand-green-ink hover:underline dark:text-brand-green">Open the deck</Link>
        </p>
      )}

      {/* Held vs moved — only meaningful once a debate has actually asked. */}
      {after && after.answered > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"><Anchor className="h-4 w-4" /></span>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">After a debate</h2>
            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{after.answered} {after.answered === 1 ? "round" : "rounds"}</span>
          </div>
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <span className="bg-gray-400 dark:bg-gray-500" style={{ width: `${heldPct}%` }} />
            <span className="bg-brand-green" style={{ width: `${100 - heldPct}%` }} />
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            You held your position <span className="font-semibold text-gray-900 dark:text-gray-100">{after.held}</span>{" "}
            {after.held === 1 ? "time" : "times"} and moved{" "}
            <span className="font-semibold text-brand-green-ink dark:text-brand-green">{after.moved}</span>.{" "}
            {after.moved === 0
              ? "Holding firm is fine — most debates sharpen a view rather than flip it."
              : "Moving on the evidence counts for you, not against you."}
          </p>
        </section>
      )}

      {/* Where you lean, by topic */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">By topic</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">How far each topic leans, and how firmly.</p>
        <ul className="mt-4 space-y-3.5">
          {map!.byCategory.map((c) => (
            <li key={c.categoryId}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.label}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                  {c.agrees} agree · {c.disagrees} disagree{c.moved > 0 && ` · ${c.moved} moved`}
                </span>
              </div>
              <div className="mt-1.5"><LeanBar lean={c.lean} /></div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <span>Disagree</span><span>Agree</span>
        </div>
      </section>

      {/* The log of every recorded move */}
      {map!.timeline.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><RefreshCw className="h-4 w-4" /></span>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">What moved</h2>
          </div>
          <ul className="mt-3 space-y-3">
            {map!.timeline.map((s) => (
              <li key={s.id} className="border-l-2 border-gray-200 pl-3 dark:border-gray-700">
                <p className="text-sm leading-snug text-gray-900 dark:text-gray-100">&ldquo;{s.text}&rdquo;</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="line-through decoration-gray-400">{stanceLabel(s.fromStance, s.fromConfidence)}</span>
                  <span aria-hidden>&rarr;</span>
                  <span className={`font-semibold ${s.toStance === "agree" ? "text-brand-green-ink dark:text-brand-green" : "text-brand-red-ink dark:text-brand-red"}`}>
                    {stanceLabel(s.toStance, s.toConfidence)}
                  </span>
                  {s.flipped && <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Flip</span>}
                  {s.inDebate && <span className="rounded-full bg-gray-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-400">In a debate</span>}
                  <span>· {s.label} · {shortDate(s.createdAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Every current position */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Your positions</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[{ categoryId: "all", label: "All", positions: t.positions }, ...map!.byCategory].map((c) => (
            <button
              key={c.categoryId}
              onClick={() => setFilter(c.categoryId)}
              aria-pressed={filter === c.categoryId}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${filter === c.categoryId
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}
            >
              {c.label} <span className="tabular-nums opacity-70">{c.positions}</span>
            </button>
          ))}
        </div>
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {claims.map((c) => (
            <li key={c.propositionId} className="flex items-start gap-3 py-2.5">
              <span className="min-w-0 flex-1 text-sm leading-snug text-gray-800 dark:text-gray-200">{c.text}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                {c.changes > 0 && (
                  <span title={`Moved ${c.changes} ${c.changes === 1 ? "time" : "times"}`} className="text-[10px] font-bold tabular-nums text-gray-500 dark:text-gray-400">
                    &#8635;{c.changes}
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c.stance === "agree"
                  ? "bg-brand-green/15 text-brand-green-ink dark:text-brand-green"
                  : "bg-brand-red/15 text-brand-red-ink dark:text-brand-red"}`}>
                  {stanceLabel(c.stance, c.confidence)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {claims.length === 0 && <p className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">Nothing in that topic yet.</p>}
      </section>

      <p className="pb-2 text-center text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
        Only recorded changes appear here &mdash; your first answer on a claim, skips, and
        corrections in the deck aren&rsquo;t counted as moves.
      </p>
    </>,
  );
}
