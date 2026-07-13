// The "Grounds for Debate" logo as text, colored to match the logo:
// GROUNDS (green) · FOR (ink/white) · DEBATE (red).

// Compact single-word mark for nav rails and headers.
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-bold tracking-tight text-brand-green ${className}`}>Grounds</span>;
}

// Full tri-color lockup for the login / landing screen.
export function WordmarkFull({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight leading-none ${className}`}>
      <span className="text-brand-green">GROUNDS</span>{" "}
      <span className="text-brand-ink dark:text-white">FOR</span>{" "}
      <span className="text-brand-red">DEBATE</span>
    </span>
  );
}
