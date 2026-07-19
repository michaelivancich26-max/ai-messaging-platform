import type { Metadata } from "next";
import Link from "next/link";
import { H2, P, UL, LI, Strong, Lead } from "@/components/legal-ui";
import { LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

export const metadata: Metadata = { title: "Cookie Policy · Grounds for Debate" };

export default function CookiesPage() {
  return (
    <article>
      <h1 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Cookie Policy</h1>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Last updated {LEGAL_EFFECTIVE_DATE}</p>

      <Lead>
        This policy explains the cookies and local storage Grounds for Debate uses. We keep this deliberately minimal:
        <Strong> we do not use advertising or third-party tracking cookies.</Strong>
      </Lead>

      <H2>Strictly necessary</H2>
      <UL>
        <LI><Strong>Authentication session</Strong> — after you sign in, a secure session cookie keeps you logged in and
          protects requests. The Service cannot function without it, so it is not subject to consent.</LI>
      </UL>

      <H2>Functional (local storage)</H2>
      <UL>
        <LI><Strong>Theme preference</Strong> — your light/dark choice is stored in your browser&rsquo;s local storage.</LI>
        <LI><Strong>Room access</Strong> — a password you enter for a private room is kept in session storage for the length
          of your browser session so you aren&rsquo;t asked again.</LI>
      </UL>
      <P>These are stored on your device to remember your preferences and are not used to track you across sites.</P>

      <H2>Analytics and advertising</H2>
      <P>None. We do not load third-party analytics, advertising, or social-media tracking cookies. If we ever introduce
        non-essential cookies, we will ask for your consent first through the banner shown on your first visit, and you can
        change your choice at any time.</P>

      <H2>Managing cookies</H2>
      <P>You can clear or block cookies and local storage through your browser settings. Blocking the authentication cookie
        will prevent you from signing in.</P>

      <H2>Contact</H2>
      <P>Questions: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-brand-green-ink underline dark:text-brand-green">{LEGAL_CONTACT_EMAIL}</a>.
        See also our <Link href="/legal/privacy" className="text-brand-green-ink underline dark:text-brand-green">Privacy Policy</Link>.</P>
    </article>
  );
}
