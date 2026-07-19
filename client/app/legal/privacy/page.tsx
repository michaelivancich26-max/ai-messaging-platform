import type { Metadata } from "next";
import Link from "next/link";
import { H2, P, UL, LI, Strong, Lead } from "@/components/legal-ui";
import { LEGAL_ENTITY, LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, MIN_AGE } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy · Grounds for Debate" };

export default function PrivacyPage() {
  return (
    <article>
      <h1 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Privacy Policy</h1>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Last updated {LEGAL_EFFECTIVE_DATE}</p>

      <Lead>
        This Privacy Policy explains what information Grounds for Debate, operated by {LEGAL_ENTITY}, collects, how we use it,
        and the choices you have. By using the Service you agree to this Policy.
      </Lead>

      <H2>1. Information we collect</H2>
      <UL>
        <LI><Strong>Account information</Strong> — the username and email address you provide, and a securely hashed
          version of your password (we never store your password in plain text).</LI>
        <LI><Strong>Content you create</Strong> — debate messages, arguments, claims, room and profile details, reactions,
          and direct messages.</LI>
        <LI><Strong>Activity data</Strong> — match results, ratings (ELO), streaks, credibility and claim scores, and
          similar records generated as you use the Service.</LI>
        <LI><Strong>Technical data</Strong> — information necessary to operate the Service, such as your authentication
          session and basic request logs used for security and debugging.</LI>
      </UL>
      <P>We do <Strong>not</Strong> use advertising or third-party tracking cookies. See our <Link href="/legal/cookies" className="text-brand-green-ink underline dark:text-brand-green">Cookie Policy</Link>.</P>

      <H2>2. How we use your information</H2>
      <UL>
        <LI>To provide, operate, and secure the Service and your account.</LI>
        <LI>To evaluate claims, judge matches, generate bot responses and summaries, and compute ratings.</LI>
        <LI>To enforce our Terms and Community Guidelines and to prevent abuse, cheating, and fraud.</LI>
        <LI>To respond to your requests and communicate about the Service.</LI>
      </UL>

      <H2>3. Automated processing and AI providers</H2>
      <P><Strong>Content you submit is sent to a third-party AI provider (Anthropic) for automated processing</Strong> —
        for example, to evaluate the strength and accuracy of claims, judge debates, and generate bot arguments and
        summaries. That content is transmitted to and processed by the provider to return a result. Do not submit sensitive
        personal information in debate content. We do not use your content to train our own advertising profiles, and we do
        not sell your personal information.</P>

      <H2>4. How we share information</H2>
      <P>We share information only as needed to run the Service:</P>
      <UL>
        <LI><Strong>Service providers</Strong> — hosting and database infrastructure, and the AI provider described above,
          which process data on our behalf under their terms.</LI>
        <LI><Strong>Other users</Strong> — content you post in rooms, debates, profiles, and leaderboards is visible to
          other users by design.</LI>
        <LI><Strong>Legal and safety</Strong> — when we believe disclosure is required by law or necessary to protect the
          Service, our users, or the public.</LI>
      </UL>

      <H2>5. Data retention</H2>
      <P>We keep your information for as long as your account is active or as needed to provide the Service and meet legal
        obligations. When you delete your account, we delete or de-identify your personal information, except where we must
        retain limited records to comply with law, resolve disputes, or enforce our agreements.</P>

      <H2>6. Your rights and choices</H2>
      <P>Depending on where you live, you may have rights to access, correct, export, or delete your personal information. We
        offer self-service tools in your account settings:</P>
      <UL>
        <LI><Strong>Access &amp; portability</Strong> — download a copy of your account data.</LI>
        <LI><Strong>Deletion</Strong> — permanently delete your account and associated personal data.</LI>
      </UL>
      <P>You can also contact us at <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-brand-green-ink underline dark:text-brand-green">{LEGAL_CONTACT_EMAIL}</a> to exercise these rights. We will not discriminate against you for doing so.</P>

      <H2>7. Security</H2>
      <P>We use reasonable technical and organizational measures to protect your information, including password hashing and
        authenticated sessions. No method of transmission or storage is perfectly secure, and we cannot guarantee absolute
        security.</P>

      <H2>8. Children&rsquo;s privacy</H2>
      <P>The Service is not directed to children under {MIN_AGE}, and we do not knowingly collect personal information from
        them. If you believe a child has provided us personal information, contact us and we will delete it.</P>

      <H2>9. International users</H2>
      <P>We may process and store information in countries other than where you live. Where required, we take steps to ensure
        appropriate protection for cross-border transfers. <Strong>[Confirm the specifics with counsel for your target
        markets, including any GDPR/UK-GDPR or CCPA/CPRA obligations.]</Strong></P>

      <H2>10. Changes to this Policy</H2>
      <P>We may update this Policy from time to time. When we make material changes, we will update the date above and, where
        appropriate, ask you to re-accept.</P>

      <H2>11. Contact</H2>
      <P>Questions about privacy: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-brand-green-ink underline dark:text-brand-green">{LEGAL_CONTACT_EMAIL}</a>.</P>
    </article>
  );
}
