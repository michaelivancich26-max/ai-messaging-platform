"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getConsent, setConsent, type ConsentChoice } from "@/lib/consent";

// First-visit consent notice. Shown until the user makes a choice; the choice is
// stored locally so it never re-appears once set. Nothing non-essential runs
// before a choice — see lib/consent.ts.
export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(getConsent() === null);
  }, []);

  if (!show) return null;

  const choose = (choice: ConsentChoice) => {
    setConsent(choice);
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 pb-safe shadow-elevated dark:border-gray-800 dark:bg-gray-900/95"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
          We use only <span className="font-semibold text-gray-900 dark:text-gray-100">essential</span> cookies to keep you
          signed in, plus local storage for your theme. No ads, no third-party tracking.{" "}
          <Link href="/legal/cookies" className="text-brand-green-ink underline dark:text-brand-green">
            Cookie Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => choose("essential")}
            className="rounded-lg border border-gray-300 px-3.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/60"
          >
            Essential only
          </button>
          <button
            onClick={() => choose("accepted")}
            className="rounded-lg bg-brand-green px-3.5 py-1.5 text-xs font-semibold text-white shadow-card transition-colors hover:bg-brand-green-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
