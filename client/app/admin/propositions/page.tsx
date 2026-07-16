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
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  if (denied) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-sm text-gray-600 dark:text-gray-400">Admins only.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Propositions</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Generate with <code className="rounded bg-gray-200 px-1 py-0.5 text-xs dark:bg-gray-800">npm run props:generate</code>,
          then approve here. Only live claims reach the deck.
        </p>

        <div className="mt-6 flex gap-2">
          {TABS.map(t => (
            <button key={t.status} onClick={() => setTab(t.status)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === t.status
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "border border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-400"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {loading && <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
          {!loading && !rows.length && (
            <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">Nothing here.</p>
          )}
          {rows.map(r => (
            <div key={r.id}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{r.text}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {r.categoryId} · {r.source}
                  {r.positions > 0 && <> · {r.positions} {r.positions === 1 ? "position" : "positions"}</>}
                  {(() => {
                    const s = split(r);
                    if (!s) return null;
                    return (
                      <span className={s.lopsided ? "font-bold text-amber-700 dark:text-amber-400" : ""}>
                        {" "}· {s.label}{s.lopsided && " — nobody argues this"}
                      </span>
                    );
                  })()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {r.status !== "live" && (
                  <button onClick={() => move(r.id, "live")}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500">
                    Approve
                  </button>
                )}
                {r.status !== "retired" && (
                  <button onClick={() => move(r.id, "retired")}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-400 dark:border-gray-700 dark:text-gray-400">
                    Retire
                  </button>
                )}
                {r.status === "retired" && (
                  <button onClick={() => move(r.id, "draft")}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-400 dark:border-gray-700 dark:text-gray-400">
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
