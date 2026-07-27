"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Shield, Flag, EyeOff, Eye } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

interface AdminBot {
  id: string; name: string; persona: string; tier: number;
  isPublic: boolean; hidden: boolean; uses: number; createdAt: string;
  authorName: string | null; reports: number; reasons: string[] | null;
}

// Admin-only: the review queue for community personas. Reported first.
// The server route is admin-gated too — this page is just the front end.
export default function AdminBotsPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const isAdmin: boolean = (session?.user as any)?.isAdmin ?? false;

  const [bots, setBots] = useState<AdminBot[]>([]);
  const [autoHideAt, setAutoHideAt] = useState(3);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api(`${SERVER}/api/admin/custom-bots`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (r.ok) { setBots(d.bots ?? []); setAutoHideAt(d.autoHideAt ?? 3); }
        else setErr(d.error ?? "Couldn't load the queue.");
      })
      .catch(() => setErr("Network error."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, [isAdmin, load]);

  async function setHidden(bot: AdminBot, hidden: boolean) {
    setBusyId(bot.id);
    try {
      const res = await api(`${SERVER}/api/admin/custom-bots/${bot.id}/hide`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      if (res.ok) load();
    } finally { setBusyId(null); }
  }

  if (status === "loading" || loading) {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-gray-50 px-4 text-center dark:bg-gray-950">
        <p className="font-display text-lg font-bold text-gray-900 dark:text-white">Admins only</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">This page is for administrators.</p>
      </div>
    );
  }

  const reported = bots.filter(b => b.reports > 0);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-10">
        <header className="mb-5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-orange-800 dark:text-orange-300">
            <Shield className="h-3.5 w-3.5" /> Admin
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Community opponents</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Personas shared to the library. Reported ones sort to the top, and anything reaching{" "}
            <span className="font-semibold">{autoHideAt} reports</span> is hidden automatically pending review.
          </p>
        </header>

        {err && <p className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-red-600 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:text-red-400">{err}</p>}

        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            { label: "Shared", value: bots.filter(b => b.isPublic && !b.hidden).length },
            { label: "Reported", value: reported.length },
            { label: "Hidden", value: bots.filter(b => b.hidden).length },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card dark:border-gray-800 dark:bg-gray-900">
              <p className="font-display text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{s.value}</p>
              <p className="mt-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300">{s.label}</p>
            </div>
          ))}
        </div>

        {bots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Nothing to review</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">No personas have been shared or reported yet.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {bots.map(bot => (
              <li key={bot.id} className={`rounded-2xl border bg-white p-5 shadow-card dark:bg-gray-900 ${
                bot.reports > 0 ? "border-amber-300 dark:border-amber-800/60" : "border-gray-200 dark:border-gray-800"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{bot.name}</h2>
                      {bot.hidden && (
                        <span className="rounded-full bg-red-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-red-800 dark:bg-red-950/50 dark:text-red-300">Hidden</span>
                      )}
                      {bot.reports > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                          <Flag className="h-2.5 w-2.5" />{bot.reports}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                      by {bot.authorName ?? "unknown"} · {bot.uses} {bot.uses === 1 ? "match" : "matches"}
                    </p>
                  </div>
                  <button onClick={() => setHidden(bot, !bot.hidden)} disabled={busyId === bot.id}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
                      bot.hidden
                        ? "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        : "bg-red-700 text-white hover:bg-red-600"}`}>
                    {bot.hidden ? <><Eye className="h-3.5 w-3.5" /> Restore</> : <><EyeOff className="h-3.5 w-3.5" /> Hide</>}
                  </button>
                </div>

                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                  {bot.persona}
                </p>

                {bot.reasons && bot.reasons.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Reasons given</p>
                    <ul className="mt-1 space-y-1">
                      {bot.reasons.map((r, i) => (
                        <li key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {bot.hidden && (
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                    Restoring also clears its reports, so the threshold doesn&rsquo;t immediately re-hide it.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
