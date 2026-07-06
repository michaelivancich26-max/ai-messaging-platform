"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  PUZZLES, DAILY_PUZZLE_ID, getPuzzleById, CATEGORY_COLORS, DIFFICULTY_ORDER,
  type Puzzle, type Difficulty,
} from "./content";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

const DIFF_STYLE: Record<Difficulty, { label: string; pill: string; dot: string }> = {
  easy:   { label: "Easy",   pill: "bg-emerald-950/50 text-emerald-400", dot: "bg-emerald-400" },
  medium: { label: "Medium", pill: "bg-amber-950/50 text-amber-400",     dot: "bg-amber-400"   },
  hard:   { label: "Hard",   pill: "bg-red-950/50 text-red-400",         dot: "bg-red-400"     },
};

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill={filled ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5} className="h-3.5 w-3.5">
      <path d="M8 1.25l1.78 3.6 3.97.58-2.875 2.8.68 3.96L8 10.26l-3.555 1.87.68-3.96L2.25 5.43l3.97-.58L8 1.25Z" />
    </svg>
  );
}

// ── Puzzle view ──────────────────────────────────────────────────────────────
function PuzzleView({
  puzzle,
  completed,
  onComplete,
  onBack,
  onNext,
}: {
  puzzle: Puzzle;
  completed: boolean;
  onComplete: (id: string) => void;
  onBack: () => void;
  onNext: (() => void) | null;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(completed);

  useEffect(() => {
    setSelected(null);
    setRevealed(completed);
  }, [puzzle.id, completed]);

  function choose(idx: number) {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
    if (idx === puzzle.correctIndex) onComplete(puzzle.id);
  }

  const isCorrect = selected === puzzle.correctIndex;
  const d = DIFF_STYLE[puzzle.difficulty];
  const catColor = CATEGORY_COLORS[puzzle.category] ?? "bg-gray-800 text-gray-400";
  const isDaily = puzzle.id === DAILY_PUZZLE_ID;

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-800 bg-gray-950/95 px-4 py-3 backdrop-blur-sm">
        <button onClick={onBack}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-500">Puzzles</span>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-700 shrink-0">
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-semibold text-gray-100 truncate">{puzzle.title}</span>
        </div>
        {onNext && (
          <button onClick={onNext}
            className="ml-auto shrink-0 flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors">
            Next
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {isDaily && (
            <span className="flex items-center gap-1.5 rounded-full bg-yellow-950/50 px-2.5 py-1 text-[11px] font-semibold text-yellow-400">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M8 1.25l1.78 3.6 3.97.58-2.875 2.8.68 3.96L8 10.26l-3.555 1.87.68-3.96L2.25 5.43l3.97-.58L8 1.25Z" /></svg>
              Daily Puzzle
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${d.pill}`}>{d.label}</span>
          {revealed && (
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${catColor}`}>{puzzle.category}</span>
          )}
        </div>

        {/* Argument card */}
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-6">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-600">Argument</p>
          <blockquote className="text-base leading-relaxed text-gray-100 italic">
            "{puzzle.argument}"
          </blockquote>
          {puzzle.context && (
            <p className="mt-3 text-xs text-gray-500">{puzzle.context}</p>
          )}
        </div>

        {/* Question */}
        <p className="text-sm font-semibold text-gray-300">{puzzle.question}</p>

        {/* Options */}
        <div className="space-y-2.5">
          {puzzle.options.map((opt, idx) => {
            let style = "border-gray-800 bg-gray-900 hover:border-gray-600 hover:bg-gray-800/60";
            let icon = null;

            if (revealed) {
              if (idx === puzzle.correctIndex) {
                style = "border-emerald-600/60 bg-emerald-950/30";
                icon = (
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-emerald-400 shrink-0">
                    <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                  </svg>
                );
              } else if (idx === selected) {
                style = "border-red-700/50 bg-red-950/30";
                icon = (
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-red-400 shrink-0">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                );
              } else {
                style = "border-gray-800 bg-gray-900 opacity-50";
              }
            }

            return (
              <button
                key={idx}
                onClick={() => choose(idx)}
                disabled={revealed}
                className={`w-full flex items-start gap-3 rounded-xl border p-4 text-left text-sm transition-all ${style} disabled:cursor-default`}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-700 text-[11px] font-bold text-gray-500">
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="flex-1 leading-relaxed text-gray-200">{opt}</span>
                {icon}
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {revealed && (
          <div className={`rounded-2xl border p-5 space-y-2 ${isCorrect || completed ? "border-emerald-800/40 bg-emerald-950/20" : "border-red-800/40 bg-red-950/20"}`}>
            <div className="flex items-center gap-2">
              {isCorrect || completed ? (
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-emerald-400">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-red-400">
                  <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm2.78-4.22a.75.75 0 0 1-1.06 0L8 9.06l-1.72 1.72a.75.75 0 1 1-1.06-1.06L6.94 8 5.22 6.28a.75.75 0 0 1 1.06-1.06L8 6.94l1.72-1.72a.75.75 0 1 1 1.06 1.06L9.06 8l1.72 1.72a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
                </svg>
              )}
              <span className={`text-sm font-semibold ${isCorrect || completed ? "text-emerald-400" : "text-red-400"}`}>
                {isCorrect || completed ? "Correct!" : "Not quite"}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-gray-300">{puzzle.explanation}</p>
          </div>
        )}

        {/* Next puzzle */}
        {revealed && onNext && (
          <button onClick={onNext}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500">
            Next Puzzle →
          </button>
        )}
      </div>
    </div>
  );
}

// ── Catalogue ────────────────────────────────────────────────────────────────
export default function PuzzlesPage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId: string = (session?.user as any)?.id ?? "";

  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [activePuzzle, setActivePuzzle] = useState<Puzzle | null>(null);
  const [filter, setFilter] = useState<Difficulty | "all">("all");

  useEffect(() => {
    if (!userId) return;
    fetch(`${SERVER}/api/puzzles/progress?userId=${userId}`)
      .then(r => r.json())
      .then(d => setCompleted(new Set((d.completed ?? []) as string[])))
      .catch(() => {});
  }, [userId]);

  const markComplete = useCallback(async (id: string) => {
    if (completed.has(id) || !userId) return;
    setCompleted(prev => new Set([...prev, id]));
    await fetch(`${SERVER}/api/puzzles/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, puzzleId: id }),
    }).catch(() => {});
  }, [completed, userId]);

  const filtered = filter === "all" ? PUZZLES : PUZZLES.filter(p => p.difficulty === filter);
  const dailyPuzzle = PUZZLES.find(p => p.id === DAILY_PUZZLE_ID)!;

  const activePuzzleIndex = activePuzzle ? PUZZLES.findIndex(p => p.id === activePuzzle.id) : -1;
  const nextPuzzle = activePuzzleIndex >= 0 && activePuzzleIndex < PUZZLES.length - 1
    ? PUZZLES[activePuzzleIndex + 1]
    : null;

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center bg-gray-950 text-gray-600 text-sm">Loading…</div>;
  }

  if (activePuzzle) {
    return (
      <PuzzleView
        puzzle={activePuzzle}
        completed={completed.has(activePuzzle.id)}
        onComplete={markComplete}
        onBack={() => setActivePuzzle(null)}
        onNext={nextPuzzle ? () => setActivePuzzle(nextPuzzle) : null}
      />
    );
  }

  const doneCount = completed.size;
  const pct = Math.round((doneCount / PUZZLES.length) * 100);

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-800 bg-gray-950/95 px-4 py-3 backdrop-blur-sm">
        <button onClick={() => router.push("/learn")}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-100">Debate Puzzles</span>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-950 ring-1 ring-violet-900/60">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 text-violet-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Debate Puzzles</h1>
            <p className="mt-1 text-sm text-gray-500">{PUZZLES.length} puzzles · spot the fallacy or weak point before reading the answer</p>
          </div>
          {doneCount > 0 && (
            <div className="mx-auto max-w-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{doneCount} of {PUZZLES.length} solved</span>
                <span className="font-semibold text-violet-400">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Daily puzzle */}
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-600">Daily Puzzle</p>
          <button
            onClick={() => setActivePuzzle(dailyPuzzle)}
            className="group w-full flex items-center gap-4 rounded-2xl border border-yellow-900/40 bg-yellow-950/20 p-5 text-left transition-all hover:border-yellow-700/60 hover:bg-yellow-950/30"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-950 ring-1 ring-yellow-900/60">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5 text-yellow-400">
                <path d="M8 1.25l1.78 3.6 3.97.58-2.875 2.8.68 3.96L8 10.26l-3.555 1.87.68-3.96L2.25 5.43l3.97-.58L8 1.25Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-100">{dailyPuzzle.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {completed.has(dailyPuzzle.id) ? `${dailyPuzzle.category} · ` : ""}{DIFF_STYLE[dailyPuzzle.difficulty].label}
              </p>
            </div>
            {completed.has(dailyPuzzle.id) ? (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-white">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                </svg>
              </div>
            ) : (
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0">
                <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>

        {/* Filter tabs */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            {(["all", ...DIFFICULTY_ORDER] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors capitalize ${filter === f ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"}`}>
                {f === "all" ? "All" : DIFF_STYLE[f].label}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-600">{filtered.length} puzzles</span>
          </div>

          {/* Puzzle grid */}
          <div className="space-y-2">
            {filtered.map((puzzle, idx) => {
              const d = DIFF_STYLE[puzzle.difficulty];
              const done = completed.has(puzzle.id);
              const catColor = CATEGORY_COLORS[puzzle.category] ?? "bg-gray-800 text-gray-400";
              const isDaily = puzzle.id === DAILY_PUZZLE_ID;
              const num = PUZZLES.findIndex(p => p.id === puzzle.id) + 1;

              return (
                <button
                  key={puzzle.id}
                  onClick={() => setActivePuzzle(puzzle)}
                  className="group w-full flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 text-left transition-all hover:border-gray-700 hover:bg-gray-800/60"
                >
                  {/* Number / checkmark */}
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${done ? "bg-emerald-500 text-white" : "border-2 border-gray-700 text-gray-500 group-hover:border-gray-500"}`}>
                    {done ? (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                      </svg>
                    ) : num}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-100 leading-tight">{puzzle.title}</p>
                      {isDaily && (
                        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-yellow-400 shrink-0">
                          <path d="M8 1.25l1.78 3.6 3.97.58-2.875 2.8.68 3.96L8 10.26l-3.555 1.87.68-3.96L2.25 5.43l3.97-.58L8 1.25Z" />
                        </svg>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${d.pill}`}>{d.label}</span>
                      {done && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${catColor}`}>{puzzle.category}</span>
                      )}
                    </div>
                  </div>

                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-gray-700 group-hover:text-gray-500 transition-colors shrink-0">
                    <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
