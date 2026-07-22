"use client";

import { useMemo, useState } from "react";
import { X } from "@/lib/icons";
import {
  Swords, Sword, Target, Trophy, Bot, Flame, Star, BadgeCheck, Zap, Drama,
  BarChart3, Pin, Handshake, MessageSquare, PenLine, Medal as MedalGlyph, type LucideIcon,
} from "lucide-react";

export type MedalTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface Medal {
  id: string;
  groupId: string;
  group: string;
  name: string;
  description: string;
  icon: string;
  tier: MedalTier;
  order: number;
  target: number;
  value: number;
  unit: string;
  earned: boolean;
  progress: number;
}

// Medal-group icons are stored as stable KEYS in services/medals.ts (they used to
// be emoji) and mapped to Lucide icons here.
const MEDAL_ICONS: Record<string, LucideIcon> = {
  swords: Swords, sword: Sword, target: Target, trophy: Trophy, bot: Bot,
  flame: Flame, star: Star, "badge-check": BadgeCheck, zap: Zap, drama: Drama,
  "bar-chart": BarChart3, pin: Pin, handshake: Handshake, message: MessageSquare,
  pen: PenLine, medal: MedalGlyph,
};

export function MedalIcon({ name, className }: { name: string; className?: string }) {
  const Ic = MEDAL_ICONS[name] ?? MedalGlyph;
  return <Ic className={className} aria-hidden />;
}

const TIER_RANK: Record<MedalTier, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5 };

const TIER_STYLE: Record<MedalTier, { text: string; bg: string; ring: string; bar: string; label: string }> = {
  bronze:   { text: "text-amber-700 dark:text-amber-300",  bg: "bg-amber-100 dark:bg-amber-950/50",  ring: "ring-amber-700/50",  bar: "bg-amber-500",  label: "Bronze"   },
  // silver and gold were written for the old dark-only theme and never given light
  // variants — slate-200 on white measured 1.2:1, i.e. invisible.
  silver:   { text: "text-slate-700 dark:text-slate-200",  bg: "bg-slate-200 dark:bg-slate-700/40",  ring: "ring-slate-400/40",  bar: "bg-slate-400 dark:bg-slate-300",  label: "Silver"   },
  gold:     { text: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-100 dark:bg-yellow-950/50", ring: "ring-yellow-600/50", bar: "bg-yellow-500 dark:bg-yellow-400", label: "Gold"     },
  platinum: { text: "text-cyan-800 dark:text-cyan-200",   bg: "bg-cyan-100 dark:bg-cyan-950/50",   ring: "ring-cyan-500/40",   bar: "bg-cyan-300",   label: "Platinum" },
  diamond:  { text: "text-indigo-800 dark:text-indigo-200", bg: "bg-indigo-100 dark:bg-indigo-950/60", ring: "ring-indigo-400/50", bar: "bg-indigo-300", label: "Diamond"  },
};

interface GroupView {
  groupId: string;
  group: string;
  icon: string;
  unit: string;
  tiers: Medal[];               // sorted by order
  earnedTiers: Medal[];
  highest: Medal | null;        // highest earned
  next: Medal | null;           // next locked tier
  value: number;
}

function buildGroups(medals: Medal[]): GroupView[] {
  const byGroup = new Map<string, Medal[]>();
  for (const m of medals) {
    if (!byGroup.has(m.groupId)) byGroup.set(m.groupId, []);
    byGroup.get(m.groupId)!.push(m);
  }
  const groups: GroupView[] = [];
  for (const [groupId, tiers] of byGroup) {
    tiers.sort((a, b) => a.order - b.order);
    const earnedTiers = tiers.filter(t => t.earned);
    const highest = earnedTiers.length ? earnedTiers[earnedTiers.length - 1] : null;
    const next = tiers.find(t => !t.earned) ?? null;
    groups.push({
      groupId, group: tiers[0].group, icon: tiers[0].icon, unit: tiers[0].unit,
      tiers, earnedTiers, highest, next, value: tiers[0].value,
    });
  }
  // Groups with earned medals first, then by closeness to the next medal
  groups.sort((a, b) => {
    if ((b.earnedTiers.length > 0 ? 1 : 0) !== (a.earnedTiers.length > 0 ? 1 : 0))
      return (b.earnedTiers.length > 0 ? 1 : 0) - (a.earnedTiers.length > 0 ? 1 : 0);
    if (b.earnedTiers.length !== a.earnedTiers.length) return b.earnedTiers.length - a.earnedTiers.length;
    return (b.next?.progress ?? 0) - (a.next?.progress ?? 0);
  });
  return groups;
}

function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString() : `${n}`;
}

export function MedalsPanel({ medals }: { medals: Medal[] }) {
  const groups = useMemo(() => buildGroups(medals), [medals]);
  const earned = useMemo(() => medals.filter(m => m.earned), [medals]);

  if (!medals.length) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Medals</p>
        <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
          {earned.length} <span className="text-gray-500 dark:text-gray-400">/ {medals.length}</span>
        </span>
      </div>

      {/* Earned showcase */}
      {earned.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {earned.map(m => {
            const s = TIER_STYLE[m.tier];
            return (
              <div
                key={m.id}
                title={`${m.name} — ${m.description}`}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${s.bg} ${s.text} ${s.ring}`}
              >
                <MedalIcon name={m.icon} className="h-3.5 w-3.5 shrink-0" />
                <span>{m.name}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-3 py-3 text-center text-xs text-gray-600 dark:text-gray-400">
          No medals yet — debate, stake claims, and win matches to start earning them.
        </p>
      )}

      {/* Progression ladders */}
      <div className="space-y-2.5 border-t border-gray-200 dark:border-gray-800 pt-4">
        {groups.map(g => {
          const s = g.highest ? TIER_STYLE[g.highest.tier] : null;
          const nextTarget = g.next?.target ?? g.highest?.target ?? 1;
          const pct = g.next ? Math.round(Math.min(1, g.value / nextTarget) * 100) : 100;
          return (
            <div key={g.groupId} className="flex items-center gap-3">
              {/* Medal disc */}
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
                s ? `${s.bg} ${s.ring} ${s.text}` : "bg-gray-100 dark:bg-gray-800 ring-gray-300/50 dark:ring-gray-700/50 text-gray-400 dark:text-gray-600 opacity-60"
              }`}>
                <MedalIcon name={g.icon} className="h-5 w-5" />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{g.group}</span>
                  {g.highest && <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${s!.text}`}>{TIER_STYLE[g.highest.tier].label}</span>}
                </div>
                {g.next ? (
                  <>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                        <div className={`h-full rounded-full ${TIER_STYLE[g.next.tier].bar} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                        {fmt(g.value)}/{fmt(nextTarget)}{g.unit === "%" ? "%" : ""}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">Next: {g.next.name} — {g.next.description}</p>
                  </>
                ) : (
                  <p className="mt-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Maxed out — all tiers earned</p>
                )}
              </div>

              {/* Tier pips */}
              <div className="flex shrink-0 items-center gap-1">
                {g.tiers.map(t => (
                  <span
                    key={t.id}
                    title={`${TIER_STYLE[t.tier].label}: ${t.description}`}
                    className={`h-2 w-2 rounded-full ${t.earned ? TIER_STYLE[t.tier].bar : "bg-gray-200 dark:bg-gray-700"}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Featured medal showcase (with owner editing) ──────────────────────────────

const MAX_FEATURED = 6;

function MedalCard({ medal }: { medal: Medal }) {
  const s = TIER_STYLE[medal.tier];
  return (
    <div
      title={`${medal.name} — ${medal.description}`}
      className={`flex min-w-[80px] flex-1 flex-col items-center gap-1 rounded-xl px-2.5 py-3 ring-1 ${s.bg} ${s.ring}`}
    >
      <MedalIcon name={medal.icon} className={`h-6 w-6 ${s.text}`} />
      <span className={`text-center text-[11px] font-semibold leading-tight ${s.text}`}>{medal.name}</span>
      <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{s.label}</span>
    </div>
  );
}

function MedalPicker({
  earned, initial, onClose, onSave,
}: {
  earned: Medal[]; initial: string[]; onClose: () => void; onSave: (ids: string[]) => void | Promise<void>;
}) {
  const [sel, setSel] = useState<string[]>(initial.filter(id => earned.some(m => m.id === id)).slice(0, MAX_FEATURED));
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSel(s => s.includes(id) ? s.filter(x => x !== id) : (s.length < MAX_FEATURED ? [...s, id] : s));
  }
  async function save() {
    setSaving(true);
    try { await onSave(sel); onClose(); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-gray-200 bg-white shadow-elevated dark:border-gray-800 dark:bg-gray-900 animate-fadeIn" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-5 py-4">
          <h2 className="flex-1 font-display text-sm font-bold text-gray-900 dark:text-white">Choose featured medals</h2>
          <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-400 tabular-nums">{sel.length}/{MAX_FEATURED}</span>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {earned.length === 0 ? (
            <p className="py-10 text-center text-xs text-gray-600 dark:text-gray-400">You haven't earned any medals yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {earned.map(m => {
                const s = TIER_STYLE[m.tier];
                const on = sel.includes(m.id);
                const atCap = !on && sel.length >= MAX_FEATURED;
                return (
                  <button
                    key={m.id}
                    onClick={() => toggle(m.id)}
                    disabled={atCap}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors disabled:opacity-40 ${
                      on ? `${s.bg} ${s.ring} ring-1 border-transparent` : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                    }`}
                  >
                    <MedalIcon name={m.icon} className={`h-5 w-5 shrink-0 ${on ? s.text : "text-gray-500 dark:text-gray-400"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[11px] font-semibold ${on ? s.text : "text-gray-700 dark:text-gray-300"}`}>{m.name}</span>
                      <span className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{s.label}</span>
                    </span>
                    {on && (
                      <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 shrink-0 ${s.text}`}>
                        <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-gray-200 dark:border-gray-800 px-5 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 rounded-xl bg-orange-700 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-40">
            {saving ? "Saving…" : "Save showcase"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MedalShowcase({
  medals, featuredIds, editable = false, onSave, emptyHint,
}: {
  medals: Medal[];
  featuredIds: string[];
  editable?: boolean;
  onSave?: (ids: string[]) => void | Promise<void>;
  emptyHint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const earned = useMemo(() => medals.filter(m => m.earned), [medals]);

  const displayed = useMemo(() => {
    const byId = new Map(medals.map(m => [m.id, m]));
    const chosen = featuredIds.map(id => byId.get(id)).filter((m): m is Medal => !!m && m.earned);
    if (chosen.length) return chosen;
    // Auto: highest earned tier per group, best tiers first
    const byGroup = new Map<string, Medal>();
    for (const m of earned) {
      const cur = byGroup.get(m.groupId);
      if (!cur || TIER_RANK[m.tier] > TIER_RANK[cur.tier]) byGroup.set(m.groupId, m);
    }
    return [...byGroup.values()].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]).slice(0, MAX_FEATURED);
  }, [featuredIds, medals, earned]);

  if (earned.length === 0 && !editable) {
    return emptyHint ? (
      <div className="rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 p-5">
        <p className="text-center text-xs text-gray-600 dark:text-gray-400">{emptyHint}</p>
      </div>
    ) : null;
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {featuredIds.length ? "Featured Medals" : "Top Medals"}
        </p>
        {editable && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs font-semibold text-orange-700 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Z" />
            </svg>
            Edit
          </button>
        )}
      </div>

      {displayed.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {displayed.map(m => <MedalCard key={m.id} medal={m} />)}
        </div>
      ) : (
        <p className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-3 py-3 text-center text-xs text-gray-600 dark:text-gray-400">
          {editable ? "No medals earned yet — earn some, then feature your favorites here." : (emptyHint ?? "No medals yet.")}
        </p>
      )}

      {editing && (
        <MedalPicker
          earned={earned}
          initial={featuredIds}
          onClose={() => setEditing(false)}
          onSave={(ids) => onSave?.(ids)}
        />
      )}
    </div>
  );
}

export interface ClaimAverages {
  score: number; accuracy: number; relevance: number; evidence: number; logic: number; impact: number; rated: number;
}

export function RubricAverages({ avg }: { avg: ClaimAverages }) {
  const dims: { label: string; value: number; color: string }[] = [
    { label: "Accuracy",  value: avg.accuracy,  color: "bg-emerald-500" },
    { label: "Relevance", value: avg.relevance, color: "bg-indigo-500"  },
    { label: "Evidence",  value: avg.evidence,  color: "bg-violet-500"  },
    { label: "Logic",     value: avg.logic,     color: "bg-sky-500"     },
    { label: "Impact",    value: avg.impact,    color: "bg-amber-500"   },
  ];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Rubric Averages</p>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {avg.rated > 0
            ? <>avg <span className="font-bold text-gray-800 dark:text-gray-200 tabular-nums">{avg.score}</span><span className="text-gray-500 dark:text-gray-400">/100</span> over {avg.rated} claim{avg.rated === 1 ? "" : "s"}</>
            : "No rated claims yet"}
        </span>
      </div>
      {avg.rated > 0 ? (
        <div className="space-y-2.5">
          {dims.map(d => (
            <div key={d.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-gray-600 dark:text-gray-400">{d.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className={`h-full rounded-full ${d.color} transition-all`} style={{ width: `${Math.min(100, (d.value / 10) * 100)}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-600 dark:text-gray-400">{d.value.toFixed(1)}<span className="text-gray-500 dark:text-gray-400">/10</span></span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-3 py-3 text-center text-xs text-gray-600 dark:text-gray-400">
          Stake claims in debates to build your category averages.
        </p>
      )}
    </div>
  );
}
