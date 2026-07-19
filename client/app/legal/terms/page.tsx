import type { Metadata } from "next";
import Link from "next/link";
import { H2, P, UL, LI, Strong, Lead } from "@/components/legal-ui";
import { LEGAL_ENTITY, LEGAL_CONTACT_EMAIL, LEGAL_GOVERNING_LAW, LEGAL_EFFECTIVE_DATE, MIN_AGE } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service · Grounds for Debate" };

export default function TermsPage() {
  return (
    <article>
      <h1 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Terms of Service</h1>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Last updated {LEGAL_EFFECTIVE_DATE}</p>

      <Lead>
        These Terms of Service (&ldquo;Terms&rdquo;) are a binding agreement between you and {LEGAL_ENTITY} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;), operator of Grounds for Debate (the &ldquo;Service&rdquo;). By creating an account or using the
        Service, you agree to these Terms, our <Link href="/legal/privacy" className="text-brand-green-ink underline dark:text-brand-green">Privacy Policy</Link>,
        and our <Link href="/legal/guidelines" className="text-brand-green-ink underline dark:text-brand-green">Community Guidelines</Link>. If you do not agree, do not use the Service.
      </Lead>

      <H2>1. Eligibility</H2>
      <P>You must be at least {MIN_AGE} years old to use the Service. If you are under the age of majority where you live,
        you may use the Service only with the involvement and consent of a parent or legal guardian. By using the Service you
        represent that you meet these requirements and that the information you provide is accurate.</P>

      <H2>2. Your account</H2>
      <UL>
        <LI>You are responsible for your login credentials and for all activity under your account.</LI>
        <LI>Keep your password secure and notify us promptly of any unauthorized use.</LI>
        <LI>You may not share, sell, or transfer your account, or create an account for anyone else without authorization.</LI>
        <LI>We may suspend or terminate accounts that violate these Terms or the Community Guidelines.</LI>
      </UL>

      <H2>3. The Service</H2>
      <P>Grounds for Debate is a platform for structured debate. It includes human-versus-human and human-versus-AI debates,
        automated claim evaluation and match judging, ratings and leaderboards, community rooms, and messaging. Features may
        change, and we may add, modify, or discontinue parts of the Service at any time.</P>

      <H2>4. Your content</H2>
      <P>You retain ownership of the messages, arguments, and other content you submit (&ldquo;Your Content&rdquo;). By
        submitting Your Content, you grant us a worldwide, non-exclusive, royalty-free license to host, store, reproduce,
        display, and distribute it as needed to operate, improve, and promote the Service, and to process it through automated
        and third-party systems (including AI providers) for evaluation, moderation, and judging.</P>
      <P>You represent that you have the rights to Your Content and that it does not infringe any third party&rsquo;s rights or
        violate any law or these Terms.</P>

      <H2>5. Acceptable use</H2>
      <P>Your use of the Service is also governed by our <Link href="/legal/guidelines" className="text-brand-green-ink underline dark:text-brand-green">Community Guidelines</Link>.
        You agree not to:</P>
      <UL>
        <LI>Post unlawful, harassing, hateful, threatening, defamatory, or infringing content.</LI>
        <LI>Harass, abuse, impersonate, or threaten others, or share others&rsquo; private information.</LI>
        <LI>Attempt to manipulate ratings, judging, or leaderboards, or otherwise game or exploit the Service.</LI>
        <LI>Interfere with, disrupt, probe, or attempt to gain unauthorized access to the Service or its systems.</LI>
        <LI>Use bots, scrapers, or automated means except as we expressly permit.</LI>
      </UL>

      <H2>6. AI-generated content and no professional advice</H2>
      <P><Strong>Automated features can be wrong.</Strong> Claim evaluations, fact-checks, verdicts, bot arguments, and
        summaries are produced by automated systems and may contain errors, omissions, or bias. They are provided for
        discussion and entertainment only and are <Strong>not</Strong> professional, legal, medical, financial, or other
        advice. Do not rely on them as statements of fact. You are responsible for independently verifying any information
        before acting on it.</P>

      <H2>7. Intellectual property</H2>
      <P>The Service, including its software, design, text, and logos (excluding Your Content), is owned by {LEGAL_ENTITY} or
        its licensors and is protected by intellectual-property laws. We grant you a limited, revocable, non-transferable
        license to use the Service for its intended purpose. You may not copy, modify, or create derivative works from the
        Service except as permitted by law.</P>

      <H2>8. Termination</H2>
      <P>You may stop using the Service and delete your account at any time from your account settings. We may suspend or
        terminate your access, with or without notice, if you violate these Terms or the Community Guidelines, or to protect
        the Service or other users. Sections that by their nature should survive termination (including ownership,
        disclaimers, limitation of liability, and indemnification) will survive.</P>

      <H2>9. Disclaimers</H2>
      <P>The Service is provided <Strong>&ldquo;as is&rdquo; and &ldquo;as available,&rdquo;</Strong> without warranties of
        any kind, whether express or implied, including merchantability, fitness for a particular purpose, and
        non-infringement. We do not warrant that the Service will be uninterrupted, secure, or error-free, or that any content
        or automated output is accurate.</P>

      <H2>10. Limitation of liability</H2>
      <P>To the maximum extent permitted by law, {LEGAL_ENTITY} and its operators will not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or for lost profits, data, or goodwill, arising out of or
        related to your use of the Service. Our total liability for any claim will not exceed the greater of the amount you
        paid us in the twelve months before the claim or USD $100.</P>

      <H2>11. Indemnification</H2>
      <P>You agree to indemnify and hold harmless {LEGAL_ENTITY} and its operators from any claims, damages, or expenses
        (including reasonable legal fees) arising from Your Content, your use of the Service, or your violation of these Terms
        or the rights of others.</P>

      <H2>12. Changes to these Terms</H2>
      <P>We may update these Terms from time to time. When we make material changes, we will update the date above and may ask
        you to re-accept before continuing to use the Service. Your continued use after changes take effect constitutes
        acceptance.</P>

      <H2>13. Governing law and disputes</H2>
      <P>These Terms are governed by the laws of {LEGAL_GOVERNING_LAW}, without regard to conflict-of-laws rules. Any dispute
        will be resolved in the courts located in {LEGAL_GOVERNING_LAW}, unless applicable law requires otherwise.
        <Strong> [If you intend to require arbitration or a class-action waiver, insert those provisions here with counsel.]</Strong></P>

      <H2>14. Contact</H2>
      <P>Questions about these Terms: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-brand-green-ink underline dark:text-brand-green">{LEGAL_CONTACT_EMAIL}</a>.</P>
    </article>
  );
}
