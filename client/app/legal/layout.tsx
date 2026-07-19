import Link from "next/link";
import { LEGAL_DOCS, LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

// Standalone chrome for the legal documents — no app shell, so the pages work
// logged-out (they are linked from the sign-up form) and read like documents.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-5 h-14">
          <Link href="/" className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-brand-green" aria-hidden><path d="M10 1.5 3 4v5c0 4 3 7.5 7 9.5 4-2 7-5.5 7-9.5V4l-7-2.5Z" /></svg>
            <span className="font-display text-sm font-bold">Grounds for Debate</span>
          </Link>
          <nav className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Legal documents">
            {LEGAL_DOCS.map(d => (
              <Link key={d.slug} href={`/legal/${d.slug}`}
                className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
                {d.title}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        {children}
      </main>

      <footer className="mx-auto max-w-3xl px-5 pb-12">
        <p className="border-t border-gray-200 pt-5 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Effective {LEGAL_EFFECTIVE_DATE}. These documents are a starting template and have not been reviewed by a
          licensed attorney; complete the bracketed placeholders and obtain legal review before relying on them.
        </p>
      </footer>
    </div>
  );
}
