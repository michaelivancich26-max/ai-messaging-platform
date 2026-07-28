"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "@/lib/api";
import MatchCoach from "@/components/MatchCoach";
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Side {
  userId: string; username: string; label: string; claims: number;
  score: number | null; relevance: number | null; evidence: number | null;
  logic: number | null; impact: number | null;
}
interface Claim {
  id: string; claimantId: string; claimantName: string; text: string; status: string;
  reasoning: string | null; relevance: number | null; evidence: number | null;
  logic: number | null; impact: number | null; score: number | null; createdAt: string;
}
interface Tape {
  match: {
    roomName: string; status: string; winnerId: string | null; verdict: string | null;
    completedAt: string | null; categoryLabel: string | null;
  };
  sideA: Side; sideB: Side;
  trajectory: { exchange: number; priceA: number }[];
  claims: Claim[];
  biggestSwing: { exchange: number; delta: number; from: number; to: number; claims: Claim[] } | null;
}

const DIMS = [
  { key: "relevance", label: "Relevance" },
  { key: "evidence", label: "Evidence" },
  { key: "logic", label: "Logic" },
  { key: "impact", label: "Impact" },
] as const;

const VERDICT_TONE: Record<string, string> = {
  SUPPORTED: "bg-emerald-500",
  CONTESTED: "bg-amber-500",
  REFUTED: "bg-rose-500",
};

// The bar's shape over the match. Side A above the midline, B below.
// Deliberately no y-axis ticks: the number is a model's scoring differential,
// not a measured quantity, and a precise-looking axis would oversell it.
function Trajectory({ points, swingAt }: { points: { exchange: number; priceA: number }[]; swingAt?: number }) {
  if (points.length < 2) return null;
  const W = 640, H = 150, PAD = 10;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (p: number) => PAD + (1 - p) * (H - PAD * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.priceA).toFixed(1)}`).join(" ");
  const swingIdx = swingAt != null ? points.findIndex(p => p.exchange === swingAt) : -1;
  const last = points[points.length - 1].priceA;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img"
      aria-label={`Persuasion bar across ${points.length} exchanges, ending at ${Math.round(last * 100)}% for the first side`}>
      <rect x={PAD} y={PAD} width={W - PAD * 2} height={(H - PAD * 2) / 2} className="fill-emerald-500/5" />
      <rect x={PAD} y={H / 2} width={W - PAD * 2} height={(H - PAD * 2) / 2} className="fill-rose-500/5" />
      <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} strokeDasharray="4 4" className="stroke-gray-300 dark:stroke-gray-700" strokeWidth="1" />
      <path d={line} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
        className="stroke-gray-800 dark:stroke-gray-200" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.priceA)} r={i === swingIdx ? 5 : 3}
          className={i === swingIdx ? "fill-orange-600" : "fill-gray-700 dark:fill-gray-300"} />
      ))}
    </svg>
  );
}

// A diverging row: whoever is ahead on this dimension gets the longer bar.
function DimRow({ label, a, b }: { label: string; a: number | null; b: number | null }) {
  const av = a ?? 0, bv = b ?? 0;
  const total = av + bv;
  const aPct = total > 0 ? (av / total) * 100 : 50;
  const lead = a == null || b == null ? null : a > b ? "a" : b > a ? "b" : "tie";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className={`tabular-nums ${lead === "a" ? "font-bold text-emerald-800 dark:text-emerald-300" : "text-gray-600 dark:text-gray-400"}`}>{a ?? "—"}</span>
        <span className="font-semibold text-gray-700 dark:text-gray-300">{label}</span>
        <span className={`tabular-nums ${lead === "b" ? "font-bold text-rose-800 dark:text-rose-300" : "text-gray-600 dark:text-gray-400"}`}>{b ?? "—"}</span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <span className="bg-emerald-500" style={{ width: `${aPct}%` }} />
        <span className="bg-rose-500" style={{ width: `${100 - aPct}%` }} />
      </div>
    </div>
  );
}

function ClaimCard({ c, mine }: { c: Claim; mine: boolean }) {
  return (
    <li className={`rounded-xl border p-3 ${mine
      ? "border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
      : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{c.claimantName}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${VERDICT_TONE[c.status] ?? "bg-gray-400"}`} aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-400">{c.status}</span>
          {c.score != null && <span className="text-[11px] font-bold tabular-nums text-gray-900 dark:text-gray-100">{Math.round(c.score)}</span>}
        </span>
      </div>
      <p className="mt-1 text-sm leading-snug text-gray-900 dark:text-gray-100">{c.text}</p>
      {c.reasoning && <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">{c.reasoning}</p>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
        {DIMS.map(d => <span key={d.key}>{d.label} {(c as any)[d.key] ?? "—"}</span>)}
      </div>
    </li>
  );
}

export default function MatchReviewPage() {
  const router = useRouter();
  const params = useParams<{ roomName: string }>();
  const roomName = params?.roomName ?? "";
  const { data: session, status: authStatus } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const me = (session?.user as any)?.id ?? "";

  const [tape, setTape] = useState<Tape | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    if (authStatus !== "authenticated" || !roomName) return;
    let alive = true;
    setLoading(true);
    api(`${SERVER}/api/match/${encodeURIComponent(roomName)}/tape`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok) setTape(d as Tape); else setErr(d.error ?? "Couldn't load the tape.");
      })
      .catch(() => { if (alive) setErr("Network error. Try again."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [authStatus, roomName]);

  const claims = useMemo(
    () => (tape?.claims ?? []).filter(c => !onlyMine || c.claimantId === me),
    [tape, onlyMine, me]);

  const shell = (children: React.ReactNode) => (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:py-8">
        <Link href="/compete" className="-my-2 inline-flex min-h-11 items-center gap-1.5 py-2 text-xs font-semibold text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Battle Grounds
        </Link>
        {children}
      </div>
    </div>
  );

  if (loading) return shell(<p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Loading the tape&hellip;</p>);
  if (err) return shell(
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-card dark:border-gray-800 dark:bg-gray-900">
      <p className="text-sm text-red-700 dark:text-red-400">{err}</p>
    </div>
  );
  if (!tape) return shell(null);

  const { match, sideA, sideB, trajectory, biggestSwing } = tape;
  const iWon = match.winnerId && match.winnerId === me;
  const voided = match.status === "void";
  const swingPts = biggestSwing ? Math.round(Math.abs(biggestSwing.delta) * 100) : 0;
  const SwingIcon = !biggestSwing ? Minus : biggestSwing.delta > 0 ? TrendingUp : TrendingDown;

  return shell(
    <>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          The tape{match.categoryLabel ? ` · ${match.categoryLabel}` : ""}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:text-3xl">
          {voided ? "No result" : iWon ? "You won" : match.winnerId ? "You lost" : "Match review"}
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {/* The app's secondary token. The inverted 400/600 pair reads at 2.4:1. */}
          {sideA.label} <span className="text-gray-500 dark:text-gray-400">vs</span> {sideB.label}
        </p>
        {match.verdict && <p className="mt-2 text-sm italic leading-relaxed text-gray-700 dark:text-gray-300">&ldquo;{match.verdict}&rdquo;</p>}
      </header>

      {/* How the bar moved */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">How it moved</h2>
        {trajectory.length >= 2 ? (
          <>
            <div className="mt-1 flex items-center justify-between text-[11px] font-semibold">
              <span className="text-emerald-800 dark:text-emerald-300">{sideA.label}</span>
              <span className="text-rose-800 dark:text-rose-300">{sideB.label}</span>
            </div>
            <Trajectory points={trajectory} swingAt={biggestSwing?.exchange} />
            {biggestSwing && (
              <div className="mt-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
                  <SwingIcon className="h-3.5 w-3.5 text-orange-700 dark:text-orange-400" aria-hidden />
                  Biggest swing · exchange {biggestSwing.exchange} · {biggestSwing.delta > 0 ? "+" : "−"}{swingPts} points to {biggestSwing.delta > 0 ? sideA.label : sideB.label}
                </p>
                {biggestSwing.claims?.length ? (
                  <ul className="mt-2 space-y-2">
                    {biggestSwing.claims.map(c => <ClaimCard key={c.id} c={c} mine={c.claimantId === me} />)}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">No scored claims landed in that exchange.</p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            No trajectory for this match. The bar only started being recorded exchange-by-exchange
            recently, so matches played before then kept just their final position.
          </p>
        )}
      </section>

      {/* The scorecard */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">The scorecard</h2>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">{sideA.claims + sideB.claims} rated claims</span>
        </div>
        <div className="mt-3 space-y-3">
          {DIMS.map(d => <DimRow key={d.key} label={d.label} a={(sideA as any)[d.key]} b={(sideB as any)[d.key]} />)}
        </div>
        {/* The honest caveat. Under exchanges and time the winner comes from a
            holistic read of the transcript, not from these averages — so the
            scorecard and the verdict genuinely can disagree, and saying so is
            better than letting the page look broken. */}
        <p className="mt-4 border-t border-gray-200 pt-3 text-[11px] leading-relaxed text-gray-500 dark:border-gray-800 dark:text-gray-400">
          These are the evaluator&rsquo;s per-claim scores, averaged. The bar tracks them.
          The verdict is a separate holistic reading of the whole transcript, so the two
          can disagree &mdash; when they do, the scorecard is the part you can act on.
        </p>
      </section>

      {/* Every claim */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Every claim, in order</h2>
          <button onClick={() => setOnlyMine(v => !v)} aria-pressed={onlyMine}
            className={`min-h-11 rounded-full px-3 text-[11px] font-semibold transition-colors ${onlyMine
              ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}>
            Only mine
          </button>
        </div>
        {claims.length === 0 ? (
          <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
            Nothing was scored in this match{onlyMine ? " by you" : ""}.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {claims.map(c => <ClaimCard key={c.id} c={c} mine={c.claimantId === me} />)}
          </ul>
        )}
      </section>

      <MatchCoach roomName={roomName} />
    </>
  );
}
