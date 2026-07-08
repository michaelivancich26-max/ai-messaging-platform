// Shared debate topic catalog — used by Arena and Compete so both surfaces
// offer the same curated propositions.

export const TOPIC_CATALOG: { category: string; topics: string[] }[] = [
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
