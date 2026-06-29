"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import type { CredScore } from "@/lib/types";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024;

function VeritasScorePanel({ cred }: { cred: CredScore }) {
  const accuracy = cred.total > 0 ? Math.round((cred.supported / cred.total) * 100) : null;
  const rating = cred.total >= 3 ? Math.min(100, Math.round((cred.score / (cred.total * 2)) * 100)) : null;
  const tier =
    cred.total < 3 ? { label: "Unrated",  color: "text-gray-500",    bg: "bg-gray-800/60",      ring: "ring-gray-700/40"   } :
    accuracy !== null && accuracy >= 80 ? { label: "Credible",  color: "text-emerald-300", bg: "bg-emerald-950/40",   ring: "ring-emerald-700/40" } :
    accuracy !== null && accuracy >= 50 ? { label: "Mixed",     color: "text-yellow-300",  bg: "bg-yellow-950/30",    ring: "ring-yellow-700/40"  } :
                                          { label: "Disputed",  color: "text-red-400",     bg: "bg-red-950/30",       ring: "ring-red-700/40"     };
  return (
    <div className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Veritas Score</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tier.bg} ${tier.color} ${tier.ring}`}>{tier.label}</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-4xl font-bold tabular-nums text-gray-100">{cred.total < 3 ? "—" : cred.score.toFixed(1)}</span>
        {rating !== null && <span className="mb-1 text-sm text-gray-500">pts · {rating}% rating</span>}
      </div>
      {cred.total < 3 && <p className="text-xs text-gray-600">Make at least 3 verified claims to earn a score.</p>}
      {cred.total >= 1 && accuracy !== null && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-600">
            <span className="text-emerald-400">{accuracy}% accuracy</span>
            <span>{cred.total} claim{cred.total !== 1 ? "s" : ""} evaluated</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-800 flex">
            <div className="bg-emerald-500 transition-all" style={{ width: `${accuracy}%` }} />
            <div className="bg-red-500 transition-all" style={{ width: `${cred.total > 0 ? Math.round((cred.refuted / cred.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-900/30 px-2.5 py-1 text-xs text-emerald-400 ring-1 ring-emerald-700/30"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{cred.supported} supported</span>
        <span className="flex items-center gap-1.5 rounded-full bg-red-900/30 px-2.5 py-1 text-xs text-red-400 ring-1 ring-red-700/30"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{cred.refuted} refuted</span>
        <span className="flex items-center gap-1.5 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-500 ring-1 ring-gray-700/30"><span className="h-1.5 w-1.5 rounded-full bg-gray-500" />{cred.contested} contested</span>
      </div>
      <p className="text-[10px] text-gray-700 leading-relaxed pt-1">Score weights supported claims by their relevance to the debate proposition. Refuted claims always cost full points.</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">{children}</p>;
}

export default function ProfilePage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? "";

  // Profile state
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [cred, setCred] = useState<CredScore | null>(null);
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Email edit state
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Resend verification state
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Change password state
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    fetch(`${SERVER}/api/users/${userId}/profile`)
      .then(r => r.json())
      .then(data => {
        setBio(data.bio ?? "");
        setAvatarUrl(data.avatarUrl ?? null);
        if (data.cred) setCred(data.cred);
        if (data.email) setEmail(data.email);
        if (data.emailVerified) setEmailVerified(data.emailVerified);
        if (data.createdAt) setCreatedAt(data.createdAt);
      })
      .catch(() => {});
  }, [status, userId]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) { alert("Image too large — please choose one under 1.5 MB."); return; }
    const reader = new FileReader();
    reader.onload = ev => setAvatarUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    if (!userId) return;
    setSaving(true);
    try {
      await fetch(`${SERVER}/api/users/${userId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio, avatarUrl }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function saveEmail() {
    setEmailMsg(null);
    setEmailSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailMsg({ type: "err", text: data.error ?? "Something went wrong." });
      } else {
        setEmail(data.email);
        setEmailVerified(null);
        setEditingEmail(false);
        setEmailMsg({ type: "ok", text: "Email updated — check your inbox to verify the new address." });
      }
    } finally {
      setEmailSaving(false);
    }
  }

  async function resendVerification() {
    setResendMsg(null);
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      setResendMsg(res.ok
        ? { type: "ok", text: "Verification email sent — check your inbox." }
        : { type: "err", text: data.error ?? "Something went wrong." });
    } finally {
      setResending(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next !== pw.confirm) { setPwMsg({ type: "err", text: "New passwords don't match." }); return; }
    if (pw.next.length < 8) { setPwMsg({ type: "err", text: "New password must be at least 8 characters." }); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMsg({ type: "err", text: data.error ?? "Something went wrong." });
      } else {
        setPwMsg({ type: "ok", text: "Password changed successfully." });
        setPw({ current: "", next: "", confirm: "" });
        setPwOpen(false);
      }
    } finally {
      setPwSaving(false);
    }
  }

  if (status === "loading") return (
    <div className="flex h-full items-center justify-center bg-gray-950 text-gray-500">Loading…</div>
  );

  return (
    <div className="flex h-full overflow-hidden bg-gray-950 text-gray-100">
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-800 px-3 md:px-5">
          <button className="md:hidden rounded p-1.5 text-gray-400 hover:bg-gray-800" onClick={() => setMobileSidebarOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-100">Profile</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-lg px-4 py-10 space-y-8">

            {/* Avatar + name */}
            <div className="flex flex-col items-center gap-4">
              <button onClick={() => fileRef.current?.click()}
                className="group relative h-24 w-24 rounded-full overflow-hidden ring-2 ring-gray-700 hover:ring-indigo-500 transition-all">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-800 text-2xl font-bold text-gray-400">
                    {username[0]?.toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-white">
                    <path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                  </svg>
                </div>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              <div className="text-center">
                <p className="font-semibold text-gray-100">{username}</p>
                {createdAt && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    Member since {new Date(createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </p>
                )}
                {avatarUrl && (
                  <button onClick={() => setAvatarUrl(null)} className="mt-1 text-xs text-gray-500 hover:text-red-400 transition-colors">
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            {/* Veritas Score */}
            {cred && <VeritasScorePanel cred={cred} />}

            {/* Account info */}
            <div className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 p-5 space-y-4">
              <SectionLabel>Account</SectionLabel>

              {/* Username */}
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Username</p>
                <p className="text-sm text-gray-200">{username}</p>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Email</p>
                  {emailVerified ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-700/40">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5">
                        <path fillRule="evenodd" d="M10.53 2.47a.75.75 0 0 1 0 1.06L4.5 9.56 1.47 6.53a.75.75 0 0 1 1.06-1.06L4.5 7.44l5.97-5.97a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                      </svg>
                      Verified
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-amber-700/40">
                      Unverified
                    </span>
                  )}
                </div>

                {editingEmail ? (
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder={email}
                      className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
                    />
                    {emailMsg && (
                      <p className={`text-xs ${emailMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>{emailMsg.text}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={saveEmail}
                        disabled={emailSaving || !newEmail}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                      >
                        {emailSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => { setEditingEmail(false); setEmailMsg(null); }}
                        className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-200">{email}</p>
                    <button
                      onClick={() => { setNewEmail(email); setEditingEmail(true); setEmailMsg(null); }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Change
                    </button>
                  </div>
                )}

                {emailMsg && !editingEmail && (
                  <p className={`text-xs ${emailMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>{emailMsg.text}</p>
                )}

                {/* Resend verification */}
                {!emailVerified && !editingEmail && (
                  <div className="pt-1">
                    {resendMsg ? (
                      <p className={`text-xs ${resendMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>{resendMsg.text}</p>
                    ) : (
                      <button
                        onClick={resendVerification}
                        disabled={resending}
                        className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 disabled:opacity-50 transition-colors"
                      >
                        {resending ? "Sending…" : "Resend verification email"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <SectionLabel>Bio</SectionLabel>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Tell people a bit about yourself…"
                className="w-full resize-none rounded-xl bg-gray-800 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500 transition-colors"
              />
              <p className="text-right text-xs text-gray-600">{bio.length}/500</p>
            </div>

            {/* Save profile */}
            <button
              onClick={saveProfile}
              disabled={saving}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                saved ? "bg-emerald-600 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              }`}
            >
              {saved ? "Saved!" : saving ? "Saving…" : "Save profile"}
            </button>

            {/* Change password */}
            <div className="rounded-2xl bg-gray-900 ring-1 ring-gray-800 overflow-hidden">
              <button
                onClick={() => { setPwOpen(v => !v); setPwMsg(null); }}
                className="flex w-full items-center justify-between px-5 py-4 text-sm text-gray-300 hover:text-gray-100 transition-colors"
              >
                <span className="font-medium">Change password</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                  className={`h-4 w-4 text-gray-500 transition-transform ${pwOpen ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {pwOpen && (
                <form onSubmit={changePassword} className="border-t border-gray-800 px-5 py-4 space-y-3">
                  {(["current", "next", "confirm"] as const).map((key) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs text-gray-500">
                        {key === "current" ? "Current password" : key === "next" ? "New password" : "Confirm new password"}
                      </label>
                      <div className="relative">
                        <input
                          type={showPw ? "text" : "password"}
                          value={pw[key]}
                          onChange={e => setPw(p => ({ ...p, [key]: e.target.value }))}
                          required
                          className="w-full rounded-lg bg-gray-800 px-3 py-2 pr-9 text-sm text-gray-100 outline-none ring-1 ring-gray-700 focus:ring-indigo-500"
                          placeholder="••••••••"
                        />
                        {key === "current" && (
                          <button type="button" onClick={() => setShowPw(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                              {showPw
                                ? <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                                : <path fillRule="evenodd" d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM1.174 7.557a1.006 1.006 0 0 0 0 .886A7.003 7.003 0 0 0 8 12.5a7.003 7.003 0 0 0 6.826-4.057 1.006 1.006 0 0 0 0-.886A7.003 7.003 0 0 0 8 3.5a7.003 7.003 0 0 0-6.826 4.057Z" clipRule="evenodd" />
                              }
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {pwMsg && (
                    <p className={`text-xs ${pwMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>{pwMsg.text}</p>
                  )}

                  <button
                    type="submit"
                    disabled={pwSaving}
                    className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                  >
                    {pwSaving ? "Updating…" : "Update password"}
                  </button>
                </form>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
