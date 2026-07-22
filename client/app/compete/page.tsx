"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import TeamMatches from "@/components/TeamMatches";
import LiveMatches, { useLiveMatches } from "@/components/LiveMatches";
import { api } from "@/lib/api";
import { Zap, X, Trophy, Medal, Check, Lock, GraduationCap } from "@/lib/icons";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// Below this many ranked matches a competitor's rating is still settling, so it's
// shown as provisional. Mirrors BG_PROVISIONAL_MATCHES on the server.
const PROVISIONAL_MATCHES = 5;

interface BattleEligibility {
  eligible: boolean;
  claimsRated: number; ratedNeed: number;
  arenaWins: number; arenaNeed: number;
  battleMatches: number; provisional: boolean;
}

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
  battleMatches?: number;
}

interface LeaderboardEntry {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  battleMatches?: number;
}

const WC_LABEL: Record<string, (wc: any) => string> = {
  exchanges: (wc) => `${wc.limit} exchanges`,
  time: (wc) => `${wc.minutes} min`,
  proposition: (wc) => `Prop ≥${wc.threshold}%`,
};

// One-line explanation of how each win condition actually resolves — surfaced in
// the post modal so the rules are legible before you commit.
const WC_HELP: Record<string, string> = {
  exchanges: "Ends after this many back-and-forth exchanges, then the AI judge reads the full transcript and picks the stronger case.",
  time: "You each have this long to argue. When the clock runs out, the AI judge decides the winner from the transcript.",
  proposition: "A live persuasion bar moves as claims land and get scored. The first side to push it past this threshold wins.",
};

// EloBadge tier colors are intentional DATA (yellow/violet/sky/gray rank tiers),
// each tuned for AA in light + dark — not chrome. Do not fold these into the
// green/orange chrome roles.
function EloBadge({ elo, provisional = false, className = "" }: { elo: number; provisional?: boolean; className?: string }) {
  const color =
    elo >= 1600 ? "text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800 bg-yellow-100 dark:bg-yellow-950/40" :
    elo >= 1400 ? "text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-800 bg-violet-100 dark:bg-violet-950/40" :
    elo >= 1200 ? "text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-800 bg-sky-100 dark:bg-sky-950/40" :
    "text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900";
  return (
    <span
      title={provisional ? "Provisional rating — still settling over the first few ranked matches" : undefined}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${color} ${className}`}
    >
      <Zap className="h-3 w-3 shrink-0" aria-hidden />{elo}{provisional && <span className="font-bold opacity-70">?</span>}
    </span>
  );
}

// Is a competitor still provisionally rated? Undefined battleMatches (older API
// payloads) reads as settled so we never wrongly brand an established player.
const isProvisional = (battleMatches?: number) => typeof battleMatches === "number" && battleMatches < PROVISIONAL_MATCHES;

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Shared empty state ────────────────────────────────────────────────────────

function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center animate-fadeIn">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
        {icon}
      </div>
      <div>
        <p className="font-display text-base font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{hint}</p>
      </div>
      {action}
    </div>
  );
}

const BoltIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>
);

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
  const [error, setError] = useState("");

  const wc: WinCondition =
    wcType === "exchanges" ? { type: "exchanges", limit } :
    wcType === "time" ? { type: "time", minutes } :
    { type: "proposition", threshold };

  async function submit() {
    if (!claim.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api(`${SERVER}/api/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, claim: claim.trim(), stance, winCondition: wc }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't post that challenge.");
        return;
      }
      onPosted();
      onClose();
    } catch {
      setError("Couldn't post that challenge.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-elevated animate-fadeInUp" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-4">Post a Challenge</h2>

        {/* Claim */}
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Your claim</label>
        <textarea
          autoFocus
          value={claim}
          onChange={e => setClaim(e.target.value)}
          placeholder="e.g. Universal basic income would reduce poverty"
          rows={3}
          className="w-full resize-none rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-brand-green focus:outline-none"
        />

        {/* Stance */}
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-4 mb-1.5">You are arguing</label>
        <div className="flex gap-2">
          {(["affirmative", "negative"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStance(s)}
              className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                stance === s
                  ? s === "affirmative"
                    ? "border-emerald-500 bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                    : "border-rose-500 bg-rose-100 dark:border-rose-600 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"
                  : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              {s === "affirmative" ? "FOR this claim" : "AGAINST this claim"}
            </button>
          ))}
        </div>

        {/* Win condition */}
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-4 mb-1.5">Win condition</label>
        <div className="flex gap-2 mb-3">
          {(["exchanges", "time", "proposition"] as const).map(t => (
            <button
              key={t}
              onClick={() => setWcType(t)}
              className={`flex-1 rounded-lg border py-2 text-xs font-semibold capitalize transition-colors ${
                wcType === t ? "border-brand-green bg-brand-green/10 text-brand-green-ink dark:text-brand-green" : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {wcType === "exchanges" && (
          <div className="flex items-center gap-3">
            <input type="range" min={4} max={20} value={limit} onChange={e => setLimit(+e.target.value)} className="flex-1 accent-brand-green" />
            <span className="w-20 text-right text-xs text-gray-700 dark:text-gray-300">{limit} exchanges</span>
          </div>
        )}
        {wcType === "time" && (
          <div className="flex items-center gap-3">
            <input type="range" min={3} max={30} value={minutes} onChange={e => setMinutes(+e.target.value)} className="flex-1 accent-brand-green" />
            <span className="w-20 text-right text-xs text-gray-700 dark:text-gray-300">{minutes} minutes</span>
          </div>
        )}
        {wcType === "proposition" && (
          <div className="flex items-center gap-3">
            <input type="range" min={50} max={90} step={5} value={threshold} onChange={e => setThreshold(+e.target.value)} className="flex-1 accent-brand-green" />
            <span className="w-20 text-right text-xs text-gray-700 dark:text-gray-300">≥{threshold}%</span>
          </div>
        )}

        {/* How it resolves + what's at stake */}
        <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-[11px] leading-relaxed text-gray-600 dark:bg-gray-800/60 dark:text-gray-400">
          {WC_HELP[wcType]} A win raises your ELO and drops your opponent&rsquo;s — by more when you beat a higher-rated debater.
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || !claim.trim()}
            className="flex-1 rounded-xl bg-orange-700 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-40 active:scale-[0.98] motion-reduce:active:scale-100"
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
    ? "border-emerald-300 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
    : "border-rose-300 dark:border-rose-800 bg-rose-100 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400";

  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-elevated">
      {/* Claim */}
      <p className="text-sm font-medium leading-relaxed text-gray-900 dark:text-gray-100">&ldquo;{challenge.claim}&rdquo;</p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2">
        <EloBadge elo={challenge.elo} provisional={isProvisional(challenge.battleMatches)} />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{challenge.username}</span>
        <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${stanceColor}`}>
          {challenge.stance === "affirmative" ? "FOR" : "AGAINST"}
        </span>
        {wc && (
          <span className="rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-600 dark:text-gray-400">
            {WC_LABEL[wc.type]?.(wc) ?? wc.type}
          </span>
        )}
        <span className="ml-auto text-[11px] text-gray-500 dark:text-gray-400">{timeAgo(challenge.createdAt)}</span>
      </div>

      {/* Action */}
      {isMine ? (
        challenge.status === "open" && onCancel && (
          <button
            onClick={() => onCancel(challenge.id)}
            className="self-end rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:border-red-300 hover:text-red-600 dark:hover:border-red-800 dark:hover:text-red-400 transition-colors"
          >
            Withdraw
          </button>
        )
      ) : (
        <button
          onClick={() => onAccept(challenge.id)}
          disabled={accepting === challenge.id}
          className="self-end inline-flex items-center gap-1.5 rounded-xl bg-orange-700 px-4 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-50 active:scale-[0.98] motion-reduce:active:scale-100"
        >
          {accepting === challenge.id ? "Joining…" : <>Accept &amp; Debate <span aria-hidden>→</span></>}
        </button>
      )}
    </div>
  );
}

// ── Entry gate ────────────────────────────────────────────────────────────────

function RequirementRow({ met, label, detail, have, need, cta }: {
  met: boolean; label: string; detail: string; have: number; need: number; cta: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${met ? "bg-brand-green/15 text-brand-green-ink dark:text-brand-green" : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"}`}>
        {met ? <Check className="h-5 w-5" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{detail}</p>
      </div>
      {met ? (
        <span className="shrink-0 text-xs font-semibold text-brand-green-ink dark:text-brand-green">Done</span>
      ) : (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs font-bold tabular-nums text-gray-700 dark:text-gray-200">{Math.min(have, need)} / {need}</span>
          {cta}
        </div>
      )}
    </div>
  );
}

function EntryGate({ eligibility, onGoTo }: { eligibility: BattleEligibility; onGoTo: (href: string) => void }) {
  const ratedMet = eligibility.claimsRated >= eligibility.ratedNeed;
  const arenaMet = eligibility.arenaWins >= eligibility.arenaNeed;
  const done = (ratedMet ? 1 : 0) + (arenaMet ? 1 : 0);
  return (
    <div className="mx-auto max-w-xl animate-fadeIn">
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-hero dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-5 dark:border-gray-800 dark:bg-gray-950/40">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400"><Lock className="h-5 w-5" aria-hidden /></span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold tracking-tight text-gray-900 dark:text-white">Earn your way into Battle Grounds</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Ranked 1v1 and team debates unlock once you&rsquo;ve proven yourself in Training Grounds — <span className="font-semibold text-gray-700 dark:text-gray-300">{done} of 2</span> done.</p>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-5">
          <RequirementRow
            met={ratedMet}
            label="Earn a Grounds Score"
            detail="Make verified claims in debates to build a credibility rating."
            have={eligibility.claimsRated} need={eligibility.ratedNeed}
            cta={<button onClick={() => onGoTo("/lobby")} className="text-[11px] font-semibold text-orange-700 hover:text-orange-600 dark:text-orange-400">Go debate →</button>}
          />
          <RequirementRow
            met={arenaMet}
            label="Win a Training Grounds match"
            detail="Beat a bot in a ranked practice debate on a curated topic."
            have={eligibility.arenaWins} need={eligibility.arenaNeed}
            cta={<button onClick={() => onGoTo("/arena")} className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 hover:text-orange-600 dark:text-orange-400"><GraduationCap className="h-3.5 w-3.5" aria-hidden />Train →</button>}
          />
        </div>
        <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            This keeps the ladder meaningful — everyone you face has learned the ropes first. You can still watch live matches and browse the leaderboard while you qualify.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompetePage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId = (session?.user as any)?.id ?? "";

  const [tab, setTab] = useState<"live" | "board" | "teams" | "mine" | "leaderboard">("board");
  const { matches: liveMatches } = useLiveMatches();
  const liveByUser = new Map<string, string>();
  for (const m of liveMatches) for (const id of m.participantIds) liveByUser.set(id, m.roomName);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [myChallenges, setMyChallenges] = useState<Challenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myElo, setMyElo] = useState<number>(1200);
  const [eligibility, setEligibility] = useState<BattleEligibility | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ roomName: string; acceptedBy: string } | null>(null);

  // Default to unlocked until eligibility is known, so the gate never flashes for
  // players who are actually allowed in.
  const locked = eligibility ? !eligibility.eligible : false;
  const myProvisional = isProvisional(eligibility?.battleMatches);

  function loadBoard() {
    if (!userId) return;
    api(`${SERVER}/api/challenges?excludeUserId=${userId}`)
      .then(r => r.json()).then(setChallenges).catch(() => {});
  }
  function loadMine() {
    if (!userId) return;
    api(`${SERVER}/api/challenges/mine?userId=${userId}`)
      .then(r => r.json()).then(setMyChallenges).catch(() => {});
  }
  function loadLeaderboard() {
    api(`${SERVER}/api/leaderboard`)
      .then(r => r.json()).then(data => setLeaderboard(Array.isArray(data) ? data : [])).catch(() => {});
  }

  useEffect(() => {
    if (!userId) return;
    api(`${SERVER}/api/users/${userId}/profile`)
      .then(r => r.json()).then(d => setMyElo(d.elo ?? 1200)).catch(() => {});
    api(`${SERVER}/api/battle/eligibility`)
      .then(r => r.json()).then(d => setEligibility(d as BattleEligibility)).catch(() => {});
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
      const socket = getSocket();
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
      const res = await api(`${SERVER}/api/challenges/${challengeId}/accept`, {
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
    await api(`${SERVER}/api/challenges/${challengeId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    loadMine();
    loadBoard();
  }

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="h-2 w-2 rounded-full bg-brand-green motion-safe:animate-pulse" />
          Loading Battle Grounds…
        </div>
      </div>
    );
  }

  const myUsername = (session?.user as any)?.username ?? session?.user?.name ?? "";

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">

      {/* Challenge accepted notification banner */}
      {notification && (
        <div className="flex items-center gap-3 border-b border-brand-green/30 bg-brand-green/10 dark:bg-brand-green/15 px-4 py-3 text-sm animate-fadeIn">
          <span className="flex-1 text-gray-800 dark:text-gray-100">
            <span className="font-semibold text-brand-green-ink dark:text-brand-green">{notification.acceptedBy}</span> accepted your challenge!
          </span>
          <button
            onClick={() => { router.push(`/room/${notification.roomName}`); setNotification(null); }}
            className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600"
          >
            Join Room →
          </button>
          <button onClick={() => setNotification(null)} aria-label="Close" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"><X className="h-4 w-4" aria-hidden /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-4 py-3 pt-safe">
        <button onClick={() => router.push("/home")} className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800/50 dark:hover:text-gray-300 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0 text-brand-green-ink dark:text-brand-green">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          <h1 className="truncate font-display text-lg md:text-xl font-bold tracking-tight text-gray-900 dark:text-white">Battle Grounds</h1>
        </div>
        <EloBadge elo={myElo} provisional={myProvisional} className="ml-1 shrink-0" />
        <div className="ml-auto">
          {locked ? (
            <button
              onClick={() => setTab("board")}
              title="Complete the entry requirements to post a challenge"
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-500 transition-colors hover:border-gray-400 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden /> Locked
            </button>
          ) : (
            <button
              onClick={() => setPostOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-700 px-3 py-2 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              Post Challenge
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
        {([["live", "Live"], ["board", "1v1 Challenges"], ["teams", "Team Matches"], ["mine", "My Challenges"], ["leaderboard", "Leaderboard"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (key === "board") loadBoard(); if (key === "mine") loadMine(); if (key === "leaderboard") loadLeaderboard(); }}
            className={`shrink-0 whitespace-nowrap px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
              tab === key ? "border-brand-green text-brand-green-ink dark:text-brand-green" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {label}
            {key === "board" && challenges.length > 0 && (
              <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">{challenges.length}</span>
            )}
            {key === "live" && liveMatches.length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{liveMatches.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* The entry gate stands in for the interactive tabs until the player
            qualifies. Live + Leaderboard stay open — you can watch and browse. */}
        {locked && eligibility && tab !== "live" && tab !== "leaderboard" && (
          <EntryGate eligibility={eligibility} onGoTo={(href) => router.push(href)} />
        )}

        {/* Live matches */}
        {tab === "live" && (
          <div className="mx-auto max-w-4xl">
            <LiveMatches variant="grid" />
          </div>
        )}

        {/* Team matches */}
        {!locked && tab === "teams" && <TeamMatches userId={userId} username={myUsername} />}

        {/* Open challenges board */}
        {!locked && tab === "board" && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {challenges.length === 0 ? (
              <EmptyState
                icon={BoltIcon}
                title="No open challenges"
                hint="Be the first — post a claim and dare someone to debate you."
                action={
                  <button onClick={() => setPostOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 active:scale-[0.98] motion-reduce:active:scale-100">
                    Post a Challenge
                  </button>
                }
              />
            ) : (
              challenges.map(c => (
                <ChallengeCard key={c.id} challenge={c} onAccept={handleAccept} accepting={accepting} />
              ))
            )}
          </div>
        )}

        {/* My challenges */}
        {!locked && tab === "mine" && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {myChallenges.length === 0 ? (
              <EmptyState
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
                  </svg>
                }
                title="No challenges yet"
                hint="Post a claim and dare someone to debate you."
              />
            ) : (
              myChallenges.map(c => (
                <div key={c.id}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold capitalize ${
                      c.status === "open" ? "bg-brand-green/15 text-brand-green-ink dark:text-brand-green" :
                      c.status === "matched" ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300" :
                      "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <ChallengeCard challenge={c} onAccept={handleAccept} accepting={accepting} isMine onCancel={handleCancel} />
                </div>
              ))
            )}
            <div className="pt-2">
              <button onClick={() => setPostOpen(true)} className="w-full rounded-xl border border-dashed border-gray-300 dark:border-gray-700 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:border-orange-400 hover:text-orange-700 dark:hover:border-orange-500/60 dark:hover:text-orange-400 transition-colors">
                + Post a new challenge
              </button>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {tab === "leaderboard" && (
          <div className="max-w-lg mx-auto">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-card overflow-hidden">
              {leaderboard.length === 0 ? (
                <EmptyState
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
                    </svg>
                  }
                  title="No ranked players yet"
                  hint="Win ranked debates to earn a spot on the board."
                />
              ) : (
                leaderboard.map((entry, i) => {
                  const medal =
                    i === 0 ? <Trophy className="mx-auto h-4 w-4 text-amber-500" aria-hidden /> :
                    i === 1 ? <Medal className="mx-auto h-4 w-4 text-gray-400" aria-hidden /> :
                    i === 2 ? <Medal className="mx-auto h-4 w-4 text-amber-700" aria-hidden /> :
                    null;
                  const isMe = entry.id === userId;
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 last:border-0 ${isMe ? "bg-brand-green/10 dark:bg-brand-green/10" : ""}`}
                    >
                      <span className="w-6 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">{medal ?? `${i + 1}`}</span>
                      <button
                        onClick={() => router.push(`/u/${encodeURIComponent(entry.username)}`)}
                        className={`flex-1 truncate text-left text-sm font-medium hover:underline ${isMe ? "text-brand-green-ink dark:text-brand-green" : "text-gray-800 dark:text-gray-200"}`}
                      >
                        {entry.username}{isMe && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(you)</span>}
                      </button>
                      {liveByUser.has(entry.id) && (
                        <button
                          onClick={() => router.push(`/room/${liveByUser.get(entry.id)}?spectate=1`)}
                          className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white transition-colors hover:bg-red-500"
                        >
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                          </span>
                          Watch
                        </button>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400">{Number(entry.wins)}W {Number(entry.losses)}L</span>
                      <EloBadge elo={entry.elo} provisional={isProvisional(entry.battleMatches)} />
                    </div>
                  );
                })
              )}
            </div>
            {leaderboard.length > 0 && (
              <p className="mt-3 px-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                <span className="font-bold">?</span> marks a provisional rating — still settling over a player&rsquo;s first {PROVISIONAL_MATCHES} ranked matches.
              </p>
            )}
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
