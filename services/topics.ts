// Server-side debate topic catalog.
//
// Rapid Fire matches by CATEGORY, then the server picks the topic — so the
// server has to own this list. The client has its own copies (client/lib/topics.ts
// and a private one inside app/arena/page.tsx); those predate this and are only
// used for pickers where the user chooses a topic themselves. Worth converging
// on GET /api/topics eventually.

export interface TopicCategory {
  id: string;
  label: string;
  topics: string[];
}

export const TOPIC_CATALOG: TopicCategory[] = [
  {
    id: "politics",
    label: "Politics",
    topics: [
      "Universal Basic Income should be implemented",
      "Voting should be mandatory in democracies",
      "Term limits should apply to all elected officials",
      "Social media platforms should be regulated as public utilities",
      "Ranked choice voting is better than first-past-the-post",
    ],
  },
  {
    id: "technology",
    label: "Technology",
    topics: [
      "AI will create more jobs than it destroys",
      "Social media does more harm than good to society",
      "Nuclear energy is the best path to clean energy",
      "Cryptocurrencies will replace traditional currencies",
      "Surveillance technology makes society safer",
    ],
  },
  {
    id: "philosophy",
    label: "Philosophy",
    topics: [
      "Free will is an illusion",
      "Moral relativism is correct",
      "Utilitarianism is the best ethical framework",
      "Privacy is more important than national security",
      "Cancel culture does more harm than good",
    ],
  },
  {
    id: "science",
    label: "Science",
    topics: [
      "Space exploration is worth the cost",
      "Gene editing in humans should be permitted",
      "Lab-grown meat will replace traditional farming",
      "Geoengineering is too risky to pursue",
      "Electric vehicles will solve transportation emissions",
    ],
  },
  {
    id: "society",
    label: "Society",
    topics: [
      "College education is overvalued in modern society",
      "Remote work is better than office work",
      "Zoos should be abolished",
      "Social media influencers deserve their income",
      "The gig economy exploits workers",
    ],
  },
  {
    id: "economics",
    label: "Economics",
    topics: [
      "Billionaires should not exist in a just society",
      "A four-day work week should be the global standard",
      "Free trade benefits all participating countries",
      "Automation will cause mass unemployment",
      "Universal healthcare improves economic productivity",
    ],
  },
];

export const CATEGORY_IDS = TOPIC_CATALOG.map((c) => c.id);

export function isCategoryId(id: string): boolean {
  return CATEGORY_IDS.includes(id);
}

export function categoryLabel(id: string): string {
  return TOPIC_CATALOG.find((c) => c.id === id)?.label ?? id;
}

// Pick a random topic from a category, or from anywhere when no category is given.
export function pickTopic(categoryId?: string | null): { categoryId: string; topic: string } {
  const pool = categoryId ? TOPIC_CATALOG.filter((c) => c.id === categoryId) : TOPIC_CATALOG;
  const cat = pool[Math.floor(Math.random() * pool.length)] ?? TOPIC_CATALOG[0];
  const topic = cat.topics[Math.floor(Math.random() * cat.topics.length)];
  return { categoryId: cat.id, topic };
}
