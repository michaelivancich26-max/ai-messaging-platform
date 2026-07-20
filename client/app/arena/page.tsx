"use client";

import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import ArenaSidebar from "@/components/ArenaSidebar";
import TrainingTabs from "@/components/TrainingTabs";
import { BOTS, BOT_COLORS, botWinRate, type Bot } from "@/lib/bots";
import { api } from "@/lib/api";
import { Trophy, Medal, Zap, Star } from "@/lib/icons";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

// ─── Bot Avatar ──────────────────────────────────────────────────────────────

function BotIcon({ id, size }: { id: string; size: number }) {
  const s = size;
  const icons: Record<string, React.ReactNode> = {
    rex: (
      // Flame — pure heat, no light
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M13.5 .67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
      </svg>
    ),
    dunk: (
      // Warning triangle — alarm, paranoia
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
      </svg>
    ),
    cass: (
      // Graduation cap — the student
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M12 3L1 9l4 2.18V17h2v-4.82l2 1.09V17c0 2.21 3.134 4 7 4s7-1.79 7-4v-3.73l2-1.09L23 9 12 3zM6.087 15.683C5.422 14.989 5 14.027 5 13v-1.95l7 3.82 7-3.82V13c0 2.21-3.134 4-7 4a8.76 8.76 0 0 1-5.913-1.317z"/>
      </svg>
    ),
    norm: (
      // Balance/scales — pathological both-sidesism
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M17 2H7L2 12h5v8h2v-8h6v8h2v-8h5L17 2zm-5 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
      </svg>
    ),
    morgan: (
      // Lightbulb — methodical, pragmatic
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M12 3C8.69 3 6 5.69 6 9c0 2.27 1.26 4.25 3.13 5.31V17a1 1 0 0 0 1 1h3.74a1 1 0 0 0 1-1v-2.69C16.74 13.25 18 11.27 18 9c0-3.31-2.69-6-6-6zm2.25 14H9.75v-1h4.5v1zm.75-3H9V12.5c-1.77-.64-3-2.36-3-4.5 0-2.76 2.24-5 5-5s5 2.24 5 5c0 2.14-1.23 3.86-3 4.5V14zm-3 5h2v1h-2v-1z"/>
      </svg>
    ),
    pip: (
      // Bar chart — data obsession
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zM16.2 13h2.8v6h-2.8v-6z"/>
      </svg>
    ),
    vera: (
      // Target/crosshair — finds the flaw precisely
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
      </svg>
    ),
    hugo: (
      // Question mark — the contrarian Socrates
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
      </svg>
    ),
    atlas: (
      // Trophy — tournament champion
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
      </svg>
    ),
    nova: (
      // Sparkle / auto-awesome — philosophical brilliance
      <svg viewBox="0 0 24 24" fill="currentColor" width={s} height={s}>
        <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
      </svg>
    ),
  };
  return <>{icons[id] ?? icons.cass}</>;
}

function BotAvatar({ bot, large = false }: { bot: Bot; large?: boolean }) {
  const c = BOT_COLORS[bot.color];
  const dim = large ? "h-20 w-20" : "h-14 w-14";
  const iconSize = large ? 36 : 26;
  return (
    <div className={`${dim} rounded-2xl flex items-center justify-center ring-2 ${c.ring} bg-white dark:bg-gray-900`}>
      <span className={c.text}>
        <BotIcon id={bot.id} size={iconSize} />
      </span>
    </div>
  );
}

// ─── Star Rating ─────────────────────────────────────────────────────────────

function StarRow({ tier, color }: { tier: number; color: Bot["color"] }) {
  const c = BOT_COLORS[color];
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${i <= tier ? c.star : "text-gray-400 dark:text-gray-700"}`}>
          <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
        </svg>
      ))}
    </div>
  );
}

// ─── Win Condition types ──────────────────────────────────────────────────────

type WinCondition =
  | { type: "exchanges"; limit: number; topic?: string; stance?: "affirmative" | "negative"; botFirst?: boolean; propositionId?: string }
  | { type: "time"; minutes: number; topic?: string; stance?: "affirmative" | "negative"; botFirst?: boolean; propositionId?: string }
  | { type: "proposition"; threshold: number; topic?: string; stance?: "affirmative" | "negative"; botFirst?: boolean; propositionId?: string };

// ─── Topic catalog ────────────────────────────────────────────────────────────

const TOPIC_CATALOG: { category: string; topics: string[] }[] = [
  {
    category: "Politics",
    topics: [
      "Universal Basic Income should be implemented",
      "Voting should be mandatory in democracies",
      "Term limits should apply to all elected officials",
      "Social media platforms should be regulated as public utilities",
      "Ranked choice voting is better than first-past-the-post",
    ],
  },
  {
    category: "Technology",
    topics: [
      "AI will create more jobs than it destroys",
      "Social media does more harm than good to society",
      "Nuclear energy is the best path to clean energy",
      "Cryptocurrencies will replace traditional currencies",
      "Surveillance technology makes society safer",
    ],
  },
  {
    category: "Philosophy",
    topics: [
      "Free will is an illusion",
      "Moral relativism is correct",
      "Utilitarianism is the best ethical framework",
      "Privacy is more important than national security",
      "Cancel culture does more harm than good",
    ],
  },
  {
    category: "Science",
    topics: [
      "Space exploration is worth the cost",
      "Gene editing in humans should be permitted",
      "Lab-grown meat will replace traditional farming",
      "Geoengineering is too risky to pursue",
      "Electric vehicles will solve transportation emissions",
    ],
  },
  {
    category: "Society",
    topics: [
      "College education is overvalued in modern society",
      "Remote work is better than office work",
      "Zoos should be abolished",
      "Social media influencers deserve their income",
      "The gig economy exploits workers",
    ],
  },
  {
    category: "Economics",
    topics: [
      "Billionaires should not exist in a just society",
      "A four-day work week should be the global standard",
      "Free trade benefits all participating countries",
      "Automation will cause mass unemployment",
      "Universal healthcare improves economic productivity",
    ],
  },
];

// ─── Match Setup Modal ────────────────────────────────────────────────────────

function MatchSetupModal({
  bot,
  onConfirm,
  onClose,
}: {
  bot: Bot;
  onConfirm: (wc: WinCondition) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"topic" | "condition">("topic");
  const [topicInput, setTopicInput] = useState("");
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [rankedClaims, setRankedClaims] = useState<{ category: string; claims: { id: string; text: string }[] }[]>([]);
  const [stance, setStance] = useState<"affirmative" | "negative">("affirmative");
  const [botFirst, setBotFirst] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [type, setType] = useState<WinCondition["type"]>("exchanges");
  const [exchangeLimit, setExchangeLimit] = useState(10);
  const [timeMinutes, setTimeMinutes] = useState(5);
  const [propThreshold, setPropThreshold] = useState(70);
  const c = BOT_COLORS[bot.color];

  // The vetted live claims a RANKED (ELO-earning) match can use. Falls back to the
  // static catalog (as practice suggestions) if none load.
  useEffect(() => {
    api(`${SERVER}/api/arena/claims`).then(r => r.json())
      .then(d => Array.isArray(d) && d.length && setRankedClaims(d)).catch(() => {});
  }, []);

  const effectiveTopic = topicInput.trim();
  const claimGroups = rankedClaims.length
    ? rankedClaims
    : TOPIC_CATALOG.map(g => ({ category: g.category, claims: g.topics.map(t => ({ id: "", text: t })) }));
  const filteredClaims = activeCategory
    ? claimGroups.find(g => g.category === activeCategory)?.claims ?? []
    : claimGroups.flatMap(g => g.claims);
  // A ranked match needs a live claim id — either picked, or a typed topic that
  // exactly matches one. Server re-checks this; the flag here is just for the UI.
  const claimIdByText = new Map<string, string>();
  for (const g of rankedClaims) for (const cl of g.claims) claimIdByText.set(cl.text.trim().toLowerCase(), cl.id);
  const ranked = !!selectedPropId;

  function setTopic(v: string) {
    setTopicInput(v);
    setSelectedPropId(claimIdByText.get(v.trim().toLowerCase()) ?? null);
  }
  function pickClaim(cl: { id: string; text: string }) {
    setTopicInput(cl.text);
    setSelectedPropId(cl.id || null);
  }

  function confirm() {
    const topic = effectiveTopic || undefined;
    const propositionId = selectedPropId ?? undefined;
    if (type === "exchanges") onConfirm({ type: "exchanges", limit: exchangeLimit, topic, stance, botFirst, propositionId });
    else if (type === "time") onConfirm({ type: "time", minutes: timeMinutes, topic, stance, botFirst, propositionId });
    else onConfirm({ type: "proposition", threshold: propThreshold, topic, stance, botFirst, propositionId });
  }

  const optionCls = (active: boolean) =>
    `flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${
      active ? "border-orange-600 bg-orange-50 dark:bg-orange-950/20" : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800 shadow-elevated flex flex-col animate-fadeInUp"
        style={{ maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ring-1 ${c.ring} bg-gray-50 dark:bg-gray-950`}>
            <span className={c.text}><BotIcon id={bot.id} size={20} /></span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm font-bold text-gray-900 dark:text-gray-100">Challenge {bot.name}</p>
            <p className={`text-[11px] ${c.text}`}>{bot.title} · {bot.tierName}</p>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-1 shrink-0">
            <div className={`h-1.5 w-4 rounded-full transition-colors ${step === "topic" ? "bg-orange-500" : "bg-gray-200 dark:bg-gray-700"}`} />
            <div className={`h-1.5 w-4 rounded-full transition-colors ${step === "condition" ? "bg-orange-500" : "bg-gray-200 dark:bg-gray-700"}`} />
          </div>
        </div>

        {/* ── Step 1: Topic ── */}
        {step === "topic" && (
          <>
            {/* Custom input — pinned at top, always visible */}
            <div className="px-5 pt-4 pb-3 shrink-0">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Debate topic
              </label>
              <input
                autoFocus
                value={topicInput}
                onChange={e => setTopic(e.target.value)}
                placeholder="Pick a ranked claim below, or type your own for practice…"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 outline-none focus:border-orange-500 transition-colors"
              />
              {effectiveTopic && (
                <p className={`mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold ${ranked ? "text-emerald-700 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>
                  {ranked ? (
                    <><svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M8 1.5 10 5l3.5.5-2.5 2.5.6 3.5L8 10l-3.1 1.5.6-3.5L3 5.5 6.5 5 8 1.5Z" /></svg>Ranked · earns arena ELO</>
                  ) : (
                    <>Practice · no ELO — pick a claim below to make it ranked</>
                  )}
                </p>
              )}
            </div>

            {/* Stance + turn order */}
            <div className="px-5 pb-3 shrink-0 grid grid-cols-2 gap-3">
              {/* Stance */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">My stance</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setStance("affirmative")}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${stance === "affirmative" ? "bg-emerald-700 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
                  >
                    FOR
                  </button>
                  <button
                    onClick={() => setStance("negative")}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${stance === "negative" ? "bg-rose-700 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
                  >
                    AGAINST
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{stance === "affirmative" ? "You argue for the proposition" : "You argue against it"}</p>
              </div>

              {/* Turn order */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">First move</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setBotFirst(false)}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${!botFirst ? "bg-orange-700 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
                  >
                    Me
                  </button>
                  <button
                    onClick={() => setBotFirst(true)}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${botFirst ? "bg-orange-700 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
                  >
                    Bot
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{botFirst ? "Bot makes the opening argument" : "You open the debate"}</p>
              </div>
            </div>

            {/* Divider + category pills */}
            <div className="px-5 pb-2 shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                {rankedClaims.length ? "ranked claims — pick one to earn ELO" : "or choose from catalog"}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${activeCategory === null ? "bg-orange-700 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"}`}
                >
                  All
                </button>
                {claimGroups.map(g => (
                  <button
                    key={g.category}
                    onClick={() => setActiveCategory(g.category === activeCategory ? null : g.category)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${activeCategory === g.category ? "bg-orange-700 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50"}`}
                  >
                    {g.category}
                  </button>
                ))}
              </div>
            </div>

            {/* Claim list — picking one makes the match ranked */}
            <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-1.5 min-h-0">
              {filteredClaims.map((cl, i) => (
                <button
                  key={cl.id || `${cl.text}-${i}`}
                  onClick={() => pickClaim(cl)}
                  className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-xs leading-snug transition-colors ${
                    topicInput === cl.text
                      ? "border-orange-600 bg-orange-50 dark:bg-orange-950/20 text-gray-900 dark:text-gray-100"
                      : "border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {cl.text}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-800 shrink-0">
              <button onClick={onClose} className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => setStep("condition")}
                disabled={!effectiveTopic}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold text-white transition-colors disabled:opacity-40 active:scale-[0.98] motion-reduce:active:scale-100 ${c.btn}`}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Win condition ── */}
        {step === "condition" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
              {/* Selected topic recap */}
              <div className="rounded-xl bg-gray-100 dark:bg-gray-800 px-3 py-2 flex items-start gap-2">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 mt-0.5 text-orange-500">
                  <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.575a.75.75 0 0 1-1.12.814L8 11.979l-3.136 1.015a.75.75 0 0 1-1.12-.814l.853-3.574-2.79-2.39a.75.75 0 0 1 .427-1.318l3.663-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
                </svg>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">{effectiveTopic}</p>
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Win Condition</p>

              {/* Option: Exchanges */}
              <div className={optionCls(type === "exchanges")} onClick={() => setType("exchanges")}>
                <div className={`mt-0.5 h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${type === "exchanges" ? "border-orange-600" : "border-gray-300 dark:border-gray-600"}`}>
                  {type === "exchanges" && <div className="h-1.5 w-1.5 rounded-full bg-orange-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Exchange Limit</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Match ends after N back-and-forth exchanges.</p>
                  {type === "exchanges" && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {[5, 10, 15, 20].map(n => (
                        <button
                          key={n}
                          onClick={e => { e.stopPropagation(); setExchangeLimit(n); }}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${exchangeLimit === n ? "bg-orange-700 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Option: Time */}
              <div className={optionCls(type === "time")} onClick={() => setType("time")}>
                <div className={`mt-0.5 h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${type === "time" ? "border-orange-600" : "border-gray-300 dark:border-gray-600"}`}>
                  {type === "time" && <div className="h-1.5 w-1.5 rounded-full bg-orange-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Time Limit</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Match is judged when the clock runs out.</p>
                  {type === "time" && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {[3, 5, 10, 15].map(n => (
                        <button
                          key={n}
                          onClick={e => { e.stopPropagation(); setTimeMinutes(n); }}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${timeMinutes === n ? "bg-orange-700 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
                        >
                          {n} min
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Option: Proposition bar */}
              <div className={optionCls(type === "proposition")} onClick={() => setType("proposition")}>
                <div className={`mt-0.5 h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${type === "proposition" ? "border-orange-600" : "border-gray-300 dark:border-gray-600"}`}>
                  {type === "proposition" && <div className="h-1.5 w-1.5 rounded-full bg-orange-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Proposition Bar</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">AI scores each exchange live. First to dominate wins.</p>
                  {type === "proposition" && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Win threshold</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {[60, 70, 80].map(n => (
                          <button
                            key={n}
                            onClick={e => { e.stopPropagation(); setPropThreshold(n); }}
                            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${propThreshold === n ? "bg-orange-700 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
                          >
                            {n}%
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-rose-500/60 transition-all" style={{ width: `${100 - propThreshold}%` }} />
                        <div className="absolute inset-y-0 right-0 bg-emerald-500/60 transition-all" style={{ width: `${100 - propThreshold}%` }} />
                        <div className="absolute inset-y-0 bg-gray-200 dark:bg-gray-700" style={{ left: `${100 - propThreshold}%`, right: `${100 - propThreshold}%` }} />
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Win zone starts at {propThreshold}% on either side</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-800 shrink-0">
              <button onClick={() => setStep("topic")} className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                ← Back
              </button>
              <button onClick={confirm} className={`flex-1 rounded-xl py-2 text-xs font-semibold text-white transition-colors active:scale-[0.98] motion-reduce:active:scale-100 ${c.btn}`}>
                Start Match →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Bot Card ────────────────────────────────────────────────────────────────

function BotCard({ bot, autoOpen = false }: { bot: Bot; autoOpen?: boolean }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [challenging, setChallenging] = useState(false);
  const [modalOpen, setModalOpen] = useState(autoOpen);
  const [error, setError] = useState("");
  const userId: string = (session?.user as any)?.id ?? "";
  const c = BOT_COLORS[bot.color];
  const winRate = botWinRate(bot);

  async function challenge(winCondition: WinCondition) {
    if (!userId || challenging) return;
    setModalOpen(false);
    setChallenging(true);
    setError("");
    try {
      const res = await api(`${SERVER}/api/bot-rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, botId: bot.id, winCondition }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to start match."); setChallenging(false); return; }
      router.push(`/room/${data.name}`);
    } catch {
      setError("Network error. Try again.");
      setChallenging(false);
    }
  }

  return (
    <div className={`flex flex-col rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-card overflow-hidden animate-fadeInUp transition-all hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-elevated`}>
      {/* Avatar area */}
      <div className={`flex flex-col items-center gap-3 bg-gradient-to-b ${c.gradient} px-4 py-7`}>
        <BotAvatar bot={bot} large />
        <div className="text-center">
          <h3 className="font-display text-lg font-bold text-white leading-tight">{bot.name}</h3>
          <p className={`text-xs font-medium ${c.onGradient}`}>"{bot.title}"</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Tier + style badge */}
        <div className="mb-2 flex items-center justify-between">
          <StarRow tier={bot.tier} color={bot.color} />
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${c.subtext}`}>
            {bot.tierName}
          </span>
        </div>
        <div className="mb-3">
          <span className={`inline-flex rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-gray-200 dark:ring-gray-700 ${c.text}`}>
            {bot.specialty}
          </span>
        </div>

        {/* Bio */}
        <p className="flex-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{bot.bio}</p>

        {/* Weakness */}
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 px-2.5 py-2 ring-1 ring-red-200 dark:ring-red-900/40">
          <span className="mt-px shrink-0 text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">Weak</span>
          <p className="text-[11px] leading-relaxed text-red-700 dark:text-red-300/90">{bot.flaw}</p>
        </div>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-2 border-t border-gray-200 dark:border-gray-800 pt-3 text-[11px]">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">{bot.wins.toLocaleString()}W</span>
          <span className="text-gray-500 dark:text-gray-400">·</span>
          <span className="font-semibold text-red-600 dark:text-red-400">{bot.losses.toLocaleString()}L</span>
          <span className="ml-auto text-gray-500 dark:text-gray-400">{winRate}% win rate</span>
        </div>

        {/* Challenge button */}
        {error && <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
        <button
          onClick={() => setModalOpen(true)}
          disabled={challenging || !userId}
          className={`mt-3 w-full rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 active:scale-[0.98] motion-reduce:active:scale-100 ${c.btn}`}
        >
          {challenging ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Starting…
            </span>
          ) : "Challenge"}
        </button>
      </div>

      {modalOpen && typeof document !== "undefined" && createPortal(
        <MatchSetupModal
          bot={bot}
          onConfirm={challenge}
          onClose={() => setModalOpen(false)}
        />,
        document.body,
      )}
    </div>
  );
}

// ─── Arena Leaderboard ────────────────────────────────────────────────────────

interface ArenaRank { id: string; username: string; elo: number; wins: number; losses: number }

function ArenaLeaderboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const myId: string = (session?.user as any)?.id ?? "";
  const [rows, setRows] = useState<ArenaRank[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`${SERVER}/api/arena-leaderboard`)
      .then(r => r.json())
      .then(d => { setRows(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-14">
      <div className="mb-4 flex items-center gap-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 text-amber-600 dark:text-amber-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
        </svg>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Training Grounds Leaderboard</h2>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">by arena ELO</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-card">
        {loading ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-4 py-3.5 last:border-0">
                <div className="shimmer-track h-4 w-6 shrink-0 rounded bg-gray-100 dark:bg-gray-800" />
                <div className="shimmer-track h-4 w-28 max-w-[40%] rounded bg-gray-100 dark:bg-gray-800" />
                <div className="shimmer-track ml-auto h-4 w-20 rounded bg-gray-100 dark:bg-gray-800" />
                <div className="shimmer-track h-5 w-12 shrink-0 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 dark:bg-gray-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 text-gray-400 dark:text-gray-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </div>
            <p className="font-display text-base font-bold text-gray-900 dark:text-gray-100">No rankings yet</p>
            <p className="max-w-xs text-sm text-gray-600 dark:text-gray-400">Beat a bot to earn an arena ELO and claim your spot on the leaderboard.</p>
          </div>
        ) : (
          rows.map((entry, i) => {
            const medal =
              i === 0 ? <Trophy className="inline-block h-4 w-4 align-middle text-amber-500" aria-hidden /> :
              i === 1 ? <Medal className="inline-block h-4 w-4 align-middle text-gray-400" aria-hidden /> :
              i === 2 ? <Medal className="inline-block h-4 w-4 align-middle text-amber-700" aria-hidden /> :
              null;
            const isMe = entry.id === myId;
            const rate = entry.wins + entry.losses > 0 ? Math.round((entry.wins / (entry.wins + entry.losses)) * 100) : 0;
            return (
              <div key={entry.id} className={`flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 px-4 py-3 last:border-0 ${isMe ? "bg-brand-green/10" : ""}`}>
                <span className="w-6 text-center text-xs text-gray-500 dark:text-gray-400">{medal ?? `${i + 1}`}</span>
                <button
                  onClick={() => router.push(`/u/${encodeURIComponent(entry.username)}`)}
                  className={`flex-1 truncate text-left text-sm font-medium hover:underline ${isMe ? "text-brand-green-ink dark:text-brand-green" : "text-gray-800 dark:text-gray-200"}`}
                >
                  {entry.username}{isMe && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(you)</span>}
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">{entry.wins}W {entry.losses}L · {rate}%</span>
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"><Zap className="h-3 w-3 shrink-0" aria-hidden />{entry.elo}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function ArenaContent() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const searchParams = useSearchParams();
  const autoChallenge = searchParams.get("challenge");
  return (
    <div className="flex h-full">
      <ArenaSidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      <main className="flex flex-1 flex-col overflow-y-auto bg-gray-50 dark:bg-gray-950">

        {/* Mobile top bar */}
        <div className="flex min-h-12 shrink-0 items-center border-b border-gray-200 dark:border-gray-800 px-4 md:hidden pt-safe">
          <button onClick={() => setMobileSidebarOpen(true)} className="rounded p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" /></svg>
          </button>
          <span className="ml-3 font-display text-sm font-semibold text-brand-green-ink dark:text-brand-green">Training Grounds</span>
        </div>

        <TrainingTabs />

        {/* Hero */}
        <div className="relative shrink-0 overflow-hidden border-b border-gray-200 dark:border-gray-800 bg-gradient-to-b from-white dark:from-gray-900 via-white/90 dark:via-gray-900/90 to-gray-50 dark:to-gray-950 px-6 py-14 text-center">
          {/* decorative glow — orange energy + a brand-green wash */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-64 w-96 -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />
            <div className="absolute right-1/4 top-4 h-40 w-56 rounded-full bg-brand-green/5 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-xl animate-fadeInUp">
            <div className="mb-5 flex justify-center">
              <div className="grid h-[72px] w-[72px] place-items-center rounded-2xl bg-orange-100 ring-1 ring-orange-200 shadow-glow dark:bg-orange-950/40 dark:ring-orange-900/50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10 text-orange-700 dark:text-orange-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </div>
            </div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">Practice Arena</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">Training Grounds</h1>
            <p className="mt-3 text-base text-gray-600 dark:text-gray-400">
              Choose your opponent. Each bot has a unique debating style and difficulty level.
              Send the first message to open any topic — your opponent will respond.
            </p>
            <div className="mt-5 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
                10 opponents across 5 tiers
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                1-on-1 private match
              </span>
            </div>
          </div>
        </div>

        {/* Bot grid */}
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Choose your opponent</h2>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="flex h-3 w-3 items-center justify-center"><Star className="h-3 w-3" aria-hidden /></span>
              <span>= difficulty</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-5">
            {BOTS.map((bot) => (
              <BotCard key={bot.id} bot={bot} autoOpen={bot.id === autoChallenge} />
            ))}
          </div>

          {/* Footer note */}
          <p className="mt-10 text-center text-[11px] text-gray-500 dark:text-gray-400">
            Bot rooms are private and only visible to you. Win rates are illustrative.
          </p>
        </div>

        {/* Arena leaderboard */}
        <ArenaLeaderboard />
      </main>
    </div>
  );
}

export default function ArenaPage() {
  return (
    <Suspense>
      <ArenaContent />
    </Suspense>
  );
}
