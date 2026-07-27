"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { usePro } from "@/lib/usePro";
import { Bot as BotIcon, Plus, Globe, Lock, Trash2, Pencil, Flag, Sparkles, Users } from "lucide-react";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

const NAME_MAX = 32;
const PERSONA_MAX = 600;
const PERSONA_MIN = 20;

export interface CustomBot {
  id: string; name: string; persona: string; tier: number;
  isPublic: boolean; hidden: boolean; uses: number; createdAt: string;
  authorName?: string; mine?: boolean;
}

const TIERS = [
  { tier: 1, label: "Novice" },
  { tier: 2, label: "Apprentice" },
  { tier: 3, label: "Debater" },
  { tier: 4, label: "Expert" },
  { tier: 5, label: "Grandmaster" },
];
const tierLabel = (t: number) => TIERS.find(x => x.tier === t)?.label ?? "Debater";

// ── Create / edit ────────────────────────────────────────────────────────────

function BotEditor({ existing, onClose, onSaved }: {
  existing?: CustomBot; onClose: () => void; onSaved: (b: CustomBot) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [persona, setPersona] = useState(existing?.persona ?? "");
  const [tier, setTier] = useState(existing?.tier ?? 3);
  const [isPublic, setIsPublic] = useState(existing?.isPublic ?? false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const tooShort = persona.trim().length < PERSONA_MIN;

  async function save() {
    if (saving) return;
    setSaving(true); setErr("");
    try {
      const res = await api(`${SERVER}/api/custom-bots${existing ? `/${existing.id}` : ""}`, {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, persona, tier, isPublic }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? "Couldn't save."); setSaving(false); return; }
      onSaved(data.bot as CustomBot);
      onClose();
    } catch { setErr("Network error. Try again."); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-5 shadow-hero dark:border-gray-800 dark:bg-gray-900 sm:rounded-2xl">
        <h3 className="font-display text-lg font-bold text-gray-900 dark:text-gray-100">
          {existing ? "Edit opponent" : "Create an opponent"}
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Describe how they argue — their style, their favourite moves, their blind spots.
        </p>

        <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</label>
        <input value={name} onChange={e => setName(e.target.value.slice(0, NAME_MAX))} maxLength={NAME_MAX}
          placeholder="The Pedant"
          className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />

        <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          How they argue
        </label>
        <textarea value={persona} onChange={e => setPersona(e.target.value.slice(0, PERSONA_MAX))} rows={5} maxLength={PERSONA_MAX}
          placeholder="Demands a precise definition of every term before engaging, never concedes a point without an explicit citation, and treats any generalisation as a fatal flaw."
          className="mt-1 w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none focus:border-orange-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className={tooShort ? "text-amber-700 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"}>
            {tooShort ? `At least ${PERSONA_MIN} characters` : " "}
          </span>
          <span className="tabular-nums text-gray-500 dark:text-gray-400">{persona.length}/{PERSONA_MAX}</span>
        </div>

        <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Difficulty</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {TIERS.map(t => (
            <button key={t.tier} onClick={() => setTier(t.tier)} aria-pressed={tier === t.tier}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${tier === t.tier
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          Sets how long and how considered their replies are. Matches against custom opponents are always unranked.
        </p>

        <button onClick={() => setIsPublic(v => !v)} role="switch" aria-checked={isPublic}
          className="mt-4 flex w-full items-start gap-3 rounded-xl border border-gray-200 p-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
          <span className={`mt-0.5 grid h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${isPublic ? "bg-brand-green" : "bg-gray-300 dark:bg-gray-600"}`}>
            <span className={`h-4 w-4 rounded-full bg-white transition-transform ${isPublic ? "translate-x-4" : ""}`} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">Share to the community library</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
              Anyone can find and debate this opponent, and your username is shown as the author.
              You can unshare at any time.
            </span>
          </span>
        </button>

        {err && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button onClick={save} disabled={saving || tooShort || name.trim().length < 2}
            className="flex-1 rounded-xl bg-orange-700 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-40">
            {saving ? "Saving…" : existing ? "Save changes" : "Create opponent"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── A single persona card ────────────────────────────────────────────────────

function BotRow({ bot, mine, onChallenge, onEdit, onDelete, onTogglePublic, onReport, busy }: {
  bot: CustomBot; mine: boolean; busy: boolean;
  onChallenge: () => void; onEdit?: () => void; onDelete?: () => void;
  onTogglePublic?: () => void; onReport?: () => void;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-card dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <BotIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{bot.name}</h4>
            <span className="rounded-full bg-gray-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {tierLabel(bot.tier)}
            </span>
            {mine && bot.isPublic && !bot.hidden && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                <Globe className="h-2.5 w-2.5" />Shared
              </span>
            )}
            {mine && bot.hidden && (
              <span className="rounded-full bg-red-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-red-800 dark:bg-red-950/50 dark:text-red-300">
                Removed from library
              </span>
            )}
          </div>
          {!mine && bot.authorName && (
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              by {bot.authorName}{bot.uses > 0 && <> · {bot.uses} {bot.uses === 1 ? "match" : "matches"}</>}
            </p>
          )}
          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{bot.persona}</p>
        </div>
      </div>

      {mine && bot.hidden && (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-relaxed text-red-800 dark:bg-red-950/30 dark:text-red-300">
          A moderator removed this from the library after it was reported. You can still practise against it yourself.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button onClick={onChallenge} disabled={busy}
          className="flex-1 rounded-xl bg-orange-700 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-40">
          {busy ? "Starting…" : "Challenge"}
        </button>
        {mine ? (
          <>
            <button onClick={onTogglePublic} title={bot.isPublic ? "Unshare" : "Share to library"} disabled={bot.hidden}
              className="rounded-xl border border-gray-300 p-2 text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              {bot.isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </button>
            <button onClick={onEdit} title="Edit"
              className="rounded-xl border border-gray-300 p-2 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} title="Delete"
              className="rounded-xl border border-gray-300 p-2 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-red-950/30 dark:hover:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button onClick={onReport} title="Report this opponent"
            className="rounded-xl border border-gray-300 p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-red-950/30 dark:hover:text-red-400">
            <Flag className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export default function CustomOpponents({ onChallenge }: { onChallenge: (botId: string) => Promise<string | null> }) {
  const router = useRouter();
  const { isPro, loading: proLoading } = usePro();
  const [mine, setMine] = useState<CustomBot[]>([]);
  const [library, setLibrary] = useState<CustomBot[]>([]);
  const [limit, setLimit] = useState(12);
  const [tab, setTab] = useState<"library" | "mine">("library");
  const [editing, setEditing] = useState<CustomBot | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The notice line carries both confirmations and failures, so the kind is
  // tracked explicitly. Sniffing the text for a prefix looked fine until a server
  // error ("Opponent not found.") rendered in the neutral style.
  const [notice, setNotice] = useState<{ text: string; kind: "info" | "error" } | null>(null);
  const say = (text: string, kind: "info" | "error" = "info") => setNotice({ text, kind });
  const clearNotice = () => setNotice(null);

  const load = useCallback(() => {
    api(`${SERVER}/api/custom-bots`).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setMine(d.bots ?? []); setLimit(d.limit ?? 12); } }).catch(() => {});
    api(`${SERVER}/api/custom-bots/library`).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setLibrary(d.bots ?? []); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // Every mutation reports failure. These used to be `if (res.ok) load()` with no
  // else, so a 403, a 409 or a dropped connection left the card exactly as it was
  // — indistinguishable from a button that isn't wired up.
  async function mutate(label: string, run: () => Promise<Response>) {
    clearNotice();
    try {
      const res = await run();
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        say(data.error ?? `Couldn't ${label}. Try again.`, "error");
        return false;
      }
      load();
      return true;
    } catch {
      say(`Couldn't ${label} — you may be offline.`, "error");
      return false;
    }
  }

  async function challenge(botId: string) {
    setBusyId(botId); clearNotice();
    try {
      const err = await onChallenge(botId);
      if (err) say(err, "error");
    } finally {
      // Always clear. Cancelling the match-setup modal resolves the same way a
      // successful start does, and only the error path used to reset this — so
      // backing out of the modal left the card stuck on "Starting…" forever.
      // On a real start the page navigates away, so clearing is harmless there.
      setBusyId(null);
    }
  }

  async function togglePublic(bot: CustomBot) {
    await mutate(bot.isPublic ? "unshare that opponent" : "share that opponent", () =>
      api(`${SERVER}/api/custom-bots/${bot.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !bot.isPublic }),
      }));
  }

  async function remove(bot: CustomBot) {
    if (!window.confirm(`Delete "${bot.name}"? This can't be undone.`)) return;
    await mutate("delete that opponent", () =>
      api(`${SERVER}/api/custom-bots/${bot.id}`, { method: "DELETE" }));
  }

  async function report(bot: CustomBot) {
    const reason = window.prompt(
      `Report "${bot.name}" to the moderators.\n\nWhat's wrong with it? (optional)`, "");
    if (reason === null) return;   // cancelled
    const res = await api(`${SERVER}/api/custom-bots/${bot.id}/report`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) { say(data.error ?? "Couldn't submit the report.", "error"); return; }
    say(data.autoHidden
      ? "Thanks — that opponent has been pulled from the library pending review."
      : "Thanks — a moderator will take a look.");
    load();
  }


  const atLimit = mine.length >= limit;
  const shown = tab === "mine" ? mine : library;

  return (
    <section className="mx-auto w-full max-w-5xl px-6 pb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Custom opponents</h2>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            Debate a persona someone described. Always unranked.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            {([["library", "Library"], ["mine", "Yours"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${tab === k
                  ? "bg-white text-orange-800 shadow-sm dark:bg-gray-900 dark:text-orange-300"
                  : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"}`}>
                {label}{k === "mine" && mine.length > 0 ? ` ${mine.length}` : ""}
              </button>
            ))}
          </div>
          <button
            // Wait for the entitlement before acting on it. The badge below already
            // waits for !proLoading; this handler did not, so during the in-flight
            // /api/billing/status a subscriber who clicked Create was bounced off
            // Training Grounds to the upsell page.
            onClick={() => { if (proLoading) return; isPro ? setCreating(true) : router.push("/pro"); }}
            disabled={proLoading || (isPro && atLimit)}
            title={isPro && atLimit ? `You can keep up to ${limit} opponents` : undefined}
            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-700 px-3 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" /> Create
            {!proLoading && !isPro && (
              <span className="rounded-full bg-white/20 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide">Pro</span>
            )}
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" aria-live="polite"
          className={`mb-3 rounded-xl border px-4 py-2.5 text-xs shadow-card ${notice.kind === "error"
            ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
            : "border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"}`}>
          {notice.text}
        </p>
      )}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
          <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {tab === "mine" ? <Sparkles className="h-5 w-5" /> : <Users className="h-5 w-5" />}
          </span>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {tab === "mine" ? "You haven't made an opponent yet" : "The library is empty"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {tab === "mine"
              ? "Describe how someone argues and the AI will play them — a specific colleague's style, a philosopher, or the debate you keep losing."
              : "Nobody has shared a persona yet. Create one and share it to get the library started."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(bot => (
            <BotRow key={bot.id} bot={bot} mine={tab === "mine" || !!bot.mine} busy={busyId === bot.id}
              onChallenge={() => challenge(bot.id)}
              onEdit={() => setEditing(bot)}
              onDelete={() => remove(bot)}
              onTogglePublic={() => togglePublic(bot)}
              onReport={() => report(bot)} />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <BotEditor existing={editing ?? undefined}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => load()} />
      )}
    </section>
  );
}
