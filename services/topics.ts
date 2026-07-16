// The category list, and the seed claims that bootstrapped the deck.
//
// `topics` is SEED DATA now, not runtime data: services/propositions.ts loads it
// into the Proposition table once, and everything downstream reads the table.
// Rapid used to match on category and have the server pick a topic out of here,
// which is why it lived on the server at all — that's gone, because a category
// has no opposite and so can't be argued. Nothing picks from this list any more.
//
// The categories themselves are still real: they tag propositions and filter the
// queue. The client keeps its own copies (client/lib/topics.ts and a private one
// in app/arena/page.tsx) for pickers where the user chooses a topic themselves;
// those predate this and are still worth converging on GET /api/topics.

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

// pickTopic() lived here: it dealt Rapid a random claim from a category, which
// the server then split between two people with a coin flip. It is gone
// deliberately. Rounds are now paired on a Proposition the two players actually
// hold opposite views on, so nothing chooses a topic on their behalf.
