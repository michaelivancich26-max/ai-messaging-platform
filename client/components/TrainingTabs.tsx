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
    <div className="flex shrink-0 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
      {TABS.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <button key={href} onClick={() => router.push(href)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
              active
                ? "border-brand-green text-brand-green-ink dark:text-brand-green"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
