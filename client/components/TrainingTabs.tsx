"use client";

import { usePathname, useRouter } from "next/navigation";

const TABS = [
  { href: "/arena", label: "Practice" },
  { href: "/learn", label: "Learn" },
] as const;

// Switches between the two halves of Training Grounds. They stay separate routes
// — this only makes them feel like one section, so the nav needs a single entry.
export default function TrainingTabs() {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  return (
    <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-800">
      {TABS.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <button key={href} onClick={() => router.push(href)}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
              active
                ? "border-amber-500 text-amber-700 dark:text-amber-300"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
