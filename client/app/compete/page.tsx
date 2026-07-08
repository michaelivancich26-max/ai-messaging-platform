"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import TeamMatches from "@/components/TeamMatches";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

type WinCondition =
  | { type: "exchanges"; limit: number }
  | { type: "time"; minutes: number }
  | { type: "proposition"; threshold: number };

interface Challenge {
  id: string;
  userId: string;
  username: string;
  elo: number;
  claim: string;
  stance: "affirmative" | "negative";
  winCondition: string; // raw JSON
  status: string;
  createdAt: string;
}

interface LeaderboardEntry {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
}

const WC_LABEL: Record<string, (wc: any) => string> = {
  exchanges: (wc) => `${wc.limit} exchanges`,
  time: (wc) => `${wc.minutes} min`,
  proposition: (wc) => `Prop ≥${wc.threshold}%`,
};

function EloBadge({ elo, className = "" }: { elo: number; className?: string }) {
  const color =
    elo >= 1600 ? "text-yellow-400 border-yellow-800 bg-yellow-950/40" :
    elo >= 1400 ? "text-violet-400 border-violet-800 bg-violet-950/40" :
    elo >= 1200 ? "text-sky-400 border-sky-800 bg-sky-950/40" :
    "text-gray-400 border-gray-700 bg-gray-900";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${color} ${className}`}>
      ⚡{elo}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Post Challenge Modal ──────────────────────────────────────────────────────

function PostModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id ?? "";
  const [claim, setClaim] = useState("");
  const [stance, setStance] = useState<"affirmative" | "negative">("affirmative");
  const [wcType, setWcType] = useState<"exchanges" | "time" | "proposition">("exchanges");
  const [limit, setLimit] = useState(10);
  const [minutes, setMinutes] = useState(10);
  const [threshold, setThreshold] = useState(60);
  const [loading, setLoading] = useState(false);

  const wc: WinCondition =
    wcType === "exchanges" ? { type: "exchanges", limit } :
    wcType === "time" ? { type: "time", minutes } :
    { type: "proposition", threshold };

  async function submit() {
    if (!claim.trim()) return;
    setLoading(true);
    try {
      await fetch(`${SERVER}/api/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, claim: claim.trim(), stance, winCondition: wc }),
      });
      onPosted();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold text-white mb-4">Post a Challenge</h2>

        {/* Claim */}
        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Your claim</label>
        <textarea
          autoFocus
          value={claim}
          onChange={e => setClaim(e.target.value)}
          placeholder="e.g. Universal basic income would reduce poverty"
          rows={3}
          className="w-full resize-none rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-violet-500 focus:outline-none"
        />

        {/* Stance */}
        <label className="block text-xs font-semibold text-gray-400 mt-4 mb-1.5">You are arguing</label>
        <div className="flex gap-2">
          {(["affirmative", "negative"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStance(s)}
              className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                stance === s
                  ? s === "affirmative"
                    ? "border-emerald-600 bg-emerald-900/40 text-emerald-300"
                    : "border-red-700 bg-red-900/30 text-red-300"
                  : "border-gray-700 text-gray-500 hover:border-gray-600"
              }`}
            >
              {s === "affirmative" ? "FOR this claim" : "AGAINST this claim"}
            </button>
          ))}
        </div>

        {/* Win condition */}
        <label className="block text-xs font-semibold text-gray-400 mt-4 mb-1.5">Win condition</label>
        <div className="flex gap-2 mb-3">
          {(["exchanges", "time", "proposition"] as const).map(t => (
            <button
              key={t}
              onClick={() => setWcType(t)}
              className={`flex-1 rounded-lg border py-2 text-xs font-semibold capitalize transition-colors ${
                wcType === t ? "border-violet-600 bg-violet-900/40 text-violet-300" : "border-gray-700 text-gray-500 hover:border-gray-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {wcType === "exchanges" && (
          <div className="flex items-center gap-3">
            <input type="range" min={4} max={20} value={limit} onChange={e => setLimit(+e.target.value)} className="flex-1 accent-violet-500" />
            <span className="w-20 text-right text-xs text-gray-300">{limit} exchanges</span>
          </div>
        )}
        {wcType === "time" && (
          <div className="flex items-center gap-3">
            <input type="range" min={3} max={30} value={minutes} onChange={e => setMinutes(+e.target.value)} className="flex-1 accent-violet-500" />
            <span className="w-20 text-right text-xs text-gray-300">{minutes} minutes</span>
          </div>
        )}
        {wcType === "proposition" && (
          <div className="flex items-center gap-3">
            <input type="range" min={50} max={90} step={5} value={threshold} onChange={e => setThreshold(+e.target.value)} className="flex-1 accent-violet-500" />
            <span className="w-20 text-right text-xs text-gray-300">≥{threshold}%</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-700 py-2.5 text-sm text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || !claim.trim()}
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
          >
            {loading ? "Posting…" : "Post Challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Challenge Card ────────────────────────────────────────────────────────────

function ChallengeCard({
  challenge, onAccept, accepting, isMine, onCancel,
}: {
  challenge: Challenge;
  onAccept: (id: string) => void;
  accepting: string | null;
  isMine?: boolean;
  onCancel?: (id: string) => void;
}) {
  const wc = (() => { try { return JSON.parse(challenge.winCondition); } catch { return null; } })();
  const stanceColor = challenge.stance === "affirmative"
    ? "border-emerald-800 bg-emerald-950/30 text-emerald-400"
    : "border-red-800 bg-red-950/30 text-red-400";

  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-5 transition-all hover:border-gray-700 hover:bg-gray-900">
      {/* Claim */}
      <p className="text-sm font-medium leading-relaxed text-gray-100">"{challenge.claim}"</p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2">
        <EloBadge elo={challenge.elo} />
        <span className="text-xs font-medium text-gray-400">{challenge.username}</span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${stanceColor}`}>
          {challenge.stance === "affirmative" ? "FOR" : "AGAINST"}
        </span>
        {wc && (
          <span className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
            {WC_LABEL[wc.type]?.(wc) ?? wc.type}
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-600">{timeAgo(challenge.createdAt)}</span>
      </div>

      {/* Action */}
      {isMine ? (
        challenge.status === "open" && onCancel && (
          <button
            onClick={() => onCancel(challenge.id)}
            className="self-end rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-500 hover:border-red-800 hover:text-red-400 transition-colors"
          >
            Withdraw
          </button>
        )
      ) : (
        <button
          onClick={() => onAccept(challenge.id)}
          disabled={accepting === challenge.id}
          className="self-end flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {accepting === challenge.id ? "Joining…" : <>Accept &amp; Debate <span>→</span></>}
        </button>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompetePage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId = (session?.user as any)?.id ?? "";

  const [tab, setTab] = useState<"board" | "teams" | "mine" | "leaderboard">("board");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [myChallenges, setMyChallenges] = useState<Challenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myElo, setMyElo] = useState<number>(1200);
  const [postOpen, setPostOpen] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ roomName: string; acceptedBy: string } | null>(null);

  function loadBoard() {
    if (!userId) return;
    fetch(`${SERVER}/api/challenges?excludeUserId=${userId}`)
      .then(r => r.json()).then(setChallenges).catch(() => {});
  }
  function loadMine() {
    if (!userId) return;
    fetch(`${SERVER}/api/challenges/mine?userId=${userId}`)
      .then(r => r.json()).then(setMyChallenges).catch(() => {});
  }
  function loadLeaderboard() {
    fetch(`${SERVER}/api/leaderboard`)
      .then(r => r.json()).then(data => setLeaderboard(Array.isArray(data) ? data : [])).catch(() => {});
  }

  useEffect(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/users/${userId}/profile`)
      .then(r => r.json()).then(d => setMyElo(d.elo ?? 1200)).catch(() => {});
    loadBoard();
    loadMine();
    loadLeaderboard();
  }, [userId]);

  // Socket: listen for challengeAccepted notification
  useEffect(() => {
    if (!userId) return;
    // Dynamically import socket to avoid SSR issues
    import("@/lib/socket").then(({ getSocket }) => {
      const username = (session?.user as any)?.username ?? session?.user?.name ?? "";
      const socket = getSocket({ id: userId, username });
      function onAccepted(data: { roomName: string; acceptedBy: string }) {
        setNotification(data);
        loadBoard();
        loadMine();
      }
      socket.on("challengeAccepted", onAccepted);
      return () => { socket.off("challengeAccepted", onAccepted); };
    });
  }, [userId]);

  async function handleAccept(challengeId: string) {
    setAccepting(challengeId);
    try {
      const res = await fetch(`${SERVER}/api/challenges/${challengeId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.roomName) {
        router.push(`/room/${data.roomName}`);
      } else {
        alert(data.error ?? "Failed to accept challenge");
        setAccepting(null);
      }
    } catch {
      setAccepting(null);
    }
  }

  async function handleCancel(challengeId: string) {
    await fetch(`${SERVER}/api/challenges/${challengeId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    loadMine();
    loadBoard();
  }

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-950 text-gray-600 text-sm">Loading…</div>;
  }

  const myUsername = (session?.user as any)?.username ?? session?.user?.name ?? "";

  return (
    <div className="flex h-full flex-col bg-gray-950 text-white">

      {/* Challenge accepted notification banner */}
      {notification && (
        <div className="flex items-center gap-3 bg-violet-900/80 border-b border-violet-700 px-4 py-3 text-sm">
          <span className="flex-1">
            <span className="font-semibold">{notification.acceptedBy}</span> accepted your challenge!
          </span>
          <button
            onClick={() => { router.push(`/room/${notification.roomName}`); setNotification(null); }}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold hover:bg-violet-500"
          >
            Join Room →
          </button>
          <button onClick={() => setNotification(null)} className="text-violet-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-800 px-4 py-3 pt-safe">
        <button onClick={() => router.push("/home")} className="rounded-lg p-1.5 text-gray-500 hover:text-gray-300 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 text-violet-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          <h1 className="text-base font-bold text-white">Challenge Board</h1>
        </div>
        <EloBadge elo={myElo} className="ml-1" />
        <div className="ml-auto">
          <button
            onClick={() => setPostOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
            </svg>
            Post Challenge
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-gray-800">
        {([["board", "1v1 Challenges"], ["teams", "Team Matches"], ["mine", "My Challenges"], ["leaderboard", "Leaderboard"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (key === "board") loadBoard(); if (key === "mine") loadMine(); if (key === "leaderboard") loadLeaderboard(); }}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
              tab === key ? "border-violet-500 text-violet-300" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {label}
            {key === "board" && challenges.length > 0 && (
              <span className="ml-1.5 rounded-full bg-violet-800 px-1.5 text-[10px] text-violet-200">{challenges.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* Team matches */}
        {tab === "teams" && <TeamMatches userId={userId} username={myUsername} />}

        {/* Open challenges board */}
        {tab === "board" && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {challenges.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-800 ring-1 ring-gray-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-gray-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-400">No open challenges</p>
                  <p className="mt-1 text-xs text-gray-600">Be the first — post a claim and dare someone to debate you.</p>
                </div>
                <button onClick={() => setPostOpen(true)} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors">
                  Post a Challenge
                </button>
              </div>
            ) : (
              challenges.map(c => (
                <ChallengeCard key={c.id} challenge={c} onAccept={handleAccept} accepting={accepting} />
              ))
            )}
          </div>
        )}

        {/* My challenges */}
        {tab === "mine" && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {myChallenges.length === 0 ? (
              <div className="py-20 text-center text-sm text-gray-600">You haven't posted any challenges yet.</div>
            ) : (
              myChallenges.map(c => (
                <div key={c.id}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      c.status === "open" ? "bg-emerald-900/50 text-emerald-400" :
                      c.status === "matched" ? "bg-violet-900/50 text-violet-400" :
                      "bg-gray-800 text-gray-500"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <ChallengeCard challenge={c} onAccept={handleAccept} accepting={accepting} isMine onCancel={handleCancel} />
                </div>
              ))
            )}
            <div className="pt-2">
              <button onClick={() => setPostOpen(true)} className="w-full rounded-xl border border-dashed border-gray-700 py-3 text-xs text-gray-600 hover:border-violet-700 hover:text-violet-400 transition-colors">
                + Post a new challenge
              </button>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {tab === "leaderboard" && (
          <div className="max-w-lg mx-auto">
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 overflow-hidden">
              {leaderboard.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-600">No ranked players yet.</div>
              ) : (
                leaderboard.map((entry, i) => {
                  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                  const isMe = entry.id === userId;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => router.push(`/u/${encodeURIComponent(entry.username)}`)}
                      className={`flex w-full items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0 text-left transition-colors hover:bg-gray-800/50 ${isMe ? "bg-violet-950/30" : ""}`}
                    >
                      <span className="w-6 text-center text-xs text-gray-500">{medal ?? `${i + 1}`}</span>
                      <span className={`flex-1 text-sm font-medium ${isMe ? "text-violet-300" : "text-gray-200"}`}>
                        {entry.username}{isMe && <span className="ml-1 text-xs text-gray-500">(you)</span>}
                      </span>
                      <span className="text-xs text-gray-500">{Number(entry.wins)}W {Number(entry.losses)}L</span>
                      <EloBadge elo={entry.elo} />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Post modal */}
      {postOpen && (
        <PostModal onClose={() => setPostOpen(false)} onPosted={() => { loadBoard(); loadMine(); }} />
      )}
    </div>
  );
}
