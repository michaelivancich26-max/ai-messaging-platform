"use client";

import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DMThread from "@/components/DMThread";

export default function DMConversationPage() {
  const params = useParams();
  const { data: session } = useSession();
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";
  const raw = params?.username;
  const partnerUsername = decodeURIComponent(Array.isArray(raw) ? raw[0] : raw ?? "");

  if (!userId || !username) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-600">Loading…</div>;
  }

  return <DMThread userId={userId} username={username} partnerUsername={partnerUsername} />;
}
