// The puzzle answers must not be guessable from their position.
//
// Every puzzle is authored with the correct option written first, which is the
// natural way to write them — and left as-is meant 17 of 20 answered at index 0,
// so "always pick the first option" scored 85% and "first or last" scored 100%.
// content.ts now deals the options into a seeded order at module load. This
// checks the deal actually spreads them, keeps every puzzle answerable, leaves
// "All of the above" in the only slot where it means anything, and is stable
// across reloads so the answer never moves under a reader mid-puzzle.
//
// Run: node -r ts-node/register/transpile-only scripts/verify-puzzles.ts
import { PUZZLES } from "../client/app/learn/puzzles/content";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const n = PUZZLES.length;
const dist: Record<number, number> = {};
for (const p of PUZZLES) dist[p.correctIndex] = (dist[p.correctIndex] ?? 0) + 1;
const share = (i: number) => (dist[i] ?? 0) / n;

console.log(`  ..    ${n} puzzles, answer positions ${JSON.stringify(dist)}`);

// The deal is balanced by construction, so with four options every position
// should hold within one puzzle of a quarter of them. The slack covers puzzle
// counts that don't divide by four and the "All of the above" answers that are
// pinned last and can't be moved.
const perfect = 1 / 4;
const slack = Math.max(1.5 / n, 0.05);
for (const i of [0, 1, 2, 3]) {
  check(`position ${i} holds about a quarter of the answers`,
    Math.abs(share(i) - perfect) <= slack,
    `${(share(i) * 100).toFixed(0)}% (${dist[i] ?? 0} of ${n})`);
}

check("no guessing strategy beats chance",
  Math.max(...[0, 1, 2, 3].map(share)) <= perfect + slack,
  `best single position is ${(Math.max(...[0, 1, 2, 3].map(share)) * 100).toFixed(0)}%`);

// Every puzzle must still be answerable and internally consistent.
let badIndex = 0, pinnedBad = 0, dupes = 0, thin = 0;
const seen = new Set<string>();
for (const p of PUZZLES) {
  if (seen.has(p.id)) dupes++;
  seen.add(p.id);
  if (p.correctIndex < 0 || p.correctIndex >= p.options.length) badIndex++;
  if (p.options.length < 2) thin++;
  const ai = p.options.findIndex(o => /^all of the above/i.test(o));
  if (ai >= 0 && ai !== p.options.length - 1) pinnedBad++;
}
check("every correct answer is in range", badIndex === 0, badIndex ? `${badIndex} broken` : "");
check("every puzzle has options to choose from", thin === 0);
check("puzzle ids are unique", dupes === 0);
check(`"All of the above" is always last`, pinnedBad === 0,
  pinnedBad ? `${pinnedBad} stranded mid-list` : "");

// The deal is seeded off the puzzle id, so a second load must be identical —
// otherwise the answer would move under anyone who refreshed.
delete require.cache[require.resolve("../client/app/learn/puzzles/content")];
const reloaded = require("../client/app/learn/puzzles/content").PUZZLES as typeof PUZZLES;
check("the deal is identical on reload",
  JSON.stringify(reloaded.map(p => [p.id, p.correctIndex, p.options])) ===
  JSON.stringify(PUZZLES.map(p => [p.id, p.correctIndex, p.options])));

console.log(failures ? `\n${failures} FAILURE(S)` : `\npuzzle answers are spread and stable`);
process.exit(failures ? 1 : 0);
