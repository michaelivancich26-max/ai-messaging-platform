"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ProBadge } from "@/components/ProBadge";
import { ArrowLeft, Crown, Users, Play } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Entrant { userId: string; username: string; isPro: boolean; seed: number | null }
interface Match {
  round: number; slot: number;
  playerA: string | null; playerB: string | null;
  playerAName: string | null; playerBName: string | null;
  roomName: string | null; winnerId: string | null; status: string;
}
interface Detail {
  id: string; name: string; claim: string; size: number; status: string;
  hostId: string; hostName: string; championId: string | null; championName: string | null;
  rounds: number; entrants: Entrant[]; matches: Match[];
}

const ROUND_NAME = (round: number, rounds: number) =>
  round === rounds ? "Final" : round === rounds - 1 ? "Semi-finals" : round === 1 ? "Round 1" : `Round ${round}`;

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const myId: string = (session?.user as any)?.id ?? "";

  const [t, setT] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api(`${SERVER}/api/tournaments/${encodeURIComponent(String(id))}`)
      .then(async r => { if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? "Couldn't load that."); return null; } return r.json(); })
      .then(d => { if (d) setT(d); })
      .catch(() => setErr("Couldn't load that."));
  }, [id]);

  useEffect(() => { if (authStatus === "authenticated") load(); }, [authStatus, load]);

  // A bracket moves while you're watching it — someone else's match ends and the
  // next one opens. Poll while it's live rather than leaving a stale board up.
  useEffect(() => {
    if (t?.status !== "running") return;
    const h = setInterval(load, 10000);
    return () => clearInterval(h);
  }, [t?.status, load]);

  async function act(path: string, method = "POST") {
    setBusy(true); setErr("");
    try {
      const r = await api(`${SERVER}/api/tournaments/${encodeURIComponent(String(id))}${path}`, { method });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error ?? "That didn't work.");
      load();
    } finally { setBusy(false); }
  }

  if (authStatus === "loading" || (!t && !err)) {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  const shell = (children: React.ReactNode) => (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:py-8">
        <Link href="/tournaments" className="-my-2 inline-flex min-h-11 items-center gap-1.5 py-2 text-xs font-semibold text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Tournaments
        </Link>
        {children}
      </div>
    </div>
  );

  if (!t) return shell(<p className="py-16 text-center text-sm text-gray-600 dark:text-gray-400">{err}</p>);

  const joined = t.entrants.some(e => e.userId === myId);
  const isHost = t.hostId === myId;
  const full = t.entrants.length >= t.size;
  const byRound = Array.from({ length: t.rounds }, (_, i) =>
    t.matches.filter(m => m.round === i + 1).sort((a, b) => a.slot - b.slot));

  return shell(
    <>
      <header className="rounded-3xl border border-gray-200 bg-white bg-hero-glow p-5 shadow-hero dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{t.name}</h1>
          <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {t.size}-player · {t.status}
          </span>
        </div>
        <p className="mt-2 text-sm font-medium leading-snug text-gray-800 dark:text-gray-200">&ldquo;{t.claim}&rdquo;</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Hosted by {t.hostName} · <span className="font-medium">unranked</span> — no ELO moves in this bracket.
        </p>

        {t.championName && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <Crown className="h-4 w-4" aria-hidden /> {t.championName} takes it
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {t.status === "open" && !joined && (
            <button onClick={() => act("/join")} disabled={busy || full}
              className="inline-flex min-h-11 items-center rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-amber-500 disabled:opacity-40">
              {full ? "Bracket full" : "Enter"}
            </button>
          )}
          {t.status === "open" && joined && !isHost && (
            <button onClick={() => act("/leave")} disabled={busy}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50">
              Withdraw
            </button>
          )}
          {t.status === "open" && isHost && (
            <>
              <button onClick={() => act("/start")} disabled={busy || !full}
                title={full ? undefined : `Needs all ${t.size} players`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-amber-500 disabled:opacity-40">
                <Play className="h-4 w-4" aria-hidden /> Start the bracket
              </button>
              <button onClick={() => act("", "DELETE")} disabled={busy}
                className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-gray-500 transition-colors hover:text-rose-700 dark:text-gray-400 dark:hover:text-rose-400">
                Cancel
              </button>
            </>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Users className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums">{t.entrants.length}/{t.size}</span> entered
          </span>
        </div>
        {err && <p role="alert" className="mt-3 text-xs font-medium text-rose-700 dark:text-rose-400">{err}</p>}
      </header>

      {t.status === "open" ? (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Entrants</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {t.entrants.map(e => (
              <li key={e.userId} className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-card dark:border-gray-800 dark:bg-gray-900">
                {/* The name is the tap target, so it fills the row rather than
                    being a 20px line of text inside it. */}
                <Link href={`/u/${encodeURIComponent(e.username)}`}
                  className="-my-2 flex min-h-11 min-w-0 items-center py-2 font-medium text-gray-900 transition-colors hover:text-amber-700 dark:text-gray-100 dark:hover:text-amber-400">
                  <span className="truncate">{e.username}</span>
                </Link>
                {e.isPro && <ProBadge inline />}
                {e.userId === t.hostId && <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">host</span>}
              </li>
            ))}
            {Array.from({ length: Math.max(0, t.size - t.entrants.length) }, (_, i) => (
              <li key={`empty-${i}`} className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                Open seat
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Bracket</h2>
          <div className="space-y-5">
            {byRound.map((ms, i) => (
              <div key={i}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{ROUND_NAME(i + 1, t.rounds)}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ms.map(m => <Fixture key={`${m.round}-${m.slot}`} m={m} myId={myId} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Fixture({ m, myId }: { m: Match; myId: string }) {
  const mine = m.playerA === myId || m.playerB === myId;
  const side = (id: string | null, name: string | null) => {
    if (!id) return <span className="text-gray-400 dark:text-gray-600">To be decided</span>;
    const won = m.winnerId === id;
    const lost = !!m.winnerId && !won;
    return (
      <span className={won ? "font-semibold text-gray-900 dark:text-white"
        : lost ? "text-gray-400 line-through dark:text-gray-600"
          : "text-gray-700 dark:text-gray-300"}>
        {name ?? "Debater"}{id === myId && <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">you</span>}
      </span>
    );
  };

  const body = (
    <div className={`rounded-xl border p-3 text-sm shadow-card transition-colors ${mine
      ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/25"
      : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}>
      <div className="flex items-center justify-between gap-2">
        {side(m.playerA, m.playerAName)}
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-600">vs</span>
        {side(m.playerB, m.playerBName)}
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        {m.status === "complete" ? "Decided"
          : m.roomName ? (mine ? "Your match is open — go argue it" : "In progress")
            : "Waiting on the round before"}
      </p>
    </div>
  );

  return m.roomName
    ? <Link href={`/room/${m.roomName}${mine ? "" : "?spectate=1"}`} className="block transition-transform hover:-translate-y-0.5">{body}</Link>
    : body;
}
