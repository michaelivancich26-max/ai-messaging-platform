"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { signOutEverywhere } from "@/lib/session";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

const DOC_LINK = "text-brand-green-ink underline hover:no-underline dark:text-brand-green";

// Blocks the app for a signed-in user who has not accepted the CURRENT agreements
// version (a new signup already accepted; this catches existing users after the
// documents change). The documents open in a new tab so the user can read them
// without dismissing the gate.
export default function AgreementGate() {
  const { status } = useSession();
  const pathname = usePathname() ?? "";
  const [needsAccept, setNeedsAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") { setNeedsAccept(false); return; }
    let active = true;
    api(`${SERVER}/api/legal/status`).then(r => r.json())
      .then(d => { if (active) setNeedsAccept(d && d.accepted === false); })
      .catch(() => {});
    return () => { active = false; };
  }, [status]);

  // The /legal documents must stay readable without accepting — you have to be
  // able to read the terms before you can agree to them.
  if (!needsAccept || pathname.startsWith("/legal")) return null;

  const accept = async () => {
    setSubmitting(true);
    setFailed(false);
    try {
      const r = await api(`${SERVER}/api/legal/accept`, { method: "POST" });
      if (r.ok) setNeedsAccept(false);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="agreement-gate-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
        <h2 id="agreement-gate-title" className="font-display text-lg font-bold text-gray-900 dark:text-white">
          Please review our updated agreements
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          To keep using Grounds for Debate, please review and accept the current versions of:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
          <li>· <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className={DOC_LINK}>Terms of Service</a></li>
          <li>· <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className={DOC_LINK}>Privacy Policy</a></li>
          <li>· <a href="/legal/guidelines" target="_blank" rel="noopener noreferrer" className={DOC_LINK}>Community Guidelines</a></li>
        </ul>

        {failed && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            Something went wrong. Please try again.
          </p>
        )}

        <button
          onClick={accept}
          disabled={submitting}
          className="mt-5 w-full rounded-xl bg-brand-green py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-green-ink disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
        >
          {submitting ? "Saving…" : "I have read and agree"}
        </button>
        <p className="mt-3 text-center text-[11px] text-gray-500 dark:text-gray-400">
          Don&rsquo;t agree?{" "}
          <button onClick={() => signOutEverywhere()} className="underline hover:no-underline">Sign out</button>
        </p>
      </div>
    </div>
  );
}
