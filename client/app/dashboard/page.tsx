"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { CredScore } from "@/lib/types";
import { BOTS } from "@/lib/bots";
import { MedalsPanel, MedalShowcase, RubricAverages, type Medal, type ClaimAverages } from "@/components/MedalsPanel";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024;

interface Stats {
  debateCount: number;
  messageCount: number;
  arenaMatchCount: number;
  arenaWins: number;
  arenaLosses: number;
  arenaBonus: number;
  dailyStreak?: number;
  longestStreak?: number;
}

// ─── Grounds Score Panel ─────────────────────────────────────────────────────
// Unified credibility tier scale — shared visual language with the public
// profile summary and the UserProfileModal. Thresholds (80 / 50) are data.
function credTier(accuracy: number | null, rated: boolean) {
  if (!rated)                        return { label: "Unrated",  color: "text-gray-600 dark:text-gray-400",       bg: "bg-gray-100 dark:bg-gray-800",          ring: "ring-gray-300/60 dark:ring-gray-700/60" };
  if ((accuracy ?? 0) >= 80)         return { label: "Credible", color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-950/40", ring: "ring-emerald-600/40" };
  if ((accuracy ?? 0) >= 50)         return { label: "Mixed",    color: "text-amber-700 dark:text-amber-300",     bg: "bg-amber-100 dark:bg-amber-950/40",     ring: "ring-amber-600/40" };
  return                                    { label: "Disputed", color: "text-red-700 dark:text-red-400",         bg: "bg-red-100 dark:bg-red-950/40",         ring: "ring-red-600/40" };
}

function VeritasScorePanel({ cred, arenaBonus = 0 }: { cred: CredScore; arenaBonus?: number }) {
  const accuracy = cred.total > 0 ? Math.round((cred.supported / cred.total) * 100) : null;
  const baseScore = cred.total >= 3 ? cred.score : 0;
  const displayScore = baseScore + arenaBonus;
  const rated = !(cred.total < 3 && arenaBonus === 0);
  // Tier by accuracy exactly when the score is rated (>=3 claims, or an arena
  // bonus is in play); otherwise Unrated — matching the original gating.
  const tier = credTier(accuracy, rated);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Grounds Score</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tier.bg} ${tier.color} ${tier.ring}`}>{tier.label}</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="font-display text-4xl font-bold tabular-nums text-gray-900 dark:text-white">
          {!rated ? "—" : displayScore.toFixed(1)}
        </span>
        {cred.total >= 3 && accuracy !== null && <span className="mb-1 text-sm text-gray-500 dark:text-gray-400">{accuracy}% accuracy</span>}
        {arenaBonus !== 0 && (
          <span className={`mb-1 text-xs font-semibold ${arenaBonus > 0 ? "text-amber-700 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
            {arenaBonus > 0 ? "+" : ""}{arenaBonus.toFixed(1)} arena
          </span>
        )}
      </div>
      {cred.total < 3 && arenaBonus === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Make at least 3 verified claims to earn a score.</p>}
      {cred.total >= 1 && accuracy !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex">
          <div className="bg-emerald-500 transition-all" style={{ width: `${accuracy}%` }} />
          <div className="bg-red-500 transition-all" style={{ width: `${cred.total > 0 ? Math.round((cred.refuted / cred.total) * 100) : 0}%` }} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Pill color="emerald" label={`${cred.supported} supported`} />
        <Pill color="red" label={`${cred.refuted} refuted`} />
        <Pill color="gray" label={`${cred.contested} contested`} />
      </div>
    </div>
  );
}

function Pill({ color, label }: { color: "emerald" | "red" | "gray"; label: string }) {
  const cls = {
    emerald: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 ring-emerald-600/30",
    red:     "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-red-600/30",
    gray:    "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 ring-gray-300/40 dark:ring-gray-700/40",
  }[color];
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${color === "emerald" ? "bg-emerald-500" : color === "red" ? "bg-red-500" : "bg-gray-400 dark:bg-gray-500"}`} />
      {label}
    </span>
  );
}

function StatCard({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 p-4">
      <span className="font-display text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</span>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {sub && <span className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</span>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">{children}</p>;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? "";

  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [cred, setCred] = useState<CredScore | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [medals, setMedals] = useState<Medal[]>([]);
  const [featuredMedals, setFeaturedMedals] = useState<string[]>([]);
  const [claimAverages, setClaimAverages] = useState<ClaimAverages | null>(null);
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    api(`${SERVER}/api/users/${userId}/profile`)
      .then(r => r.json())
      .then(data => {
        setBio(data.bio ?? "");
        setAvatarUrl(data.avatarUrl ?? null);
        if (data.cred) setCred(data.cred);
        if (data.email) setEmail(data.email);
        if (data.emailVerified) setEmailVerified(data.emailVerified);
        if (data.createdAt) setCreatedAt(data.createdAt);
        if (data.stats) setStats(data.stats);
        if (Array.isArray(data.medals)) setMedals(data.medals);
        if (Array.isArray(data.featuredMedals)) setFeaturedMedals(data.featuredMedals);
        if (data.claimAverages) setClaimAverages(data.claimAverages);
      })
      .catch(() => {});
  }, [status, userId]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) { alert("Image too large — max 1.5 MB."); return; }
    const reader = new FileReader();
    reader.onload = ev => setAvatarUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    if (!userId) return;
    setSaving(true);
    try {
      await api(`${SERVER}/api/users/${userId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio, avatarUrl }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  async function saveFeatured(ids: string[]) {
    setFeaturedMedals(ids);
    if (!userId) return;
    await api(`${SERVER}/api/users/${userId}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featuredMedals: ids }),
    }).catch(() => {});
  }

  async function saveEmail() {
    setEmailMsg(null); setEmailSaving(true);
    try {
      const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: newEmail }) });
      const data = await res.json();
      if (!res.ok) { setEmailMsg({ type: "err", text: data.error ?? "Something went wrong." }); }
      else { setEmail(data.email); setEmailVerified(null); setEditingEmail(false); setEmailMsg({ type: "ok", text: "Email updated — check your inbox to verify." }); }
    } finally { setEmailSaving(false); }
  }

  async function resendVerification() {
    setResendMsg(null); setResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      setResendMsg(res.ok ? { type: "ok", text: "Verification email sent." } : { type: "err", text: data.error ?? "Something went wrong." });
    } finally { setResending(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setPwMsg(null);
    if (pw.next !== pw.confirm) { setPwMsg({ type: "err", text: "New passwords don't match." }); return; }
    if (pw.next.length < 8) { setPwMsg({ type: "err", text: "New password must be at least 8 characters." }); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
      const data = await res.json();
      if (!res.ok) { setPwMsg({ type: "err", text: data.error ?? "Something went wrong." }); }
      else { setPwMsg({ type: "ok", text: "Password changed." }); setPw({ current: "", next: "", confirm: "" }); setPwOpen(false); }
    } finally { setPwSaving(false); }
  }

  if (status === "loading") return (
    <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-2xl px-4 space-y-4">
        <div className="shimmer-track h-28 rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900"><div className="animate-shimmer h-full w-full" /></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="shimmer-track h-20 rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900"><div className="animate-shimmer h-full w-full" /></div>)}
        </div>
        <div className="shimmer-track h-40 rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900"><div className="animate-shimmer h-full w-full" /></div>
      </div>
    </div>
  );

  const memberSince = createdAt ? new Date(createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;

  return (
    <div className="flex h-full overflow-hidden bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="flex flex-1 min-w-0 flex-col">
        {/* Top bar */}
        <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 pt-safe">
          <span className="font-display text-lg font-bold tracking-tight text-gray-900 dark:text-white">Dashboard</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-8 space-y-6 animate-fadeInUp">

            {/* ── Profile card ── */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-elevated dark:border-gray-800 dark:bg-gray-900 p-5">
              <div className="flex items-start gap-5">
                <button onClick={() => fileRef.current?.click()} className="group relative h-20 w-20 shrink-0 rounded-full overflow-hidden ring-2 ring-gray-300 dark:ring-gray-700 hover:ring-brand-green transition-all">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-800 text-2xl font-bold text-gray-600 dark:text-gray-400">{username[0]?.toUpperCase()}</div>
                  }
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-white"><path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" /></svg>
                  </div>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h1 className="font-display text-xl font-bold tracking-tight text-gray-900 dark:text-white">{username}</h1>
                      {memberSince && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Member since {memberSince}</p>}
                    </div>
                    {avatarUrl && (
                      <button onClick={() => setAvatarUrl(null)} className="shrink-0 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">Remove photo</button>
                    )}
                  </div>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Add a bio…"
                    className="mt-3 w-full resize-none rounded-xl bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-brand-green transition-colors"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{bio.length}/500</span>
                    <button
                      onClick={saveProfile}
                      disabled={saving}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-glow transition-colors active:scale-[0.98] motion-reduce:active:scale-100 ${saved ? "bg-emerald-700" : "bg-orange-700 hover:bg-orange-600 disabled:opacity-50"}`}
                    >
                      {saved ? "Saved!" : saving ? "Saving…" : "Save profile"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Stats row ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard value={stats?.debateCount ?? "—"} label="Debates joined" />
              <StatCard value={stats?.messageCount ?? "—"} label="Messages sent" />
              <StatCard value={stats?.arenaMatchCount ?? "—"} label="Bot matches" />
              <StatCard
                value={stats?.dailyStreak != null ? `${stats.dailyStreak}🔥` : "—"}
                label="Day streak"
                sub={stats?.longestStreak ? `best ${stats.longestStreak}` : undefined}
              />
            </div>

            {/* ── Veritas Score ── */}
            {cred && <VeritasScorePanel cred={cred} arenaBonus={stats?.arenaBonus ?? 0} />}

            {/* ── Featured medal showcase (editable) ── */}
            {medals.length > 0 && (
              <MedalShowcase medals={medals} featuredIds={featuredMedals} editable onSave={saveFeatured} />
            )}

            {/* ── Medals ── */}
            {medals.length > 0 && <MedalsPanel medals={medals} />}

            {/* ── Rubric averages ── */}
            {claimAverages && <RubricAverages avg={claimAverages} />}

            {/* ── Arena overview ── */}
            {(stats?.arenaMatchCount ?? 0) > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 p-5">
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>Training Grounds</SectionLabel>
                  <div className="flex items-center gap-2 text-xs -mt-3">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{stats?.arenaWins ?? 0}W</span>
                    <span className="text-gray-400 dark:text-gray-600">/</span>
                    <span className="font-bold text-red-700 dark:text-red-400">{stats?.arenaLosses ?? 0}L</span>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {BOTS.map(bot => (
                    <button
                      key={bot.id}
                      onClick={() => router.push("/arena")}
                      className="flex flex-col items-center gap-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 p-3 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      <span className="font-display text-lg font-bold text-gray-700 dark:text-gray-300">{bot.name[0]}</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{bot.name}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => router.push("/arena")} className="mt-3 w-full rounded-xl border border-gray-300 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50">
                  Go to Training Grounds →
                </button>
              </div>
            )}

            {/* ── Account ── */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 p-5 space-y-4">
              <SectionLabel>Account</SectionLabel>

              <div className="space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">Username</p>
                <p className="text-sm text-gray-800 dark:text-gray-200">{username}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                  {emailVerified
                    ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-600/40"><svg viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5"><path fillRule="evenodd" d="M10.53 2.47a.75.75 0 0 1 0 1.06L4.5 9.56 1.47 6.53a.75.75 0 0 1 1.06-1.06L4.5 7.44l5.97-5.97a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>Verified</span>
                    : <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 ring-1 ring-amber-600/40">Unverified</span>
                  }
                </div>
                {editingEmail ? (
                  <div className="space-y-2">
                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={email}
                      className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-brand-green" />
                    {emailMsg && <p className={`text-xs ${emailMsg.type === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{emailMsg.text}</p>}
                    <div className="flex gap-2">
                      <button onClick={saveEmail} disabled={emailSaving || !newEmail} className="rounded-xl bg-orange-700 px-4 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-50">{emailSaving ? "Saving…" : "Save"}</button>
                      <button onClick={() => { setEditingEmail(false); setEmailMsg(null); }} className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-800 dark:text-gray-200">{email}</p>
                    <button onClick={() => { setNewEmail(email); setEditingEmail(true); setEmailMsg(null); }} className="text-xs font-semibold text-orange-700 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 transition-colors">Change</button>
                  </div>
                )}
                {emailMsg && !editingEmail && <p className={`text-xs ${emailMsg.type === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{emailMsg.text}</p>}
                {!emailVerified && !editingEmail && (
                  <div className="pt-1">
                    {resendMsg
                      ? <p className={`text-xs ${resendMsg.type === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{resendMsg.text}</p>
                      : <button onClick={resendVerification} disabled={resending} className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 underline underline-offset-2 disabled:opacity-50 transition-colors">{resending ? "Sending…" : "Resend verification email"}</button>
                    }
                  </div>
                )}
              </div>
            </div>

            {/* ── Change password ── */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
              <button onClick={() => { setPwOpen(v => !v); setPwMsg(null); }} className="flex w-full items-center justify-between px-5 py-4 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                <span className="font-semibold">Change password</span>
                <svg viewBox="0 0 16 16" fill="currentColor" className={`h-4 w-4 text-gray-500 transition-transform ${pwOpen ? "rotate-180" : ""}`}><path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
              </button>
              {pwOpen && (
                <form onSubmit={changePassword} className="border-t border-gray-200 dark:border-gray-800 px-5 py-4 space-y-3">
                  {(["current", "next", "confirm"] as const).map((key) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{key === "current" ? "Current password" : key === "next" ? "New password" : "Confirm new"}</label>
                      <div className="relative">
                        <input type={showPw ? "text" : "password"} value={pw[key]} onChange={e => setPw(p => ({ ...p, [key]: e.target.value }))} required
                          className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 px-3 py-2 pr-9 text-sm text-gray-900 dark:text-gray-100 outline-none ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-2 focus:ring-brand-green" placeholder="••••••••" />
                        {key === "current" && (
                          <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">{showPw ? <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" /> : <path fillRule="evenodd" d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM1.174 7.557a1.006 1.006 0 0 0 0 .886A7.003 7.003 0 0 0 8 12.5a7.003 7.003 0 0 0 6.826-4.057 1.006 1.006 0 0 0 0-.886A7.003 7.003 0 0 0 8 3.5a7.003 7.003 0 0 0-6.826 4.057Z" clipRule="evenodd" />}</svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {pwMsg && <p className={`text-xs ${pwMsg.type === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{pwMsg.text}</p>}
                  <button type="submit" disabled={pwSaving} className="w-full rounded-xl bg-orange-700 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-50">{pwSaving ? "Updating…" : "Update password"}</button>
                </form>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
