"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ProBadge } from "@/components/ProBadge";
import { ArrowLeft, Crown, Users, Play, Lock, Shuffle, Check } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Entrant { userId: string; username: string; isPro: boolean; seed: number | null }
interface Match {
  round: number; slot: number;
  playerA: string | null; playerB: string | null;
  playerAName: string | null; playerBName: string | null;
  roomName: string | null; winnerId: string | null; status: string;
  stanceA: "affirmative" | "negative";
}
interface Detail {
  id: string; name: string; claim: string; size: number; status: string;
  hostId: string; hostName: string; isPrivate: boolean;
  championId: string | null; championName: string | null;
  rounds: number; entrants: Entrant[]; matches: Match[];
}

const ROUND_NAME = (round: number, rounds: number) =>
  round === rounds ? "Final" : round === rounds - 1 ? "Semi-finals" : `Round ${round}`;

// Bouts are numbered straight through the bracket, so a later fixture can name
// the ones that feed it: "Winner of Bout 1 vs Winner of Bout 2".
function boutNumbers(matches: Match[], rounds: number) {
  const n = new Map<string, number>();
  let i = 1;
  for (let r = 1; r <= rounds; r++) {
    for (const m of matches.filter(m => m.round === r).sort((a, b) => a.slot - b.slot)) {
      n.set(`${m.round}:${m.slot}`, i++);
    }
  }
  return n;
}

const SIDE = (s: "affirmative" | "negative") => s === "affirmative" ? "FOR" : "AGAINST";
const sideClass = (s: "affirmative" | "negative") =>
  s === "affirmative"
    ? "bg-emerald-50 text-brand-green-ink dark:bg-emerald-950/40 dark:text-brand-green"
    : "bg-rose-50 text-brand-red-ink dark:bg-rose-950/40 dark:text-brand-red";

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const myId: string = (session?.user as any)?.id ?? "";

  const [t, setT] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [editing, setEditing] = useState(false);

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

  async function act(path: string, method = "POST", body?: any) {
    setBusy(true); setErr("");
    try {
      const r = await api(`${SERVER}/api/tournaments/${encodeURIComponent(String(id))}${path}`, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error ?? "That didn't work.");
      load();
      return r.ok;
    } finally { setBusy(false); }
  }

  const bouts = useMemo(() => t ? boutNumbers(t.matches, t.rounds) : new Map<string, number>(), [t]);

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
          {t.isPrivate && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <Lock className="h-3 w-3" aria-hidden /> Private
            </span>
          )}
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
            <>
              {t.isPrivate && (
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Password" aria-label="Tournament password"
                  className="h-11 w-40 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-amber-400 dark:border-gray-700 dark:bg-gray-950/50 dark:text-gray-100 dark:placeholder:text-gray-400" />
              )}
              <button onClick={() => act("/join", "POST", t.isPrivate ? { password } : undefined)} disabled={busy || full}
                className="inline-flex min-h-11 items-center rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-amber-500 disabled:opacity-40">
                {full ? "Bracket full" : "Enter"}
              </button>
            </>
          )}
          {t.status === "open" && joined && !isHost && (
            <button onClick={() => act("/leave")} disabled={busy}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50">
              Withdraw
            </button>
          )}
          {t.status === "open" && isHost && (
            <>
              <button onClick={() => setEditing(v => !v)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50">
                <Shuffle className="h-4 w-4" aria-hidden /> {editing ? "Done" : "Draw the bracket"}
              </button>
              <button onClick={() => act("/start")} disabled={busy || !full}
                title={full ? undefined : `Needs all ${t.size} players`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-amber-500 disabled:opacity-40">
                <Play className="h-4 w-4" aria-hidden /> Start
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

      {editing && isHost && t.status === "open" && (
        <DrawEditor t={t} bouts={bouts} busy={busy}
          onSave={async (pairings, stances) => { if (await act("/bracket", "POST", { pairings, stances })) setEditing(false); }} />
      )}

      {/* The bracket is shown from the moment the tournament exists — empty seats
          and all — because the draw and the sides are what someone is deciding
          whether to enter. */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Bracket</h2>
        <div className="space-y-5">
          {byRound.map((ms, i) => (
            <div key={i}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{ROUND_NAME(i + 1, t.rounds)}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {ms.map(m => <Fixture key={`${m.round}-${m.slot}`} m={m} myId={myId} bouts={bouts} claim={t.claim} />)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Entrants <span className="tabular-nums">({t.entrants.length}/{t.size})</span>
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {t.entrants.map(e => (
            <li key={e.userId} className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-card dark:border-gray-800 dark:bg-gray-900">
              <Link href={`/u/${encodeURIComponent(e.username)}`}
                className="-my-2 flex min-h-11 min-w-0 items-center py-2 font-medium text-gray-900 transition-colors hover:text-amber-700 dark:text-gray-100 dark:hover:text-amber-400">
                <span className="truncate">{e.username}</span>
              </Link>
              {e.isPro && <ProBadge inline />}
              {e.userId === t.hostId && <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">host</span>}
            </li>
          ))}
          {Array.from({ length: Math.max(0, t.size - t.entrants.length) }, (_, i) => (
            <li key={`empty-${i}`} className="flex min-h-11 items-center rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Open seat
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// One fixture. Before it has players it still says what it IS — which bouts feed
// it, and which side each seat argues.
function Fixture({ m, myId, bouts, claim }: { m: Match; myId: string; bouts: Map<string, number>; claim: string }) {
  const mine = m.playerA === myId || m.playerB === myId;
  const bout = bouts.get(`${m.round}:${m.slot}`);
  const feedA = bouts.get(`${m.round - 1}:${m.slot * 2}`);
  const feedB = bouts.get(`${m.round - 1}:${m.slot * 2 + 1}`);
  const stanceB = m.stanceA === "affirmative" ? "negative" : "affirmative";

  const seat = (id: string | null, name: string | null, feed: number | undefined, stance: "affirmative" | "negative") => {
    const won = !!m.winnerId && m.winnerId === id;
    const lost = !!m.winnerId && !!id && !won;
    return (
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${won ? "font-semibold text-gray-900 dark:text-white"
          : lost ? "text-gray-400 line-through dark:text-gray-600"
            : id ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-400"}`}>
          {name ?? (feed ? `Winner of Bout ${feed}` : "Open seat")}
          {id === myId && <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">you</span>}
        </p>
        <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${sideClass(stance)}`}>{SIDE(stance)}</span>
      </div>
    );
  };

  const body = (
    <div className={`rounded-xl border p-3 shadow-card transition-colors ${mine
      ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/25"
      : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Bout {bout}</p>
      <div className="flex items-start gap-2">
        {seat(m.playerA, m.playerAName, feedA, m.stanceA)}
        {/* The app's secondary token, not its inverse — text-gray-400 on light
            measures 2.35:1 and is the mistake this codebase keeps making. */}
        <span className="shrink-0 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">vs</span>
        {seat(m.playerB, m.playerBName, feedB, stanceB)}
      </div>
      <p className="mt-1.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
        {m.status === "complete" ? "Decided"
          : m.roomName ? (mine ? "Your match is open — go argue it" : "In progress")
            : m.playerA && m.playerB ? "Ready when the bracket starts"
              : `On "${claim.slice(0, 40)}${claim.length > 40 ? "…" : ""}"`}
      </p>
    </div>
  );

  return m.roomName
    ? <Link href={`/room/${m.roomName}${mine ? "" : "?spectate=1"}`} className="block transition-transform hover:-translate-y-0.5">{body}</Link>
    : body;
}

// The host's draw: who meets whom in the opening round, and which side every
// seat in the bracket argues.
function DrawEditor({ t, bouts, busy, onSave }: {
  t: Detail; bouts: Map<string, number>; busy: boolean;
  onSave: (pairings: { a: string | null; b: string | null; stanceA: string }[], stances: Record<string, string>) => void;
}) {
  const opening = t.matches.filter(m => m.round === 1).sort((a, b) => a.slot - b.slot);
  const [pairs, setPairs] = useState(() => opening.map(m => ({ a: m.playerA, b: m.playerB, stanceA: m.stanceA as string })));
  const [later, setLater] = useState<Record<string, string>>(() =>
    Object.fromEntries(t.matches.filter(m => m.round > 1).map(m => [`${m.round}:${m.slot}`, m.stanceA])));

  // Somebody can only be in one bout, so picking them here takes them out of
  // every other dropdown.
  const takenBy = (slot: number, side: "a" | "b") => {
    const used = new Set<string>();
    pairs.forEach((p, i) => {
      if (!(i === slot && side === "a") && p.a) used.add(p.a);
      if (!(i === slot && side === "b") && p.b) used.add(p.b);
    });
    return used;
  };

  const set = (i: number, side: "a" | "b", val: string) =>
    setPairs(ps => ps.map((p, j) => j === i ? { ...p, [side]: val || null } : p));

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
      <h2 className="font-display text-base font-bold text-gray-900 dark:text-gray-100">Draw the bracket</h2>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
        Set who meets whom and which side each seat argues. Anything you leave open is filled at random when you start.
      </p>

      <div className="mt-4 space-y-3">
        {pairs.map((p, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Bout {bouts.get(`1:${i}`)}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["a", "b"] as const).map(side => {
                const stance = side === "a" ? p.stanceA : (p.stanceA === "affirmative" ? "negative" : "affirmative");
                const taken = takenBy(i, side);
                return (
                  <div key={side}>
                    <select value={(side === "a" ? p.a : p.b) ?? ""} onChange={e => set(i, side, e.target.value)}
                      aria-label={`Bout ${bouts.get(`1:${i}`)} ${side === "a" ? "first" : "second"} seat`}
                      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950/50 dark:text-gray-100">
                      <option value="">— open seat —</option>
                      {t.entrants.filter(e => !taken.has(e.userId)).map(e => (
                        <option key={e.userId} value={e.userId}>{e.username}</option>
                      ))}
                    </select>
                    <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${sideClass(stance as any)}`}>
                      {SIDE(stance as any)}
                    </span>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setPairs(ps => ps.map((q, j) => j === i
              ? { ...q, stanceA: q.stanceA === "affirmative" ? "negative" : "affirmative" } : q))}
              className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-amber-700 transition-colors hover:text-amber-600 dark:text-amber-400">
              Swap sides
            </button>
          </div>
        ))}
      </div>

      {t.rounds > 1 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Later rounds</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {t.matches.filter(m => m.round > 1).sort((a, b) => a.round - b.round || a.slot - b.slot).map(m => {
              const key = `${m.round}:${m.slot}`;
              const st = later[key] ?? m.stanceA;
              return (
                <button key={key}
                  onClick={() => setLater(l => ({ ...l, [key]: st === "affirmative" ? "negative" : "affirmative" }))}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-left text-xs dark:border-gray-800 dark:bg-gray-900">
                  <span className="font-semibold text-gray-700 dark:text-gray-200">Bout {bouts.get(key)}</span>
                  <span className="text-gray-500 dark:text-gray-400">first seat argues</span>
                  <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold ${sideClass(st as any)}`}>{SIDE(st as any)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={() => onSave(pairs, later)} disabled={busy}
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-amber-500 disabled:opacity-40">
        <Check className="h-4 w-4" aria-hidden /> Save the draw
      </button>
    </section>
  );
}
