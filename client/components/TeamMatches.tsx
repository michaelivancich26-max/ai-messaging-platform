"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TOPIC_CATALOG } from "@/lib/topics";

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

function StanceTag({ stance }: { stance: "affirmative" | "negative" }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
      stance === "affirmative" ? "border-emerald-800 bg-emerald-950/30 text-emerald-400" : "border-red-800 bg-red-950/30 text-red-400"
    }`}>
      {stance === "affirmative" ? "FOR" : "AGAINST"}
    </span>
  );
}

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
      const res = await fetch(`${SERVER}/api/team/challenges`, {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-gray-900 ring-1 ring-gray-800" style={{ maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-800 px-5 py-4 shrink-0">
          <h2 className="flex-1 text-sm font-bold text-white">New Team Match</h2>
          <div className="flex items-center gap-1">
            <div className={`h-1.5 w-4 rounded-full ${step === "topic" ? "bg-violet-500" : "bg-gray-700"}`} />
            <div className={`h-1.5 w-4 rounded-full ${step === "config" ? "bg-violet-500" : "bg-gray-700"}`} />
          </div>
        </div>

        {step === "topic" && (
          <>
            <div className="px-5 pt-4 pb-3 shrink-0">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Debate topic</label>
              <input
                autoFocus value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="Type your own topic, or pick one below…"
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-violet-500"
              />
            </div>
            <div className="px-5 pb-2 shrink-0">
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setActiveCategory(null)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${activeCategory === null ? "bg-violet-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                  All
                </button>
                {TOPIC_CATALOG.map(g => (
                  <button key={g.category} onClick={() => setActiveCategory(g.category === activeCategory ? null : g.category)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${activeCategory === g.category ? "bg-violet-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                    {g.category}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 pb-3">
              {filteredTopics.map(t => (
                <button key={t} onClick={() => setTopic(t)}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-left text-xs leading-snug ${
                    topic === t ? "border-violet-600 bg-violet-950/30 text-gray-100" : "border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2 border-t border-gray-800 px-5 py-4 shrink-0">
              <button onClick={onClose} className="flex-1 rounded-xl border border-gray-700 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-800">Cancel</button>
              <button onClick={() => setStep("config")} disabled={!topic.trim()}
                className="flex-1 rounded-xl bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40">Next →</button>
            </div>
          </>
        )}

        {step === "config" && (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex items-start gap-2 rounded-xl bg-gray-800/50 px-3 py-2">
                <span className="text-violet-400">⚡</span>
                <p className="text-[11px] leading-snug text-gray-400">{topic}</p>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Your side argues</p>
                <div className="flex gap-2">
                  {(["affirmative", "negative"] as const).map(s => (
                    <button key={s} onClick={() => setStance(s)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${
                        stance === s
                          ? s === "affirmative" ? "border-emerald-600 bg-emerald-900/40 text-emerald-300" : "border-red-700 bg-red-900/30 text-red-300"
                          : "border-gray-700 text-gray-500 hover:border-gray-600"
                      }`}>
                      {s === "affirmative" ? "FOR" : "AGAINST"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Team size</p>
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <button key={n} onClick={() => setTeamSize(n)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${teamSize === n ? "border-violet-600 bg-violet-900/40 text-violet-300" : "border-gray-700 text-gray-500 hover:border-gray-600"}`}>
                      {SIZE_LABEL[n]}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-gray-600">
                  {teamSize === 1 ? "Solo — no teammates to invite." : `Invite ${teamSize - 1} teammate${teamSize - 1 > 1 ? "s" : ""} after creating.`}
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Win condition</p>
                <div className="mb-3 flex gap-2">
                  {(["exchanges", "time"] as const).map(t => (
                    <button key={t} onClick={() => setWcType(t)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-semibold capitalize ${wcType === t ? "border-violet-600 bg-violet-900/40 text-violet-300" : "border-gray-700 text-gray-500 hover:border-gray-600"}`}>
                      {t === "exchanges" ? "Exchanges" : "Time"}
                    </button>
                  ))}
                </div>
                {wcType === "exchanges" ? (
                  <div className="flex items-center gap-3">
                    <input type="range" min={4} max={20} value={limit} onChange={e => setLimit(+e.target.value)} className="flex-1 accent-violet-500" />
                    <span className="w-24 text-right text-xs text-gray-300">{limit} exchanges</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <input type="range" min={3} max={30} value={minutes} onChange={e => setMinutes(+e.target.value)} className="flex-1 accent-violet-500" />
                    <span className="w-24 text-right text-xs text-gray-300">{minutes} minutes</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 border-t border-gray-800 px-5 py-4 shrink-0">
              <button onClick={() => setStep("topic")} className="flex-1 rounded-xl border border-gray-700 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-800">← Back</button>
              <button onClick={submit} disabled={loading}
                className="flex-1 rounded-xl bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40">
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
    fetch(`${SERVER}/api/team/challenges/${challengeId}`)
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
      const res = await fetch(`${SERVER}/api/team/challenges/${challengeId}/invite`, {
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
      <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900/60 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-300">Team {side}</span>
          <StanceTag stance={stance} />
        </div>
        <div className="space-y-1.5">
          {slots.map((m, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${m ? "bg-gray-800" : "border border-dashed border-gray-700 text-gray-600"}`}>
              {m ? (
                <>
                  <span className={`h-1.5 w-1.5 rounded-full ${m.status === "accepted" ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <span className="flex-1 truncate text-gray-200">{m.username}{m.userId === userId && <span className="text-gray-500"> (you)</span>}</span>
                  {m.role === "captain" && <span className="text-[9px] font-bold uppercase text-violet-400">Cap</span>}
                  {m.status === "invited" && <span className="text-[9px] text-amber-400">pending</span>}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-gray-900 ring-1 ring-gray-800" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-800 px-5 py-4">
          <h2 className="flex-1 text-sm font-bold text-white">Team Lobby</h2>
          {roster && <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-400">{SIZE_LABEL[roster.teamSize]}</span>}
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>

        {!roster ? (
          <div className="py-16 text-center text-sm text-gray-600">Loading…</div>
        ) : (
          <div className="space-y-4 p-5">
            <p className="text-sm font-medium leading-relaxed text-gray-100">"{roster.topic}"</p>

            <div className="flex gap-3">
              {slotRow(roster.sideA, roster.teamSize, "A", roster.stance)}
              {slotRow(roster.sideB, roster.teamSize, "B", roster.stance === "affirmative" ? "negative" : "affirmative")}
            </div>

            {canInvite ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Invite a teammate</p>
                <div className="flex gap-2">
                  <input
                    value={inviteName} onChange={e => setInviteName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") invite(); }}
                    placeholder="Username…"
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-violet-500"
                  />
                  <button onClick={invite} disabled={inviting || !inviteName.trim()}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40">
                    {inviting ? "…" : "Invite"}
                  </button>
                </div>
                {inviteError && <p className="mt-1 text-[10px] text-red-400">{inviteError}</p>}
              </div>
            ) : (
              <p className="rounded-lg bg-gray-800/50 px-3 py-2 text-center text-[11px] text-gray-500">
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
    fetch(`${SERVER}/api/team/challenges?excludeUserId=${userId}`).then(r => r.json()).then(d => setOpen(Array.isArray(d) ? d : [])).catch(() => {});
  }, [userId]);
  const loadMine = useCallback(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/team/mine?userId=${userId}`).then(r => r.json()).then(d => setMine(Array.isArray(d) ? d : [])).catch(() => {});
  }, [userId]);
  const loadInvites = useCallback(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/team/invites?userId=${userId}`).then(r => r.json()).then(d => setInvites(Array.isArray(d) ? d : [])).catch(() => {});
  }, [userId]);

  const refreshAll = useCallback(() => { loadOpen(); loadMine(); loadInvites(); }, [loadOpen, loadMine, loadInvites]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // Live: navigate when a match this user is in starts
  useEffect(() => {
    if (!userId) return;
    let cleanup = () => {};
    import("@/lib/socket").then(({ getSocket }) => {
      const socket = getSocket({ id: userId, username });
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
      const res = await fetch(`${SERVER}/api/team/challenges/${c.id}/accept`, {
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
      const res = await fetch(`${SERVER}/api/team/challenges/${inv.challengeId}/respond`, {
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
    await fetch(`${SERVER}/api/team/challenges/${id}`, {
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
        <div className="flex flex-1 gap-1.5">
          {subTabs.map(([key, label, count]) => (
            <button key={key} onClick={() => { setSub(key); refreshAll(); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${sub === key ? "bg-violet-600/20 text-violet-300 ring-1 ring-violet-700/50" : "text-gray-500 hover:text-gray-300"}`}>
              {label}{count > 0 && <span className="ml-1.5 rounded-full bg-violet-800 px-1.5 text-[10px] text-violet-200">{count}</span>}
            </button>
          ))}
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" /></svg>
          New Team Match
        </button>
      </div>

      {/* Open matches */}
      {sub === "open" && (
        <div className="space-y-3">
          {open.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-gray-400">No open team matches</p>
              <p className="mt-1 text-xs text-gray-600">Create one and invite your team, or check back soon.</p>
            </div>
          ) : open.map(c => (
            <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-5 hover:border-gray-700">
              <p className="text-sm font-medium leading-relaxed text-gray-100">"{c.claim}"</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-violet-800 bg-violet-950/40 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">{SIZE_LABEL[c.teamSize]}</span>
                <span className="text-xs font-medium text-gray-400">{c.captainName} ⚡{c.captainElo}</span>
                <StanceTag stance={c.stance} />
                <span className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">{WC_LABEL(c.winCondition)}</span>
                <button onClick={() => acceptOpen(c)} disabled={busy === c.id}
                  className="ml-auto rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
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
            <div className="py-16 text-center text-sm text-gray-600">You're not in any team matches yet.</div>
          ) : mine.map(m => (
            <div key={m.id} className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  m.status === "matched" ? "bg-emerald-900/50 text-emerald-400" :
                  m.status === "open" ? "bg-violet-900/50 text-violet-400" :
                  m.status === "filling" ? "bg-amber-900/40 text-amber-400" :
                  "bg-gray-800 text-gray-500"
                }`}>{m.status}</span>
                <span className="rounded border border-violet-800 bg-violet-950/40 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">{SIZE_LABEL[m.teamSize]}</span>
                {m.myRole === "captain" && <span className="text-[9px] font-bold uppercase text-violet-400">Captain</span>}
                <span className="ml-auto text-[10px] text-gray-600">Team {m.mySide}</span>
              </div>
              <p className="text-sm font-medium leading-relaxed text-gray-100">"{m.claim}"</p>
              <div className="flex items-center gap-2">
                <StanceTag stance={m.mySide === "A" ? m.stance : (m.stance === "affirmative" ? "negative" : "affirmative")} />
                <span className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">{WC_LABEL(m.winCondition)}</span>
                <div className="ml-auto flex gap-2">
                  {m.status === "matched" && m.roomName ? (
                    <button onClick={() => router.push(`/room/${m.roomName}`)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">Enter Room →</button>
                  ) : (
                    <button onClick={() => setLobbyId(m.id)}
                      className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-violet-700 hover:text-violet-300">
                      {m.myRole === "captain" && (m.teamSize > 1) ? "Manage team" : "View lobby"}
                    </button>
                  )}
                  {m.myRole === "captain" && m.status !== "matched" && (
                    <button onClick={() => cancelMine(m.id)}
                      className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-500 hover:border-red-800 hover:text-red-400">Cancel</button>
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
            <div className="py-16 text-center text-sm text-gray-600">No pending team invites.</div>
          ) : invites.map(inv => (
            <div key={inv.memberId} className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <p className="text-xs text-gray-500"><span className="font-semibold text-gray-300">{inv.captainName}</span> invited you to Team {inv.side} for a {SIZE_LABEL[inv.teamSize]}:</p>
              <p className="text-sm font-medium leading-relaxed text-gray-100">"{inv.claim}"</p>
              <div className="flex items-center gap-2">
                <StanceTag stance={inv.side === "A" ? inv.stance : (inv.stance === "affirmative" ? "negative" : "affirmative")} />
                <div className="ml-auto flex gap-2">
                  <button onClick={() => respondInvite(inv, false)} disabled={busy === inv.memberId}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-500 hover:border-red-800 hover:text-red-400 disabled:opacity-50">Decline</button>
                  <button onClick={() => respondInvite(inv, true)} disabled={busy === inv.memberId}
                    className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
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
