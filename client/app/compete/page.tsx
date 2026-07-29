"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TeamMatches from "@/components/TeamMatches";
import { useLiveMatches } from "@/components/LiveMatches";
import PostChallengeModal, { WC_LABEL } from "@/components/PostChallengeModal";
import { api } from "@/lib/api";
import { Zap, X, Trophy, Medal, Check, Lock, GraduationCap, Scale } from "@/lib/icons";
import { ChevronRight, Swords, type LucideIcon } from "lucide-react";

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

interface Standing {
  elo: number; wins: number; losses: number; draws: number;
  battleMatches: number; provisional: boolean;
  rank: number | null; total: number | null;
}

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
  id: string; username: string; elo: number;
  wins: number; losses: number; battleMatches?: number;
}

interface Match {
  roomName: string; topic: string; opponentName: string;
  won: boolean; drawn: boolean; eloDelta: number; completedAt: string | null;
}

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

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : `${Math.floor(d / 7)}w ago`;
}

// ── Main page ──────────────────────────────────────────────────────────────
//
// /compete used to be five tabs over an empty frame: you landed on a board of
// other people's challenges with no sense of your own standing, no record of
// what you'd played, and a ladder one click away that you had to go looking
// for. The challenge board is still the engine of the mode, so it keeps the
// middle of the page — but your rating, your matches and the ladder are the
// reason to come back, and they're on the page now.
export default function CompetePage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId = (session?.user as any)?.id ?? "";
  const myUsername = (session?.user as any)?.username ?? session?.user?.name ?? "";

  const [board, setBoard] = useState<"open" | "mine" | "teams">("open");
  const { matches: liveMatches } = useLiveMatches();
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [myChallenges, setMyChallenges] = useState<Challenge[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [history, setHistory] = useState<Match[] | null>(null);
  const [eligibility, setEligibility] = useState<BattleEligibility | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ roomName: string; acceptedBy: string } | null>(null);
  // A failed accept used to be an alert(); it's a line above the board now, so
  // the reason stays on screen next to the challenge it belongs to.
  const [acceptError, setAcceptError] = useState("");

  // Default to unlocked until eligibility is known, so the gate never flashes for
  // players who are actually allowed in.
  const locked = eligibility ? !eligibility.eligible : false;

  // Ranked only. A rapid round on the Battle Grounds page would send someone
  // into a mode with different rules under this heading.
  const liveRanked = useMemo(() => liveMatches.filter(m => !m.isRapid), [liveMatches]);
  const liveByUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const match of liveRanked) for (const id of match.participantIds) m.set(id, match.roomName);
    return m;
  }, [liveRanked]);

  const loadBoard = useCallback(() => {
    if (!userId) return;
    api(`${SERVER}/api/challenges?excludeUserId=${userId}`)
      .then(r => (r.ok ? r.json() : [])).then(d => setChallenges(Array.isArray(d) ? d : [])).catch(() => setChallenges([]));
  }, [userId]);

  const loadMine = useCallback(() => {
    if (!userId) return;
    api(`${SERVER}/api/challenges/mine?userId=${userId}`)
      .then(r => (r.ok ? r.json() : [])).then(d => setMyChallenges(Array.isArray(d) ? d : [])).catch(() => setMyChallenges([]));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    api(`${SERVER}/api/battle/me`).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setStanding(d); }).catch(() => {});
    api(`${SERVER}/api/battle/eligibility`).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setEligibility(d as BattleEligibility); }).catch(() => {});
    api(`${SERVER}/api/leaderboard`).then(r => (r.ok ? r.json() : []))
      .then(d => setLeaderboard(Array.isArray(d) ? d : [])).catch(() => setLeaderboard([]));
    api(`${SERVER}/api/users/${userId}/matches?mode=ranked`).then(r => (r.ok ? r.json() : []))
      .then(d => setHistory(Array.isArray(d) ? d : [])).catch(() => setHistory([]));
    loadBoard();
    loadMine();
  }, [userId, loadBoard, loadMine]);

  // Socket: someone took your challenge.
  useEffect(() => {
    if (!userId) return;
    let off: (() => void) | undefined;
    import("@/lib/socket").then(({ getSocket }) => {
      const socket = getSocket();
      const onAccepted = (data: { roomName: string; acceptedBy: string }) => {
        setNotification(data);
        loadBoard();
        loadMine();
      };
      socket.on("challengeAccepted", onAccepted);
      off = () => socket.off("challengeAccepted", onAccepted);
    });
    return () => off?.();
  }, [userId, loadBoard, loadMine]);

  async function handleAccept(challengeId: string) {
    setAccepting(challengeId);
    try {
      const res = await api(`${SERVER}/api/challenges/${challengeId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.roomName) { router.push(`/room/${data.roomName}`); return; }
      setAcceptError(data.error ?? "Couldn't accept that challenge.");
    } catch {
      setAcceptError("Couldn't accept that challenge.");
    }
    setAccepting(null);
  }

  async function handleCancel(challengeId: string) {
    await api(`${SERVER}/api/challenges/${challengeId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }).catch(() => {});
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

  const openCount = challenges?.length ?? 0;
  // The badge counts challenges still waiting for a taker. Counting matched and
  // closed ones too would advertise work that isn't there.
  const mineCount = myChallenges?.filter(c => c.status === "open").length ?? 0;
  // Open ones first — a long history of matched challenges would otherwise bury
  // the one you're waiting on.
  const mineSorted = myChallenges
    ? [...myChallenges].sort((a, b) => Number(b.status === "open") - Number(a.status === "open"))
    : null;
  const gateDone = eligibility
    ? (eligibility.claimsRated >= eligibility.ratedNeed ? 1 : 0) + (eligibility.arenaWins >= eligibility.arenaNeed ? 1 : 0)
    : 0;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:py-8">

        {/* Someone accepted your challenge — the room is already open. */}
        {notification && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-green/40 bg-brand-green/10 p-4 animate-fadeIn dark:bg-brand-green/15">
            <span className="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100">
              <span className="font-semibold text-brand-green-ink dark:text-brand-green">{notification.acceptedBy}</span> accepted your challenge.
            </span>
            <button onClick={() => { router.push(`/room/${notification.roomName}`); setNotification(null); }}
              className="inline-flex min-h-11 items-center rounded-xl bg-orange-700 px-4 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600">
              Join the room →
            </button>
            <button onClick={() => setNotification(null)} aria-label="Dismiss"
              className="grid h-11 w-11 place-items-center rounded-xl text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white bg-hero-glow shadow-hero dark:border-gray-800 dark:bg-gray-900">
          <div className="grid gap-7 p-5 sm:p-6 md:p-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand-green-ink dark:text-brand-green">
                  <Swords className="h-4 w-4" aria-hidden />
                  Battle Grounds
                </p>
                {liveRanked.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] shadow-card dark:border-gray-800 dark:bg-gray-950/60">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                    <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-100">{liveRanked.length}</span>
                    <span className="text-gray-500 dark:text-gray-400">live now</span>
                  </span>
                )}
                {openCount > 0 && (
                  <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-500 shadow-card dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-400">
                    <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-100">{openCount}</span> open {openCount === 1 ? "challenge" : "challenges"}
                  </span>
                )}
              </div>

              <h1 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight text-balance text-gray-900 dark:text-white md:text-4xl">
                Pick the claim. Pick the fight.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-pretty text-gray-600 dark:text-gray-300">
                Post a claim from the library, choose the side you&rsquo;ll defend and how the match ends.
                Whoever takes it argues you on the record — every claim scored, an AI judge on the transcript,
                and your rating moves either way.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                {locked ? (
                  <Link href="/arena"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-orange-700 px-6 py-3.5 text-base font-semibold text-white shadow-glow transition-transform duration-150 hover:bg-orange-600 active:scale-[0.99] motion-reduce:active:scale-100">
                    <GraduationCap className="h-5 w-5" aria-hidden />
                    Qualify in Training Grounds
                  </Link>
                ) : (
                  <button onClick={() => setPostOpen(true)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-orange-700 px-6 py-3.5 text-base font-semibold text-white shadow-glow transition-transform duration-150 hover:bg-orange-600 active:scale-[0.99] motion-reduce:active:scale-100">
                    Post a challenge <span aria-hidden>→</span>
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                  <Stake title="Your rating moves on every completed match — up more when you beat a higher-rated opponent.">Rating on the line</Stake>
                  <Stake title="Every message is scored on relevance, evidence, logic and impact; a judge reads the whole transcript at the end.">AI judged</Stake>
                </div>
              </div>

              {locked && eligibility && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{gateDone} of 2</span> requirements done —
                  you can watch and browse the ladder meanwhile.
                </p>
              )}
            </div>

            <StandingCard standing={standing} history={history} locked={locked} />
          </div>
        </section>

        {/* ── The gate, when you haven't earned in yet ──────────────────────── */}
        {locked && eligibility && <EntryGate eligibility={eligibility} />}

        {/* ── The board ────────────────────────────────────────────────────── */}
        {!locked && (
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
                {([["open", "Open", openCount], ["mine", "Yours", mineCount], ["teams", "Teams", null]] as const).map(([k, label, n]) => (
                  <button key={k} onClick={() => setBoard(k)} aria-pressed={board === k}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors ${board === k
                      ? "bg-white text-brand-green-ink shadow-sm dark:bg-gray-900 dark:text-brand-green"
                      : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"}`}>
                    {label}
                    {typeof n === "number" && n > 0 && (
                      <span className="rounded-full bg-gray-200 px-1.5 text-[11px] font-bold tabular-nums text-gray-700 dark:bg-gray-700 dark:text-gray-200">{n}</span>
                    )}
                  </button>
                ))}
              </div>
              {board !== "teams" && (
                <button onClick={() => setPostOpen(true)}
                  className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 px-3.5 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900">
                  + Post
                </button>
              )}
            </div>

            {acceptError && (
              <p role="alert" className="mb-3 rounded-xl bg-rose-100 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{acceptError}</p>
            )}

            {board === "teams" ? (
              <TeamMatches userId={userId} username={myUsername} />
            ) : board === "open" ? (
              challenges === null
                ? <SkeletonRows />
                : challenges.length === 0
                  ? <Empty title="No open challenges" hint="Be the first — post a claim and dare someone to take the other side."
                      action={<button onClick={() => setPostOpen(true)} className="inline-flex min-h-11 items-center rounded-xl bg-orange-700 px-5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600">Post a challenge</button>} />
                  : <div className="grid gap-3 md:grid-cols-2">
                      {challenges.map(c => <ChallengeCard key={c.id} challenge={c} onAccept={handleAccept} accepting={accepting} />)}
                    </div>
            ) : (
              mineSorted === null
                ? <SkeletonRows />
                : mineSorted.length === 0
                  ? <Empty title="You haven't posted one yet" hint="Put a claim up and let someone come to you."
                      action={<button onClick={() => setPostOpen(true)} className="inline-flex min-h-11 items-center rounded-xl bg-orange-700 px-5 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-orange-600">Post a challenge</button>} />
                  : <div className="grid gap-3 md:grid-cols-2">
                      {mineSorted.map(c => (
                        <ChallengeCard key={c.id} challenge={c} onAccept={handleAccept} accepting={accepting} isMine onCancel={handleCancel} />
                      ))}
                    </div>
            )}
          </section>
        )}

        {/* ── Your matches + the ladder ─────────────────────────────────────── */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Your ranked matches</h2>
              {history && history.length > 0 && (
                <Link href="/profile" className="-my-3 inline-flex min-h-11 items-center py-3 text-xs font-semibold text-orange-700 transition-colors hover:text-orange-600 dark:text-orange-400">Full history</Link>
              )}
            </div>
            <div className="space-y-2.5">
              {history === null
                ? <SkeletonRows n={3} />
                : history.length === 0
                  ? <Empty title="No ranked matches yet" hint="Every finished match leaves a tape here — the bar's trajectory, every claim scored, and what the judge read." small />
                  : history.slice(0, 5).map(m => <MatchRow key={m.roomName} m={m} />)}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">The ladder</h2>
              {standing?.rank && standing.total && (
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">You&rsquo;re #{standing.rank} of {standing.total}</span>
              )}
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900">
              {leaderboard === null
                ? <div className="shimmer-track h-64" />
                : leaderboard.length === 0
                  ? <p className="p-5 text-sm text-gray-600 dark:text-gray-400">Nobody is rated yet. Win a ranked match and you&rsquo;ll open the ladder.</p>
                  : (
                    <ol>
                      {leaderboard.slice(0, 8).map((row, i) => (
                        <LadderRow key={row.id} row={row} place={i + 1} me={row.id === userId} liveRoom={liveByUser.get(row.id)} />
                      ))}
                      {/* Your own row, when you're on the board but below the fold. */}
                      {standing?.rank && standing.rank > 8 && (
                        <LadderRow
                          row={{ id: userId, username: myUsername, elo: standing.elo, wins: standing.wins, losses: standing.losses, battleMatches: standing.battleMatches }}
                          place={standing.rank} me separated liveRoom={liveByUser.get(userId)} />
                      )}
                    </ol>
                  )}
            </div>
            {leaderboard && leaderboard.length > 0 && (
              <p className="mt-2 px-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                <span className="font-bold">?</span> marks a provisional rating — still settling over a player&rsquo;s first {PROVISIONAL_MATCHES} ranked matches.
              </p>
            )}
          </div>
        </section>

        {/* ── Live ranked matches. Hidden when there are none. ──────────────── */}
        {liveRanked.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-brand-red opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-red" />
              </span>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">Live now</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {liveRanked.slice(0, 3).map(m => (
                <Link key={m.roomName} href={`/room/${m.roomName}${m.participantIds.includes(userId) ? "" : "?spectate=1"}`}
                  className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                    </span>
                    <span className="font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Live</span>
                    <span className="rounded-full border border-gray-200 bg-gray-100 px-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {m.type === "team" ? `${m.teamSize}v${m.teamSize}` : "1v1"}
                    </span>
                    <span className="ml-auto tabular-nums">{m.viewers} watching</span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">&ldquo;{m.topic}&rdquo;</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {m.sideA.map(p => p.username).join(", ")} vs {m.sideB.map(p => p.username).join(", ")}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Where else to go ──────────────────────────────────────────────── */}
        <section className="grid gap-3 sm:grid-cols-2">
          <SideDoor href="/rapid" Icon={Zap} title="Rapid Fire"
            blurb="No setup, no waiting for an opponent — queued against whoever disagrees." />
          <SideDoor href="/arena" Icon={GraduationCap} title="Training Grounds"
            blurb="Practise against a bot on a curated claim. Nothing on the line." />
          <SideDoor href="/tournaments" Icon={Trophy} title="Tournaments"
            blurb="One claim, single elimination. Unranked — the title is the prize." />
        </section>

      </div>

      {postOpen && (
        <PostChallengeModal onClose={() => setPostOpen(false)} onPosted={() => { loadBoard(); loadMine(); setBoard("mine"); }} />
      )}
    </div>
  );
}

// ── Standing ───────────────────────────────────────────────────────────────
function StandingCard({ standing, history, locked }: { standing: Standing | null; history: Match[] | null; locked: boolean }) {
  const played = (standing?.wins ?? 0) + (standing?.losses ?? 0) + (standing?.draws ?? 0);
  const winPct = played > 0 ? Math.round(((standing?.wins ?? 0) / played) * 100) : 0;
  const form = (history ?? []).slice(0, 5).reverse();   // oldest to newest, left to right
  const last = history?.[0];

  return (
    <aside className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 shadow-card dark:border-gray-800 dark:bg-gray-950/50">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Your rating</p>
        {standing?.provisional && played > 0 && (
          <span className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Provisional
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-4xl font-bold tabular-nums text-gray-900 dark:text-white">
          {standing ? standing.elo : "—"}
        </span>
        {last && last.eloDelta !== 0 && (
          <span className={`text-sm font-semibold tabular-nums ${last.eloDelta > 0
            ? "text-brand-green-ink dark:text-brand-green" : "text-brand-red-ink dark:text-brand-red"}`}>
            {last.eloDelta > 0 ? "+" : ""}{last.eloDelta}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {standing?.rank && standing.total
          ? <><span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">#{standing.rank}</span> of {standing.total} on the ladder</>
          : locked ? "Unrated until you qualify" : "Unranked — win a match to join the ladder"}
      </p>

      <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
        {played > 0 ? (
          <>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                {standing!.wins}W · {standing!.losses}L{standing!.draws > 0 ? ` · ${standing!.draws}D` : ""}
              </span>
              <span className="text-gray-500 dark:text-gray-400 tabular-nums">{winPct}% won</span>
            </div>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
              <div className="bg-brand-green transition-[width] duration-500" style={{ width: `${winPct}%` }} />
            </div>
            {standing!.provisional && (
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                {PROVISIONAL_MATCHES - standing!.battleMatches} more {PROVISIONAL_MATCHES - standing!.battleMatches === 1 ? "match" : "matches"} and your rating settles.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">No ranked matches yet — your record starts with the first one.</p>
        )}

        {form.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Form</span>
            <span className="flex gap-1">
              {form.map(m => (
                <span key={m.roomName}
                  title={`${m.drawn ? "Drew with" : m.won ? "Beat" : "Lost to"} ${m.opponentName}`}
                  className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold text-white ${m.drawn
                    ? "bg-gray-500 dark:bg-gray-600" : m.won ? "bg-emerald-700" : "bg-rose-700"}`}>
                  {m.drawn ? "D" : m.won ? "W" : "L"}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── A posted challenge ─────────────────────────────────────────────────────
function ChallengeCard({ challenge, onAccept, accepting, isMine, onCancel }: {
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
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700">
      {isMine && (
        <span className={`self-start rounded-md px-1.5 py-0.5 text-[11px] font-bold capitalize ${
          challenge.status === "open" ? "bg-brand-green/15 text-brand-green-ink dark:text-brand-green" :
          challenge.status === "matched" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" :
          "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
          {challenge.status}
        </span>
      )}

      <p className="text-sm font-medium leading-relaxed text-gray-900 dark:text-gray-100">&ldquo;{challenge.claim}&rdquo;</p>

      <div className="flex flex-wrap items-center gap-2">
        <EloBadge elo={challenge.elo} provisional={isProvisional(challenge.battleMatches)} />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{challenge.username}</span>
        <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${stanceColor}`}>
          {challenge.stance === "affirmative" ? "FOR" : "AGAINST"}
        </span>
        {wc && (
          <span className="rounded-md border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {WC_LABEL[wc.type]?.(wc) ?? wc.type}
          </span>
        )}
        <span className="ml-auto text-[11px] text-gray-500 dark:text-gray-400">{timeAgo(challenge.createdAt)}</span>
      </div>

      {isMine ? (
        challenge.status === "open" && onCancel && (
          <button onClick={() => onCancel(challenge.id)}
            className="min-h-11 self-end rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-600 transition-colors hover:border-red-300 hover:text-red-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-red-800 dark:hover:text-red-400">
            Withdraw
          </button>
        )
      ) : (
        <button onClick={() => onAccept(challenge.id)} disabled={accepting === challenge.id}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 self-end rounded-xl bg-orange-700 px-4 text-xs font-semibold text-white shadow-glow transition-colors hover:bg-orange-600 disabled:opacity-50 active:scale-[0.98] motion-reduce:active:scale-100">
          {accepting === challenge.id ? "Joining…" : <>Accept &amp; debate <span aria-hidden>→</span></>}
        </button>
      )}
    </div>
  );
}

// ── A finished ranked match ────────────────────────────────────────────────
function MatchRow({ m }: { m: Match }) {
  const tone = m.drawn
    ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
    : m.won ? "bg-emerald-50 text-brand-green-ink dark:bg-emerald-950/40 dark:text-brand-green"
      : "bg-rose-50 text-brand-red-ink dark:bg-rose-950/40 dark:text-brand-red";
  return (
    <Link href={`/match/${encodeURIComponent(m.roomName)}/review`}
      className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold ${tone}`}>
        {m.drawn ? "D" : m.won ? "W" : "L"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-sm font-medium text-gray-900 dark:text-gray-100">&ldquo;{m.topic}&rdquo;</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="truncate">vs {m.opponentName}</span>
          {m.completedAt && <><span aria-hidden>·</span><span className="shrink-0">{timeAgo(m.completedAt)}</span></>}
        </span>
      </span>
      {m.eloDelta !== 0 && (
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${m.eloDelta > 0
          ? "text-brand-green-ink dark:text-brand-green" : "text-brand-red-ink dark:text-brand-red"}`}>
          {m.eloDelta > 0 ? "+" : ""}{m.eloDelta}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" aria-hidden />
      <span className="sr-only">Review the tape</span>
    </Link>
  );
}

// ── Ladder ─────────────────────────────────────────────────────────────────
function LadderRow({ row, place, me, separated, liveRoom }: {
  row: LeaderboardEntry; place: number; me?: boolean; separated?: boolean; liveRoom?: string;
}) {
  const medal =
    place === 1 ? <Trophy className="h-4 w-4 text-amber-500" aria-hidden /> :
    place === 2 ? <Medal className="h-4 w-4 text-gray-400" aria-hidden /> :
    place === 3 ? <Medal className="h-4 w-4 text-amber-700" aria-hidden /> : null;
  return (
    <li className={`${separated ? "border-t-4" : "border-t first:border-t-0"} border-gray-100 dark:border-gray-800 ${
      me ? "bg-brand-green/10" : ""}`}>
      <div className="flex min-h-11 items-center gap-2.5 px-3 py-2">
        <span className="grid w-6 shrink-0 place-items-center text-xs font-bold tabular-nums text-gray-500 dark:text-gray-400">
          {/* The medal is decorative, so the position still has to be spoken. */}
          {medal ? <><span className="sr-only">{place}</span>{medal}</> : place}
        </span>
        {/* min-h-11 on the row isn't enough — the link is the tap target, so it
            has to fill the row's height itself. */}
        <Link href={`/u/${encodeURIComponent(row.username)}`}
          className={`-my-2 flex min-h-11 min-w-0 flex-1 items-center py-2 text-sm font-medium transition-colors hover:text-brand-green-ink dark:hover:text-brand-green ${
            me ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-300"}`}>
          <span className="truncate">{row.username}</span>
          {me && <span className="ml-1.5 shrink-0 text-[10px] font-bold uppercase tracking-wider text-brand-green-ink dark:text-brand-green">you</span>}
        </Link>
        {liveRoom && (
          <Link href={`/room/${liveRoom}${me ? "" : "?spectate=1"}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white transition-colors hover:bg-red-500">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            {me ? "Rejoin" : "Watch"}
          </Link>
        )}
        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{row.wins}–{row.losses}</span>
        <EloBadge elo={row.elo} provisional={isProvisional(row.battleMatches)} className="shrink-0" />
      </div>
    </li>
  );
}

// ── Entry gate ─────────────────────────────────────────────────────────────
function RequirementRow({ met, label, detail, have, need, href, cta, Icon }: {
  met: boolean; label: string; detail: string; have: number; need: number;
  href: string; cta: string; Icon?: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${met
        ? "bg-brand-green/15 text-brand-green-ink dark:text-brand-green"
        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
        {met ? <Check className="h-5 w-5" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{detail}</p>
      </div>
      {met ? (
        <span className="shrink-0 text-xs font-semibold text-brand-green-ink dark:text-brand-green">Done</span>
      ) : (
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-xs font-bold tabular-nums text-gray-700 dark:text-gray-200">{Math.min(have, need)} / {need}</span>
          <Link href={href} className="-my-1 inline-flex min-h-11 items-center gap-1 py-1 text-[11px] font-semibold text-orange-700 hover:text-orange-600 dark:text-orange-400">
            {Icon && <Icon className="h-3.5 w-3.5" />}{cta} →
          </Link>
        </div>
      )}
    </div>
  );
}

function EntryGate({ eligibility }: { eligibility: BattleEligibility }) {
  const ratedMet = eligibility.claimsRated >= eligibility.ratedNeed;
  const arenaMet = eligibility.arenaWins >= eligibility.arenaNeed;
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-gray-950/40">
        <h2 className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-gray-900 dark:text-white">
          <Lock className="h-4 w-4 text-orange-700 dark:text-orange-400" aria-hidden />
          Earn your way in
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Ranked 1v1 and team matches unlock once you&rsquo;ve proven yourself in Training Grounds. It keeps the
          ladder meaningful — everyone you face has learned the ropes first.
        </p>
      </div>
      <div className="space-y-3 p-5">
        <RequirementRow met={ratedMet} label="Earn a Grounds Score"
          detail="Make verified claims in debates to build a credibility rating."
          have={eligibility.claimsRated} need={eligibility.ratedNeed} href="/lobby" cta="Go debate" />
        <RequirementRow met={arenaMet} label="Win a Training Grounds match"
          detail="Beat a bot in a ranked practice debate on a curated topic."
          have={eligibility.arenaWins} need={eligibility.arenaNeed} href="/arena" cta="Train" Icon={GraduationCap} />
      </div>
    </section>
  );
}

// ── Small parts ────────────────────────────────────────────────────────────
function Stake({ children, title }: { children: ReactNode; title: string }) {
  return (
    <span title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
      <Scale className="h-3 w-3 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
      {children}
    </span>
  );
}

function SkeletonRows({ n = 2 }: { n?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="shimmer-track h-32 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
      ))}
    </div>
  );
}

function Empty({ title, hint, action, small }: { title: string; hint: string; action?: ReactNode; small?: boolean }) {
  return (
    <div className={`rounded-2xl border border-dashed border-gray-300 bg-white/60 text-center dark:border-gray-700 dark:bg-gray-900/40 ${small ? "p-5" : "p-8"}`}>
      <p className="font-display text-base font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600 dark:text-gray-400">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function SideDoor({ href, Icon, title, blurb }: {
  href: string; Icon: LucideIcon; title: string; blurb: string;
}) {
  return (
    <Link href={href}
      className="group flex items-center gap-3.5 rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:border-gray-800 dark:bg-gray-900">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
        <span className="block text-xs text-gray-500 dark:text-gray-400">{blurb}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" aria-hidden />
    </Link>
  );
}
