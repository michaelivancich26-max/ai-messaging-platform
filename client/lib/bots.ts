export type BotTier = 1 | 2 | 3 | 4 | 5;

export interface Bot {
  id: string;
  name: string;
  title: string;
  tier: BotTier;
  tierName: string;
  color: "red" | "orange" | "sky" | "zinc" | "emerald" | "cyan" | "violet" | "purple" | "amber" | "teal";
  bio: string;
  flaw: string;
  specialty: string;
  wins: number;
  losses: number;
}

export const BOTS: Bot[] = [
  // ── Tier 1 — Novice ──────────────────────────────────────────────────────
  {
    id: "rex",
    name: "Rex",
    title: "The Hothead",
    tier: 1,
    tierName: "Novice",
    color: "red",
    bio: "Argues entirely from gut feeling. Long on passion, very short on logic. Expect circular reasoning, straw men, and wild exaggerations.",
    specialty: "Gut Feeling",
    flaw: "Cite one concrete fact — he falls apart",
    wins: 41,
    losses: 892,
  },
  {
    id: "dunk",
    name: "Dunk",
    title: "The Conspiracy Theorist",
    tier: 1,
    tierName: "Novice",
    color: "orange",
    bio: "Sees hidden agendas behind every argument. Every mainstream claim is a cover-up, every source is compromised, and counter-evidence only deepens the conspiracy.",
    specialty: "Conspiracy Logic",
    flaw: "Ask him for his own sources — he has none",
    wins: 28,
    losses: 834,
  },

  // ── Tier 2 — Apprentice ──────────────────────────────────────────────────
  {
    id: "cass",
    name: "Cass",
    title: "The Student",
    tier: 2,
    tierName: "Apprentice",
    color: "sky",
    bio: "Fresh out of debate class. Knows the basics, occasionally lands a decent point, but drifts off-topic and hasn't found her footing yet.",
    specialty: "Textbook Structure",
    flaw: "Keep refocusing — she loses track easily",
    wins: 218,
    losses: 710,
  },
  {
    id: "norm",
    name: "Norm",
    title: "The Both-Sider",
    tier: 2,
    tierName: "Apprentice",
    color: "zinc",
    bio: "Pathologically committed to false balance. Every position has an equally valid counter. He never commits, never concedes, and never actually says anything.",
    specialty: "False Balance",
    flaw: "Force him to take a position — he freezes",
    wins: 167,
    losses: 589,
  },

  // ── Tier 3 — Debater ─────────────────────────────────────────────────────
  {
    id: "morgan",
    name: "Morgan",
    title: "The Pragmatist",
    tier: 3,
    tierName: "Debater",
    color: "emerald",
    bio: "Methodical and hard to rattle. Builds clean claim-evidence-warrant arguments and rarely goes off-topic. A solid, predictable opponent.",
    specialty: "Evidence-First",
    flaw: "Exploit the edge cases and exceptions she ignores",
    wins: 513,
    losses: 489,
  },
  {
    id: "pip",
    name: "Pip",
    title: "The Stats Monkey",
    tier: 3,
    tierName: "Debater",
    color: "cyan",
    bio: "Drowns every debate in statistics. Data-driven to a fault — constantly confusing correlation with causation, and she's never met a cherry-picked number she didn't love.",
    specialty: "Data Mining",
    flaw: "Challenge the methodology — she can't defend it",
    wins: 389,
    losses: 421,
  },

  // ── Tier 4 — Expert ──────────────────────────────────────────────────────
  {
    id: "vera",
    name: "Vera",
    title: "The Logician",
    tier: 4,
    tierName: "Expert",
    color: "violet",
    bio: "Finds the flaw in your reasoning before she counters it. Precise, relentless, and very hard to shake. She dismantles arguments at the premise level.",
    specialty: "Premise Attack",
    flaw: "Values debates make her logic brittle — try ethics",
    wins: 801,
    losses: 201,
  },
  {
    id: "hugo",
    name: "Hugo",
    title: "The Contrarian",
    tier: 4,
    tierName: "Expert",
    color: "purple",
    bio: "Reflexively opposes everything on principle. Uses Socratic questions to poke holes in any argument — but has no positive case of his own. He's the devil's advocate who forgot to stop.",
    specialty: "Devil's Advocate",
    flaw: "Ask what HE believes — he has no answer",
    wins: 688,
    losses: 194,
  },

  // ── Tier 5 — Grandmaster ─────────────────────────────────────────────────
  {
    id: "atlas",
    name: "Atlas",
    title: "The Sophist",
    tier: 5,
    tierName: "Grandmaster",
    color: "amber",
    bio: "Tournament-level debater. Steelmans your argument before dismantling it. Rarely loses, never loses composure, and has a rhetorical technique for every situation.",
    specialty: "Steelmanning",
    flaw: "Occasionally over-engineers simple points — stay direct",
    wins: 1204,
    losses: 48,
  },
  {
    id: "nova",
    name: "Nova",
    title: "The Philosopher",
    tier: 5,
    tierName: "Grandmaster",
    color: "teal",
    bio: "Argues from first principles with academic rigor. Brings Kant when you're discussing pizza. Brilliant and nearly unbeatable — but occasionally so abstract she loses the room.",
    specialty: "First Principles",
    flaw: "Drag her to concrete specifics — abstraction is her comfort zone",
    wins: 1147,
    losses: 31,
  },
];

export function getBotById(id: string): Bot | undefined {
  return BOTS.find((b) => b.id === id);
}

export function botWinRate(bot: Bot): number {
  const total = bot.wins + bot.losses;
  return total === 0 ? 0 : Math.round((bot.wins / total) * 100);
}

export const BOT_COLORS: Record<Bot["color"], {
  gradient: string;
  text: string;
  subtext: string;
  btn: string;
  dot: string;
  ring: string;
  star: string;
}> = {
  red:     { gradient: "from-red-950/50 to-gray-900",     text: "text-red-400",     subtext: "text-red-500/70",     btn: "bg-red-600 hover:bg-red-500 text-white",     dot: "bg-red-500",     ring: "ring-red-900/50",     star: "text-red-400"     },
  orange:  { gradient: "from-orange-950/50 to-gray-900",  text: "text-orange-400",  subtext: "text-orange-500/70",  btn: "bg-orange-600 hover:bg-orange-500 text-white",  dot: "bg-orange-500",  ring: "ring-orange-900/50",  star: "text-orange-400"  },
  sky:     { gradient: "from-sky-950/50 to-gray-900",     text: "text-sky-400",     subtext: "text-sky-500/70",     btn: "bg-sky-600 hover:bg-sky-500 text-white",     dot: "bg-sky-500",     ring: "ring-sky-900/50",     star: "text-sky-400"     },
  zinc:    { gradient: "from-zinc-900/80 to-gray-900",    text: "text-zinc-400",    subtext: "text-zinc-500/70",    btn: "bg-zinc-600 hover:bg-zinc-500 text-white",    dot: "bg-zinc-500",    ring: "ring-zinc-800/50",    star: "text-zinc-400"    },
  emerald: { gradient: "from-emerald-950/50 to-gray-900", text: "text-emerald-400", subtext: "text-emerald-500/70", btn: "bg-emerald-600 hover:bg-emerald-500 text-white", dot: "bg-emerald-500", ring: "ring-emerald-900/50", star: "text-emerald-400" },
  cyan:    { gradient: "from-cyan-950/50 to-gray-900",    text: "text-cyan-400",    subtext: "text-cyan-500/70",    btn: "bg-cyan-600 hover:bg-cyan-500 text-white",    dot: "bg-cyan-500",    ring: "ring-cyan-900/50",    star: "text-cyan-400"    },
  violet:  { gradient: "from-violet-950/50 to-gray-900",  text: "text-violet-400",  subtext: "text-violet-500/70",  btn: "bg-violet-600 hover:bg-violet-500 text-white",  dot: "bg-violet-500",  ring: "ring-violet-900/50",  star: "text-violet-400"  },
  purple:  { gradient: "from-purple-950/50 to-gray-900",  text: "text-purple-400",  subtext: "text-purple-500/70",  btn: "bg-purple-600 hover:bg-purple-500 text-white",  dot: "bg-purple-500",  ring: "ring-purple-900/50",  star: "text-purple-400"  },
  amber:   { gradient: "from-amber-950/50 to-gray-900",   text: "text-amber-400",   subtext: "text-amber-500/70",   btn: "bg-amber-600 hover:bg-amber-500 text-white",   dot: "bg-amber-500",   ring: "ring-amber-900/50",   star: "text-amber-400"   },
  teal:    { gradient: "from-teal-950/50 to-gray-900",    text: "text-teal-400",    subtext: "text-teal-500/70",    btn: "bg-teal-600 hover:bg-teal-500 text-white",    dot: "bg-teal-500",    ring: "ring-teal-900/50",    star: "text-teal-400"    },
};
