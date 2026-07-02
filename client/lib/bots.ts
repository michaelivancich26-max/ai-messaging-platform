export type BotTier = 1 | 2 | 3 | 4 | 5;

export interface Bot {
  id: string;
  name: string;
  title: string;
  tier: BotTier;
  tierName: string;
  color: "red" | "sky" | "emerald" | "violet" | "amber";
  bio: string;
  specialty: string;
  wins: number;
  losses: number;
}

export const BOTS: Bot[] = [
  {
    id: "rex",
    name: "Rex",
    title: "The Hothead",
    tier: 1,
    tierName: "Novice",
    color: "red",
    bio: "Argues from gut feeling. Long on passion, short on logic. Expect circular reasoning and the occasional straw man.",
    specialty: "emotional appeals",
    wins: 41,
    losses: 892,
  },
  {
    id: "cass",
    name: "Cass",
    title: "The Student",
    tier: 2,
    tierName: "Apprentice",
    color: "sky",
    bio: "Fresh out of debate class. Knows the basics, occasionally lands a decent point, but hasn't found her footing yet.",
    specialty: "basic structure",
    wins: 218,
    losses: 710,
  },
  {
    id: "morgan",
    name: "Morgan",
    title: "The Pragmatist",
    tier: 3,
    tierName: "Debater",
    color: "emerald",
    bio: "Methodical and hard to rattle. Builds clean claim-evidence-warrant arguments and rarely goes off-topic.",
    specialty: "structured arguments",
    wins: 513,
    losses: 489,
  },
  {
    id: "vera",
    name: "Vera",
    title: "The Logician",
    tier: 4,
    tierName: "Expert",
    color: "violet",
    bio: "Finds the flaw in your reasoning before she counters it. Precise, relentless, and very hard to shake.",
    specialty: "logical analysis",
    wins: 801,
    losses: 201,
  },
  {
    id: "atlas",
    name: "Atlas",
    title: "The Sophist",
    tier: 5,
    tierName: "Grandmaster",
    color: "amber",
    bio: "Tournament-level debater. Steelmans your argument before dismantling it. Rarely loses, and never loses composure.",
    specialty: "advanced rhetoric",
    wins: 1204,
    losses: 48,
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
  red:     { gradient: "from-red-950/50 to-gray-900",     text: "text-red-400",     subtext: "text-red-500/70",  btn: "bg-red-600 hover:bg-red-500 text-white",     dot: "bg-red-500",     ring: "ring-red-900/50",     star: "text-red-400" },
  sky:     { gradient: "from-sky-950/50 to-gray-900",     text: "text-sky-400",     subtext: "text-sky-500/70",  btn: "bg-sky-600 hover:bg-sky-500 text-white",     dot: "bg-sky-500",     ring: "ring-sky-900/50",     star: "text-sky-400" },
  emerald: { gradient: "from-emerald-950/50 to-gray-900", text: "text-emerald-400", subtext: "text-emerald-500/70", btn: "bg-emerald-600 hover:bg-emerald-500 text-white", dot: "bg-emerald-500", ring: "ring-emerald-900/50", star: "text-emerald-400" },
  violet:  { gradient: "from-violet-950/50 to-gray-900",  text: "text-violet-400",  subtext: "text-violet-500/70", btn: "bg-violet-600 hover:bg-violet-500 text-white",  dot: "bg-violet-500",  ring: "ring-violet-900/50",  star: "text-violet-400" },
  amber:   { gradient: "from-amber-950/50 to-gray-900",   text: "text-amber-400",   subtext: "text-amber-500/70", btn: "bg-amber-600 hover:bg-amber-500 text-white",   dot: "bg-amber-500",   ring: "ring-amber-900/50",   star: "text-amber-400" },
};
