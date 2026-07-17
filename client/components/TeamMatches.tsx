"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TOPIC_CATALOG } from "@/lib/topics";
import { api } from "@/lib/api";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

type WinCondition =
  | { type: "exchanges"; limit: number }
  | { type: "time"; minutes: number };

const WC_LABEL = (raw: string): string => {
  try {
    const wc = JSON.parse(raw);
    if (wc.type === "exchanges") return `${wc.limit} exchanges`;
    if (wc.type === "time") return `${wc.minutes} min`;
    return wc.type;
  } catch { return "custom"; }
};

interface OpenChallenge {
  id: string; claim: string; stance: "affirmative" | "negative"; winCondition: string;
  teamSize: number; captainId: string; captainName: string; captainElo: number;
}
interface MyMatch {
  id: string; claim: string; stance: "affirmative" | "negative"; winCondition: string;
  teamSize: number; status: string; mySide: "A" | "B"; myRole: "captain" | "member"; roomName: string | null;
}
interface Invite {
  memberId: string; side: "A" | "B"; challengeId: string; claim: string;
  stance: "affirmative" | "negative"; teamSize: number; captainName: string; captainElo: number;
}
interface RosterMember { userId: string; username: string; elo: number; role: string; status: string }
interface Roster {
  id: string; topic: string; stance: "affirmative" | "negative"; teamSize: number;
  status: string; winCondition: WinCondition | null; captainName: string;
  sideA: RosterMember[]; sideB: RosterMember[];
}

const SIZE_LABEL: Record<number, string> = { 1: "1v1", 2: "2v2", 3: "3v3" };

// Team-size chip — neutral metadata, not chrome.
function SizeTag({ size }: { size: number }) {
  return (
    <span className="rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[11px] font-bold text-gray-700 dark:text-gray-300">
      {SIZE_LABEL[size]}
    </span>
  );
}

function StanceTag({ stance }: { stance: "affirmative" | "negative" }) {
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${
      stance === "affirmative"
        ? "border-emerald-300 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
        : "border-rose-300 dark:border-rose-800 bg-rose-100 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400"
    }`}>
      {stance === "affirmative" ? "FOR" : "AGAINST"}
    </span>
  );
}

function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center animate-fadeIn">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
        {icon}
      </div>
      <div>
        <p className="font-display text-base font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{hint}</p>
      </div>
    </div>
  );
}

const UsersIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
  </svg>
);

const EnvelopeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
  </svg>
);

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateTeamModal({
  userId, onClose, onCreated,
}: {
  userId: string;
  onClose: () => void;
  onCreated: (challengeId: string, teamSize: number) => void;
}) {
  const [step, setStep] = useState<"topic" | "config">("topic");
  const [topic, setTopic] = useState("");
  const [stance, setStance] = useState<"affirmative" | "negative">("affirmative");
  const [teamSize, setTeamSize] = useState(2);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [wcType, setWcType] = useState<"exchanges" | "time">("exchanges");
  const [limit, setLimit] = useState(10);
  const [minutes, setMinutes] = useState(10);
  const [loading, setLoading] = useState(false);

  const filteredTopics = activeCategory
    ? TOPIC_CATALOG.find(g => g.category === activeCategory)?.topics ?? []
    : TOPIC_CATALOG.flatMap(g => g.topics);

  const wc: WinCondition = wcType === "exchanges" ? { type: "exchanges", limit } : { type: "time", minutes };

  async function submit() {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const res = await api(`${SERVER}/api/team/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, topic: topic.trim(), stance, teamSize, winCondition: wc }),
      });
      const data = await res.json();
      if (res.ok && data.id) onCreated(data.id, teamSize);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn" onClick={onClose}>
      <div className="flex w-full max-w-md flex-col rounded-2xl border border-gray-200 bg-white shadow-elevated dark:border-gray-800 dark:bg-gray-900 animate-fadeInUp" style={{ maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-5 py-4 shrink-0">
          <h2 className="flex-1 font-display text-base font-bold tracking-tight text-gray-900 dark:text-white">New Team Match</h2>
          <div className="flex items-center gap-1">
            <div className={`h-1.5 w-4 rounded-full ${step === "topic" ? "bg-brand-green" : "bg-gray-200 dark:bg-gray-700"}`} />
            <div className={`h-1.5 w-4 rounded-full ${step === "config" ? "bg-brand-green" : "bg-gray-200 dark:bg-gray-700"}`} />
          </div>
        </div>

        {step === "topic" && (
          <>
            <div className="px-5 pt-4 pb-3 shrink-0">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Debate topic</label>
              <input
                autoFocus value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="Type your own topic, or pick one below…"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none focus:border-brand-green"
              />
            </div>
            <div className="px-5 pb-2 shrink-0">
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setActiveCategory(null)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${activeCategory === null ? "bg-orange-700 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"}`}>
                  All
                </button>
                {TOPIC_CATALOG.map(g => (
                  <button key={g.category} onClick={() => setActiveCategory(g.category === activeCategory ? null : g.category)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${activeCategory === g.category ? "bg-orange-700 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"}`}>
                    {g.category}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 pb-3">
              {filteredTopics.map(t => (
                <button key={t} onClick={() => setTopic(t)}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-left text-xs leading-snug transition-colors ${
                    topic === t ? "border-brand-green bg-brand-green/10 dark:bg-brand-green/10 text-gray-900 dark:text-gray-100" : "border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2 border-t border-gray-200 dark:border-gray-800 px-5 py-4 shrink-0">
              <button onClick={onClose} className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">Cancel</button>
              <button onClick={() => setStep("config")} disabled={!topic.trim()}
                className="flex-1 rounded-xl bg-orange-700 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-40">Next →</button>
            </div>
          </>
        )}

        {step === "config" && (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex items-start gap-2 rounded-xl bg-gray-100 dark:bg-gray-800 px-3 py-2">
                <span className="text-brand-green-ink dark:text-brand-green">⚡</span>
                <p className="text-[11px] leading-snug text-gray-600 dark:text-gray-300">{topic}</p>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Your side argues</p>
                <div className="flex gap-2">
                  {(["affirmative", "negative"] as const).map(s => (
                    <button key={s} onClick={() => setStance(s)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                        stance === s
                          ? s === "affirmative" ? "border-emerald-500 bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "border-rose-500 bg-rose-100 dark:border-rose-600 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"
                          : "border-gray-300 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600"
                      }`}>
                      {s === "affirmative" ? "FOR" : "AGAINST"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Team size</p>
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <button key={n} onClick={() => setTeamSize(n)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${teamSize === n ? "border-brand-green bg-brand-green/10 dark:bg-brand-green/10 text-brand-green-ink dark:text-brand-green" : "border-gray-300 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600"}`}>
                      {SIZE_LABEL[n]}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {teamSize === 1 ? "Solo — no teammates to invite." : `Invite ${teamSize - 1} teammate${teamSize - 1 > 1 ? "s" : ""} after creating.`}
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Win condition</p>
                <div className="mb-3 flex gap-2">
                  {(["exchanges", "time"] as const).map(t => (
                    <button key={t} onClick={() => setWcType(t)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-semibold capitalize transition-colors ${wcType === t ? "border-brand-green bg-brand-green/10 dark:bg-brand-green/10 text-brand-green-ink dark:text-brand-green" : "border-gray-300 dark:border-gray-700 text-gray-500 hover:border-gray-400 dark:hover:border-gray-600"}`}>
                      {t === "exchanges" ? "Exchanges" : "Time"}
                    </button>
                  ))}
                </div>
                {wcType === "exchanges" ? (
                  <div className="flex items-center gap-3">
                    <input type="range" min={4} max={20} value={limit} onChange={e => setLimit(+e.target.value)} className="flex-1 accent-brand-green" />
                    <span className="w-24 text-right text-xs text-gray-700 dark:text-gray-300">{limit} exchanges</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <input type="range" min={3} max={30} value={minutes} onChange={e => setMinutes(+e.target.value)} className="flex-1 accent-brand-green" />
                    <span className="w-24 text-right text-xs text-gray-700 dark:text-gray-300">{minutes} minutes</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 border-t border-gray-200 dark:border-gray-800 px-5 py-4 shrink-0">
              <button onClick={() => setStep("topic")} className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">← Back</button>
              <button onClick={submit} disabled={loading}
                className="flex-1 rounded-xl bg-orange-700 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-40">
                {loading ? "Creating…" : teamSize === 1 ? "Post Match" : "Create & Invite"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Lobby modal (build your team) ─────────────────────────────────────────────

function LobbyModal({
  challengeId, userId, onClose,
}: {
  challengeId: string; userId: string; onClose: () => void;
}) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(() => {
    api(`${SERVER}/api/team/challenges/${challengeId}`)
      .then(r => r.json()).then((d: Roster) => { if (d && d.id) setRoster(d); }).catch(() => {});
  }, [challengeId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  // My side + captain status
  const mySideMembers = roster
    ? [...roster.sideA, ...roster.sideB].find(m => m.userId === userId)
    : null;
  const mySide: "A" | "B" | null = roster
    ? (roster.sideA.some(m => m.userId === userId) ? "A" : roster.sideB.some(m => m.userId === userId) ? "B" : null)
    : null;
  const iAmCaptain = mySideMembers?.role === "captain";
  const myRoster = roster ? (mySide === "A" ? roster.sideA : mySide === "B" ? roster.sideB : []) : [];
  const canInvite = iAmCaptain && roster && myRoster.length < roster.teamSize;

  async function invite() {
    if (!inviteName.trim() || !roster) return;
    setInviting(true); setInviteError("");
    try {
      const res = await api(`${SERVER}/api/team/challenges/${challengeId}/invite`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, targetUsername: inviteName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setInviteError(data.error ?? "Failed to invite"); return; }
      setInviteName("");
      load();
    } finally {
      setInviting(false);
    }
  }

  function slotRow(members: RosterMember[], size: number, side: "A" | "B", stance: "affirmative" | "negative") {
    const slots: (RosterMember | null)[] = [];
    for (let i = 0; i < size; i++) slots.push(members[i] ?? null);
    return (
      <div className="flex-1 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">Team {side}</span>
          <StanceTag stance={stance} />
        </div>
        <div className="space-y-1.5">
          {slots.map((m, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${m ? "bg-gray-100 dark:bg-gray-800" : "border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400"}`}>
              {m ? (
                <>
                  <span className={`h-1.5 w-1.5 rounded-full ${m.status === "accepted" ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{m.username}{m.userId === userId && <span className="text-gray-500 dark:text-gray-400"> (you)</span>}</span>
                  {m.role === "captain" && <span className="text-[10px] font-bold uppercase text-brand-green-ink dark:text-brand-green">Cap</span>}
                  {m.status === "invited" && <span className="text-[10px] text-amber-600 dark:text-amber-400">pending</span>}
                </>
              ) : (
                <span className="text-[11px]">Empty slot</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-elevated dark:border-gray-800 dark:bg-gray-900 animate-fadeInUp" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-5 py-4">
          <h2 className="flex-1 font-display text-base font-bold tracking-tight text-gray-900 dark:text-white">Team Lobby</h2>
          {roster && <SizeTag size={roster.teamSize} />}
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">✕</button>
        </div>

        {!roster ? (
          <div className="space-y-3 p-5">
            <div className="shimmer-track h-5 w-3/4 rounded bg-gray-100 dark:bg-gray-800" />
            <div className="flex gap-3">
              <div className="shimmer-track h-24 flex-1 rounded-xl bg-gray-100 dark:bg-gray-800" />
              <div className="shimmer-track h-24 flex-1 rounded-xl bg-gray-100 dark:bg-gray-800" />
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <p className="text-sm font-medium leading-relaxed text-gray-900 dark:text-gray-100">&ldquo;{roster.topic}&rdquo;</p>

            <div className="flex gap-3">
              {slotRow(roster.sideA, roster.teamSize, "A", roster.stance)}
              {slotRow(roster.sideB, roster.teamSize, "B", roster.stance === "affirmative" ? "negative" : "affirmative")}
            </div>

            {canInvite ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Invite a teammate</p>
                <div className="flex gap-2">
                  <input
                    value={inviteName} onChange={e => setInviteName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") invite(); }}
                    placeholder="Username…"
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none focus:border-brand-green"
                  />
                  <button onClick={invite} disabled={inviting || !inviteName.trim()}
                    className="rounded-lg bg-orange-700 px-4 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-40">
                    {inviting ? "…" : "Invite"}
                  </button>
                </div>
                {inviteError && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{inviteError}</p>}
              </div>
            ) : (
              <p className="rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-center text-[11px] text-gray-600 dark:text-gray-400">
                {roster.status === "open"
                  ? "Your team is full — waiting for an opponent to accept."
                  : roster.status === "filling"
                    ? "Waiting for the opposing captain to fill their team…"
                    : "Waiting for teammates to accept their invites…"}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TeamMatches({ userId, username }: { userId: string; username: string }) {
  const router = useRouter();
  const [sub, setSub] = useState<"open" | "mine" | "invites">("open");
  const [open, setOpen] = useState<OpenChallenge[]>([]);
  const [mine, setMine] = useState<MyMatch[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadOpen = useCallback(() => {
    if (!userId) return;
    api(`${SERVER}/api/team/challenges?excludeUserId=${userId}`).then(r => r.json()).then(d => setOpen(Array.isArray(d) ? d : [])).catch(() => {});
  }, [userId]);
  const loadMine = useCallback(() => {
    if (!userId) return;
    api(`${SERVER}/api/team/mine?userId=${userId}`).then(r => r.json()).then(d => setMine(Array.isArray(d) ? d : [])).catch(() => {});
  }, [userId]);
  const loadInvites = useCallback(() => {
    if (!userId) return;
    api(`${SERVER}/api/team/invites?userId=${userId}`).then(r => r.json()).then(d => setInvites(Array.isArray(d) ? d : [])).catch(() => {});
  }, [userId]);

  const refreshAll = useCallback(() => { loadOpen(); loadMine(); loadInvites(); }, [loadOpen, loadMine, loadInvites]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // Live: navigate when a match this user is in starts
  useEffect(() => {
    if (!userId) return;
    let cleanup = () => {};
    import("@/lib/socket").then(({ getSocket }) => {
      const socket = getSocket();
      const onStarted = (data: { roomName: string }) => { if (data?.roomName) router.push(`/room/${data.roomName}`); };
      const onNotif = (n: any) => { if (n?.type === "team_invite") loadInvites(); };
      socket.on("teamMatchStarted", onStarted);
      socket.on("notification", onNotif);
      cleanup = () => { socket.off("teamMatchStarted", onStarted); socket.off("notification", onNotif); };
    });
    return () => cleanup();
  }, [userId, username, router, loadInvites]);

  async function acceptOpen(c: OpenChallenge) {
    setBusy(c.id);
    try {
      const res = await api(`${SERVER}/api/team/challenges/${c.id}/accept`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) { setBusy(null); return; }
      if (data.roomName) { router.push(`/room/${data.roomName}`); return; }
      // Team match — open the lobby to fill side B
      refreshAll();
      setLobbyId(c.id);
    } finally {
      setBusy(null);
    }
  }

  async function respondInvite(inv: Invite, accepted: boolean) {
    setBusy(inv.memberId);
    try {
      const res = await api(`${SERVER}/api/team/challenges/${inv.challengeId}/respond`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, accepted }),
      });
      const data = await res.json();
      refreshAll();
      if (accepted && data.roomName) router.push(`/room/${data.roomName}`);
    } finally {
      setBusy(null);
    }
  }

  async function cancelMine(id: string) {
    await api(`${SERVER}/api/team/challenges/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    refreshAll();
  }

  const subTabs: [typeof sub, string, number][] = [
    ["open", "Open Matches", open.length],
    ["mine", "My Teams", mine.filter(m => m.status !== "matched").length],
    ["invites", "Invites", invites.length],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Sub-tabs + create */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {subTabs.map(([key, label, count]) => (
            <button key={key} onClick={() => { setSub(key); refreshAll(); }}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${sub === key ? "bg-brand-green/15 text-brand-green-ink dark:text-brand-green ring-1 ring-brand-green/30" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800/50 dark:hover:text-gray-300"}`}>
              {label}{count > 0 && <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">{count}</span>}
            </button>
          ))}
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-orange-700 px-3 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.98] motion-reduce:active:scale-100">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" /></svg>
          New Team Match
        </button>
      </div>

      {/* Open matches */}
      {sub === "open" && (
        <div className="space-y-3">
          {open.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No open team matches" hint="Create one and invite your team, or check back soon." />
          ) : open.map(c => (
            <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-elevated">
              <p className="text-sm font-medium leading-relaxed text-gray-900 dark:text-gray-100">&ldquo;{c.claim}&rdquo;</p>
              <div className="flex flex-wrap items-center gap-2">
                <SizeTag size={c.teamSize} />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{c.captainName} ⚡{c.captainElo}</span>
                <StanceTag stance={c.stance} />
                <span className="rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-600 dark:text-gray-400">{WC_LABEL(c.winCondition)}</span>
                <button onClick={() => acceptOpen(c)} disabled={busy === c.id}
                  className="ml-auto inline-flex items-center gap-1 rounded-xl bg-orange-700 px-4 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-50 active:scale-[0.98] motion-reduce:active:scale-100">
                  {busy === c.id ? "…" : c.teamSize === 1 ? "Accept & Debate →" : "Accept with a team →"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My teams */}
      {sub === "mine" && (
        <div className="space-y-3">
          {mine.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No team matches yet" hint="Create a team match or accept an open one to get started." />
          ) : mine.map(m => (
            <div key={m.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-card">
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold capitalize ${
                  m.status === "matched" ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300" :
                  m.status === "open" ? "bg-brand-green/15 text-brand-green-ink dark:text-brand-green" :
                  m.status === "filling" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" :
                  "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                }`}>{m.status}</span>
                <SizeTag size={m.teamSize} />
                {m.myRole === "captain" && <span className="text-[10px] font-bold uppercase text-brand-green-ink dark:text-brand-green">Captain</span>}
                <span className="ml-auto text-[11px] text-gray-500 dark:text-gray-400">Team {m.mySide}</span>
              </div>
              <p className="text-sm font-medium leading-relaxed text-gray-900 dark:text-gray-100">&ldquo;{m.claim}&rdquo;</p>
              <div className="flex items-center gap-2">
                <StanceTag stance={m.mySide === "A" ? m.stance : (m.stance === "affirmative" ? "negative" : "affirmative")} />
                <span className="rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-600 dark:text-gray-400">{WC_LABEL(m.winCondition)}</span>
                <div className="ml-auto flex gap-2">
                  {m.status === "matched" && m.roomName ? (
                    <button onClick={() => router.push(`/room/${m.roomName}`)}
                      className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600">Enter Room →</button>
                  ) : (
                    <button onClick={() => setLobbyId(m.id)}
                      className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      {m.myRole === "captain" && (m.teamSize > 1) ? "Manage team" : "View lobby"}
                    </button>
                  )}
                  {m.myRole === "captain" && m.status !== "matched" && (
                    <button onClick={() => cancelMine(m.id)}
                      className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 transition-colors hover:border-red-300 hover:text-red-600 dark:hover:border-red-800 dark:hover:text-red-400">Cancel</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invites */}
      {sub === "invites" && (
        <div className="space-y-3">
          {invites.length === 0 ? (
            <EmptyState icon={EnvelopeIcon} title="No pending invites" hint="When a captain invites you to their team, it'll show up here." />
          ) : invites.map(inv => (
            <div key={inv.memberId} className="flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-card">
              <p className="text-xs text-gray-500 dark:text-gray-400"><span className="font-semibold text-gray-700 dark:text-gray-300">{inv.captainName}</span> invited you to Team {inv.side} for a {SIZE_LABEL[inv.teamSize]}:</p>
              <p className="text-sm font-medium leading-relaxed text-gray-900 dark:text-gray-100">&ldquo;{inv.claim}&rdquo;</p>
              <div className="flex items-center gap-2">
                <StanceTag stance={inv.side === "A" ? inv.stance : (inv.stance === "affirmative" ? "negative" : "affirmative")} />
                <div className="ml-auto flex gap-2">
                  <button onClick={() => respondInvite(inv, false)} disabled={busy === inv.memberId}
                    className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 transition-colors hover:border-red-300 hover:text-red-600 dark:hover:border-red-800 dark:hover:text-red-400 disabled:opacity-50">Decline</button>
                  <button onClick={() => respondInvite(inv, true)} disabled={busy === inv.memberId}
                    className="rounded-lg bg-orange-700 px-4 py-1.5 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-50 active:scale-[0.98] motion-reduce:active:scale-100">
                    {busy === inv.memberId ? "…" : "Accept"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateTeamModal
          userId={userId}
          onClose={() => setCreateOpen(false)}
          onCreated={(id, size) => { setCreateOpen(false); refreshAll(); if (size > 1) setLobbyId(id); }}
        />
      )}
      {lobbyId && (
        <LobbyModal
          challengeId={lobbyId} userId={userId}
          onClose={() => { setLobbyId(null); refreshAll(); }}
        />
      )}
    </div>
  );
}
