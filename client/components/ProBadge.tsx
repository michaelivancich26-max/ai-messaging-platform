import { Sparkles } from "lucide-react";

// The Grounds Pro mark. Status is one of the things Pro is allowed to sell — it
// confers nothing in a debate, which is why it can be worn openly.
//
// Deliberately quiet: it sits inline next to a username in a dense message list,
// so it reads as a small mark of support rather than an advertisement. It never
// renders for non-Pro users, so there is no upsell surface here — a badge that
// nagged everyone else would make the chat worse for the people not paying.
//
// `inline` is the chat/list variant (icon only, with an accessible name);
// the default carries the word, for profile headers where there is room.
export function ProBadge({ inline = false, className = "" }: { inline?: boolean; className?: string }) {
  if (inline) {
    return (
      <span
        title="Grounds Pro"
        aria-label="Grounds Pro member"
        className={`inline-flex shrink-0 items-center text-orange-700 dark:text-orange-300 ${className}`}
      >
        <Sparkles className="h-3 w-3" aria-hidden />
      </span>
    );
  }
  return (
    <span
      title="Grounds Pro"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-orange-800 ring-1 ring-orange-500/30 dark:text-orange-300 ${className}`}
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      Pro
    </span>
  );
}
