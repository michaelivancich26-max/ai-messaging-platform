"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface Row {
  id: string; text: string; categoryId: string;
  status: string; source: string; positions: number; agrees: number;
}

// Below this many positions the split is noise, not a signal.
const SPLIT_MIN = 8;

// A claim the room agrees on can't pair anyone, so it's dead weight however
// well written it is. Flagged rather than auto-retired — a lopsided split can
// also mean the claim is badly worded rather than uncontested, and that's a
// judgement call.
function split(r: Row): { label: string; lopsided: boolean } | null {
  if (r.positions < SPLIT_MIN) return null;
  const pct = Math.round((r.agrees / r.positions) * 100);
  return { label: `${pct}% agree`, lopsided: pct >= 85 || pct <= 15 };
}

const TABS = [
  { status: "draft", label: "Awaiting review" },
  { status: "live", label: "Live" },
  { status: "retired", label: "Retired" },
];

// Per-tab empty-state copy so a clear queue reads intentionally, not broken.
const EMPTY: Record<string, { title: string; hint: string }> = {
  draft: { title: "Queue is clear", hint: "No drafts awaiting review. Generate more with the command above, then approve them here." },
  live: { title: "Nothing live yet", hint: "Approved propositions land here — these are the only claims that reach the deck." },
  retired: { title: "Nothing retired", hint: "Propositions you retire will collect here. You can restore them at any time." },
};

// Review queue for generated claims. Nothing reaches the deck without passing
// through here — the generator writes drafts and stops.
export default function AdminPropositionsPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const userId: string = (session?.user as any)?.id ?? "";

  const [tab, setTab] = useState("draft");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await api(`${SERVER}/api/admin/propositions?userId=${encodeURIComponent(userId)}&status=${tab}`);
      if (r.status === 403) { setDenied(true); setRows([]); return; }
      setRows(await r.json());
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [userId, tab]);

  useEffect(() => { load(); }, [load]);

  async function move(id: string, status: string) {
    setRows(prev => prev.filter(r => r.id !== id));   // it leaves this tab either way
    await api(`${SERVER}/api/admin/propositions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, status }),
    }).catch(() => load());
  }

  if (authStatus === "loading") {
    return (
      <div className="h-full overflow-y-auto bg-gray-50 px-4 py-8 dark:bg-gray-950">
        <div className="mx-auto max-w-3xl">
          <div className="shimmer-track h-8 w-44 rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="shimmer-track mt-3 h-4 w-full max-w-md rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-6 flex gap-6 border-b border-gray-200 pb-3 dark:border-gray-800">
            {[0, 1, 2].map(i => <div key={i} className="shimmer-track h-4 w-24 rounded bg-gray-200 dark:bg-gray-800" />)}
          </div>
          <div className="mt-4 space-y-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="shimmer-track h-[76px] rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
        <div className="flex max-w-sm flex-col items-center text-center animate-fadeIn">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 dark:bg-gray-800">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-gray-400 dark:text-gray-500">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="mt-4 font-display text-lg font-bold text-gray-900 dark:text-white">Admins only</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">You don&apos;t have access to the propositions review queue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl">
        <header className="animate-fadeInUp">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">Admin</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:text-3xl">Propositions</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Generate with <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">npm run props:generate</code>,
            then approve here. Only live claims reach the deck.
          </p>
        </header>

        {/* Status tabs — brand-green marks the active queue */}
        <div className="mt-6 flex shrink-0 gap-6 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
          {TABS.map(t => {
            const active = tab === t.status;
            return (
              <button key={t.status} onClick={() => setTab(t.status)}
                className={`shrink-0 whitespace-nowrap border-b-2 pb-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border-brand-green text-brand-green-ink dark:text-brand-green"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}>
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-2">
          {loading && (
            <div className="space-y-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="shimmer-track h-[76px] rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900" />
              ))}
            </div>
          )}

          {!loading && !rows.length && (
            <div className="flex flex-col items-center justify-center py-16 text-center animate-fadeIn">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 text-gray-400 dark:text-gray-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
                </svg>
              </div>
              <p className="mt-4 font-display text-base font-bold text-gray-900 dark:text-white">{(EMPTY[tab] ?? EMPTY.draft).title}</p>
              <p className="mt-1 max-w-xs text-sm text-gray-600 dark:text-gray-400">{(EMPTY[tab] ?? EMPTY.draft).hint}</p>
            </div>
          )}

          {!loading && rows.map((r, i) => (
            <div key={r.id}
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition-all hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900 animate-fadeInUp">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">{r.text}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  <span className="font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">{r.categoryId}</span>
                  {" · "}{r.source}
                  {r.positions > 0 && <> · {r.positions} {r.positions === 1 ? "position" : "positions"}</>}
                  {(() => {
                    const s = split(r);
                    if (!s) return null;
                    return (
                      <span className={s.lopsided ? "font-bold text-red-700 dark:text-red-400" : ""}>
                        {" "}· {s.label}{s.lopsided && " — nobody argues this"}
                      </span>
                    );
                  })()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {r.status !== "live" && (
                  <button onClick={() => move(r.id, "live")}
                    className="rounded-xl bg-orange-700 px-3.5 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.98] motion-reduce:active:scale-100">
                    Approve
                  </button>
                )}
                {r.status !== "retired" && (
                  <button onClick={() => move(r.id, "retired")}
                    className="rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500 active:scale-[0.98] motion-reduce:active:scale-100">
                    Retire
                  </button>
                )}
                {r.status === "retired" && (
                  <button onClick={() => move(r.id, "draft")}
                    className="rounded-xl border border-gray-300 px-3.5 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.98] motion-reduce:active:scale-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50">
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
