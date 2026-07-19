// Shared presentational primitives for the /legal documents, so every page reads
// consistently without pulling in a markdown/prose dependency.
import type { ReactNode } from "react";

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mb-6 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{children}</p>;
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-9 mb-2.5 font-display text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm leading-relaxed text-gray-700 dark:text-gray-300 marker:text-gray-400 dark:marker:text-gray-600">{children}</ul>;
}

export function LI({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>;
}
