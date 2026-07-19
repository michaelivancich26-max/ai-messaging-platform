import type { Metadata } from "next";
import Link from "next/link";
import { H2, P, UL, LI, Strong, Lead } from "@/components/legal-ui";
import { LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

export const metadata: Metadata = { title: "Community Guidelines · Grounds for Debate" };

export default function GuidelinesPage() {
  return (
    <article>
      <h1 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Community Guidelines</h1>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Last updated {LEGAL_EFFECTIVE_DATE}</p>

      <Lead>
        Grounds for Debate exists to make disagreement productive. These Guidelines are part of our
        {" "}<Link href="/legal/terms" className="text-brand-green-ink underline dark:text-brand-green">Terms of Service</Link> and
        apply everywhere on the Service. By participating in the community, you agree to follow them.
      </Lead>

      <H2>The spirit of the community</H2>
      <P>Argue in good faith. Attack ideas, not people. Assume the person across from you is reasoning honestly, stay open to
        being wrong, and make the strongest version of your case rather than the loudest.</P>

      <H2>Expected behavior</H2>
      <UL>
        <LI>Engage with the argument being made, not the person making it.</LI>
        <LI>Be honest — represent sources and others&rsquo; positions fairly.</LI>
        <LI>Keep debate civil even when it&rsquo;s heated; disagreement is welcome, cruelty is not.</LI>
        <LI>Respect the topic and the format of the room you&rsquo;re in.</LI>
      </UL>

      <H2>Not allowed</H2>
      <UL>
        <LI><Strong>Harassment and abuse</Strong> — targeted insults, bullying, stalking, or encouraging others to do so.</LI>
        <LI><Strong>Hate speech</Strong> — attacks or slurs based on race, ethnicity, national origin, religion, sex,
          gender identity, sexual orientation, disability, or similar protected characteristics.</LI>
        <LI><Strong>Threats and violence</Strong> — threatening, glorifying, or inciting harm.</LI>
        <LI><Strong>Privacy violations</Strong> — sharing someone&rsquo;s private or identifying information (doxxing).</LI>
        <LI><Strong>Sexual content involving minors</Strong> or any content that sexualizes children — zero tolerance.</LI>
        <LI><Strong>Illegal content</Strong> or content promoting serious illegal activity.</LI>
        <LI><Strong>Spam and manipulation</Strong> — flooding, advertising, or coordinated inauthentic activity.</LI>
        <LI><Strong>Impersonation</Strong> — pretending to be another person, organization, or the platform.</LI>
        <LI><Strong>Cheating</Strong> — manipulating ratings, judging, or leaderboards, using multiple accounts to gain an
          advantage, or exploiting bugs instead of reporting them.</LI>
      </UL>

      <H2>Fair play with AI features</H2>
      <P>Automated evaluation and judging are part of the game. Don&rsquo;t attempt to trick, prompt-inject, or otherwise
        manipulate the AI to falsify results, and don&rsquo;t rig matchups to farm ratings. Compete on the merits.</P>

      <H2>Enforcement</H2>
      <P>When content or behavior violates these Guidelines, we may — depending on severity and history — remove content,
        issue a warning, limit features, or suspend or permanently ban the account. Serious violations (such as threats or
        content sexualizing minors) can result in an immediate ban and, where appropriate, referral to authorities. We
        aim to be fair and consistent, but we may act at our discretion to protect the community.</P>

      <H2>Reporting</H2>
      <P>If you see something that breaks these Guidelines, report it or contact us at
        {" "}<a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-brand-green-ink underline dark:text-brand-green">{LEGAL_CONTACT_EMAIL}</a>.
        Don&rsquo;t retaliate or take enforcement into your own hands.</P>
    </article>
  );
}
