"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { usePro } from "@/lib/usePro";
import ClaimPicker, { type PickedClaim } from "@/components/ClaimPicker";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Trophy, Users, Sparkles, ChevronRight, Crown } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Row {
  id: string; name: string; claim: string; size: number; status: string;
  hostId: string; hostName: string; entrants: number;
  championId: string | null; championName: string | null;
}

const SIZES = [4, 8] as const;

export default function TournamentsPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const myId: string = (session?.user as any)?.id ?? "";
  const { isPro } = usePro();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api(`${SERVER}/api/tournaments`).then(r => (r.ok ? r.json() : []))
      .then(d => setRows(Array.isArray(d) ? d : [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  const open = (rows ?? []).filter(r => r.status === "open");
  const running = (rows ?? []).filter(r => r.status === "running");
  const done = (rows ?? []).filter(r => r.status === "complete");

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 md:py-8">
        <header>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            <Trophy className="h-4 w-4" aria-hidden /> Tournaments
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:text-3xl">
            One claim. One bracket. One left standing.
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            Everyone argues the same claim, single elimination, judged the same way as a ranked match.
            {" "}<span className="font-medium text-gray-700 dark:text-gray-300">Bracket matches move no rating</span> — what&rsquo;s
            on the line is the title, not your ELO.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          {isPro ? (
            <button onClick={() => setCreating(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-amber-600 px-5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-amber-500">
              <Trophy className="h-4 w-4" aria-hidden /> Host a tournament
            </button>
          ) : (
            <Link href="/pro"
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-200">
              <Sparkles className="h-4 w-4" aria-hidden /> Hosting is a Pro feature
            </Link>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">Entering is free for anyone through the Battle Grounds gate.</p>
        </div>

        <Section title="Open for entries" empty="Nothing taking entries right now.">
          {open.map(t => <Card key={t.id} t={t} myId={myId} />)}
        </Section>

        {running.length > 0 && (
          <Section title="In progress" empty="">
            {running.map(t => <Card key={t.id} t={t} myId={myId} />)}
          </Section>
        )}

        {done.length > 0 && (
          <Section title="Champions" empty="">
            {done.map(t => <Card key={t.id} t={t} myId={myId} />)}
          </Section>
        )}
      </div>

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={id => { setCreating(false); load(); router.push(`/tournaments/${id}`); }} />}
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  const any = items.filter(Boolean).length > 0;
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h2>
      {any ? <div className="grid gap-3 sm:grid-cols-2">{children}</div>
        : empty ? <p className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-5 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">{empty}</p> : null}
    </section>
  );
}

function Card({ t, myId }: { t: Row; myId: string }) {
  const full = t.entrants >= t.size;
  return (
    <Link href={`/tournaments/${t.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{t.name}</span>
        {t.hostId === myId && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">yours</span>}
        <span className="ml-auto shrink-0 rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {t.size}-player
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-gray-700 dark:text-gray-300">&ldquo;{t.claim}&rdquo;</p>
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {t.status === "complete" && t.championName ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
            <Crown className="h-3.5 w-3.5" aria-hidden /> {t.championName}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" aria-hidden />
            <span className="tabular-nums">{t.entrants}/{t.size}</span>
            {t.status === "open" && full && <span className="font-semibold text-brand-green-ink dark:text-brand-green">ready</span>}
            {t.status === "running" && <span className="font-semibold text-red-600 dark:text-red-400">live</span>}
          </span>
        )}
        <span className="ml-auto truncate">hosted by {t.hostName}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" aria-hidden />
      </div>
    </Link>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<PickedClaim | null>(null);
  const [size, setSize] = useState<number>(4);
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!picked || !name.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await api(`${SERVER}/api/tournaments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), size,
          ...(picked.propositionId ? { propositionId: picked.propositionId } : { claim: picked.text }),
          winCondition: { type: "exchanges", limit },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Couldn't create that tournament."); return; }
      onCreated(d.id);
    } catch {
      setError("Couldn't create that tournament.");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm animate-fadeIn sm:items-center" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="new-tournament"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-elevated animate-fadeInUp dark:border-gray-800 dark:bg-gray-900"
        onClick={e => e.stopPropagation()}>
        <h2 id="new-tournament" className="mb-4 font-display text-lg font-bold tracking-tight text-gray-900 dark:text-white">Host a tournament</h2>

        <label htmlFor="trn-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</label>
        <input id="trn-name" value={name} onChange={e => setName(e.target.value)} maxLength={80}
          placeholder="Friday night bracket"
          className="mb-4 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-amber-400 dark:border-gray-700 dark:bg-gray-950/50 dark:text-gray-100 dark:placeholder:text-gray-400" />

        <ClaimPicker value={picked} onChange={setPicked} />

        <label className="mb-1.5 mt-4 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Bracket size</label>
        <div className="flex gap-2">
          {SIZES.map(s => (
            <button key={s} onClick={() => setSize(s)} aria-pressed={size === s}
              className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors ${size === s
                ? "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
                : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-400"}`}>
              {s} players
            </button>
          ))}
        </div>

        <label className="mb-1.5 mt-4 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Each match ends after</label>
        <div className="flex items-center gap-3">
          <input type="range" min={4} max={20} value={limit} onChange={e => setLimit(+e.target.value)}
            aria-label={`Exchanges: ${limit}`} className="h-11 flex-1 accent-amber-600" />
          <span className="w-24 text-right text-xs text-gray-700 dark:text-gray-300">{limit} exchanges</span>
        </div>

        <p className="mt-4 rounded-lg bg-gray-100 px-3 py-2 text-[11px] leading-relaxed text-gray-600 dark:bg-gray-800/60 dark:text-gray-400">
          Bracket matches are judged like any ranked debate but move <span className="font-semibold">no ELO</span>, on any ladder.
          You&rsquo;re entered automatically; the bracket starts when all {size} seats are filled.
        </p>

        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !picked || !name.trim()}
            className="min-h-11 flex-1 rounded-xl bg-amber-600 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-amber-500 disabled:opacity-40">
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
