"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

// Placeholder — the friends system (requests, list, online status) lands in a
// follow-up. Kept minimal so the rail's Friends entry isn't a dead link.
export default function FriendsPage() {
  const router = useRouter();
  const { status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
          <Users className="h-7 w-7" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Friends</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Add other debaters, see who&rsquo;s online, and challenge them directly. This is landing shortly — for now, find people in the Community.
        </p>
        <button onClick={() => router.push("/community")}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-brand-green-ink px-5 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:opacity-90">
          Browse the Community
        </button>
      </div>
    </div>
  );
}
