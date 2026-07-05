export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Example {
  type: "bad" | "good";
  label: string;
  text: string;
}

export interface LessonSection {
  heading: string;
  body: string;
  examples?: Example[];
}

export interface Lesson {
  slug: string;
  title: string;
  subtitle: string;
  readingTime: string;
  intro: string;
  sections: LessonSection[];
  takeaways: string[];
  quiz: QuizQuestion[];
  practice?: { botId: string; botName: string; cta: string };
}

export interface Series {
  slug: string;
  title: string;
  description: string;
  color: "red" | "blue" | "emerald" | "amber";
  lessons: Lesson[];
}

// ─── Series 1: Fallacies 101 ──────────────────────────────────────────────────

const fallacies: Series = {
  slug: "fallacies",
  title: "Fallacies 101",
  description: "Learn to identify and counter the most common logical fallacies used in debate — from ad hominem attacks to false balance.",
  color: "red",
  lessons: [
    {
      slug: "ad-hominem",
      title: "Ad Hominem",
      subtitle: "Attacking the person, not the argument",
      readingTime: "5 min",
      intro: "\"Ad hominem\" is Latin for \"to the person.\" It is one of the most common fallacies in debate: instead of addressing what someone actually argued, you attack who said it. Whether your opponent is a hypocrite, a fool, or has suspect motives has no logical bearing on whether their argument is correct.",
      sections: [
        {
          heading: "What Is Ad Hominem?",
          body: "An ad hominem attack shifts focus from the argument to the arguer. Instead of explaining why a claim is wrong, the attacker targets the speaker's character, credibility, motives, or personal history. The defining feature is that the attack is used as a reason to dismiss the argument — not just as a side observation.",
          examples: [
            { type: "bad", label: "Ad hominem in action", text: "We can't trust your views on healthcare policy — you don't even have a medical degree. So whatever you're arguing here, it doesn't hold up." },
            { type: "good", label: "Engaging the argument instead", text: "Your proposal assumes administrative costs drive healthcare prices — but pharmaceutical pricing actually accounts for a larger share of expenditure. Here's the data." },
          ],
        },
        {
          heading: "Types of Ad Hominem",
          body: "There are several varieties:\n\nDirect — attacking character to dismiss a view: \"You're dishonest, so your argument is worthless.\"\n\nCircumstantial — using affiliation to pre-dismiss: \"Of course you support tax cuts — you're wealthy.\"\n\nTu quoque (\"you too\") — citing hypocrisy: \"You tell me to exercise more, but you're out of shape.\" The advice can be sound even from an imperfect source.\n\nAll share the same flaw: the person's character or consistency does not determine the truth of their claim.",
        },
        {
          heading: "Why It's a Fallacy",
          body: "The validity of an argument is entirely independent of who makes it. A convicted fraudster can correctly describe physics. A saint can make a logically flawed argument. Attacking the person instead of the reasoning never addresses whether the conclusion follows from the premises — so it contributes nothing to finding the truth.",
        },
      ],
      takeaways: [
        "A person's character does not determine the truth of their argument",
        "Even a biased or flawed person can make valid points — evaluate the argument, not the person",
        "Counter it by naming the fallacy, then redirecting to the substance: \"That's about me, not my argument. Let me address the actual reasoning.\"",
      ],
      quiz: [
        {
          question: "Which of the following is an ad hominem attack?",
          options: [
            "Your carbon tax proposal ignores the impact on low-income households.",
            "We can't take climate advice from someone who flies in private jets.",
            "Carbon taxes have reduced emissions in Canada by 12% since 2019.",
            "There's a strong economic case against carbon taxes in developing economies.",
          ],
          correctIndex: 1,
          explanation: "Option B attacks the person's behavior (flying privately) rather than their argument. Whether someone practices what they preach has no bearing on the correctness of their position.",
        },
        {
          question: "Your opponent says: \"You only support free trade because you work in finance.\" What type of ad hominem is this?",
          options: ["Direct ad hominem — attacking character", "Tu quoque — citing hypocrisy", "Circumstantial ad hominem — using affiliation to dismiss", "A legitimate observation about bias"],
          correctIndex: 2,
          explanation: "Circumstantial ad hominem uses someone's affiliation or circumstances (working in finance) to preemptively dismiss their argument. Whether the arguer has financial interests doesn't determine whether free trade is economically beneficial.",
        },
        {
          question: "What is the most effective counter to an ad hominem attack?",
          options: [
            "Attack the opponent's character in return",
            "Deny the personal accusation and stop there",
            "Name the fallacy, then redirect to the substance of the actual argument",
            "Concede the point and move to a different argument",
          ],
          correctIndex: 2,
          explanation: "Naming the fallacy clarifies what happened; redirecting to the argument's substance shows you can defend it on its merits. Just denying the accusation keeps the audience focused on the personal attack instead of the argument.",
        },
      ],
      practice: { botId: "dunk", botName: "Dunk", cta: "Dunk questions your motives every turn — catch him in the act and name it" },
    },

    {
      slug: "straw-man",
      title: "Straw Man",
      subtitle: "Defeating the argument no one made",
      readingTime: "5 min",
      intro: "The straw man fallacy involves misrepresenting your opponent's argument — distorting, exaggerating, or oversimplifying it — and then attacking that distorted version instead of what was actually said. The name comes from the idea of building a scarecrow (an effigy made of straw) that is easy to knock down, rather than fighting the real opponent.",
      sections: [
        {
          heading: "What Is a Straw Man?",
          body: "A straw man substitutes the actual argument with a weaker or more extreme version, then defeats the substitute. The opponent never made the argument being attacked. The audience may not notice — which is why it works, and why it is dishonest.",
          examples: [
            { type: "bad", label: "Straw man attack", text: "Person A: \"We should have stricter background checks for gun purchases.\" Person B: \"My opponent wants to take away every law-abiding citizen's right to bear arms and leave us defenseless.\"" },
            { type: "good", label: "Engaging the actual argument", text: "\"Stricter background checks already exist — the real question is whether extending them to private sales would change outcomes. The evidence from states that have tried it suggests modest effects, so let's look at those numbers.\"" },
          ],
        },
        {
          heading: "Why It Is Dishonest",
          body: "A straw man wins a debate that wasn't happening. It looks like a decisive rebuttal but it's a non-answer — if you've attacked a position your opponent never held, you've contributed nothing to determining whether their actual position is true or false. Audiences who notice lose trust in the arguer; those who don't are deceived.",
        },
        {
          heading: "How to Spot and Counter It",
          body: "Watch for language that escalates or universalizes your position beyond what you said:\n\n\"So you're saying that ALL...\"\n\"You want to COMPLETELY eliminate...\"\n\"By that logic, you'd have to...\"\n\nRespond by repairing the record: \"That's not my position. What I actually argued was [restatement].\" Be calm and specific — vague protests sound defensive.",
        },
      ],
      takeaways: [
        "Always address your opponent's actual argument, not a weakened version",
        "If you are tempted to simplify their view to make it easier to attack, that is a red flag",
        "Counter by clearly restating your real position: \"Let me be precise about what I am arguing...\"",
      ],
      quiz: [
        {
          question: "Person A: \"We should reduce added sugar in school lunches.\" Person B: \"My opponent wants to ban all food enjoyment from children's lives.\" What fallacy is Person B committing?",
          options: ["Ad hominem", "Straw man", "False dichotomy", "Appeal to authority"],
          correctIndex: 1,
          explanation: "Person B exaggerated a specific, targeted proposal (reducing added sugar) into an extreme universal ban. This is a straw man — attack the distorted version, not the real argument.",
        },
        {
          question: "Which response best counters a straw man?",
          options: [
            "\"You clearly didn't understand my point.\"",
            "\"Let me restate what I actually argued, and show why your version is different from mine.\"",
            "\"You're using the straw man fallacy, which means I automatically win.\"",
            "Repeat your original argument more loudly.",
          ],
          correctIndex: 1,
          explanation: "The best counter is to calmly restate your actual position and contrast it with the distortion. Naming the fallacy helps, but only if you follow it with the substantive clarification.",
        },
        {
          question: "What is the key difference between a straw man and a legitimate rebuttal?",
          options: [
            "Legitimate rebuttals use more evidence",
            "A straw man responds to a distorted version; a rebuttal responds to the actual argument",
            "Straw men only appear in formal debates",
            "Legitimate rebuttals take longer to deliver",
          ],
          correctIndex: 1,
          explanation: "The essential feature of a straw man is that it addresses an argument the opponent did not make. A legitimate rebuttal engages precisely with what was actually said.",
        },
      ],
      practice: { botId: "rex", botName: "Rex", cta: "Rex regularly misrepresents your arguments — catch each one and demand he respond to what you actually said" },
    },

    {
      slug: "false-dichotomy",
      title: "False Dichotomy",
      subtitle: "The either/or trap",
      readingTime: "4 min",
      intro: "A false dichotomy (also called a false dilemma or either/or fallacy) presents a situation as having only two possible options when in reality more exist. By artificially narrowing the choices, the arguer makes one option seem inevitable once the other is dismissed.",
      sections: [
        {
          heading: "The Mechanics of the Trap",
          body: "False dichotomies work by framing a complex situation as binary: \"Either X or Y — there is no other way.\" If the listener accepts this framing, they are already trapped. One option is made to look unacceptable, leaving the other as the only \"reasonable\" choice — even though neither may be right, or there may be a third path entirely.",
          examples: [
            { type: "bad", label: "Classic false dichotomy", text: "\"You are either with us or against us.\" (Ignores neutral positions, partial agreements, and principled opposition.)" },
            { type: "bad", label: "Policy false dichotomy", text: "\"We can either cut spending or raise taxes — those are the only options.\" (Ignores restructuring debt, stimulating growth, reallocating budgets, and many other tools.)" },
            { type: "good", label: "Naming the additional options", text: "\"There are at least four approaches here: cutting spending, raising taxes, restructuring debt, or stimulating growth through targeted investment. Let's evaluate each on its merits.\"" },
          ],
        },
        {
          heading: "Why It Works (and Why It Is Wrong)",
          body: "Binary choices feel clear and decisive; nuance feels complicated and evasive. That psychological asymmetry is the fallacy's power. But reality almost never offers only two options — most policy debates, ethical questions, and empirical disputes exist on a spectrum, not between two poles.",
        },
        {
          heading: "How to Counter It",
          body: "Name the additional options: \"You've presented this as a binary choice, but there's at least a third path: [X].\" You can also challenge the characterization of the \"wrong\" option — often the arguer has made it sound more extreme than it needs to be.",
        },
      ],
      takeaways: [
        "Always ask: are there really only two options here?",
        "\"Either you're for X or you're against freedom\" is almost always a false dichotomy",
        "Counter by naming additional alternatives, not by picking one of the false two",
      ],
      quiz: [
        {
          question: "A politician says: \"Either we increase defense spending or we leave our country vulnerable to attack.\" What is the problem?",
          options: [
            "The argument relies on false statistics",
            "It presents only two options when others exist — reallocation, diplomacy, alliances",
            "It is an ad hominem against the military",
            "It is a straw man of the opposition's position",
          ],
          correctIndex: 1,
          explanation: "The claim ignores multiple intermediate options: reallocating the current defense budget, efficiency improvements, diplomatic solutions, and international partnerships. Presenting the choice as \"increase spending or be vulnerable\" is artificially binary.",
        },
        {
          question: "Someone tells you: \"If you don't support my policy, you must support the opposite.\" How do you respond?",
          options: [
            "Explain why you support neither option and propose a third path",
            "Choose the lesser of two evils",
            "Admit that you haven't thought about it enough",
            "Ask them to define what the \"opposite\" policy is",
          ],
          correctIndex: 0,
          explanation: "The correct response is to reject the framing itself by identifying a third (or fourth) position. Accepting the binary as given means accepting the fallacy.",
        },
        {
          question: "Which of the following is NOT a false dichotomy?",
          options: [
            "\"You either love your country or you want to tear it down.\"",
            "\"Either the defendant is guilty or innocent.\" (in a legal proceeding)",
            "\"Either we privatize healthcare or people will die.\"",
            "\"You're either pro-business or pro-worker.\"",
          ],
          correctIndex: 1,
          explanation: "Legal guilt or innocence is a genuine binary in most legal systems — one of the few real either/or situations. The others all ignore intermediate positions or false equivalences.",
        },
      ],
      practice: { botId: "rex", botName: "Rex", cta: "Rex loves a false \"you're either with me or against common sense\" — identify each one and show the middle ground" },
    },

    {
      slug: "appeal-to-authority",
      title: "Appeal to Authority",
      subtitle: "When expertise becomes a shortcut",
      readingTime: "5 min",
      intro: "Citing an expert is not automatically a fallacy — it is often appropriate and useful. The appeal to authority becomes fallacious when the \"authority\" lacks expertise in the relevant area, or when a single dissenting authority is treated as decisive against a strong scientific consensus.",
      sections: [
        {
          heading: "Legitimate vs. Fallacious Appeals",
          body: "The key question is: does the cited authority actually have expertise in the specific domain being discussed?",
          examples: [
            { type: "good", label: "Legitimate appeal to authority", text: "\"The CDC, WHO, and the majority of epidemiological research support this position.\" (Relevant authorities, broad consensus.)" },
            { type: "bad", label: "Wrong expertise", text: "\"A Nobel Prize-winning physicist says vaccines are dangerous.\" (The physicist's expertise is in physics, not immunology or epidemiology.)" },
            { type: "bad", label: "Single anecdote", text: "\"My uncle who's a doctor says this diet works.\" (A single practitioner's opinion is not a substitute for clinical evidence.)" },
          ],
        },
        {
          heading: "Consensus vs. Single Expert",
          body: "Even within the right field, one expert's opinion does not override the weight of evidence or the field's consensus. Science advances through replication and peer review. When an individual expert contradicts a broad consensus, the appropriate response is to look at the weight of evidence — not to treat the dissenting expert as equally authoritative to the consensus.",
        },
        {
          heading: "How to Evaluate an Authority",
          body: "Ask four questions:\n\n1. Is this person an expert in the specific relevant field?\n2. Do other experts in the same field share this view?\n3. Is there reason to suspect bias — funding, ideology, financial stake?\n4. How does this authority's view relate to the broader evidence base?\n\nIf the answers are: wrong field, mostly no, yes, and poorly — the citation is not reliable.",
        },
      ],
      takeaways: [
        "Citing the wrong authority (or a single authority against consensus) is fallacious; citing the right authority in context is legitimate",
        "Always check whether the expertise matches the specific claim",
        "\"An expert said it\" is a starting point, not a conclusion",
      ],
      quiz: [
        {
          question: "A company argues its product is safe because \"thousands of satisfied customers\" have used it. What is the problem?",
          options: [
            "This is an appeal to false authority — customers are not safety experts",
            "This is ad hominem",
            "This is a perfectly legitimate appeal to authority",
            "This is cherry-picking",
          ],
          correctIndex: 0,
          explanation: "Customer satisfaction is not authority on product safety. \"Many people use it\" is an appeal to popularity, not expert endorsement — a close cousin of the appeal to authority fallacy.",
        },
        {
          question: "Which appeal to authority is most legitimate?",
          options: [
            "\"A famous actor endorses this health supplement.\"",
            "\"A nutritionist with 20 years of clinical research experience recommends this diet for diabetes management.\"",
            "\"Experts agree on this\" (without specifying who or in what field).",
            "\"My professor once mentioned this was probably true.\"",
          ],
          correctIndex: 1,
          explanation: "Option B names a relevant expert in the specific domain (nutritionist + clinical research + diabetes), with specific credentials. The others are either irrelevant, too vague, or insufficiently verified.",
        },
        {
          question: "97% of climate scientists support the consensus on human-caused climate change. A skeptic cites a single contrarian meteorologist. How should you respond?",
          options: [
            "Dismiss the meteorologist without engaging",
            "Ask for their credentials to determine if they're qualified",
            "Note that the weight of expert opinion overwhelmingly supports the consensus, and ask what specific evidence would change that consensus",
            "Agree to disagree — both sides have experts",
          ],
          correctIndex: 2,
          explanation: "Consensus vs. outlier is not a tie. The appropriate framing is the weight and direction of expert consensus, while remaining open to specific counterevidence — not presenting both sides as equally credible.",
        },
      ],
      practice: { botId: "pip", botName: "Pip", cta: "Pip cites statistics from unnamed \"studies\" — challenge him to name the source and methodology" },
    },

    {
      slug: "slippery-slope",
      title: "Slippery Slope",
      subtitle: "When \"and then...\" goes too far",
      readingTime: "4 min",
      intro: "The slippery slope fallacy asserts that one action or policy will inevitably lead to a chain of increasingly extreme consequences — without justifying why each step necessarily follows from the previous one. The structure sounds logical but relies on unjustified assumptions at every link.",
      sections: [
        {
          heading: "The Structure of a Slippery Slope",
          body: "A slippery slope looks like: \"If we allow A, then B will happen, then C, then eventually Z.\" The key weakness is the unstated and unjustified assumption that each link in the chain is inevitable.",
          examples: [
            { type: "bad", label: "Classic slippery slope", text: "\"If we allow euthanasia for the terminally ill, next we will euthanize people with disabilities, then the poor, then anyone society finds inconvenient.\" (Each step assumes the previous without justification.)" },
            { type: "bad", label: "Disproportionate consequence chain", text: "\"If we lower the drinking age to 18, society will collapse — young people will drink all day, skip work, drive drunk, and there will be chaos in the streets.\"" },
          ],
        },
        {
          heading: "When Is the Slope Real?",
          body: "Not all slippery slope arguments are fallacious. Sometimes a genuine causal chain exists — the fallacy is in asserting the chain without evidence, not in the logical form itself. A legitimate slope argument provides empirical evidence that each step has followed in analogous situations, or explains the mechanism by which each step makes the next more likely.",
          examples: [
            { type: "good", label: "Evidence-based slope", text: "\"Research on similar regulations in comparable countries shows that without enforcement mechanisms, initial restrictions are progressively weakened by regulatory capture — a documented pattern. Here are three examples.\"" },
          ],
        },
        {
          heading: "How to Counter It",
          body: "Target the weakest link: \"Your argument requires that B follows from A — what's your evidence for that specific step?\" You do not need to refute the entire chain — break one link and the argument collapses.",
        },
      ],
      takeaways: [
        "A slope requires justification for each step, not just the endpoints",
        "Break the weakest link in the chain to collapse the argument",
        "Some slippery slopes are real — ask for evidence of the causal mechanism before accepting or dismissing them",
      ],
      quiz: [
        {
          question: "Someone argues: \"If we regulate tobacco advertising, next they'll regulate alcohol ads, then food ads, then all advertising will be banned.\" What is the best counter?",
          options: [
            "Point out that you agree tobacco advertising should be regulated anyway",
            "Ask for evidence that tobacco regulation has led to total ad bans in any comparable country",
            "Agree that it is a risk and propose safeguards",
            "Note that the argument is emotional, not logical",
          ],
          correctIndex: 1,
          explanation: "The best counter is to challenge a specific link: has this pattern actually occurred elsewhere? Evidence about analogous situations tests whether the slope is real or hypothetical.",
        },
        {
          question: "What distinguishes a legitimate slippery slope from a fallacious one?",
          options: [
            "The number of steps in the chain",
            "Whether the steps are justified with evidence of a causal mechanism",
            "Whether the conclusion is extreme",
            "The political ideology of the person making the argument",
          ],
          correctIndex: 1,
          explanation: "The key is whether each step is supported. A well-documented causal chain can make a slippery slope argument compelling; an undocumented one is a fallacy.",
        },
        {
          question: "A debater argues: \"If we allow same-day voter registration, election fraud will increase, then elections will be illegitimate, then democracy will collapse.\" How do you respond?",
          options: [
            "Agree that election fraud is a serious issue",
            "Ask for empirical evidence on whether same-day registration correlates with increased fraud in states that have implemented it",
            "Point out that democracy is already imperfect",
            "Dismiss the argument because it sounds extreme",
          ],
          correctIndex: 1,
          explanation: "Ground the debate in evidence: states using same-day registration can be studied. If fraud rates did not increase there, the first link in the chain breaks — and the whole argument collapses.",
        },
      ],
      practice: { botId: "rex", botName: "Rex", cta: "Rex loves catastrophizing — ask him \"what's your evidence that X leads to Y?\" for each step" },
    },

    {
      slug: "cherry-picking",
      title: "Cherry-Picking",
      subtitle: "When the data you don't cite matters most",
      readingTime: "5 min",
      intro: "Cherry-picking (also called selective evidence) is the practice of presenting only the evidence that supports your position while ignoring evidence that contradicts it. It is deceptive not because the chosen evidence is false, but because the selection creates a misleading picture of the full body of evidence.",
      sections: [
        {
          heading: "How Cherry-Picking Works",
          body: "Scientific and empirical research rarely produces unanimous results. Studies conflict; data points vary; methodologies differ. A cherry-picker exploits this variation by highlighting only the favorable results and treating contradictory findings as if they do not exist.",
          examples: [
            { type: "bad", label: "Cherry-picking studies", text: "\"Three studies show that this supplement reduces cancer risk — therefore it works.\" (The speaker omits 20 studies showing no effect or mixed results.)" },
            { type: "bad", label: "Cherry-picking statistics", text: "\"Crime fell in our city last year — proof that our policy is working.\" (Crime fell everywhere nationally; the speaker ignores the baseline trend.)" },
          ],
        },
        {
          heading: "The Base Rate Problem",
          body: "Cherry-picking often ignores base rates — the overall distribution from which the favorable examples are drawn. If one in fifty studies shows a positive result, citing that one study without the context of fifty makes a 2% probability look like 100%. This is especially dangerous in medicine and policy, where cherry-picked evidence can cause real harm.",
        },
        {
          heading: "How to Detect and Counter It",
          body: "Ask: \"What does the full body of evidence show?\" and \"Have you looked at the systematic reviews that weigh all the evidence, not just the favorable examples?\"\n\nChallenge your opponent to cite meta-analyses and systematic reviews. In debate, name the pattern: \"You've cited two studies — but the systematic review of this question found the opposite. What's your basis for selecting these two?\"",
        },
      ],
      takeaways: [
        "The studies you do not cite matter as much as the ones you do",
        "Ask for meta-analyses and systematic reviews, not individual studies",
        "A single favorable data point proves nothing if you have not accounted for the full distribution",
      ],
      quiz: [
        {
          question: "A pharmaceutical company presents 5 trials showing their drug works but does not mention 12 trials showing it does not. This is:",
          options: ["Valid marketing practice", "Cherry-picking", "A straw man of the alternative treatment", "An appeal to authority"],
          correctIndex: 1,
          explanation: "Presenting only supporting evidence while ignoring disconfirming evidence is the definition of cherry-picking. The 5 favorable trials exist — but they are not representative of the full evidence base.",
        },
        {
          question: "What is the best response when someone cites a single study to support their position?",
          options: [
            "Ask them to provide at least three studies",
            "Dismiss their study as biased",
            "Ask what the broader body of research shows and whether any systematic reviews exist",
            "Accept the evidence and move to a different argument",
          ],
          correctIndex: 2,
          explanation: "One study is rarely sufficient to establish a claim. The right question is what the weight of evidence shows — typically through systematic reviews or meta-analyses that synthesize multiple studies with conflicting results.",
        },
        {
          question: "What is a \"base rate\" and why does it matter for spotting cherry-picking?",
          options: [
            "The rate at which studies are published per year",
            "The overall distribution of results across all studies on a question",
            "The baseline effectiveness of a placebo",
            "The typical rate of statistical significance in a field",
          ],
          correctIndex: 1,
          explanation: "Knowing the base rate tells you whether the cherry-picked example is representative. If 1 in 50 studies finds an effect and someone cites that 1 study, they have given a 2% probability the appearance of 100%.",
        },
      ],
      practice: { botId: "pip", botName: "Pip", cta: "Pip invents and cherry-picks statistics — demand he cite his methodology, then point out what he is omitting" },
    },

    {
      slug: "false-balance",
      title: "False Balance",
      subtitle: "Not all \"both sides\" are equal",
      readingTime: "5 min",
      intro: "False balance is the presentation of two positions as equally valid or equally supported when the evidence strongly favors one over the other. Often framed as fairness or open-mindedness, it is profoundly misleading when applied to empirical questions with clear answers.",
      sections: [
        {
          heading: "The False Equivalence Problem",
          body: "\"Teaching the controversy\" sounds fair. But when 97% of climate scientists agree on human-caused climate change and you present one dissenting fringe view as \"the other side,\" you have created a false impression that the evidence is evenly split. The existence of two positions does not make them equally credible.",
          examples: [
            { type: "bad", label: "False balance in media", text: "A news broadcast presents climate scientists alongside climate change deniers as \"both experts\" — implying a 50/50 scientific debate when the actual consensus is overwhelming." },
            { type: "bad", label: "Both-sidesing a settled question", text: "\"Some say vaccines are safe; others say they are not. We will leave it up to you.\" Treating a medical consensus and a discredited position as equally worthy of consideration." },
            { type: "good", label: "Accurately representing the landscape", text: "\"The scientific consensus is clear; here are the specific data points the dissenting researchers cite — and here is why the mainstream scientific community finds these arguments unpersuasive.\"" },
          ],
        },
        {
          heading: "When Balance Is Appropriate",
          body: "Genuine balance is important when the evidence is truly mixed, when values genuinely differ, or when policy questions involve trade-offs between competing goods. The error is applying the form of balance (presenting two sides) to empirical questions where the weight of evidence is not balanced. Values debates warrant balance; factual disputes require evidence.",
        },
        {
          heading: "How to Counter It",
          body: "Distinguish empirical questions from values questions. On empirical questions, cite the weight of expert consensus. On genuine values questions, acknowledge the complexity. The key phrase: \"Reasonable people disagree about whether we should prioritize X or Y — that is a genuine values debate. But whether X causes Y is an empirical question with an answer.\"",
        },
      ],
      takeaways: [
        "Balance is a virtue in values debates; it is misleading in empirical ones",
        "The existence of two positions does not make them equally supported",
        "Ask: \"What does the weight of evidence show?\" — not \"What do both sides say?\"",
      ],
      quiz: [
        {
          question: "A moderator says \"Some say the earth is 4.5 billion years old; others say it is 6,000 years old. Both views have their proponents.\" What is wrong?",
          options: [
            "The moderator is using an appeal to authority",
            "This treats a settled empirical question as if both positions are equally supported",
            "This is a straw man of young-earth creationism",
            "This is a legitimate example of presenting multiple perspectives",
          ],
          correctIndex: 1,
          explanation: "False balance. The scientific evidence for the Earth's age is overwhelming; presenting the young-earth view as equally credible creates a misleading impression of the empirical landscape.",
        },
        {
          question: "When is \"presenting both sides\" genuinely appropriate?",
          options: [
            "Whenever two sides exist",
            "When discussing empirical facts with a strong scientific consensus",
            "When debating trade-offs between values, where evidence does not resolve the question",
            "Only in formal academic debates",
          ],
          correctIndex: 2,
          explanation: "Genuine balance is appropriate when the question is values-based or when evidence is truly mixed. For empirical questions, the weight of evidence — not the existence of dissent — should guide the presentation.",
        },
        {
          question: "How should you respond to someone who says \"Well, experts disagree\" to dismiss a scientific consensus?",
          options: [
            "Accept that the science is uncertain",
            "Ask which experts, how many, and what percentage of the relevant expert community holds each view",
            "Cite even more experts on your side",
            "Acknowledge the debate and move to a new argument",
          ],
          correctIndex: 1,
          explanation: "\"Experts disagree\" is meaningless without context. A handful of outlier experts always exist. The relevant questions are the distribution of expert opinion and the weight of evidence — not whether any dissent exists.",
        },
      ],
      practice: { botId: "norm", botName: "Norm", cta: "Norm treats every claim as equally valid — challenge him to explain what evidence would actually change his view" },
    },
  ],
};

// ─── Series 2: Argument Structures ───────────────────────────────────────────

const structures: Series = {
  slug: "structures",
  title: "Argument Structures",
  description: "Master the frameworks used by competitive debaters to build complete, persuasive arguments — from the Toulmin model to reductio ad absurdum.",
  color: "blue",
  lessons: [
    {
      slug: "toulmin-model",
      title: "The Toulmin Model",
      subtitle: "The architecture of a complete argument",
      readingTime: "7 min",
      intro: "In 1958, philosopher Stephen Toulmin proposed a model of argumentation that changed how we teach and analyze debate. Rather than focusing on formal logical proofs, Toulmin described how arguments actually work in practical discourse — and identified six components that complete arguments share.",
      sections: [
        {
          heading: "The Six Components",
          body: "Every strong argument can be broken into these parts:\n\nClaim — the conclusion you are asserting; what you want the audience to believe.\n\nGrounds (or Data) — the evidence supporting the claim: facts, statistics, examples, testimony.\n\nWarrant — the logical bridge connecting grounds to claim; why does this evidence support this conclusion?\n\nBacking — support for the warrant itself; why should we trust the logical bridge?\n\nQualifier — a hedge acknowledging the limits of the claim: \"usually,\" \"in most cases,\" \"probably.\"\n\nRebuttal — acknowledgment of exceptions or counterarguments, and why they do not defeat the claim.",
          examples: [
            { type: "good", label: "Toulmin model in practice", text: "Claim: \"Universal healthcare would improve population health outcomes.\" Grounds: \"Countries with universal healthcare consistently rank higher on life expectancy and infant mortality.\" Warrant: \"Healthcare access affects health outcomes.\" Backing: \"Decades of comparative research support the link between coverage and preventive care.\" Qualifier: \"In countries with functioning implementation.\" Rebuttal: \"Critics argue universal systems reduce innovation — but innovation rates have not been lower in countries with universal coverage.\"" },
          ],
        },
        {
          heading: "Why the Warrant Is the Most Important Part",
          body: "The warrant is the invisible bridge between your evidence and your conclusion — and the part debaters most often skip. \"These statistics support my claim\" is not an argument; it is an assertion that an argument exists. The warrant explains the logical mechanism: why does this evidence imply this conclusion?\n\nWithout the warrant, you have ingredients but no recipe. Make it explicit, defend it, and you have a complete argument.",
        },
        {
          heading: "Using the Model in Real Debates",
          body: "You do not need to label components out loud. But checking your arguments against the model helps you find weaknesses before your opponent does. Ask: \"What is my warrant? Is it obvious, or do I need to defend it? What is the strongest rebuttal, and have I addressed it?\" If the answer to any of these is \"I'm not sure,\" work on it before the debate.",
        },
      ],
      takeaways: [
        "The warrant is the most commonly skipped component — always make it explicit",
        "A qualifier shows intellectual honesty; it does not weaken your argument",
        "Building in rebuttals makes your argument more persuasive, not less — you have pre-answered the objection",
      ],
      quiz: [
        {
          question: "In the Toulmin model, what is the \"warrant\"?",
          options: [
            "The evidence or data you are citing",
            "The conclusion you want the audience to believe",
            "The logical bridge explaining why the evidence supports the conclusion",
            "The part that addresses counterarguments",
          ],
          correctIndex: 2,
          explanation: "The warrant is the logical mechanism connecting grounds to claim. Without it, you have evidence and a conclusion but no argument — just an assertion that they go together.",
        },
        {
          question: "You argue: \"Youth unemployment is high; therefore we should reform education.\" What component is missing?",
          options: [
            "A claim — you have not stated a conclusion",
            "Grounds — you need more data",
            "A warrant — why does youth unemployment mean education reform is the solution?",
            "A qualifier — you need to hedge the claim",
          ],
          correctIndex: 2,
          explanation: "The argument jumps from \"youth unemployment is high\" (grounds) to \"reform education\" (claim) without explaining why education reform addresses the specific cause of unemployment. That explanation is the warrant.",
        },
        {
          question: "Why does including a qualifier make an argument stronger, not weaker?",
          options: [
            "It makes the argument sound more academic",
            "It narrows the claim to what you can actually defend, reducing the surface area for attack",
            "It appeals to the audience's emotions",
            "It signals that you have done more research",
          ],
          correctIndex: 1,
          explanation: "A qualifier like \"in most cases\" restricts your claim to what the evidence supports. A claim you can fully defend is more powerful than an absolute claim that falls apart on the first exception.",
        },
      ],
      practice: { botId: "vera", botName: "Vera", cta: "Vera uses structured argumentation — try building your arguments with all six Toulmin components" },
    },

    {
      slug: "peel",
      title: "PEEL Structure",
      subtitle: "Point, Evidence, Explain, Link",
      readingTime: "4 min",
      intro: "PEEL is a four-part framework for building individual argument units in debate. It is simpler than the Toulmin model but ensures each argument is complete, evidenced, and connected to the broader discussion. Think of it as a paragraph template for spoken argumentation.",
      sections: [
        {
          heading: "The Four Elements",
          body: "Point — your argument in one clear sentence. Your claim. Be direct, not vague.\n\nEvidence — specific support for the point: statistics, examples, research, or testimony. Something concrete, not general.\n\nExplain — why does the evidence support the point? This is the logical connection. Without it, your evidence is a citation, not an argument.\n\nLink — connect back to the main debate proposition. Why does this argument matter for the bigger question?",
          examples: [
            { type: "good", label: "PEEL in practice", text: "Point: \"Renewable energy creates more jobs per dollar than fossil fuels.\" Evidence: \"A 2021 study found that $1M invested in renewables creates ~7.5 jobs, vs 2.7 in fossil fuels.\" Explain: \"Renewables require more ongoing labor for installation and maintenance than capital-intensive extraction.\" Link: \"Therefore, the economic case for the energy transition is not a jobs trade-off — it's a jobs gain.\"" },
          ],
        },
        {
          heading: "Common PEEL Mistakes",
          body: "Skipping the Explain: \"The study shows X, which proves Y.\" — X does not automatically prove Y; explain why.\n\nA Link that just repeats the Point: \"And that is why renewables are good.\" — Connect to the specific debate proposition, not just the general topic.\n\nVague Evidence: \"Studies show...\" — Which studies? Who, when, where? Vague evidence is unverifiable evidence.",
        },
      ],
      takeaways: [
        "Each argument unit should have all four components",
        "The Explain is what turns a citation into an argument",
        "The Link should connect your point to the specific resolution, not just the general topic",
      ],
      quiz: [
        {
          question: "You say: \"Technology is changing education. Many schools use tablets now.\" What PEEL elements are missing?",
          options: [
            "Point",
            "Evidence",
            "Explain and Link",
            "Nothing — this is a complete PEEL argument",
          ],
          correctIndex: 2,
          explanation: "The Point (technology is changing education) and Evidence (tablets in schools) are present, but there is no Explain (why does tablet adoption demonstrate the broader change?) and no Link (why does this matter for the debate's resolution?).",
        },
        {
          question: "In PEEL, what is the purpose of the Link?",
          options: [
            "To summarize the evidence you have presented",
            "To connect your argument back to the specific resolution or debate topic",
            "To transition to your next argument",
            "To acknowledge counterarguments",
          ],
          correctIndex: 1,
          explanation: "The Link is what makes your argument relevant. Without it, you might win a sub-argument but not the debate — a judge needs to understand why your point matters for the specific question on the table.",
        },
        {
          question: "Which of the following is the weakest Evidence component?",
          options: [
            "\"A 2023 meta-analysis of 42 studies found...\"",
            "\"Harvard researchers discovered in a controlled trial...\"",
            "\"Studies generally suggest that...\"",
            "\"FBI crime statistics from 2022 show...\"",
          ],
          correctIndex: 2,
          explanation: "\"Studies generally suggest\" is vague — no specific study is identified, so it cannot be verified or challenged. Strong evidence is specific and attributable.",
        },
      ],
      practice: { botId: "morgan", botName: "Morgan", cta: "Morgan uses clean PEEL structure — try matching it and see who argues more clearly" },
    },

    {
      slug: "claim-warrant-impact",
      title: "Claim-Warrant-Impact",
      subtitle: "The competitive debate standard",
      readingTime: "4 min",
      intro: "Claim-Warrant-Impact (CWI) is the standard argument structure in competitive debate formats — particularly parliamentary and policy debate. It is a streamlined version of the Toulmin model focused on what competitive judges look for: a clear position, logical grounding, and stakes.",
      sections: [
        {
          heading: "The Three Parts",
          body: "Claim — a single, declarative sentence stating your argument. Not a question, not a description — a direct assertion.\n\nWarrant — the logical reasoning that makes the claim follow. Why does X lead to Y? This is the engine of the argument.\n\nImpact — the real-world consequence of the claim being true. Why does this matter? What is the significance, the harm, or the benefit?",
          examples: [
            { type: "good", label: "CWI in practice", text: "Claim: \"Carbon taxes reduce emissions more effectively than cap-and-trade.\" Warrant: \"Carbon taxes create a direct price signal at the point of emission, whereas cap-and-trade allows large polluters to purchase additional credits rather than reduce output.\" Impact: \"If we adopt cap-and-trade without a price floor, projected emission reductions fall short of Paris Agreement targets by 15%, locking in temperatures that flood coastal cities by 2100.\"" },
          ],
        },
        {
          heading: "Why Impact Matters Most",
          body: "In competitive debate, impact is often what wins rounds. Not because logic and evidence do not matter, but because the judge must weigh WHOSE arguments matter more. An argument with a clear, quantified, time-bound impact beats a well-reasoned argument with no stated consequence.\n\nAlways ask: \"So what? Why should anyone care about this claim?\"",
        },
        {
          heading: "Nesting Multiple CWI Arguments",
          body: "Strong debaters layer multiple CWI arguments that reinforce each other. Each argument should stand alone on its three components, but together they build a cumulative case. The skill is in connecting them back to the resolution rather than just listing claims.",
        },
      ],
      takeaways: [
        "Never end an argument without stating its impact",
        "The claim should be one sentence — vague, multi-part claims get lost",
        "Impact should be concrete: a specific harm, benefit, or consequence — not just \"this is important\"",
      ],
      quiz: [
        {
          question: "A debater says: \"Social media is bad for teenagers because studies show it increases anxiety, and anxiety is a major issue today.\" What is missing?",
          options: [
            "A claim",
            "A warrant — the logical mechanism linking social media to anxiety",
            "A specific impact — what are the concrete consequences in this debate's context?",
            "Nothing — this is a complete CWI argument",
          ],
          correctIndex: 2,
          explanation: "The claim and warrant are present, but the impact is vague (\"anxiety is a major issue\"). The impact should be concrete: anxiety leads to X outcomes, affecting Y people, at Z scale.",
        },
        {
          question: "Why is impact the most important element for competitive judges?",
          options: [
            "It shows the debater has done research",
            "It tells the judge why the argument matters relative to the opponent's arguments",
            "It makes the argument easier to understand",
            "It summarizes the evidence",
          ],
          correctIndex: 1,
          explanation: "Competitive judges must weigh competing arguments. Impact is what enables this — it quantifies or qualifies the stakes and enables comparison between arguments on both sides.",
        },
        {
          question: "You have established that privacy regulations would slow data innovation. What is the strongest impact statement?",
          options: [
            "\"And that is why privacy regulations are a bad idea.\"",
            "\"This would affect many companies and people.\"",
            "\"Delayed data innovation could set back AI medical diagnostics by 5-10 years, costing an estimated 100,000 preventable deaths annually by 2035.\"",
            "\"Innovation is important for the economy.\"",
          ],
          correctIndex: 2,
          explanation: "Option C is specific, quantified, time-bound, and human-stakes. A and D are vague and unquantified. B has stakes but no scale. Strong impacts are concrete and comparable.",
        },
      ],
      practice: { botId: "morgan", botName: "Morgan", cta: "Practice building three CWI arguments before you start debating Morgan" },
    },

    {
      slug: "reductio-ad-absurdum",
      title: "Reductio ad Absurdum",
      subtitle: "When the conclusion eats itself",
      readingTime: "5 min",
      intro: "Reductio ad absurdum (Latin: \"reduction to absurdity\") is one of the oldest and most powerful logical techniques in philosophy and debate. It works by showing that an argument's premises, taken to their logical conclusion, lead to a result that is clearly false, contradictory, or unacceptable. If the conclusion is absurd, something in the reasoning must be wrong.",
      sections: [
        {
          heading: "How It Works",
          body: "The structure: assume your opponent's premises are true; apply them consistently; show that the result is clearly unacceptable or contradictory; conclude that at least one premise must be false or the reasoning must be qualified.",
          examples: [
            { type: "good", label: "Classic reductio", text: "\"If unrestricted free speech means all expression must be legally protected, then advertising fraud, perjury, and blackmail must also be protected — which no legal system accepts. So the premise 'all speech must be unrestricted' needs qualification.\"" },
            { type: "good", label: "Policy reductio", text: "\"Your argument that all taxes are unjust would mean no government services should be funded — no roads, no courts, no fire departments. Unless you accept those consequences, the premise needs refinement.\"" },
          ],
        },
        {
          heading: "Reductio as a Test for Hidden Premises",
          body: "Reductio ad absurdum is useful for revealing hidden assumptions. If your opponent's position sounds reasonable but leads to an absurd conclusion when applied consistently, there is likely an implicit qualifier they have not stated. Revealing that qualifier can reframe the entire debate.",
        },
        {
          heading: "How to Use It Without Straw-Manning",
          body: "The crucial distinction: reductio extends the opponent's ACTUAL premises to their logical limit — it does not distort them. If you extend a principle beyond what was intended, you have created a straw man, not a reductio. The test: \"If my opponent accepted my extension as logically following, would they say 'yes, that follows'?\" If not, you have misapplied the technique.",
        },
      ],
      takeaways: [
        "Reductio tests the logical implications of a position, not the person holding it",
        "If the extension of a principle is genuinely absurd, the principle needs a qualifier",
        "Be careful not to distort the premise — the extension must be logically faithful to what was actually said",
      ],
      quiz: [
        {
          question: "Someone argues \"the government should never restrict what companies can advertise.\" You respond: \"By that logic, cigarette companies should be able to advertise to children, and pharma companies should be able to make any medical claim without evidence.\" Is this a valid reductio?",
          options: [
            "No — it is a straw man of their position",
            "Yes — it logically follows from their stated premise and reaches clearly unacceptable consequences",
            "No — it is an appeal to emotion",
            "Yes — but only if they explicitly stated this",
          ],
          correctIndex: 1,
          explanation: "If the premise is \"no advertising restrictions ever,\" then child-targeted cigarette ads and false medical claims do follow. This is a legitimate reductio — the arguer's premise leads to a conclusion they almost certainly do not accept.",
        },
        {
          question: "What makes a reductio ad absurdum different from a straw man?",
          options: [
            "A reductio uses logic; a straw man does not",
            "A reductio extends the opponent's actual premise consistently; a straw man distorts it first",
            "A straw man always involves exaggeration; reductio never does",
            "There is no meaningful difference",
          ],
          correctIndex: 1,
          explanation: "The critical test is fidelity: does the extended conclusion follow from what was actually said? If yes, it is a reductio. If you had to change the premise to reach the absurd conclusion, it is a straw man.",
        },
        {
          question: "After presenting a reductio, your opponent says: \"I did not mean it that literally — I meant X under conditions Y.\" How should you respond?",
          options: [
            "Point out that they have shifted their argument",
            "Accept the clarification — now you know the real premise, and you can evaluate that qualified version",
            "Insist the original, unqualified statement stands",
            "Declare victory since they changed their position",
          ],
          correctIndex: 1,
          explanation: "A qualified position is a better argument. Acknowledging the clarification is intellectually honest — and often strategically wise, since you can now debate the actual qualified claim with precision.",
        },
      ],
      practice: { botId: "hugo", botName: "Hugo", cta: "Hugo uses Socratic questioning and reductio — identify when he is making a legitimate point vs. avoiding a real position" },
    },
  ],
};

// ─── Series 3: Debate Tactics ─────────────────────────────────────────────────

const tactics: Series = {
  slug: "tactics",
  title: "Debate Tactics",
  description: "Strategic tools used by experienced debaters — from steelmanning to framing, concession strategy, and controlling the burden of proof.",
  color: "emerald",
  lessons: [
    {
      slug: "steelmanning",
      title: "Steelmanning",
      subtitle: "Making your opponent's argument stronger before you beat it",
      readingTime: "5 min",
      intro: "Steelmanning is the opposite of strawmanning. Instead of misrepresenting your opponent's position to make it easier to attack, you deliberately construct the STRONGEST possible version of their argument — and then respond to that. It is intellectually demanding, strategically powerful, and surprisingly persuasive to audiences.",
      sections: [
        {
          heading: "Why It Works",
          body: "When you steelman an opponent's argument before rebutting it, you signal intellectual honesty, which builds credibility. You prevent your opponent from claiming you misunderstood them. And most importantly, if you can defeat the strongest version of an argument, the rebuttal is genuinely decisive — not a cheap win against a weakened version.",
          examples: [
            { type: "good", label: "Steelman opener", text: "\"The strongest case for universal basic income would argue that as automation displaces labor, existing safety nets are too fragmented to provide adequate support, and that a simple unconditional transfer would be both more efficient and more humane. I find this compelling up to a point — but here is where I part ways: the fiscal math at national scale does not close without regressive trade-offs elsewhere.\"" },
          ],
        },
        {
          heading: "The Mechanics: How to Do It",
          body: "Step 1 — Identify the underlying values driving the opposing view, not just the stated position.\n\nStep 2 — Imagine the strongest supporting evidence and best logical structure for that position.\n\nStep 3 — Present that version in your own words: \"The most compelling version of my opponent's argument is...\"\n\nStep 4 — Then explain, specifically, where and why you disagree.",
        },
        {
          heading: "Steelmanning vs. Conceding",
          body: "Steelmanning is not conceding. You are not agreeing — you are presenting the argument at its best before explaining why it is still insufficient. The signal to the audience is that you have genuinely grappled with the opposing view, not ignored it.",
        },
      ],
      takeaways: [
        "\"The strongest case for my opponent's view is X — and here is why I still disagree...\"",
        "Steelmanning makes your rebuttal more persuasive, not less",
        "It signals intellectual confidence — you are not afraid to engage with the best version of the opposition",
      ],
      quiz: [
        {
          question: "Why is steelmanning generally more persuasive than strawmanning?",
          options: [
            "It shows more research",
            "Because defeating a stronger argument is more convincing than defeating a weaker one",
            "It makes you appear more senior in the debate",
            "Audiences do not notice strawmanning anyway",
          ],
          correctIndex: 1,
          explanation: "A decisive response to the strongest version of an argument is genuinely convincing. Winning against a weakened version often backfires — opponents and audiences notice, and credibility suffers.",
        },
        {
          question: "Which of these is the best steelman of the argument \"immigration should be restricted\"?",
          options: [
            "\"My opponent thinks foreigners are bad.\"",
            "\"Some people think borders are important.\"",
            "\"The strongest case would argue that rapid demographic change strains public services and suppresses wages in vulnerable labor markets — and that controlled immigration allows integration to succeed.\"",
            "\"My opponent really believes this, despite being wrong.\"",
          ],
          correctIndex: 2,
          explanation: "Option C presents a coherent, specific argument that someone holding the position might actually make — rather than a cartoon version. That is the marker of a genuine steelman.",
        },
        {
          question: "What is the key signal phrase that distinguishes steelmanning from simply summarizing an opponent's argument?",
          options: [
            "Anything beginning with \"my opponent says...\"",
            "\"The strongest version of this argument would be...\" or \"The most compelling case for this position is...\"",
            "Starting with \"I agree that...\"",
            "Any summary of the opposing view",
          ],
          correctIndex: 1,
          explanation: "The framing matters. \"My opponent said\" is a neutral summary; \"the strongest version would argue\" signals that you are actively constructing the optimal form of their position before engaging with it.",
        },
      ],
      practice: { botId: "atlas", botName: "Atlas", cta: "Atlas steelmans your arguments before dismantling them — try doing the same to his" },
    },

    {
      slug: "framing",
      title: "Framing",
      subtitle: "He who defines the terms controls the debate",
      readingTime: "5 min",
      intro: "Framing is the rhetorical act of defining the terms, context, and lens through which arguments are evaluated. Debates are rarely won purely on facts — the way you define key terms and set the evaluative context often determines what counts as evidence and who bears the burden of proof. Framing is the meta-argument that governs all other arguments.",
      sections: [
        {
          heading: "How Framing Works",
          body: "When you accept your opponent's framing of an issue, you are often already halfway to losing. The question \"Is this a debate about security or about liberty?\" predetermines what evidence is relevant and what the audience values. Framing establishes the dominant narrative: who is the victim, what is at stake, and what counts as a win.",
          examples: [
            { type: "bad", label: "Accepting a damaging frame", text: "Opponent: \"This is a debate about whether to sacrifice economic growth for environmental goals.\" (You accept this framing and now must defend sacrificing growth — a losing position.)" },
            { type: "good", label: "Reframing", text: "\"I want to reframe this. The question is whether we invest now in sustainable growth or pay far larger costs later. The environment-economy trade-off is a false dichotomy — let me show why.\"" },
          ],
        },
        {
          heading: "Key Framing Tactics",
          body: "Define terms early: \"By 'censorship' I mean government-mandated content removal, not private platform moderation.\" This prevents your opponent from stretching the term later.\n\nChallenge loaded language: If your opponent uses a term that presupposes their conclusion, name it. \"You've called this a 'mandate' — but it is an opt-in incentive structure. The framing matters.\"\n\nName the evaluative standard: \"The question is not whether any harm could ever occur — it is whether benefits outweigh harms. Let us agree on that standard first.\"",
        },
        {
          heading: "Reframing Under Fire",
          body: "When your opponent successfully frames an issue against you, the response is explicit reframing — not just counterargument. \"I want to step back from the specific statistic my opponent cited and look at the broader question of how we should evaluate this policy...\" Reframing is strategic retreat to higher ground, not avoidance.",
        },
      ],
      takeaways: [
        "Define your key terms early and explicitly — before your opponent does it for you",
        "Challenge your opponent's framing before engaging with their specific arguments",
        "Control the evaluative standard: what does winning this debate look like?",
      ],
      quiz: [
        {
          question: "Your opponent opens with: \"This debate is about whether we should limit economic freedom for marginal environmental gains.\" How should you respond?",
          options: [
            "Accept the framing and argue that small gains are worth limited freedom",
            "Challenge the framing: reject 'limiting freedom' and 'marginal gains' as the premise and propose an alternative evaluative lens",
            "Cite evidence that environmental gains are not marginal",
            "Ask the audience to decide which framing is correct",
          ],
          correctIndex: 1,
          explanation: "Accepting your opponent's framing concedes significant ground — you are now defending against \"limiting freedom\" rather than advancing \"sustainable growth.\" The first move is to challenge the framing, then substantiate your alternative.",
        },
        {
          question: "A good frame accomplishes which of the following?",
          options: [
            "Makes the argument more emotional",
            "Establishes what evidence counts, who bears the burden of proof, and what a win looks like",
            "Allows you to avoid answering direct questions",
            "Summarizes your main points before making them",
          ],
          correctIndex: 1,
          explanation: "Framing is meta-argumentative — it shapes the evaluative context in which all subsequent arguments are weighed. A well-set frame means your evidence counts and your opponent's faces a higher bar.",
        },
        {
          question: "Your opponent says: \"Everyone agrees we need to protect children online.\" Why should you be cautious before agreeing?",
          options: [
            "Agreeing is a sign of weakness",
            "\"Protection\" is vague enough to justify almost any policy — accepting it as unqualified lets them move from this axiom to almost any conclusion",
            "You should always disagree with your opponent's opening premise",
            "Protecting children online is actually not a priority",
          ],
          correctIndex: 1,
          explanation: "\"Protecting children\" is vague enough to justify broad surveillance, censorship, or data collection. Accepting it unqualified allows your opponent to move from that axiom to almost any conclusion. Challenge the definition before it becomes bedrock.",
        },
      ],
      practice: { botId: "vera", botName: "Vera", cta: "Vera sets her frames early — watch how she defines terms, then practice doing the same" },
    },

    {
      slug: "concession-strategy",
      title: "Concession Strategy",
      subtitle: "When giving ground wins you the debate",
      readingTime: "4 min",
      intro: "The instinct in debate is to resist everything — to defend every claim and never admit weakness. This is almost always wrong. Strategic concessions — deliberately giving ground on minor or defensible points — make you more credible, sharpen the debate to the arguments that matter, and often win you sympathy from audiences and judges alike.",
      sections: [
        {
          heading: "Why Conceding Can Win",
          body: "When you refuse to concede anything — even the obviously true — you look defensive and dishonest. When you concede small, accurate points freely, you signal that you are a trustworthy arguer interested in the truth, not just a win. This credibility transfers to your main arguments.",
          examples: [
            { type: "good", label: "Strategic concession with redirect", text: "\"My opponent is right that the initial rollout of this policy was poorly managed — that is a fair criticism. But the question before us is whether the policy's underlying logic is sound, not whether its implementation was flawless. On that question, the evidence is clear.\"" },
          ],
        },
        {
          heading: "The Strategic Concession Technique",
          body: "Step 1 — Identify which of your opponent's points is true, well-supported, or minor enough that defending it is not worth the cost.\n\nStep 2 — Concede it explicitly, with some specificity: \"My opponent is right that X.\"\n\nStep 3 — Redirect immediately to the argument that matters: \"But this does not address Y, which is the heart of the debate.\"\n\nStep 4 — Show why the conceded point, even if true, does not change your conclusion.",
        },
        {
          heading: "What NOT to Concede",
          body: "Concede peripheral points, not central ones. Never concede your key warrant, your main impact, or any claim the opponent is building a major argument from. And be careful with concessions that can be exploited: \"I'll grant that the policy has costs\" is fine; \"I'll grant that the costs are severe\" may give your opponent too much ground.",
        },
      ],
      takeaways: [
        "Conceding small, true points builds credibility for your main arguments",
        "Always redirect: \"My opponent is right that X — but X does not change Y because...\"",
        "Never concede your central warrant or primary impact",
      ],
      quiz: [
        {
          question: "Your opponent correctly points out that one of your cited statistics is from 2015. How should you handle this?",
          options: [
            "Dispute that the statistic is outdated",
            "Ignore it and continue with your argument",
            "Concede the date, note that more recent data shows the same trend, and return to your main argument",
            "Apologize and withdraw the statistic entirely",
          ],
          correctIndex: 2,
          explanation: "Conceding a minor point (the date) while reframing it (the trend has continued) is more credible than defending the indefensible. The concession cost is low; the credibility gain is real.",
        },
        {
          question: "After you concede a point, what should you do immediately?",
          options: [
            "Move to your next argument without further comment",
            "Show why the conceded point does not change your overall position",
            "Ask the opponent if there is anything else they would like to correct",
            "Summarize everything you have said so far",
          ],
          correctIndex: 1,
          explanation: "A concession without a redirect loses ground twice: once to the opponent's point, and once because you failed to explain why it does not matter. Always connect the concession to your larger argument.",
        },
        {
          question: "A strategic concession is LEAST useful when:",
          options: [
            "The opponent's point is peripheral to the main debate",
            "The opponent's point is accurate and verifiable",
            "The point being conceded directly supports the opponent's central argument",
            "The point is a minor factual disagreement",
          ],
          correctIndex: 2,
          explanation: "Never concede what your opponent will use as a foundation for a major argument. A concession on a central warrant or impact gives them solid ground to build from — and removes your ability to contest it later.",
        },
      ],
      practice: { botId: "vera", botName: "Vera", cta: "Vera occasionally concedes minor points to redirect — notice when she does it and how it affects the flow" },
    },

    {
      slug: "burden-of-proof",
      title: "Burden of Proof",
      subtitle: "Who has to prove what — and why it matters",
      readingTime: "4 min",
      intro: "\"Burden of proof\" is one of the most important and most abused concepts in debate. Understanding who carries the burden — and holding your opponent to it — can completely change the structure of a debate. Making a claim you cannot support and then demanding your opponent disprove it is one of the most common bad-faith moves in argumentation.",
      sections: [
        {
          heading: "The Basic Rule",
          body: "The burden of proof lies with whoever makes the positive claim. If you assert that something is true, you must provide evidence; you cannot demand that your opponent prove it false. \"Innocent until proven guilty\" is the legal application: the prosecution bears the burden, not the defense.",
          examples: [
            { type: "bad", label: "Burden reversal", text: "\"Vaccines cause autism. Can you PROVE they don't?\" (The claimant must support the claim, not demand disproof.)" },
            { type: "bad", label: "Extraordinary claim without evidence", text: "\"I believe there was widespread fraud in the election. If there wasn't, prove it.\" (Extraordinary claims require extraordinary evidence — not demanded disproof.)" },
            { type: "good", label: "Proper burden in debate", text: "\"I claim that free trade reduces manufacturing employment in the short term. Here is my evidence. What evidence suggests the opposite?\"" },
          ],
        },
        {
          heading: "The Hitchens Razor",
          body: "\"What can be asserted without evidence can be dismissed without evidence.\" — Christopher Hitchens.\n\nThis is a useful shorthand for challenging burden-of-proof violations: if your opponent makes a claim without providing evidence, you are not obligated to disprove it. You can note that it is an unsupported assertion and move on — unless you choose to address it on its merits.",
        },
        {
          heading: "Shared Burdens in Structured Debate",
          body: "In formal debate, both sides carry burden. The affirmative (proposing a change) must establish that the proposed policy achieves its goals at acceptable cost. The negative must do more than say \"it's complicated\" — they need to show why the status quo or an alternative is preferable. Understanding these shared burdens helps you know what you must prove vs. what you can contest.",
        },
      ],
      takeaways: [
        "The burden lies with the claimant, not the skeptic",
        "\"Prove it is false\" is a burden reversal — do not accept it",
        "Extraordinary claims require extraordinary evidence (the Sagan Standard)",
      ],
      quiz: [
        {
          question: "Your opponent says: \"There is no evidence my plan would cause any harm — so you cannot object to it.\" What is the problem?",
          options: [
            "They have made an appeal to authority",
            "They have reversed the burden of proof — the proposer must demonstrate benefits, not just assert no proven downsides",
            "They have used a false dichotomy",
            "This is actually a valid argument",
          ],
          correctIndex: 1,
          explanation: "The burden lies with whoever is making the positive claim — here, that the plan should be adopted. Absence of evidence of harm is not the same as evidence of absence of harm, and the proposer must establish benefits.",
        },
        {
          question: "What does the Hitchens Razor mean in practice for debate?",
          options: [
            "Claims made with strong evidence can be accepted without question",
            "Any assertion made without evidence can be declined without counter-evidence",
            "Only famous philosophers' arguments require evidence",
            "You should always provide evidence before dismissing a claim",
          ],
          correctIndex: 1,
          explanation: "If someone asserts something without evidence, you are not obligated to mount a full rebuttal. You can note the lack of support and move on. This prevents \"Gish gallop\" tactics where an opponent floods the debate with unsupported assertions.",
        },
        {
          question: "In a debate on whether governments should mandate EVs by 2035, who carries the burden of proof for what?",
          options: [
            "Only the affirmative side carries any burden",
            "Affirmative: must show the policy achieves its goals at acceptable cost; Negative: must show why the status quo or an alternative is preferable",
            "The negative side has no burden — they are just the default",
            "Neither side has a formal burden in a proposition debate",
          ],
          correctIndex: 1,
          explanation: "In structured debate, both sides carry burden. Affirmative must defend the policy's merits and feasibility; Negative must do more than object — they need to show why inaction or an alternative is genuinely superior.",
        },
      ],
      practice: { botId: "hugo", botName: "Hugo", cta: "Hugo constantly challenges your burden of proof — make sure every claim you make is evidenced" },
    },
  ],
};

// ─── Series 4: Rebuttal Techniques ───────────────────────────────────────────

const rebuttals: Series = {
  slug: "rebuttals",
  title: "Rebuttal Techniques",
  description: "Advanced counterargument strategies — the 4-step rebuttal, turning arguments, preemptive inoculation, and impact calculus.",
  color: "amber",
  lessons: [
    {
      slug: "four-step-rebuttal",
      title: "The 4-Step Rebuttal",
      subtitle: "A repeatable framework for any counterargument",
      readingTime: "4 min",
      intro: "Most debaters either repeat their own argument when challenged, or improvise a rebuttal without structure. Both approaches tend to be weak. The 4-step rebuttal is a reliable framework that ensures your counterargument is clear, fair, and decisive — every time.",
      sections: [
        {
          heading: "The Four Steps",
          body: "Step 1 — Signpost: Tell the audience which argument you are addressing. \"My opponent argued that...\"\n\nStep 2 — State it fairly: Present their argument accurately, without distortion. If you cannot, you have not understood it yet.\n\nStep 3 — Counter: Explain specifically why the argument fails — missing evidence, flawed logic, wrong assumption, contradicted by data.\n\nStep 4 — Impact: Explain what follows for the debate. \"Therefore, even if you accepted everything else my opponent said, this argument does not establish their conclusion.\"",
          examples: [
            { type: "good", label: "4-step rebuttal in practice", text: "\"My opponent argued that automation will cause mass unemployment [1: Signpost] because machines replace human labor at lower cost [2: State fairly]. However, this assumes static demand — history shows each wave of automation created new employment categories faster than it destroyed old ones, documented across the Industrial Revolution and the computing era [3: Counter]. Therefore, the mass unemployment prediction relies on an assumption the evidence consistently contradicts [4: Impact].\"" },
          ],
        },
        {
          heading: "Why Structure Matters",
          body: "Unstructured rebuttals sound reactive and defensive. A structured rebuttal sounds prepared and analytical — it signals to the audience that you are engaging with the argument, not scrambling. Signposting prevents the audience from losing track; stating the argument fairly prevents the straw man charge; the counter and impact make it decisive.",
        },
      ],
      takeaways: [
        "Signpost, state fairly, counter, then state the impact for the debate",
        "A rebuttal without an impact is incomplete — always explain what follows",
        "State their argument fairly even if it is easier to distort it",
      ],
      quiz: [
        {
          question: "What is the purpose of Step 1 (Signpost) in the 4-step rebuttal?",
          options: [
            "To give yourself time to think",
            "To let the audience know which specific argument you are addressing",
            "To restate your own position",
            "To acknowledge the strength of the opponent's argument",
          ],
          correctIndex: 1,
          explanation: "Debates involve multiple arguments on multiple issues. Signposting orients the audience so they can follow which argument is being addressed and track who is winning on that specific point.",
        },
        {
          question: "Why should you state your opponent's argument fairly in Step 2?",
          options: [
            "It is required by debate rules",
            "Distorting it leads to a straw man — if the audience notices, your credibility suffers",
            "Fair restatement makes the argument easier to counter",
            "The opponent might correct you otherwise",
          ],
          correctIndex: 1,
          explanation: "A straw man is visible to attentive audiences and opponents. When spotted, it suggests you cannot counter the real argument. Stating the argument fairly and countering it anyway is more credible and more decisive.",
        },
        {
          question: "A rebuttal ends with: \"And so my opponent is clearly wrong about the economic impacts.\" What is missing?",
          options: [
            "A signpost",
            "A fair statement of the opponent's argument",
            "A specific impact — what does being wrong on this point mean for the debate?",
            "Nothing — this is a complete rebuttal",
          ],
          correctIndex: 2,
          explanation: "\"Clearly wrong\" is a conclusion without stakes. The impact should explain what follows: \"...therefore their economic case collapses, which removes their strongest objection to the policy.\"",
        },
      ],
      practice: { botId: "atlas", botName: "Atlas", cta: "Atlas uses structured rebuttals — try applying the 4-step framework to every response he makes" },
    },

    {
      slug: "turning-the-argument",
      title: "Turning the Argument",
      subtitle: "Using their evidence to prove your point",
      readingTime: "4 min",
      intro: "A \"turn\" is one of the most powerful moves in competitive debate: instead of simply rebutting an argument, you show that it actually supports YOUR position rather than your opponent's. The argument does not just fail — it backfires.",
      sections: [
        {
          heading: "What Is a Turn?",
          body: "A turn flips the logical direction of an argument. Your opponent presents evidence or reasoning intended to support their conclusion; you demonstrate that the same evidence or reasoning leads to the opposite conclusion. This is powerful because it removes the argument from the debate AND adds it to your side simultaneously.",
          examples: [
            { type: "good", label: "Turning the mechanism", text: "Opponent: \"Oppose this trade deal — it benefits corporations at the expense of workers.\" You: \"I will actually use that logic to support the deal. If corporations profit, they expand, creating jobs and increasing wages in competitive labor markets. The mechanism my opponent criticizes generates the worker benefit they want.\"" },
            { type: "good", label: "Turning the evidence", text: "Opponent: \"Renewable energy is too expensive to scale.\" You: \"The cost of solar has fallen 89% in the last decade. If cost is your standard, that trend supports accelerating the transition — not opposing it.\"" },
          ],
        },
        {
          heading: "The Two Types of Turns",
          body: "Link Turn — attack the first part of the chain: show that the cause leads to the OPPOSITE effect than claimed.\n\nImpact Turn — accept that the cause leads to the claimed effect, but argue the effect is GOOD, not bad.\n\nYou can sometimes run both simultaneously, but usually one is stronger. Identify which link in the chain is most vulnerable and turn that one.",
        },
        {
          heading: "When NOT to Turn",
          body: "Do not turn an argument if: (a) the turn requires accepting something you cannot defend later; (b) a simple rebuttal wins more decisively; (c) the turn logic is complicated enough to confuse the audience. Turns work best when the flip is obvious and dramatic.",
        },
      ],
      takeaways: [
        "A successful turn adds an argument to your side AND removes it from your opponent's",
        "Identify whether the link or the impact is the better turning point",
        "Simple, obvious turns are more persuasive than complex ones",
      ],
      quiz: [
        {
          question: "Your opponent argues that \"higher minimum wage increases unemployment because businesses reduce hiring.\" How do you \"link turn\" this?",
          options: [
            "Argue that unemployment is not actually that bad",
            "Argue that businesses do not actually reduce hiring — empirical evidence from minimum wage increases shows minimal employment effects",
            "Argue that the minimum wage should not be increased anyway",
            "Accept the premise and say unemployment is worth the wage gains",
          ],
          correctIndex: 1,
          explanation: "A link turn challenges the causal claim: higher wages → reduced hiring. If the empirical evidence shows minimal hiring effects, the link breaks and the argument fails before you reach the impact.",
        },
        {
          question: "Your opponent argues that social media increases polarization, which is harmful. How would you run an \"impact turn\"?",
          options: [
            "Show that social media does not increase polarization",
            "Accept that social media increases polarization, but argue that polarization reflects genuine value differences that are healthy in a democracy",
            "Argue that social media has other benefits that outweigh this harm",
            "Note that polarization existed before social media",
          ],
          correctIndex: 1,
          explanation: "An impact turn accepts the mechanism (social media → polarization) but revalues the outcome (polarization isn't harmful — it reflects legitimate disagreement). Riskier than a link turn, but dramatic when executed well.",
        },
        {
          question: "What makes a turn more powerful than a simple rebuttal?",
          options: [
            "Turns require more evidence",
            "Turns eliminate the argument AND add it to your side — double the effect of a rebuttal",
            "Turns are faster to deliver",
            "Judges automatically score turns higher",
          ],
          correctIndex: 1,
          explanation: "A simple rebuttal cancels the argument — net effect is zero. A successful turn cancels the argument AND gives you an additional argument for your position — net effect is double. That is why turns are among the highest-value moves in competitive debate.",
        },
      ],
      practice: { botId: "hugo", botName: "Hugo", cta: "Hugo reflexively opposes everything — try turning his objections into support for your position" },
    },

    {
      slug: "preemptive-rebuttal",
      title: "Preemptive Rebuttal",
      subtitle: "Defeating the argument before it is made",
      readingTime: "4 min",
      intro: "Preemptive rebuttal — also called \"inoculation\" in persuasion research — involves anticipating and addressing a counterargument BEFORE your opponent makes it. Rather than waiting to be challenged, you introduce the objection yourself, acknowledge its surface appeal, and then explain why it ultimately fails. This is powerful precisely because it is surprising: you are arguing against yourself, and winning.",
      sections: [
        {
          heading: "Why Inoculation Works",
          body: "Persuasion research (formalized by William McGuire in the 1960s) shows that people are more resistant to a message when they have already encountered a weakened version of it. The same logic applies in debate: an audience that has already heard an argument characterized and refuted is less susceptible to being convinced by it later. You have essentially pre-debated the opposition's best argument.",
          examples: [
            { type: "good", label: "Inoculation in action", text: "\"Now, the most compelling objection to my position is that [X]. And I want to be clear — that objection has some surface validity. But here is why it ultimately fails: [reason]. So when my opponent raises X — and I expect they will — you will have already seen why it does not hold.\"" },
          ],
        },
        {
          heading: "What to Inoculate Against",
          body: "Not every possible objection is worth preempting — only the strongest one or two. Preempting weak arguments can backfire (you look defensive about nothing). Target: your most obvious weakness, the argument your opponent has signaled they will use, and any assumption in your case that might seem counterintuitive.",
        },
        {
          heading: "The Risk: Over-Inoculation",
          body: "Do not spend most of your speech preempting objections — you will sound defensive and cede narrative control. Inoculation works as a tactical tool deployed at a specific moment, not as a structural feature of every argument. Two or three well-placed preemptive rebuttals are powerful; ten is paralysis.",
        },
      ],
      takeaways: [
        "Address your opponent's strongest expected argument before they make it",
        "Characterize it fairly, acknowledge its surface appeal, then explain why it fails",
        "Focus on the one or two strongest objections — not every conceivable one",
      ],
      quiz: [
        {
          question: "What does \"inoculation\" mean in the context of debate persuasion?",
          options: [
            "Preparing yourself psychologically for a difficult debate",
            "Exposing the audience to a weakened version of a counterargument so they are more resistant to the full version later",
            "Preventing your opponent from making certain arguments",
            "Building immunity against logical fallacies",
          ],
          correctIndex: 1,
          explanation: "The medical metaphor is apt: a vaccine exposes you to a weakened pathogen to build resistance; rhetorical inoculation exposes the audience to a weakened version of the opposing argument, addressed and refuted, to reduce its impact when the full version arrives.",
        },
        {
          question: "When is preemptive rebuttal MOST useful?",
          options: [
            "When you expect your opponent to raise many different arguments",
            "When you have an obvious weakness in your case that a sophisticated opponent will certainly attack",
            "When you are running out of time and need to cover more ground",
            "When you are unsure what your opponent will argue",
          ],
          correctIndex: 1,
          explanation: "Preemptive rebuttal is most powerful when you know what is coming and can take the sting out of it before it lands. If the attack lands as a fresh surprise on the audience, it is more damaging. If you have already addressed it, its impact is significantly reduced.",
        },
        {
          question: "You anticipate your opponent will argue that your proposal is too expensive. How do you inoculate?",
          options: [
            "Avoid mentioning cost entirely",
            "Say \"I will deal with cost concerns when they are raised\"",
            "\"Now I want to address the most obvious objection — that this is too expensive. On the surface, the price tag is significant. But here is the full picture: [comparative costs, ROI, avoided costs] — and on balance, inaction is dramatically more expensive.\"",
            "Cite a study showing the proposal is affordable",
          ],
          correctIndex: 2,
          explanation: "Option C is the correct inoculation: name the objection explicitly, acknowledge its surface validity, and provide the full counterargument so the audience is already equipped to evaluate the objection when the opponent raises it.",
        },
      ],
      practice: { botId: "nova", botName: "Nova", cta: "Nova preemptively addresses objections — identify each time she does it and notice its effect on the debate" },
    },

    {
      slug: "impact-calculus",
      title: "Impact Calculus",
      subtitle: "Explaining why your argument wins the comparison",
      readingTime: "5 min",
      intro: "When two debaters have both made strong arguments, how does a judge decide? Impact calculus is the practice of explicitly comparing the stakes of competing arguments — explaining why your impacts are bigger, more probable, more immediate, or more reversible than your opponent's. It is the meta-skill that ties everything else together.",
      sections: [
        {
          heading: "The Four Dimensions",
          body: "Impact calculus typically evaluates arguments on four dimensions:\n\nMagnitude — How large is the effect? How many people are affected? How severe?\n\nProbability — How likely is the harm or benefit to actually occur?\n\nTimeframe — How soon? Imminent harms typically outweigh distant ones.\n\nReversibility — Can the harm be undone? Irreversible harms (death, permanent rights violations) typically outweigh reversible ones.",
          examples: [
            { type: "good", label: "Running the comparison", text: "\"My opponent's impact is a 2% cost increase for a small number of businesses — real but limited and reversible. My impact: without this policy, 50,000 people per year lack preventive care, leading to preventable deaths — irreversible and affecting vastly more people. On magnitude, probability, and reversibility, my impact outweighs.\"" },
          ],
        },
        {
          heading: "Running the Comparison",
          body: "Never just assert \"my argument is bigger.\" Explain HOW and WHY using the four dimensions. Be specific — compare actual numbers where possible. And do not forget to characterize the opponent's impact accurately: you can compare more favorably by reducing their impact's probability or magnitude with evidence, not just assertion.",
        },
        {
          heading: "Timeframe Traps",
          body: "One common mistake is treating all future impacts as equally immediate. A harm in 2025 and a harm in 2100 are not equivalent — especially for policymakers operating in real time. When your impact is more immediate, make that explicit. When your opponent's is more distant, call it out: \"Even if their harm materializes eventually, mine is happening now.\"",
        },
      ],
      takeaways: [
        "Compare on all four dimensions: magnitude, probability, timeframe, reversibility",
        "Be specific — quantify where you can",
        "Never just assert \"my argument is bigger\" — show why with the actual comparison",
      ],
      quiz: [
        {
          question: "What does \"reversibility\" mean in impact calculus and why does it matter?",
          options: [
            "Whether the argument can be retracted mid-debate",
            "Whether a harm, once it occurs, can be undone — irreversible harms typically outweigh reversible ones of the same magnitude",
            "Whether the evidence supporting the impact can be reversed by new data",
            "Whether the opposing argument can be turned",
          ],
          correctIndex: 1,
          explanation: "Reversibility is a key weighing dimension because irreversible harms (death, extinction, permanent rights violations) represent a permanently locked-in loss. All else equal, an irreversible harm outweighs a reversible one of the same magnitude.",
        },
        {
          question: "Your opponent's impact: \"This policy might reduce economic growth by 0.1% over 10 years.\" Your impact: \"Without this policy, 30,000 people per year die from pollution-related illness.\" How do you run the comparison?",
          options: [
            "Simply assert that your impact is bigger",
            "Note that magnitude (30,000 deaths vs. marginal growth reduction), timeframe (ongoing vs. projected), and reversibility (death is irreversible; growth recovers) all favor your impact",
            "Challenge their economic statistics",
            "Concede that economic growth matters and argue your policy also improves it",
          ],
          correctIndex: 1,
          explanation: "Option B uses all four dimensions: magnitude is not remotely comparable; your impact is immediate and ongoing vs. a projected future estimate; death is irreversible while minor growth deviation recovers. Running all four makes the comparison decisive.",
        },
        {
          question: "When is probability the most important dimension in impact calculus?",
          options: [
            "When both sides' impacts are extremely large",
            "When one side's impact is large but speculative and the other's is smaller but near-certain",
            "When timeframe is the same on both sides",
            "Always — probability is always the most important dimension",
          ],
          correctIndex: 1,
          explanation: "When impacts differ in certainty, a smaller but near-certain harm can outweigh a larger but highly speculative one. This is especially relevant when debating catastrophic but low-probability scenarios against concrete, documented harms.",
        },
      ],
      practice: { botId: "atlas", botName: "Atlas", cta: "Atlas uses impact calculus explicitly — identify the dimensions he is weighing and practice calling out each one" },
    },
  ],
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export const SERIES: Series[] = [fallacies, structures, tactics, rebuttals];

export function findSeries(slug: string): Series | undefined {
  return SERIES.find((s) => s.slug === slug);
}

export function findLesson(seriesSlug: string, lessonSlug: string): Lesson | undefined {
  return findSeries(seriesSlug)?.lessons.find((l) => l.slug === lessonSlug);
}

export const TOTAL_LESSONS = SERIES.reduce((sum, s) => sum + s.lessons.length, 0);
