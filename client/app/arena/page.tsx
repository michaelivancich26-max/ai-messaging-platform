"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ArenaSidebar from "@/components/ArenaSidebar";
import { BOTS, BOT_COLORS, botWinRate, type Bot } from "@/lib/bots";

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
    <div className={`${dim} rounded-2xl flex items-center justify-center ring-2 ${c.ring} bg-gray-900`}>
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
        <svg key={i} viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${i <= tier ? c.star : "text-gray-700"}`}>
          <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
        </svg>
      ))}
    </div>
  );
}

// ─── Win Condition types ──────────────────────────────────────────────────────

type WinCondition =
  | { type: "exchanges"; limit: number; topic?: string; stance?: "affirmative" | "negative"; botFirst?: boolean }
  | { type: "time"; minutes: number; topic?: string; stance?: "affirmative" | "negative"; botFirst?: boolean }
  | { type: "proposition"; threshold: number; topic?: string; stance?: "affirmative" | "negative"; botFirst?: boolean };

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
  const [stance, setStance] = useState<"affirmative" | "negative">("affirmative");
  const [botFirst, setBotFirst] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [type, setType] = useState<WinCondition["type"]>("exchanges");
  const [exchangeLimit, setExchangeLimit] = useState(10);
  const [timeMinutes, setTimeMinutes] = useState(5);
  const [propThreshold, setPropThreshold] = useState(70);
  const c = BOT_COLORS[bot.color];

  const effectiveTopic = topicInput.trim();
  const filteredTopics = activeCategory
    ? TOPIC_CATALOG.find(g => g.category === activeCategory)?.topics ?? []
    : TOPIC_CATALOG.flatMap(g => g.topics);

  function confirm() {
    const topic = effectiveTopic ?? undefined;
    if (type === "exchanges") onConfirm({ type: "exchanges", limit: exchangeLimit, topic, stance, botFirst });
    else if (type === "time") onConfirm({ type: "time", minutes: timeMinutes, topic, stance, botFirst });
    else onConfirm({ type: "proposition", threshold: propThreshold, topic, stance, botFirst });
  }

  const optionCls = (active: boolean) =>
    `flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${
      active ? "border-indigo-600 bg-indigo-950/30" : "border-gray-800 hover:border-gray-700"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-gray-900 ring-1 ring-gray-800 flex flex-col"
        style={{ maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-800 shrink-0">
          <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ring-1 ${c.ring} bg-gray-950`}>
            <span className={c.text}><BotIcon id={bot.id} size={20} /></span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-100">Challenge {bot.name}</p>
            <p className={`text-[11px] ${c.text}`}>{bot.title} · {bot.tierName}</p>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-1 shrink-0">
            <div className={`h-1.5 w-4 rounded-full transition-colors ${step === "topic" ? "bg-indigo-500" : "bg-gray-700"}`} />
            <div className={`h-1.5 w-4 rounded-full transition-colors ${step === "condition" ? "bg-indigo-500" : "bg-gray-700"}`} />
          </div>
        </div>

        {/* ── Step 1: Topic ── */}
        {step === "topic" && (
          <>
            {/* Custom input — pinned at top, always visible */}
            <div className="px-5 pt-4 pb-3 shrink-0">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Debate topic
              </label>
              <input
                autoFocus
                value={topicInput}
                onChange={e => setTopicInput(e.target.value)}
                placeholder="Type your own topic, or pick one below…"
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Stance + turn order */}
            <div className="px-5 pb-3 shrink-0 grid grid-cols-2 gap-3">
              {/* Stance */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">My stance</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setStance("affirmative")}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${stance === "affirmative" ? "bg-emerald-700 text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}
                  >
                    FOR
                  </button>
                  <button
                    onClick={() => setStance("negative")}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${stance === "negative" ? "bg-red-700 text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}
                  >
                    AGAINST
                  </button>
                </div>
                <p className="mt-1 text-[9px] text-gray-600">{stance === "affirmative" ? "You argue for the proposition" : "You argue against it"}</p>
              </div>

              {/* Turn order */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">First move</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setBotFirst(false)}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${!botFirst ? "bg-indigo-700 text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}
                  >
                    Me
                  </button>
                  <button
                    onClick={() => setBotFirst(true)}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${botFirst ? "bg-indigo-700 text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}
                  >
                    Bot
                  </button>
                </div>
                <p className="mt-1 text-[9px] text-gray-600">{botFirst ? "Bot makes the opening argument" : "You open the debate"}</p>
              </div>
            </div>

            {/* Divider + category pills */}
            <div className="px-5 pb-2 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-2">or choose from catalog</p>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${activeCategory === null ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                >
                  All
                </button>
                {TOPIC_CATALOG.map(g => (
                  <button
                    key={g.category}
                    onClick={() => setActiveCategory(g.category === activeCategory ? null : g.category)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${activeCategory === g.category ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                  >
                    {g.category}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic list */}
            <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-1.5 min-h-0">
              {filteredTopics.map(topic => (
                <button
                  key={topic}
                  onClick={() => setTopicInput(topic)}
                  className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-xs leading-snug transition-colors ${
                    topicInput === topic
                      ? "border-indigo-600 bg-indigo-950/30 text-gray-100"
                      : "border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-5 py-4 border-t border-gray-800 shrink-0">
              <button onClick={onClose} className="flex-1 rounded-xl border border-gray-700 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => setStep("condition")}
                disabled={!effectiveTopic}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold text-white transition-colors disabled:opacity-40 ${c.btn}`}
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
              <div className="rounded-xl bg-gray-800/50 px-3 py-2 flex items-start gap-2">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500">
                  <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.575a.75.75 0 0 1-1.12.814L8 11.979l-3.136 1.015a.75.75 0 0 1-1.12-.814l.853-3.574-2.79-2.39a.75.75 0 0 1 .427-1.318l3.663-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
                </svg>
                <p className="text-[11px] text-gray-400 leading-snug">{effectiveTopic}</p>
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Win Condition</p>

              {/* Option: Exchanges */}
              <div className={optionCls(type === "exchanges")} onClick={() => setType("exchanges")}>
                <div className={`mt-0.5 h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${type === "exchanges" ? "border-indigo-500" : "border-gray-600"}`}>
                  {type === "exchanges" && <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-200">Exchange Limit</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Match ends after N back-and-forth exchanges.</p>
                  {type === "exchanges" && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {[5, 10, 15, 20].map(n => (
                        <button
                          key={n}
                          onClick={e => { e.stopPropagation(); setExchangeLimit(n); }}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${exchangeLimit === n ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
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
                <div className={`mt-0.5 h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${type === "time" ? "border-indigo-500" : "border-gray-600"}`}>
                  {type === "time" && <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-200">Time Limit</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Match is judged when the clock runs out.</p>
                  {type === "time" && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {[3, 5, 10, 15].map(n => (
                        <button
                          key={n}
                          onClick={e => { e.stopPropagation(); setTimeMinutes(n); }}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${timeMinutes === n ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
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
                <div className={`mt-0.5 h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${type === "proposition" ? "border-indigo-500" : "border-gray-600"}`}>
                  {type === "proposition" && <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-200">Proposition Bar</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">AI scores each exchange live. First to dominate wins.</p>
                  {type === "proposition" && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[10px] text-gray-500">Win threshold</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {[60, 70, 80].map(n => (
                          <button
                            key={n}
                            onClick={e => { e.stopPropagation(); setPropThreshold(n); }}
                            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${propThreshold === n ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                          >
                            {n}%
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-gray-800 overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-red-600/60 transition-all" style={{ width: `${100 - propThreshold}%` }} />
                        <div className="absolute inset-y-0 right-0 bg-emerald-600/60 transition-all" style={{ width: `${100 - propThreshold}%` }} />
                        <div className="absolute inset-y-0 bg-gray-700" style={{ left: `${100 - propThreshold}%`, right: `${100 - propThreshold}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-600">Win zone starts at {propThreshold}% on either side</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-5 py-4 border-t border-gray-800 shrink-0">
              <button onClick={() => setStep("topic")} className="flex-1 rounded-xl border border-gray-700 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-800 transition-colors">
                ← Back
              </button>
              <button onClick={confirm} className={`flex-1 rounded-xl py-2 text-xs font-semibold text-white transition-colors ${c.btn}`}>
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

function BotCard({ bot }: { bot: Bot }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [challenging, setChallenging] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
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
      const res = await fetch(`${SERVER}/api/bot-rooms`, {
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
    <div className={`flex flex-col rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden transition-all duration-200 hover:border-gray-700 hover:shadow-lg hover:shadow-black/30`}>
      {/* Avatar area */}
      <div className={`flex flex-col items-center gap-3 bg-gradient-to-b ${c.gradient} px-4 py-7`}>
        <BotAvatar bot={bot} large />
        <div className="text-center">
          <h3 className="text-lg font-bold text-white leading-tight">{bot.name}</h3>
          <p className={`text-xs font-medium ${c.text}`}>"{bot.title}"</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Tier + style badge */}
        <div className="mb-2 flex items-center justify-between">
          <StarRow tier={bot.tier} color={bot.color} />
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${c.subtext}`}>
            {bot.tierName}
          </span>
        </div>
        <div className="mb-3">
          <span className={`inline-flex rounded-full bg-gray-800/80 px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-gray-700/40 ${c.text}`}>
            {bot.specialty}
          </span>
        </div>

        {/* Bio */}
        <p className="flex-1 text-xs leading-relaxed text-gray-500">{bot.bio}</p>

        {/* Weakness */}
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-950/20 px-2.5 py-2 ring-1 ring-red-900/20">
          <span className="mt-px shrink-0 text-[9px] font-bold uppercase tracking-wider text-red-500">Weak</span>
          <p className="text-[10px] leading-relaxed text-red-400/70">{bot.flaw}</p>
        </div>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-2 border-t border-gray-800 pt-3 text-[10px]">
          <span className="font-semibold text-emerald-400">{bot.wins.toLocaleString()}W</span>
          <span className="text-gray-600">·</span>
          <span className="font-semibold text-red-400">{bot.losses.toLocaleString()}L</span>
          <span className="ml-auto text-gray-600">{winRate}% win rate</span>
        </div>

        {/* Challenge button */}
        {error && <p className="mt-2 text-[10px] text-red-400">{error}</p>}
        <button
          onClick={() => setModalOpen(true)}
          disabled={challenging || !userId}
          className={`mt-3 w-full rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 ${c.btn}`}
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

      {modalOpen && (
        <MatchSetupModal
          bot={bot}
          onConfirm={challenge}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ArenaPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  return (
    <div className="flex h-full">
      <ArenaSidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      <main className="flex flex-1 flex-col overflow-y-auto bg-gray-950">

        {/* Mobile top bar */}
        <div className="flex min-h-12 shrink-0 items-center border-b border-gray-800 px-4 md:hidden pt-safe">
          <button onClick={() => setMobileSidebarOpen(true)} className="rounded p-1.5 text-gray-400 hover:bg-gray-800">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" /></svg>
          </button>
          <span className="ml-3 text-sm font-semibold text-amber-400">Arena</span>
        </div>

        {/* Hero */}
        <div className="relative shrink-0 border-b border-gray-800 bg-gradient-to-b from-gray-900 via-gray-900/90 to-gray-950 px-6 py-14 text-center">
          {/* decorative glow */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-64 w-96 -translate-x-1/2 rounded-full bg-indigo-500/5 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-xl">
            <div className="mb-5 flex justify-center">
              <div className="rounded-2xl bg-indigo-950 p-4 ring-1 ring-indigo-900/60">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10 text-indigo-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Debate Arena</h1>
            <p className="mt-3 text-base text-gray-400">
              Choose your opponent. Each bot has a unique debating style and difficulty level.
              Send the first message to open any topic — your opponent will respond.
            </p>
            <div className="mt-5 flex items-center justify-center gap-4 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                10 opponents across 5 tiers
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                1-on-1 private match
              </span>
            </div>
          </div>
        </div>

        {/* Bot grid */}
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Choose your opponent</h2>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <span className="flex h-3 w-3 items-center justify-center">★</span>
              <span>= difficulty</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-5">
            {BOTS.map((bot) => (
              <BotCard key={bot.id} bot={bot} />
            ))}
          </div>

          {/* Footer note */}
          <p className="mt-10 text-center text-[11px] text-gray-700">
            Bot rooms are private and only visible to you. Win rates are illustrative.
          </p>
        </div>
      </main>
    </div>
  );
}
