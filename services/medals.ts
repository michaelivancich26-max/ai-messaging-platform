// Medals engine — derives a slew of achievement medals from a user's stats.
// Medals are computed (not stored): given a MedalStats snapshot, every medal's
// earned/progress state is recalculated, so they always reflect current data.

export type MedalTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface MedalStats {
  elo: number;
  arenaWins: number;
  arenaMatches: number;
  botsDefeated: number;        // distinct arena bots beaten
  totalBots: number;           // total arena bots that exist
  longestStreak: number;
  currentStreak: number;
  veritasScore: number;
  supported: number;
  contested: number;
  refuted: number;
  totalClaims: number;         // non-pending claims staked
  avgClaimScore: number;       // 0–100
  debateCount: number;
  messageCount: number;
  teamWins: number;
  competitiveWins: number;
  accountAgeDays: number;
}

export interface Medal {
  id: string;
  groupId: string;
  group: string;               // human-readable group name
  name: string;                // this tier's title
  description: string;
  icon: string;                // emoji
  tier: MedalTier;
  order: number;               // tier order within the group (0-based)
  target: number;              // threshold to earn
  value: number;               // the user's current metric value
  unit: string;                // e.g. "wins", "%", "days", "ELO", ""
  earned: boolean;
  progress: number;            // 0–1 toward this tier
}

interface TierDef { tier: MedalTier; name: string; description: string; target: number }

interface GroupDef {
  groupId: string;
  group: string;
  icon: string;
  unit: string;
  metric: (s: MedalStats) => number;
  tiers: TierDef[];
}

const GROUPS: GroupDef[] = [
  {
    groupId: "elo", group: "Ranked Ladder", icon: "⚔️", unit: "ELO",
    metric: (s) => s.elo,
    tiers: [
      { tier: "bronze",   name: "Contender",   description: "Reach 1200 ELO",  target: 1200 },
      { tier: "silver",   name: "Challenger",  description: "Reach 1400 ELO",  target: 1400 },
      { tier: "gold",     name: "Gladiator",   description: "Reach 1600 ELO",  target: 1600 },
      { tier: "platinum", name: "Champion",    description: "Reach 1800 ELO",  target: 1800 },
      { tier: "diamond",  name: "Legend",      description: "Reach 2000 ELO",  target: 2000 },
    ],
  },
  {
    groupId: "winrate", group: "Win Rate", icon: "🎯", unit: "%",
    // Gated: only counts once the user has ≥10 arena matches
    metric: (s) => (s.arenaMatches >= 10 ? Math.round((s.arenaWins / Math.max(1, s.arenaMatches)) * 100) : 0),
    tiers: [
      { tier: "bronze",   name: "Even Odds",    description: "50% win rate over 10+ matches", target: 50 },
      { tier: "silver",   name: "Sharp",        description: "60% win rate over 10+ matches", target: 60 },
      { tier: "gold",     name: "Dominant",     description: "70% win rate over 10+ matches", target: 70 },
      { tier: "platinum", name: "Untouchable",  description: "85% win rate over 10+ matches", target: 85 },
    ],
  },
  {
    groupId: "arenawins", group: "Arena Victories", icon: "🏆", unit: "wins",
    metric: (s) => s.arenaWins,
    tiers: [
      { tier: "bronze",   name: "First Blood",  description: "Win 1 arena match",    target: 1 },
      { tier: "silver",   name: "Seasoned",     description: "Win 10 arena matches",  target: 10 },
      { tier: "gold",     name: "Veteran",      description: "Win 25 arena matches",  target: 25 },
      { tier: "platinum", name: "Warlord",      description: "Win 50 arena matches",  target: 50 },
      { tier: "diamond",  name: "Centurion",    description: "Win 100 arena matches", target: 100 },
    ],
  },
  {
    groupId: "botslayer", group: "Bot Slayer", icon: "🤖", unit: "bots",
    metric: (s) => s.botsDefeated,
    tiers: [
      { tier: "bronze",   name: "Bot Hunter",   description: "Beat 3 different arena bots", target: 3 },
      { tier: "silver",   name: "Bot Breaker",  description: "Beat 6 different arena bots", target: 6 },
      { tier: "gold",     name: "Full Sweep",   description: "Beat every arena bot",        target: 10 },
    ],
  },
  {
    groupId: "streak", group: "Daily Streak", icon: "🔥", unit: "days",
    metric: (s) => s.longestStreak,
    tiers: [
      { tier: "bronze",   name: "Warming Up",   description: "3-day activity streak",   target: 3 },
      { tier: "silver",   name: "On Fire",      description: "7-day activity streak",   target: 7 },
      { tier: "gold",     name: "Unstoppable",  description: "30-day activity streak",  target: 30 },
      { tier: "platinum", name: "Inferno",      description: "100-day activity streak", target: 100 },
    ],
  },
  {
    groupId: "veritas", group: "Veritas Score", icon: "⭐", unit: "pts",
    metric: (s) => Math.round(s.veritasScore),
    tiers: [
      { tier: "bronze",   name: "Rated",       description: "Reach a Veritas score of 10",  target: 10 },
      { tier: "silver",   name: "Credible",    description: "Reach a Veritas score of 25",  target: 25 },
      { tier: "gold",     name: "Authority",   description: "Reach a Veritas score of 50",  target: 50 },
      { tier: "platinum", name: "Oracle",      description: "Reach a Veritas score of 100", target: 100 },
    ],
  },
  {
    groupId: "supported", group: "Truth Teller", icon: "✅", unit: "claims",
    metric: (s) => s.supported,
    tiers: [
      { tier: "bronze",   name: "Fact Checker",  description: "5 supported claims",   target: 5 },
      { tier: "silver",   name: "Straight Shooter", description: "25 supported claims", target: 25 },
      { tier: "gold",     name: "Truth Teller",  description: "100 supported claims", target: 100 },
      { tier: "platinum", name: "Beacon",        description: "500 supported claims", target: 500 },
    ],
  },
  {
    groupId: "contested", group: "Lightning Rod", icon: "⚡", unit: "claims",
    metric: (s) => s.contested,
    tiers: [
      { tier: "bronze",   name: "Provocateur",  description: "5 contested claims",   target: 5 },
      { tier: "silver",   name: "Firebrand",    description: "25 contested claims",  target: 25 },
      { tier: "gold",     name: "Lightning Rod", description: "100 contested claims", target: 100 },
    ],
  },
  {
    groupId: "refuted", group: "Devil's Advocate", icon: "🎭", unit: "claims",
    metric: (s) => s.refuted,
    tiers: [
      { tier: "bronze",   name: "Risk Taker",      description: "Have 5 claims refuted",   target: 5 },
      { tier: "silver",   name: "Contrarian",      description: "Have 25 claims refuted",  target: 25 },
      { tier: "gold",     name: "Devil's Advocate", description: "Have 100 claims refuted", target: 100 },
    ],
  },
  {
    groupId: "quality", group: "Argument Quality", icon: "📊", unit: "avg",
    // Gated: only counts once the user has ≥5 non-pending claims
    metric: (s) => (s.totalClaims >= 5 ? Math.round(s.avgClaimScore) : 0),
    tiers: [
      { tier: "bronze",   name: "Solid",       description: "50 avg rubric score (5+ claims)", target: 50 },
      { tier: "silver",   name: "Rigorous",    description: "65 avg rubric score (5+ claims)", target: 65 },
      { tier: "gold",     name: "Masterful",   description: "80 avg rubric score (5+ claims)", target: 80 },
      { tier: "platinum", name: "Peerless",    description: "90 avg rubric score (5+ claims)", target: 90 },
    ],
  },
  {
    groupId: "prolific", group: "Prolific", icon: "📌", unit: "claims",
    metric: (s) => s.totalClaims,
    tiers: [
      { tier: "bronze",   name: "Staker",      description: "Stake 10 claims",  target: 10 },
      { tier: "silver",   name: "Prolific",    description: "Stake 50 claims",  target: 50 },
      { tier: "gold",     name: "Relentless",  description: "Stake 250 claims", target: 250 },
    ],
  },
  {
    groupId: "duelist", group: "Duelist (1v1)", icon: "🥊", unit: "wins",
    metric: (s) => s.competitiveWins,
    tiers: [
      { tier: "bronze",   name: "First Duel",  description: "Win a 1v1 competitive match", target: 1 },
      { tier: "silver",   name: "Duelist",     description: "Win 10 competitive matches",  target: 10 },
      { tier: "gold",     name: "Blademaster", description: "Win 25 competitive matches",  target: 25 },
    ],
  },
  {
    groupId: "team", group: "Team Player", icon: "🤝", unit: "wins",
    metric: (s) => s.teamWins,
    tiers: [
      { tier: "bronze",   name: "Teammate",     description: "Win a team match",     target: 1 },
      { tier: "silver",   name: "Team Player",  description: "Win 10 team matches",  target: 10 },
      { tier: "gold",     name: "Captain",      description: "Win 25 team matches",  target: 25 },
    ],
  },
  {
    groupId: "debates", group: "Debater", icon: "💬", unit: "debates",
    metric: (s) => s.debateCount,
    tiers: [
      { tier: "bronze",   name: "Newcomer",   description: "Join 5 debates",   target: 5 },
      { tier: "silver",   name: "Regular",    description: "Join 25 debates",  target: 25 },
      { tier: "gold",     name: "Debater",    description: "Join 100 debates", target: 100 },
    ],
  },
  {
    groupId: "messages", group: "Wordsmith", icon: "✍️", unit: "msgs",
    metric: (s) => s.messageCount,
    tiers: [
      { tier: "bronze",   name: "Speaker",    description: "Send 50 messages",    target: 50 },
      { tier: "silver",   name: "Orator",     description: "Send 500 messages",   target: 500 },
      { tier: "gold",     name: "Wordsmith",  description: "Send 5,000 messages", target: 5000 },
    ],
  },
  {
    groupId: "veteran", group: "Veteran", icon: "🎖️", unit: "days",
    metric: (s) => s.accountAgeDays,
    tiers: [
      { tier: "bronze",   name: "Settled In",  description: "30 days on Veritas",  target: 30 },
      { tier: "silver",   name: "Established", description: "180 days on Veritas", target: 180 },
      { tier: "gold",     name: "Veteran",     description: "1 year on Veritas",   target: 365 },
    ],
  },
];

export function computeMedals(stats: MedalStats): Medal[] {
  const medals: Medal[] = [];
  for (const g of GROUPS) {
    const value = g.metric(stats);
    g.tiers.forEach((t, i) => {
      medals.push({
        id: `${g.groupId}-${t.tier}`,
        groupId: g.groupId,
        group: g.group,
        name: t.name,
        description: t.description,
        icon: g.icon,
        tier: t.tier,
        order: i,
        target: t.target,
        value,
        unit: g.unit,
        earned: value >= t.target,
        progress: Math.max(0, Math.min(1, value / t.target)),
      });
    });
  }
  return medals;
}
