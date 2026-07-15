export type Difficulty = "easy" | "medium" | "hard";
export type PuzzleType = "fallacy" | "weakness";

export interface Puzzle {
  id: string;
  title: string;
  argument: string;
  speaker?: string;
  context?: string;
  type: PuzzleType;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
  category: string;
}

export const PUZZLES: Puzzle[] = [
  // ── Easy ──────────────────────────────────────────────────────────────────
  {
    id: "p001",
    title: "The Expert Endorsement",
    argument: "You should definitely invest in this cryptocurrency. My favourite actor posted about it on Instagram and said it changed his life financially.",
    type: "fallacy",
    question: "What's wrong with this argument?",
    options: [
      "Appeal to irrelevant authority — a celebrity has no financial expertise",
      "Ad hominem — it attacks the investor's character",
      "False dichotomy — it implies invest or miss out",
      "Hasty generalisation — one person's success proves nothing",
    ],
    correctIndex: 0,
    explanation: "This is an appeal to irrelevant authority. The actor is famous, not a financial expert. Celebrity endorsements carry zero analytical weight on investment decisions — and are often paid promotions.",
    difficulty: "easy",
    category: "Appeal to Authority",
  },
  {
    id: "p002",
    title: "The Slippery Prediction",
    argument: "If we allow students to retake exams, they'll never study properly the first time. Eventually nobody will prepare at all, and academic standards will collapse entirely.",
    type: "fallacy",
    question: "Identify the logical flaw.",
    options: [
      "Slippery slope — assumes a chain of events without justification",
      "Straw man — misrepresents the opposing view",
      "Ad hominem — attacks students personally",
      "False cause — mistakes correlation for causation",
    ],
    correctIndex: 0,
    explanation: "Classic slippery slope. The argument leaps from 'retakes allowed' to 'total academic collapse' through a chain of assumed consequences, none of which are argued for. Each step needs its own evidence.",
    difficulty: "easy",
    category: "Slippery Slope",
  },
  {
    id: "p003",
    title: "You or Chaos",
    argument: "Either you support stricter gun control laws, or you simply don't care about children's lives.",
    type: "fallacy",
    question: "What fallacy is being used?",
    options: [
      "False dichotomy — presents only two options when many exist",
      "Appeal to emotion — uses children to manipulate",
      "Circular reasoning — assumes the conclusion",
      "Red herring — introduces an irrelevant topic",
    ],
    correctIndex: 0,
    explanation: "False dichotomy. There's a wide spectrum between 'strict gun control' and 'not caring about children'. One can oppose a specific policy while caring deeply about safety. This framing silences nuance by design.",
    difficulty: "easy",
    category: "False Dichotomy",
  },
  {
    id: "p004",
    title: "The Genetic Dismissal",
    argument: "We shouldn't take Senator Harris's climate bill seriously — she took $200,000 from oil companies during her last campaign.",
    type: "fallacy",
    question: "What is the primary logical problem here?",
    options: [
      "Ad hominem (circumstantial) — attacks motive instead of the argument",
      "Appeal to authority — relies on the senator's position",
      "Straw man — distorts the bill's actual content",
      "Hasty generalisation — draws broad conclusions from one donation",
    ],
    correctIndex: 0,
    explanation: "Circumstantial ad hominem. Even if the senator has a conflict of interest, that doesn't tell us whether the bill is good or bad on its merits. The argument side-steps the policy entirely and attacks the source.",
    difficulty: "easy",
    category: "Ad Hominem",
  },
  {
    id: "p005",
    title: "Rooster Logic",
    argument: "Every morning I drink coffee before sunrise, and every morning the sun rises. Clearly, my coffee is causing the sun to rise.",
    type: "fallacy",
    question: "Name this reasoning error.",
    options: [
      "Post hoc ergo propter hoc — correlation mistaken for causation",
      "Circular reasoning — the conclusion is assumed in the premise",
      "Appeal to nature — natural things assumed to be better",
      "Hasty generalisation — too small a sample",
    ],
    correctIndex: 0,
    explanation: "Post hoc ('after this, therefore because of this'). Two events happening in sequence doesn't mean the first caused the second. This is the exact error behind many health myths and superstitions.",
    difficulty: "easy",
    category: "False Cause",
  },
  {
    id: "p006",
    title: "Ancient Wisdom",
    argument: "People have been using herbal remedies for thousands of years. Clearly they work — otherwise why would so many cultures have adopted them?",
    type: "weakness",
    question: "What is the most significant weakness in this argument?",
    options: [
      "Longevity of a practice doesn't prove effectiveness — ineffective things persist too",
      "Herbal remedies have no documented history",
      "The argument ignores that science is always wrong",
      "It commits a slippery slope by assuming wide adoption",
    ],
    correctIndex: 0,
    explanation: "Appeal to tradition. Practices survive for many reasons — cultural identity, placebo effect, social ritual — that have nothing to do with efficacy. Bloodletting persisted for centuries; that didn't make it effective.",
    difficulty: "easy",
    category: "Appeal to Tradition",
  },

  // ── Medium ────────────────────────────────────────────────────────────────
  {
    id: "p007",
    title: "The Patriot's Silence",
    argument: "If you're truly patriotic, you wouldn't criticise our government's foreign policy. Criticism only gives ammunition to our enemies.",
    type: "fallacy",
    question: "Which fallacy best describes this argument?",
    options: [
      "False dichotomy combined with appeal to consequences — equates criticism with disloyalty",
      "Red herring — foreign policy is irrelevant to patriotism",
      "Hasty generalisation — assumes all critics are enemies",
      "Circular reasoning — patriotism defines itself",
    ],
    correctIndex: 0,
    explanation: "This conflates criticism of policy with lack of patriotism (false dichotomy) and warns of bad consequences (appeal to consequences) rather than addressing whether the policy is actually sound. Dissent is often the most patriotic act.",
    difficulty: "medium",
    category: "False Dichotomy",
  },
  {
    id: "p008",
    title: "The Straw Man Defence",
    argument: "My opponent wants to reduce the defence budget by 10%. So apparently he thinks we should just disarm completely and leave our nation defenceless.",
    type: "fallacy",
    question: "What is the speaker doing to the opponent's argument?",
    options: [
      "Straw man — exaggerating the position to make it easier to attack",
      "Slippery slope — predicting extreme future consequences",
      "Ad hominem — attacking the opponent's character",
      "Appeal to fear — using national security to manipulate",
    ],
    correctIndex: 0,
    explanation: "A textbook straw man. '10% budget reduction' is replaced with 'complete disarmament', a position that's much easier to attack but not what the opponent proposed. Defeating a caricature wins no argument.",
    difficulty: "medium",
    category: "Straw Man",
  },
  {
    id: "p009",
    title: "The Consensus Gambit",
    argument: "Ninety percent of my colleagues in this department agree with my research conclusions. How could so many smart people all be wrong?",
    type: "weakness",
    question: "What is the key weakness in this argument?",
    options: [
      "Appeal to popularity within a group — consensus doesn't validate conclusions",
      "The argument is purely anecdotal",
      "It uses circular reasoning by assuming colleagues are reliable",
      "It's a red herring — colleague opinion is irrelevant to data",
    ],
    correctIndex: 0,
    explanation: "Agreement among a group — even experts — isn't evidence. History is full of scientific consensus later overturned (ulcers, continental drift, hand-washing). The argument needs to defend the data and methods, not the headcount.",
    difficulty: "medium",
    category: "Appeal to Popularity",
  },
  {
    id: "p010",
    title: "Moving the Goalposts",
    argument: "First they said 'show us one study proving vaccines are safe.' We showed fifty. Now they say 'but those were all funded by pharmaceutical companies.' No evidence will ever satisfy them.",
    type: "weakness",
    question: "What argumentative tactic is being described about the opposition?",
    options: [
      "Moving the goalposts — changing the standard of evidence after it's met",
      "Ad hominem — attacking the researchers' character",
      "Hasty generalisation — dismissing all pharmaceutical research",
      "False dichotomy — presenting only two types of research",
    ],
    correctIndex: 0,
    explanation: "Moving the goalposts. When an agreed standard is met and the required evidence is dismissed in favour of a new objection, the disagreement is no longer about evidence at all — it's unfalsifiable resistance.",
    difficulty: "medium",
    category: "Goalpost Moving",
  },
  {
    id: "p011",
    title: "The Loaded Question",
    argument: "When asked why the company's safety record is so poor, the CEO responded: 'Our safety record reflects our commitment to industry-standard practices.'",
    type: "weakness",
    question: "What critical weakness exists in the CEO's response?",
    options: [
      "Begging the question — assumes the record reflects commitment without justifying it",
      "Ad hominem — attacks the questioner",
      "Straw man — misrepresents the question",
      "False dichotomy — implies only two safety approaches exist",
    ],
    correctIndex: 0,
    explanation: "The response assumes the very thing in question — that the company is committed to safety — rather than addressing the evidence of a poor record. It substitutes a reassuring framing for an actual answer.",
    difficulty: "medium",
    category: "Circular Reasoning",
  },
  {
    id: "p012",
    title: "The No True Scotsman",
    argument: "No real entrepreneur would ever accept a government grant. And before you mention Elon Musk's Tesla — he's obviously not a real entrepreneur.",
    type: "fallacy",
    question: "What fallacy is at work here?",
    options: [
      "No true Scotsman — redefines the category to exclude counterexamples",
      "Ad hominem — attacks Elon Musk personally",
      "Hasty generalisation — draws from too few examples",
      "Appeal to authority — uses 'real entrepreneur' as a standard",
    ],
    correctIndex: 0,
    explanation: "No true Scotsman. When a counterexample threatens a generalisation, the arguer redefines the category to exclude it rather than revising the claim. 'No real X does Y — and if they do, they're not a real X.'",
    difficulty: "medium",
    category: "No True Scotsman",
  },
  {
    id: "p013",
    title: "The Naturalistic Leap",
    argument: "Humans evolved to eat meat — it's completely natural. Therefore a meat-heavy diet is clearly the healthiest choice for everyone.",
    type: "weakness",
    question: "What is the central flaw in this reasoning?",
    options: [
      "Appeal to nature — 'natural' doesn't mean healthy or optimal",
      "Hasty generalisation — one evolutionary fact can't cover all diets",
      "False cause — evolution doesn't prove health outcomes",
      "All of the above",
    ],
    correctIndex: 3,
    explanation: "All three apply. 'Natural' doesn't equal healthy (arsenic is natural). Applying one evolutionary tendency to every individual ignores vast variation. And evolutionary adaptation to eating something doesn't prove it's optimal — it proves we survived, not thrived.",
    difficulty: "medium",
    category: "Appeal to Nature",
  },
  {
    id: "p014",
    title: "The Shifting Burden",
    argument: "You can't prove that ghosts don't exist, so there's no reason not to believe in them.",
    type: "fallacy",
    question: "What logical principle does this violate?",
    options: [
      "Burden of proof — the claimant must prove existence, not others disprove it",
      "False dichotomy — presents belief and disbelief as the only options",
      "Circular reasoning — assumes ghosts exist to argue for belief",
      "Appeal to ignorance is correct but isn't a fallacy — it's valid reasoning",
    ],
    correctIndex: 0,
    explanation: "Appeal to ignorance (argumentum ad ignorantiam). Inability to disprove something is not evidence for it. The burden of proof lies with whoever makes the positive claim. By this logic we'd have to believe in every unfalsified claim ever made.",
    difficulty: "medium",
    category: "Burden of Proof",
  },

  // ── Hard ──────────────────────────────────────────────────────────────────
  {
    id: "p015",
    title: "The Motte and Bailey",
    argument: "Free speech is an absolute right — corporations have no business deciding what opinions are acceptable. When critics object, the speaker retreats: 'I'm just saying people should be polite to each other online.'",
    type: "fallacy",
    question: "What sophisticated rhetorical tactic is being used?",
    options: [
      "Motte and bailey — defends a strong claim by retreating to a defensible weak one when challenged",
      "Equivocation — uses 'free speech' with two different meanings",
      "Straw man — misrepresents what content moderation actually is",
      "Slippery slope — implies moderation leads to total censorship",
    ],
    correctIndex: 0,
    explanation: "Motte and bailey. The 'bailey' (bold, vulnerable claim: no moderation ever) gets attacked, so the speaker retreats to the 'motte' (easily-defended position: people should be polite). Once the dust settles, they push the bailey again. The two positions are treated as identical when they aren't.",
    difficulty: "hard",
    category: "Motte and Bailey",
  },
  {
    id: "p016",
    title: "The Scope Creep",
    argument: "Scientists once thought the universe was static. They were wrong. Scientists now say the climate is warming due to human activity. Given their track record, why should we believe them?",
    type: "weakness",
    question: "What is the most precise description of this argument's flaw?",
    options: [
      "Hasty generalisation — uses one corrected error to discredit an entirely different conclusion",
      "Ad hominem — attacks scientists rather than the evidence",
      "Equivocation — uses 'scientists' to mean different groups",
      "All of the above, compounding each other",
    ],
    correctIndex: 3,
    explanation: "All three interact. The argument generalises from one case to all science (hasty generalisation), attacks the people rather than the data (ad hominem), and conflates cosmologists of 1920 with today's climate scientists as a single bloc (equivocation). Science revising itself is a feature, not a flaw.",
    difficulty: "hard",
    category: "Compound Fallacies",
  },
  {
    id: "p017",
    title: "The Overton Nudge",
    argument: "I'm not saying we should deport all immigrants. I'm just asking — shouldn't we at least consider whether immigration has been entirely positive? It's just a question.",
    type: "weakness",
    question: "What rhetorical technique is embedded in this framing?",
    options: [
      "Loaded framing — the 'just asking' framing smuggles in a negative assumption as a neutral question",
      "Red herring — shifts from a specific policy to a vague inquiry",
      "False dichotomy — implies immigration is either entirely positive or problematic",
      "Straw man — misrepresents the pro-immigration position as claiming perfection",
    ],
    correctIndex: 0,
    explanation: "The 'just asking questions' (JAQing off) technique. The question is framed as neutral inquiry but loads in the assumption that immigration may not have been 'entirely positive' — a standard nobody actually holds. The format gives deniability ('I'm not claiming anything!') while advancing a claim.",
    difficulty: "hard",
    category: "Loaded Framing",
  },
  {
    id: "p018",
    title: "The Overgeneralised Principle",
    argument: "If one person's freedom ends where another's begins, then any speech that makes someone uncomfortable must be restricted — feelings of discomfort are a clear boundary violation.",
    type: "weakness",
    question: "Where does the reasoning break down?",
    options: [
      "Equivocation on 'harm' — conflates discomfort with rights violations the principle was designed for",
      "Circular reasoning — the principle defines itself",
      "Slippery slope — discomfort will inevitably lead to harm",
      "Ad hominem — implies those who restrict speech are authoritarian",
    ],
    correctIndex: 0,
    explanation: "The principle 'freedom ends where another's begins' was designed to prevent concrete harm (violence, fraud, defamation). Stretching 'harm' to include psychological discomfort from disagreement makes the principle self-defeating — any opinion could restrict any other opinion.",
    difficulty: "hard",
    category: "Equivocation",
  },
  {
    id: "p019",
    title: "The Kafka Trap",
    argument: "Your defensiveness about the accusation of racism just proves how deeply it's ingrained in you. If you weren't racist, you wouldn't feel the need to deny it.",
    type: "fallacy",
    question: "Why is this argument logically inescapable — and why does that make it flawed?",
    options: [
      "It's unfalsifiable — both agreement and denial are treated as evidence of guilt",
      "It's an ad hominem — it attacks character rather than providing evidence",
      "It's a false dichotomy — denying a charge isn't the only alternative to guilt",
      "It begs the question — assumes racism before presenting evidence",
    ],
    correctIndex: 0,
    explanation: "A Kafka trap. The structure makes the accusation immune to refutation: agreeing confirms guilt; denying confirms guilt (as defensiveness). Any valid argument must be falsifiable — if no possible response counts as evidence of innocence, the charge is not a logical claim at all.",
    difficulty: "hard",
    category: "Unfalsifiability",
  },
  {
    id: "p020",
    title: "The Isolated Statistic",
    argument: "Crime in the city centre fell 30% after the new policing policy was introduced. Clearly, the policy worked.",
    type: "weakness",
    question: "What critical piece of reasoning is missing?",
    options: [
      "No control — we don't know what would have happened without the policy (counterfactual)",
      "The statistic may be cherry-picked from a longer trend",
      "Correlation is not causation — other factors could explain the drop",
      "All of the above",
    ],
    correctIndex: 3,
    explanation: "All three are valid objections. Without a control group or comparison period, the 30% drop is consistent with a pre-existing trend, seasonal variation, demographic change, or dozens of other factors. Single before/after statistics are among the most commonly misread forms of evidence.",
    difficulty: "hard",
    category: "Causal Reasoning",
  },
];

export const DAILY_PUZZLE_ID = (() => {
  const day = Math.floor(Date.now() / 86400000);
  return PUZZLES[day % PUZZLES.length].id;
})();

export function getPuzzleById(id: string): Puzzle | undefined {
  return PUZZLES.find(p => p.id === id);
}

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];

// Each entry is a light-mode pair plus its dark-mode override. The original map
// was dark-only (bg-*-950/40 text-*-400), which rendered as a pale wash with
// near-invisible text once light became the default theme.
export const CATEGORY_COLORS: Record<string, string> = {
  "Ad Hominem":       "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  "Straw Man":        "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  "False Dichotomy":  "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  "Slippery Slope":   "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  "Appeal to Authority": "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  "Appeal to Popularity": "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
  "Appeal to Tradition":  "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-400",
  "Appeal to Nature":  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  "False Cause":      "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  "Circular Reasoning": "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
  "Goalpost Moving":  "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400",
  "No True Scotsman": "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  "Burden of Proof":  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  "Motte and Bailey": "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-400",
  "Compound Fallacies": "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  "Loaded Framing":   "bg-lime-100 text-lime-800 dark:bg-lime-950/40 dark:text-lime-400",
  "Equivocation":     "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-400",
  "Unfalsifiability": "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  "Causal Reasoning": "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
};
