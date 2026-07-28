// Warm-up typing practice, for the dead minute in the Rapid queue.
//
// A rapid round is typed under time pressure against someone who is typing
// back, so hand speed is a real part of the skill — but the point of the queue
// is to leave it, which shapes everything here: a run must survive being
// interrupted, and nothing may hold on to the keyboard when the match lands.

export interface TypingRun {
  wpm: number;
  accuracy: number;        // percentage of keystrokes that were the right key
  seconds: number;         // how long was actually typed, not the mode's length
  at: number;              // epoch ms
  interrupted: boolean;    // cut short — by a match, or by leaving the queue
}

export interface TypingStats {
  runs: number;
  avgWpm: number;
  bestWpm: number;
  last: TypingRun | null;
}

const KEY = "gfd.typing.v1";
const DURATION_KEY = "gfd.typing.duration";

export const DURATIONS = [15, 30, 60] as const;
export const DEFAULT_DURATION = 30;

// Below this there is nothing to measure — a two-second burst reads as 180 wpm
// and would poison an average that is supposed to mean something.
export const MIN_RUN_SECONDS = 5;

const EMPTY: TypingStats = { runs: 0, avgWpm: 0, bestWpm: 0, last: null };

export function loadTypingStats(): TypingStats {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const d = JSON.parse(raw);
    return {
      runs: Number(d?.runs) || 0,
      avgWpm: Number(d?.avgWpm) || 0,
      bestWpm: Number(d?.bestWpm) || 0,
      last: d?.last ?? null,
    };
  } catch { return EMPTY; }
}

// Fold a finished — or interrupted — run into the stored history and return the
// new totals. Short runs are shown back to the typist but never averaged.
export function recordTypingRun(run: TypingRun): TypingStats {
  const prev = loadTypingStats();
  const counts = run.seconds >= MIN_RUN_SECONDS;
  const next: TypingStats = counts
    ? {
        runs: prev.runs + 1,
        avgWpm: Math.round(((prev.avgWpm * prev.runs) + run.wpm) / (prev.runs + 1)),
        bestWpm: Math.max(prev.bestWpm, run.wpm),
        last: run,
      }
    : { ...prev, last: run };
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }
  return next;
}

export function loadTypingDuration(): number {
  if (typeof window === "undefined") return DEFAULT_DURATION;
  const n = Number(window.localStorage.getItem(DURATION_KEY));
  return (DURATIONS as readonly number[]).includes(n) ? n : DEFAULT_DURATION;
}

export function saveTypingDuration(seconds: number) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(DURATION_KEY, String(seconds)); } catch { /* private mode */ }
}

// Common English, which is what a typing test measures. Deliberately not debate
// vocabulary: "epistemological" three times a line measures the word list, not
// the typist.
const WORDS = `the be to of and a in that have I it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were been has had did said each tell does set three want air well play small end put home read hand port large spell add land here must big high such follow act why ask men change went light kind off need house picture try again animal point mother world near build self earth father head stand own page should country found answer school grow study still learn plant cover food sun four thought let keep eye never last door between city tree cross since hard start might story saw far sea draw left late run press close night real life few stop open seem together next white children begin got walk example ease paper often always music those both mark book letter until mile river car feet care second group carry took rain eat room friend began idea fish mountain north once base hear horse cut sure watch color face wood main enough plain girl usual young ready above ever red list though feel talk bird soon body dog family direct pose leave song measure state product black short numeral class wind question happen complete ship area half rock order fire south problem piece told knew pass farm top whole king size heard best hour better true during hundred five remember step early hold west ground interest reach fast verb sing listen table travel less morning ten simple several vowel toward war lay against pattern slow center love person money serve appear road map science rule govern pull cold notice voice fall power town fine certain fly unit lead cry dark machine note wait plan figure star box noun field rest correct able pound done beauty drive stood contain front teach week final gave green oh quick develop sleep warm free minute strong special mind behind clear tail produce fact street inch lot nothing course stay wheel full force blue object decide surface deep moon island foot yet busy test record boat common gold possible plane age dry wonder laugh thousand ago ran check game shape yes hot miss brought heat snow bed bring sit perhaps fill east weight language among`
  .split(/\s+/)
  .filter(Boolean);

// A fresh run of words. Random by design — a fixed passage would be memorised
// after three queues and the number would stop meaning anything.
export function makeWords(n = 140): string[] {
  const out: string[] = [];
  let last = "";
  for (let i = 0; i < n; i++) {
    let w = WORDS[Math.floor(Math.random() * WORDS.length)];
    if (w === last) w = WORDS[(WORDS.indexOf(w) + 7) % WORDS.length];
    out.push(w);
    last = w;
  }
  return out;
}
