"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import RapidFire from "@/components/RapidFire";

export default function RapidPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? session?.user?.name ?? "";

  if (status === "loading" || !userId || !username) {
    return <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950 text-sm text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950 px-4">
      <RapidFire userId={userId} username={username} />
    </div>
  );
}
