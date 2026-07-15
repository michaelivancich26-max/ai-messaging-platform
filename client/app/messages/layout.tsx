"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ConversationList from "@/components/ConversationList";

// Two-pane Messages surface: conversation list beside the open thread. On mobile
// only one pane shows at a time — the list until you pick someone.
export default function MessagesLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const pathname = usePathname() ?? "";
  const userId: string = (session?.user as any)?.id ?? "";
  const inThread = pathname !== "/messages";

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950 text-sm text-gray-500 dark:text-gray-600">Loading…</div>;
  }

  return (
    <div className="flex h-full bg-white dark:bg-gray-900">
      <aside className={`${inThread ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-gray-200 dark:border-gray-800 md:w-72`}>
        {userId && <ConversationList userId={userId} />}
      </aside>
      <div className={`${inThread ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {children}
      </div>
    </div>
  );
}
