"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DURATIONS, MIN_RUN_SECONDS, loadTypingDuration, makeWords, recordTypingRun,
  saveTypingDuration, type TypingRun, type TypingStats,
} from "@/lib/typing";

const netWpm = (correctChars: number, seconds: number) =>
  seconds > 0 ? Math.max(0, Math.round((correctChars / 5) / (seconds / 60))) : 0;

// Warm-up typing while the queue looks for an opponent.
//
// Two rules shape this. It must never hold the keyboard hostage — nothing
// autofocuses, Escape lets go, and Tab still reaches Cancel — and a run has to
// survive being interrupted, because the whole point of the queue is that it
// ends without warning. The unmount path records the run exactly like the timer
// running out does, just flagged as cut short.
export default function TypingTrainer({ onResult }: {
  onResult?: (run: TypingRun, stats: TypingStats) => void;
}) {
  // Only ever mounted client-side (the queue is a post-click state), so seeding
  // random words in the initializer can't mismatch a server render.
  const [words, setWords] = useState<string[]>(() => makeWords());
  const [typedWords, setTypedWords] = useState<string[]>([]);
  const [duration, setDuration] = useState(30);
  const [wordIndex, setWordIndex] = useState(0);
  const [input, setInput] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [finished, setFinished] = useState<TypingRun | null>(null);
  const [stats, setStats] = useState<TypingStats | null>(null);
  const [focused, setFocused] = useState(false);
  const [committed, setCommitted] = useState({ correct: 0, incorrect: 0 });
  const [scroll, setScroll] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const keysRef = useRef({ keys: 0, correct: 0 });
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => { setDuration(loadTypingDuration()); }, []);

  // Alt-tabbing away fires blur on the input while it keeps DOM focus, so the
  // caret would vanish and never come back even though typing still worked.
  // Re-read the real focus state whenever the window does.
  useEffect(() => {
    const onFocus = () => setFocused(document.activeElement === inputRef.current);
    const onBlur = () => setFocused(false);          // no caret in an unfocused window
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => { window.removeEventListener("focus", onFocus); window.removeEventListener("blur", onBlur); };
  }, []);

  // Characters right so far, including the current word's correct prefix.
  const word = words[wordIndex] ?? "";
  let livePrefix = 0;
  for (let i = 0; i < input.length && i < word.length; i++) {
    if (input[i] === word[i]) livePrefix++; else break;
  }
  const correctChars = committed.correct + livePrefix;

  const elapsed = startedAt ? Math.min(duration, (Date.now() - startedAt) / 1000) : 0;
  const remaining = Math.max(0, duration - elapsed);
  const wpm = netWpm(correctChars, elapsed);
  const accuracy = keysRef.current.keys > 0
    ? Math.round((keysRef.current.correct / keysRef.current.keys) * 100) : 100;

  // Everything the end-of-run path needs, kept current without re-subscribing.
  const liveRef = useRef({ startedAt, correctChars, finished: false, duration });
  liveRef.current = { startedAt, correctChars, finished: !!finished, duration };

  const finish = useCallback((interrupted: boolean, at = Date.now()) => {
    const { startedAt: started, finished: already, duration: d, correctChars: chars } = liveRef.current;
    if (!started || already) return;
    const seconds = Math.min(d, (at - started) / 1000);
    const k = keysRef.current;
    const run: TypingRun = {
      wpm: netWpm(chars, seconds),
      accuracy: k.keys > 0 ? Math.round((k.correct / k.keys) * 100) : 100,
      seconds: Math.round(seconds),
      at,
      interrupted,
    };
    liveRef.current.finished = true;
    const next = recordTypingRun(run);
    setFinished(run);
    setStats(next);
    onResultRef.current?.(run, next);
  }, []);

  // Tick the clock while a run is live, and end it when the time is up.
  useEffect(() => {
    if (!startedAt || finished) return;
    const id = setInterval(() => {
      if (Date.now() - startedAt >= duration * 1000) finish(false, startedAt + duration * 1000);
      else setTick(t => t + 1);
    }, 150);
    return () => clearInterval(id);
  }, [startedAt, finished, duration, finish]);

  // Matched, cancelled, or navigated away mid-run: the score still counts.
  // Depends on nothing, so switching the timer length can't trip it.
  useEffect(() => () => { finish(true); }, [finish]);

  // Keep the line being typed at the top of the window.
  useLayoutEffect(() => {
    const el = activeRef.current;
    if (el) setScroll(el.offsetTop);
  }, [wordIndex, words]);

  // "Again" swaps the result panel back for a brand-new input. Unmounting the
  // old one fires no blur, so `focused` stayed true and the panel came back
  // dressed as focused — ring on, caret blinking, overlay gone — over an input
  // nothing was typing into. Re-read the truth whenever the live branch mounts.
  useLayoutEffect(() => {
    if (!finished) setFocused(document.activeElement === inputRef.current);
  }, [finished]);

  function restart(seconds = duration) {
    liveRef.current.finished = false;
    keysRef.current = { keys: 0, correct: 0 };
    setWords(makeWords()); setTypedWords([]);
    setWordIndex(0); setInput(""); setStartedAt(null); setFinished(null);
    setCommitted({ correct: 0, incorrect: 0 }); setScroll(0);
    if (seconds !== duration) { setDuration(seconds); saveTypingDuration(seconds); }
  }

  function commit(typed: string) {
    const target = words[wordIndex] ?? "";
    let matching = 0;
    for (let i = 0; i < Math.min(typed.length, target.length); i++) {
      if (typed[i] === target[i]) matching++;
    }
    setCommitted(c => ({
      // The space counts as a correct character only when the word was right —
      // otherwise a page of gibberish separated by spaces would score.
      correct: c.correct + matching + (typed === target ? 1 : 0),
      incorrect: c.incorrect + (typed.length - matching) + Math.max(0, target.length - typed.length),
    }));
    setTypedWords(t => [...t, typed]);
    setWordIndex(i => i + 1);
    setInput("");
    // Top the list up so the stream never runs dry on a fast 60-second run.
    if (wordIndex > words.length - 40) setWords(w => [...w, ...makeWords(80)]);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (finished) return;
    const v = e.target.value;
    // Overtyped characters render inside the active word, so an unbounded run of
    // them widens that flex item until the line re-wraps. A dozen past the end
    // is already well past any real typo.
    if (v.length > (words[wordIndex] ?? "").length + 12) return;
    if (!startedAt && v.length > 0) setStartedAt(Date.now());

    // Count the keystroke, not the resulting string: backspacing over a typo
    // shouldn't quietly restore your accuracy.
    if (v.length > input.length) {
      const added = v[v.length - 1];
      const target = words[wordIndex] ?? "";
      keysRef.current.keys++;
      const right = added === " " ? input === target : added === target[v.length - 1];
      if (right) keysRef.current.correct++;
    }

    if (v.endsWith(" ")) {
      const typed = v.slice(0, -1);
      if (typed.length > 0) commit(typed); else setInput("");
      return;
    }
    setInput(v);
  }

  const idle = !startedAt && !finished;

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-card dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Warm up your hands
        </p>
        <div className="ml-auto flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800" role="group" aria-label="Practice length">
          {DURATIONS.map(d => (
            <button key={d} onClick={() => restart(d)} aria-pressed={duration === d}
              className={`min-h-11 rounded-md px-2.5 text-xs font-semibold tabular-nums transition-colors ${duration === d
                ? "bg-white text-orange-700 shadow-sm dark:bg-gray-900 dark:text-orange-400"
                : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"}`}>
              {d}s
            </button>
          ))}
        </div>
      </div>

      {finished ? (
        <div className="mt-3" aria-live="polite">
          <div className="flex items-end gap-5">
            <div>
              <p className="font-display text-4xl font-bold tabular-nums text-gray-900 dark:text-white">{finished.wpm}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">wpm</p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold tabular-nums text-gray-700 dark:text-gray-200">{finished.accuracy}%</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">accuracy</p>
            </div>
            <button onClick={() => restart()}
              className="ml-auto inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/50">
              Again
            </button>
          </div>
          <p className="mt-2.5 text-xs text-gray-500 dark:text-gray-400">
            {finished.seconds < MIN_RUN_SECONDS
              ? `Too short to count — under ${MIN_RUN_SECONDS} seconds isn't a measurement.`
              : stats && stats.runs > 1
                ? <>Average <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{stats.avgWpm}</span> over {stats.runs} runs · best <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{stats.bestWpm}</span></>
                : "Saved — it'll be here when you get back."}
          </p>
        </div>
      ) : (
        <>
          {/* Fixed slots for the numbers. tabular-nums equalises digit width but
              reserves no space, so 9 -> 10 wpm shunted the accuracy sideways
              mid-run, right where the eye is. */}
          <div className="mt-2 flex items-baseline gap-4 text-sm">
            <span className="tabular-nums text-gray-500 dark:text-gray-400">
              <span className="inline-block min-w-[2.4ch] text-right font-display text-xl font-bold text-gray-900 dark:text-white">{wpm}</span> wpm
            </span>
            <span className="tabular-nums text-gray-500 dark:text-gray-400">
              <span className="inline-block min-w-[3ch] text-right">{accuracy}%</span> acc
            </span>
            <span className="ml-auto font-display text-xl font-bold tabular-nums text-orange-700 dark:text-orange-400">
              {Math.ceil(remaining)}
            </span>
          </div>

          {/* The stream. Hidden from screen readers — a timed race against a
              scrolling word list can't be read out without becoming unusable. */}
          <div onClick={() => inputRef.current?.focus()}
            className={`relative mt-2 cursor-text rounded-xl bg-gray-50 px-3 py-2 font-mono text-lg leading-7 dark:bg-gray-950/50 ${
              focused ? "ring-2 ring-orange-500/60" : ""}`}>
            {/* The clip has to be its own box. With overflow-hidden and py-2 on
                the SAME element, border-box takes the padding out of the 84px
                while overflow still clips at the padding edge — so the third row
                was sliced through its descenders and the scrolled-off row leaked
                back in through the top band. Height here is exactly 3 x leading-7;
                change one and change the other. */}
            <div className="h-[5.25rem] overflow-hidden">
            <div aria-hidden className="relative flex flex-wrap gap-x-2 transition-transform duration-150 motion-reduce:transition-none"
              style={{ transform: `translateY(${-scroll}px)` }}>
              {words.slice(0, wordIndex + 60).map((w, i) => {
                if (i < wordIndex) {
                  return (
                    <span key={i} className={typedWords[i] === w
                      ? "text-gray-500 dark:text-gray-400"
                      : "text-rose-700 underline decoration-rose-500/60 underline-offset-2 dark:text-rose-400"}>
                      {w}
                    </span>
                  );
                }
                // The ref lives on a wrapper rather than the component, so this
                // stays a plain function component (React 18 has no ref prop).
                if (i === wordIndex) {
                  return <span key={i} ref={activeRef}><ActiveWord word={w} typed={input} caret={focused} /></span>;
                }
                // Dimmer would look more like a typing test and read worse. The
                // upcoming words are the thing you have to read to do the task,
                // so they hold AA; the caret carries "where you are" instead.
                return <span key={i} className="text-gray-500 dark:text-gray-400">{w}</span>;
              })}
            </div>
            </div>

            {idle && !focused && (
              <div className="absolute inset-0 grid place-items-center rounded-xl bg-white/85 px-4 text-center backdrop-blur-[1px] dark:bg-gray-900/85">
                <p className="font-sans text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Click here to practise while you wait
                  <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-gray-400">
                    The timer starts on your first keystroke. Escape lets go.
                  </span>
                </p>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            value={input}
            onChange={onChange}
            onKeyDown={e => { if (e.key === "Escape") inputRef.current?.blur(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="Typing practice — type the words shown"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 font-mono text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-orange-400 dark:border-gray-800 dark:bg-gray-950/50 dark:text-gray-100 dark:placeholder:text-gray-400"
            placeholder={idle ? "type here" : ""}
          />
        </>
      )}
    </div>
  );
}

// The word under the caret, one character at a time.
function ActiveWord({ word, typed, caret }: { word: string; typed: string; caret: boolean }) {
  const extra = typed.length > word.length ? typed.slice(word.length) : "";
  return (
    <span>
      {word.split("").map((ch, i) => {
        const t = typed[i];
        // The word under the caret is the brightest thing on the panel.
        const cls = t === undefined
          ? "text-gray-900 dark:text-gray-100"
          // -700, not -600: rose-600 measures 4.49 on this panel, just under AA.
          : t === ch ? "text-brand-green-ink dark:text-brand-green" : "text-rose-700 dark:text-rose-400";
        return (
          <span key={i} className={cls}>
            {caret && i === typed.length && <Caret />}
            {ch}
          </span>
        );
      })}
      {extra && <span className="text-rose-700 dark:text-rose-400">{extra}</span>}
      {caret && typed.length >= word.length && <Caret />}
    </span>
  );
}

// Zero-width so the line never shifts as the caret moves.
//
// The height and alignment do the real work. An empty inline-block is a
// ZERO-height box that align-baseline collapses onto the baseline, so a caret
// positioned from its top starts below the text and hangs into the next line —
// measured at 18.7px low against a character box of 562.0–583.3. Giving the
// wrapper the font's own content-box height and aligning it to text-bottom puts
// it exactly over the glyphs, in em units so it holds at any text size.
function Caret() {
  return (
    <span aria-hidden className="relative inline-block h-[1.19em] w-0 align-text-bottom">
      <span className="absolute inset-y-0 -left-px w-0.5 rounded bg-orange-500 motion-safe:animate-pulse" />
    </span>
  );
}
