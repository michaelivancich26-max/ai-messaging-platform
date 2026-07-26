"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Layers } from "lucide-react";
import Deck from "@/components/Deck";

export default function DeckPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const userId: string = (session?.user as any)?.id ?? "";

  if (status === "loading" || !userId) {
    return <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 px-4 dark:bg-gray-950">
      <div className="mx-auto max-w-xl pt-8 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-3xl">Where you stand</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
          Take a side on each claim. We use these to find you someone who genuinely
          disagrees — so you argue what you actually think, not a side you were dealt.
        </p>
        <Link href="/beliefs" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <Layers className="h-3.5 w-3.5" /> See your Belief Map
        </Link>
      </div>
      <Deck userId={userId} />
    </div>
  );
}
