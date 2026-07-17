// The "Grounds for Debate" logo as text, colored to match the logo:
// GROUNDS (green) · FOR (ink/white) · DEBATE (red).

// Compact single-word mark for nav rails and headers. Small text, so it takes the
// darkened green on light backgrounds — the logo green is only 2:1 on white.
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-display font-bold tracking-tight text-brand-green-ink dark:text-brand-green ${className}`}>Grounds</span>;
}

// Full tri-color lockup for the login / landing screen.
export function WordmarkFull({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight leading-none ${className}`}>
      <span className="text-brand-green-ink dark:text-brand-green">GROUNDS</span>{" "}
      <span className="text-brand-ink dark:text-white">FOR</span>{" "}
      <span className="text-brand-red-ink dark:text-brand-red">DEBATE</span>
    </span>
  );
}
