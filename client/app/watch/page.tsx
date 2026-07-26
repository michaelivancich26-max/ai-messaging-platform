"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LiveMatches from "@/components/LiveMatches";

// Spectator hub — every ranked 1v1 / team match currently live, to drop into and
// watch. The heavy lifting (polling, empty state, "watch"/"back to your match")
// already lives in LiveMatches; this page is the framing around it.
export default function WatchPage() {
  const router = useRouter();
  const { status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:py-8">
        <header>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Watch
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white md:text-3xl">Live debates in progress</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            Drop into any ranked 1v1 or team match as a spectator and watch the proposition bar move in real time as the argument lands.
          </p>
        </header>
        <LiveMatches variant="grid" />
      </div>
    </div>
  );
}
