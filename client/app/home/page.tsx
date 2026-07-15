"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LiveMatches from "@/components/LiveMatches";

const MODES: { href: string; label: string; blurb: string; accent: string; icon: React.ReactNode }[] = [
  { href: "/lobby", label: "Common Grounds", blurb: "Join live rooms", accent: "text-indigo-600 dark:text-indigo-400",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6"><path fillRule="evenodd" d="M10 3c-4.31 0-8 2.69-8 6 0 1.56.83 2.98 2.17 4.04L3 17l3.86-1.6c.98.38 2.05.6 3.14.6 4.31 0 8-2.69 8-6s-3.69-6-8-6Z" clipRule="evenodd" /></svg> },
  { href: "/compete", label: "Battle Grounds", blurb: "1v1, AI judged", accent: "text-violet-600 dark:text-violet-400",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6"><path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h4.017l-1.75 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 14.25 8h-4.017l1.75-6.093Z" /></svg> },
  { href: "/arena", label: "Training Grounds", blurb: "Beat the bots, learn the theory", accent: "text-amber-600 dark:text-amber-400",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6"><path d="M15.5 3H14V2a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v1H4.5A1.5 1.5 0 0 0 3 4.5v1A2.5 2.5 0 0 0 5.5 8h.28A4.01 4.01 0 0 0 9 10.9V13H7a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.1A4.01 4.01 0 0 0 14.22 8h.28A2.5 2.5 0 0 0 17 5.5v-1A1.5 1.5 0 0 0 15.5 3ZM5.5 6.5A.5.5 0 0 1 5 6V5h1v1.5h-.5Zm10 0H15V5h1v1a.5.5 0 0 1-.5.5Z" /></svg> },
];

export default function HomePage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-600 text-sm">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8 space-y-8">

        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Welcome back{username ? `, ${username}` : ""}</h1>
          <p className="mt-0.5 text-sm text-gray-500">Pick a room, sharpen an argument, or watch a debate unfold.</p>
        </div>

        {/* Play — the primary action, so it leads */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Play</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MODES.map(m => (
              <button key={m.href} onClick={() => router.push(m.href)}
                className="flex flex-col items-start gap-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4 text-left transition-colors hover:border-gray-300 dark:hover:border-gray-700 hover:bg-white dark:hover:bg-gray-900">
                <span className={m.accent}>{m.icon}</span>
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.label}</div>
                  <div className="text-xs text-gray-500">{m.blurb}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Live now */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">Live now</h2>
            <span className="text-xs text-gray-500 dark:text-gray-600">— watch a debate in progress</span>
          </div>
          <LiveMatches variant="grid" />
        </section>

      </div>
    </div>
  );
}
